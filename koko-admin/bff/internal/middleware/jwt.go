package middleware

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/auth"
)

// Gin context 键名，handler 与审计中间件共用。
const (
	CtxActorID   = "actorID"
	CtxActorName = "actorName"
	CtxRole      = "role"
)

// JWTAuth 校验 Authorization: Bearer <token>。
// 额外校验"改密失效"：token 签发时间早于账号 pwd_changed_at 时拒绝（adminUsers 为 nil 时跳过，
// 仅用于不涉及账号体系的场景；生产路由必须传入集合）。
func JWTAuth(secret string, adminUsers *mongo.Collection) gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" || !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "unauthorized", "message": "缺少登录凭证",
			})
			return
		}
		token := strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
		claims, err := auth.Parse(secret, token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"error": "unauthorized", "message": "登录已失效，请重新登录",
			})
			return
		}

		// 改密后旧 token 失效：每次请求查一次 pwd_changed_at（后台 QPS 极低，实时性优先于缓存）
		if adminUsers != nil && claims.IssuedAt != nil {
			ctx, cancel := context.WithTimeout(c.Request.Context(), 3*time.Second)
			defer cancel()
			var doc struct {
				PwdChangedAt *time.Time `bson:"pwd_changed_at"`
			}
			err := adminUsers.FindOne(ctx, bson.M{"_id": claims.Subject},
				options.FindOne().SetProjection(bson.M{"pwd_changed_at": 1})).Decode(&doc)
			if err != nil {
				// 账号已被删除等情况：拒绝
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error": "unauthorized", "message": "账号状态异常，请重新登录",
				})
				return
			}
			if doc.PwdChangedAt != nil && claims.IssuedAt.Time.Before(*doc.PwdChangedAt) {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"error": "unauthorized", "message": "密码已修改，请重新登录",
				})
				return
			}
		}

		c.Set(CtxActorID, claims.Subject)
		c.Set(CtxActorName, claims.Username)
		c.Set(CtxRole, claims.Role)
		c.Next()
	}
}
