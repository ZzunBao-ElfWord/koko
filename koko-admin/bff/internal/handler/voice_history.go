package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// VoiceRoomHistory GET /api/v1/voice/history?page=1&page_size=20
// 语音房操作历史：从审计日志（koko_admin.audit_logs）过滤 /api/v1/voice/* 的变更请求。
// 声网频道是实时资源（无服务端持久化），操作轨迹依赖审计中间件落库。
func (d Deps) VoiceRoomHistory(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	col := d.AdminCol("audit_logs")
	// 审计路径以 /api/v1/voice 开头且为变更类（DELETE 解散/移出）
	filter := bson.M{
		"path":   bson.M{"$regex": "^/api/v1/voice", "$options": ""},
		"method": bson.M{"$in": []string{"DELETE", "POST", "PATCH"}},
	}

	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		d.Log.Error("count voice history failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询语音房历史失败"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		d.Log.Error("find voice history failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询语音房历史失败"})
		return
	}
	defer cursor.Close(ctx)

	items := make([]map[string]any, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析历史失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items": items, "total": total, "page": page, "page_size": pageSize,
	})
}
