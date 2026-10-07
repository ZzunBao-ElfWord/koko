package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// SessionRow 用户登录会话（revolt.sessions：_id + user_id + name + last_seen）。
type SessionRow struct {
	ID       string `bson:"_id" json:"id"`
	Name     string `bson:"name" json:"name"`
	LastSeen string `bson:"last_seen" json:"last_seen"`
}

// ListUserSessions GET /api/v1/users/:id/sessions
// 列出指定用户当前全部登录会话，供"强制下线单个设备"运营操作。
func (d Deps) ListUserSessions(c *gin.Context) {
	userID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	cursor, err := d.RevoltCol("sessions").Find(ctx,
		bson.M{"user_id": userID},
		options.Find().
			SetSort(bson.D{{Key: "last_seen", Value: -1}}).
			SetProjection(bson.M{"name": 1, "last_seen": 1}))
	if err != nil {
		d.Log.Error("list sessions failed", "error", err, "user", userID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询会话失败"})
		return
	}
	defer cursor.Close(ctx)

	items := make([]SessionRow, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析会话数据失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": len(items)})
}

// DeleteUserSession DELETE /api/v1/users/:id/sessions/:sid
// 删除单条会话文档 = 该设备立即下线（Delta 校验会话时查此集合）。
func (d Deps) DeleteUserSession(c *gin.Context) {
	userID := c.Param("id")
	sessionID := c.Param("sid")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// 双条件限定，防止误删他人会话
	res, err := d.RevoltCol("sessions").DeleteOne(ctx, bson.M{"_id": sessionID, "user_id": userID})
	if err != nil {
		d.Log.Error("delete session failed", "error", err, "user", userID, "session", sessionID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "下线会话失败"})
		return
	}
	if res.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "会话不存在或已下线"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
