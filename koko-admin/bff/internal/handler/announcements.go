package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/middleware"
	"koko-admin-bff/internal/model"
)

// 公告（koko_admin.announcements）：运营公告板。
// 触达说明：Stoat/Revolt 没有全局通知通道，Delta 也不提供全员推送接口，
// 因此当前公告仅作后台记录与运营排期管理；若后续配置专用公告频道并恢复
// Delta 管理员会话，可在"启用"动作处扩展为向该频道代发消息。
type announcement struct {
	ID        string     `bson:"_id" json:"id"`
	Title     string     `bson:"title" json:"title"`
	Content   string     `bson:"content" json:"content"`
	Active    bool       `bson:"active" json:"active"`
	CreatedAt time.Time  `bson:"created_at" json:"created_at"`
	CreatedBy string     `bson:"created_by" json:"created_by"`
	UpdatedAt *time.Time `bson:"updated_at,omitempty" json:"updated_at,omitempty"`
}

type announcementReq struct {
	Title   string `json:"title" binding:"required,min=1,max=128"`
	Content string `json:"content" binding:"required,min=1,max=4096"`
}

// ListAnnouncements GET /api/v1/announcements
func (d Deps) ListAnnouncements(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	cursor, err := d.AdminCol("announcements").Find(ctx, bson.M{}, opts)
	if err != nil {
		d.Log.Error("list announcements failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询公告失败"})
		return
	}
	defer cursor.Close(ctx)

	// 空结果必须返回 [] 而非 null（前端直接取 length）
	items := make([]announcement, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析公告失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// CreateAnnouncement POST /api/v1/announcements
// 新建公告默认为停用状态，需人工确认后再启用。
func (d Deps) CreateAnnouncement(c *gin.Context) {
	var req announcementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "标题与内容不能为空"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	_, err := d.AdminCol("announcements").InsertOne(ctx, bson.M{
		"_id":        model.NewID(),
		"title":      req.Title,
		"content":    req.Content,
		"active":     false,
		"created_at": time.Now().UTC(),
		"created_by": c.GetString(middleware.CtxActorName),
	})
	if err != nil {
		d.Log.Error("insert announcement failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "创建公告失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UpdateAnnouncement PATCH /api/v1/announcements/:id
func (d Deps) UpdateAnnouncement(c *gin.Context) {
	var req announcementReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "标题与内容不能为空"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	now := time.Now().UTC()
	res, err := d.AdminCol("announcements").UpdateByID(ctx, c.Param("id"),
		bson.M{"$set": bson.M{"title": req.Title, "content": req.Content, "updated_at": now}})
	if err != nil {
		d.Log.Error("update announcement failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "更新公告失败"})
		return
	}
	if res.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "公告不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// SetAnnouncementActive PATCH /api/v1/announcements/:id/active
// 启用/停用公告。同时最多只允许一条处于启用状态：启用某条时自动停用其余。
func (d Deps) SetAnnouncementActive(c *gin.Context) {
	var req struct {
		Active bool `json:"active"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "参数不完整"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	col := d.AdminCol("announcements")
	if req.Active {
		// 单公告位：先把其余全部停用，再启用目标（两条独立写，失败时人工重试即可）
		if _, err := col.UpdateMany(ctx, bson.M{"active": true}, bson.M{"$set": bson.M{"active": false}}); err != nil {
			d.Log.Error("deactivate other announcements failed", "error", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "切换公告状态失败"})
			return
		}
	}
	res, err := col.UpdateByID(ctx, c.Param("id"), bson.M{"$set": bson.M{"active": req.Active}})
	if err != nil {
		d.Log.Error("set announcement active failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "切换公告状态失败"})
		return
	}
	if res.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "公告不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteAnnouncement DELETE /api/v1/announcements/:id
func (d Deps) DeleteAnnouncement(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	res, err := d.AdminCol("announcements").DeleteOne(ctx, bson.M{"_id": c.Param("id")})
	if err != nil {
		d.Log.Error("delete announcement failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "删除公告失败"})
		return
	}
	if res.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "公告不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
