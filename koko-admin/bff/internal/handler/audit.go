package handler

import (
	"context"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/model"
)

// ListAudit GET /api/v1/audit?page=1&page_size=50&method=DELETE&actor=admin&q=/spaces
func (d Deps) ListAudit(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "50"))
	if pageSize < 1 || pageSize > 200 {
		pageSize = 50
	}

	// 筛选条件：方法精确匹配、操作人模糊（姓名）、路径关键字模糊
	filter := bson.M{}
	if m := strings.ToUpper(strings.TrimSpace(c.Query("method"))); m != "" {
		filter["method"] = m
	}
	if actor := strings.TrimSpace(c.Query("actor")); actor != "" {
		actorRe := bson.M{"$regex": regexp.QuoteMeta(actor), "$options": "i"}
		filter["$or"] = bson.A{
			bson.M{"actor_name": actorRe},
			bson.M{"actor_id": actor},
		}
	}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		filter["path"] = bson.M{"$regex": regexp.QuoteMeta(q), "$options": "i"}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	col := d.AdminCol("audit_logs")
	total, _ := col.CountDocuments(ctx, filter)

	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetSkip(int64((page-1)*pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		d.Log.Error("find audit failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询审计日志失败"})
		return
	}
	defer cursor.Close(ctx)

	items := make([]model.AuditLog, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析审计日志失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}
