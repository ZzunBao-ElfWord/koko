package handler

import (
	"log/slog"

	"github.com/minio/minio-go/v7"
	"go.mongodb.org/mongo-driver/mongo"

	"koko-admin-bff/internal/agora"
	"koko-admin-bff/internal/config"
	"koko-admin-bff/internal/delta"
)

// Deps 全部 handler 共享的依赖，main 中构造一次。
// handler 不允许自建 Mongo 连接或持有全局变量。
type Deps struct {
	Cfg    *config.Config
	Log    *slog.Logger
	Mongo  *mongo.Client
	Delta  *delta.Client
	Autumn *delta.Client // 复用 delta.Client 的"服务端持有会话头"转发能力访问文件服务
	Minio  *minio.Client // 附件对象删除（Autumn v0.15.5 无删除接口）；未配置时为 nil
	Agora  *agora.Client // 语音房管理（声网云端 API）；未配置凭据时为 nil
	// LinkSprite 复用 delta.Client 的"服务端持钥转发"能力访问连接精灵链后端（X-API-Key）
	LinkSprite *delta.Client
}

// RevoltCol 业务库集合（账号权限：find 全部；update 仅 users/safety_reports）。
func (d Deps) RevoltCol(name string) *mongo.Collection {
	return d.Mongo.Database(d.Cfg.RevoltDB).Collection(name)
}

// AdminCol 后台自有库集合（readWrite）。
func (d Deps) AdminCol(name string) *mongo.Collection {
	return d.Mongo.Database(d.Cfg.AdminDB).Collection(name)
}
