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

// B 端合作申请（koko_admin.b2b_applications）：公开提交，管理端审核
type b2bApplication struct {
	ID             string     `bson:"_id" json:"id"`
	Company        string     `bson:"company" json:"company"`
	Contact        string     `bson:"contact" json:"contact"`
	Phone          string     `bson:"phone" json:"phone"`
	IpType         string     `bson:"ip_type" json:"ip_type"`
	WorkDesc       string     `bson:"work_desc" json:"work_desc"`
	ExpectedVolume int64      `bson:"expected_volume,omitempty" json:"expected_volume,omitempty"`
	Status         string     `bson:"status" json:"status"` // pending|contacted|signed|active|rejected
	CreatedAt      time.Time  `bson:"created_at" json:"created_at"`
	UpdatedAt      *time.Time `bson:"updated_at,omitempty" json:"updated_at,omitempty"`
	HandledBy      string     `bson:"handled_by,omitempty" json:"handled_by,omitempty"`
}

type b2bApplyReq struct {
	Company        string `json:"company" binding:"required,min=2,max=128"`
	Contact        string `json:"contact" binding:"required,min=1,max=64"`
	Phone          string `json:"phone" binding:"required,min=4,max=64"`
	IpType         string `json:"ipType" binding:"required,oneof=出版 画师 IP运营 其他"`
	WorkDesc       string `json:"workDesc" binding:"required,min=1,max=2000"`
	ExpectedVolume int64  `json:"expectedVolume" binding:"omitempty,min=1,max=100000000"`
}

var b2bValidStatuses = map[string]bool{
	"pending": true, "contacted": true, "signed": true, "active": true, "rejected": true,
}

// SubmitB2bApply POST /api/v1/public/b2b-apply（公开端点，无 JWT）
func (d Deps) SubmitB2bApply(c *gin.Context) {
	var req b2bApplyReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid", "message": "参数校验失败: " + err.Error()})
		return
	}

	now := time.Now().UTC()
	entry := b2bApplication{
		ID:        model.NewID(),
		Company:   req.Company,
		Contact:   req.Contact,
		Phone:     req.Phone,
		IpType:    req.IpType,
		WorkDesc:  req.WorkDesc,
		Status:    "pending",
		CreatedAt: now,
	}
	if req.ExpectedVolume > 0 {
		entry.ExpectedVolume = req.ExpectedVolume
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if _, err := d.AdminCol("b2b_applications").InsertOne(ctx, entry); err != nil {
		d.Log.Error("b2b apply insert failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "提交失败，请稍后重试"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ListB2bApplications GET /api/v1/b2b/applications
func (d Deps) ListB2bApplications(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	cursor, err := d.AdminCol("b2b_applications").Find(ctx, bson.M{}, opts)
	if err != nil {
		d.Log.Error("list b2b applications failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询失败"})
		return
	}
	defer cursor.Close(ctx)

	items := make([]b2bApplication, 0)
	if err := cursor.All(ctx, &items); err != nil {
		d.Log.Error("decode b2b applications failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": items})
}

type b2bStatusReq struct {
	Status string `json:"status" binding:"required"`
}

// UpdateB2bApplicationStatus PATCH /api/v1/b2b/applications/:id
func (d Deps) UpdateB2bApplicationStatus(c *gin.Context) {
	id := c.Param("id")
	var req b2bStatusReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid", "message": "status 必填"})
		return
	}
	if !b2bValidStatuses[req.Status] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid", "message": "无效状态: " + req.Status})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	handledBy, _ := c.Get(middleware.CtxActorName)
	now := time.Now().UTC()
	result, err := d.AdminCol("b2b_applications").UpdateByID(ctx, id, bson.D{
		{Key: "$set", Value: bson.D{
			{Key: "status", Value: req.Status},
			{Key: "updated_at", Value: now},
			{Key: "handled_by", Value: handledBy},
		}},
	})
	if err != nil {
		d.Log.Error("update b2b status failed", "error", err, "id", id)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "更新失败"})
		return
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "申请不存在"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}
