package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/auth"
	"koko-admin-bff/internal/config"
	"koko-admin-bff/internal/delta"
	"koko-admin-bff/internal/handler"
	"koko-admin-bff/internal/livekit"
	"koko-admin-bff/internal/model"
	"koko-admin-bff/internal/router"
	"koko-admin-bff/internal/store"
)

func main() {
	log := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(log)

	cfg := config.Load()
	if cfg.MongoURI == "" {
		log.Error("MONGO_URI 未配置，无法启动")
		os.Exit(1)
	}
	if cfg.JWTSecret == "" {
		log.Error("JWT_SECRET 未配置，无法启动")
		os.Exit(1)
	}

	ctx := context.Background()

	client, err := store.Connect(ctx, cfg.MongoURI)
	if err != nil {
		log.Error("连接 MongoDB 失败", "error", err)
		os.Exit(1)
	}
	log.Info("MongoDB 已连接")

	adminUsers := client.Database(cfg.AdminDB).Collection("admin_users")
	auditLogs := client.Database(cfg.AdminDB).Collection("audit_logs")

	bootstrapAdmin(ctx, cfg, adminUsers, log)

	lk := livekit.New(cfg.LiveKitURL, cfg.LiveKitAPIKey, cfg.LiveKitAPISecret)
	if lk == nil {
		log.Warn("LIVEKIT_API_KEY/LIVEKIT_API_SECRET 未配置，语音房管理不可用")
	}

	deps := handler.Deps{
		Cfg:     cfg,
		Log:     log,
		Mongo:   client,
		Delta:   delta.New(cfg.DeltaBaseURL, cfg.DeltaAdminToken, cfg.DeltaTokenHeader),
		Autumn:  delta.New(cfg.AutumnBaseURL, cfg.DeltaAdminToken, cfg.DeltaTokenHeader),
		Minio:   connectMinio(cfg, log),
		LiveKit: lk,
	}

	r := router.New(deps, auditLogs, adminUsers)
	log.Info("koko-admin 启动", "port", cfg.Port)
	if err := r.Run(":" + cfg.Port); err != nil {
		log.Error("HTTP 服务退出", "error", err)
		os.Exit(1)
	}
}

// connectMinio 按配置连接对象存储；未配置凭据时返回 nil（删除附件仅清索引并提示）。
func connectMinio(cfg *config.Config, log *slog.Logger) *minio.Client {
	if cfg.MinioAccessKey == "" || cfg.MinioSecretKey == "" {
		log.Warn("MINIO_ACCESS_KEY/MINIO_SECRET_KEY 未配置，媒体删除将只清理索引不清对象")
		return nil
	}
	mc, err := minio.New(cfg.MinioEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinioAccessKey, cfg.MinioSecretKey, ""),
		Secure: false,
		// 内网容器名直连，强制 path 风格，避免依赖 bucket 虚拟主机别名
		BucketLookup: minio.BucketLookupPath,
	})
	if err != nil {
		log.Error("MinIO 客户端初始化失败", "error", err)
		return nil
	}
	return mc
}

// bootstrapAdmin 保证 username 唯一索引存在；
// 若配置了 BOOTSTRAP_ADMIN_* 且账号表为空，创建首个 super_admin（幂等）。
func bootstrapAdmin(ctx context.Context, cfg *config.Config, col *mongo.Collection, log *slog.Logger) {
	indexCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	_, err := col.Indexes().CreateOne(indexCtx, mongo.IndexModel{
		Keys:    bson.D{{Key: "username", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		log.Warn("创建 admin_users 唯一索引失败（可能已存在）", "error", err)
	}

	if cfg.BootstrapUsername == "" || cfg.BootstrapPassword == "" {
		return
	}

	countCtx, cancelCount := context.WithTimeout(ctx, 5*time.Second)
	defer cancelCount()
	n, err := col.CountDocuments(countCtx, bson.M{})
	if err != nil {
		log.Warn("统计后台账号失败，跳过种子", "error", err)
		return
	}
	if n > 0 {
		return
	}

	hash, err := auth.HashPassword(cfg.BootstrapPassword)
	if err != nil {
		log.Error("种子超管密码哈希失败", "error", err)
		return
	}
	_, err = col.InsertOne(ctx, model.AdminUser{
		ID:           model.NewID(),
		Username:     cfg.BootstrapUsername,
		PasswordHash: hash,
		Role:         model.RoleSuperAdmin,
		CreatedAt:    time.Now().UTC(),
	})
	if err != nil {
		log.Error("种子超管创建失败", "error", err)
		return
	}
	log.Info("已创建初始超级管理员，请尽快登录并在生产环境清空 BOOTSTRAP_ADMIN_* 环境变量",
		"username", cfg.BootstrapUsername)
}
