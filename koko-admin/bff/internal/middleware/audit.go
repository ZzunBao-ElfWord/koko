package middleware

import (
	"context"
	"log/slog"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/mongo"

	"koko-admin-bff/internal/model"
)

// Audit 记录所有变更类请求（POST/PUT/PATCH/DELETE）。
// 只记录路由与结果，不记录请求体（避免把密码、处置理由之外的敏感数据落库）。
// 失败也记录（401/403 同样有审计价值）。
func Audit(col *mongo.Collection, log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()

		method := c.Request.Method
		if method == "GET" || method == "HEAD" || method == "OPTIONS" {
			return
		}
		path := c.Request.URL.Path
		if !strings.HasPrefix(path, "/api/v1/") || strings.HasPrefix(path, "/api/v1/auth/login") {
			return
		}

		actorID, _ := c.Get(CtxActorID)
		actorName, _ := c.Get(CtxActorName)
		role, _ := c.Get(CtxRole)

		entry := model.AuditLog{
			ID:        model.NewID(),
			ActorID:   asString(actorID),
			ActorName: asString(actorName),
			Role:      asString(role),
			Method:    method,
			Path:      path,
			Status:    c.Writer.Status(),
			IP:        c.ClientIP(),
			UserAgent: c.Request.UserAgent(),
			CreatedAt: time.Now().UTC(),
		}

		// 审计写入失败不阻断请求，5 秒超时，仅记日志。
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := col.InsertOne(ctx, entry); err != nil && log != nil {
			log.Warn("audit insert failed", "error", err, "path", path)
		}
	}
}

func asString(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	return ""
}
