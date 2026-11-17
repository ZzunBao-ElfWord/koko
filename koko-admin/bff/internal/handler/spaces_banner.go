package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/middleware"
)

// 附件存于 Autumn，审核记录存于后台自有数据库。只有审核通过才更新 Stoat 空间头图。
const (
	spaceBannerCollection = "space_banner_reviews"
	bannerStatusPending   = "pending"
	bannerStatusReviewing = "reviewing"
	bannerStatusApproved  = "approved"
	bannerStatusRejected  = "rejected"
)

type spaceBannerPending struct {
	SpaceID         string    `bson:"_id"`
	AttachmentID    string    `bson:"attachment_id" json:"attachment_id"`
	Filename        string    `bson:"filename" json:"filename"`
	Status          string    `bson:"status" json:"status"`
	Note            string    `bson:"note" json:"note"`
	UploadedAt      time.Time `bson:"uploaded_at" json:"uploaded_at"`
	UploadedBy      string    `bson:"uploaded_by" json:"uploaded_by"`
	ReviewStartedAt time.Time `bson:"review_started_at" json:"-"`
	ReviewedAt      time.Time `bson:"reviewed_at" json:"reviewed_at"`
	ReviewedBy      string    `bson:"reviewed_by" json:"reviewed_by"`
}

type spaceBannerInfo struct {
	AttachmentID string     `json:"attachment_id"`
	URL          string     `json:"url"`
	Status       string     `json:"status,omitempty"`
	Note         string     `json:"note,omitempty"`
	Filename     string     `json:"filename,omitempty"`
	UploadedAt   *time.Time `json:"uploaded_at,omitempty"`
	UploadedBy   string     `json:"uploaded_by,omitempty"`
	ReviewedAt   *time.Time `json:"reviewed_at,omitempty"`
	ReviewedBy   string     `json:"reviewed_by,omitempty"`
}

type spaceBannerView struct {
	Current *spaceBannerInfo `json:"current"`
	Pending *spaceBannerInfo `json:"pending"`
}

type reviewBannerReq struct {
	AttachmentID string `json:"attachment_id"`
	Action       string `json:"action"`
	Note         string `json:"note"`
}

func (d Deps) bannerURL(attachmentID string) string {
	if attachmentID == "" {
		return ""
	}
	return strings.TrimRight(d.Cfg.AutumnPublicURL, "/") + "/banners/" + attachmentID
}

// loadSpaceBanner treats Stoat as the source of truth for the displayed image.
func (d Deps) loadSpaceBanner(ctx context.Context, spaceID string) (string, *spaceBannerPending, error) {
	var space struct {
		Banner any `bson:"banner"`
	}
	err := d.RevoltCol("servers").FindOne(ctx, bson.M{"_id": spaceID},
		options.FindOne().SetProjection(bson.M{"banner": 1})).Decode(&space)
	if err != nil {
		return "", nil, err
	}

	var currentID string
	switch banner := space.Banner.(type) {
	case string:
		currentID = banner
	case bson.D:
		currentID, _ = banner.Map()["_id"].(string)
	case bson.M:
		currentID, _ = banner["_id"].(string)
	}

	var pending spaceBannerPending
	err = d.AdminCol(spaceBannerCollection).FindOne(ctx, bson.M{"_id": spaceID}).Decode(&pending)
	if err == mongo.ErrNoDocuments {
		return currentID, nil, nil
	}
	if err != nil {
		return "", nil, err
	}
	if pending.Status == bannerStatusReviewing && time.Since(pending.ReviewStartedAt) >= time.Minute {
		nextStatus := bannerStatusPending
		if currentID == pending.AttachmentID {
			nextStatus = bannerStatusApproved
		}
		result, err := d.AdminCol(spaceBannerCollection).UpdateOne(ctx, bson.M{
			"_id": spaceID, "attachment_id": pending.AttachmentID, "status": bannerStatusReviewing,
			"review_started_at": pending.ReviewStartedAt,
		}, bson.M{"$set": bson.M{"status": nextStatus}})
		if err != nil {
			return "", nil, err
		}
		if result.MatchedCount > 0 {
			pending.Status = nextStatus
		}
	}
	return currentID, &pending, nil
}

func (d Deps) bannerView(currentID string, pending *spaceBannerPending) spaceBannerView {
	view := spaceBannerView{}
	if currentID != "" {
		view.Current = &spaceBannerInfo{
			AttachmentID: currentID,
			URL:          d.bannerURL(currentID),
			Status:       bannerStatusApproved,
		}
	}
	if pending != nil {
		view.Pending = &spaceBannerInfo{
			AttachmentID: pending.AttachmentID,
			URL:          d.bannerURL(pending.AttachmentID),
			Status:       pending.Status,
			Note:         pending.Note,
			Filename:     pending.Filename,
			UploadedBy:   pending.UploadedBy,
			ReviewedBy:   pending.ReviewedBy,
		}
		if !pending.UploadedAt.IsZero() {
			t := pending.UploadedAt
			view.Pending.UploadedAt = &t
		}
		if !pending.ReviewedAt.IsZero() {
			t := pending.ReviewedAt
			view.Pending.ReviewedAt = &t
		}
	}
	return view
}

// GetSpaceBanner GET /api/v1/spaces/:id/banner
func (d Deps) GetSpaceBanner(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	currentID, pending, err := d.loadSpaceBanner(ctx, c.Param("id"))
	if err != nil {
		d.writeBannerReadError(c, err)
		return
	}
	c.JSON(http.StatusOK, d.bannerView(currentID, pending))
}

func (d Deps) writeBannerReadError(c *gin.Context, err error) {
	if err == mongo.ErrNoDocuments {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "空间不存在"})
		return
	}
	d.Log.Error("load space banner failed", "error", err, "space", c.Param("id"))
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "读取头图失败"})
}

// ReviewSpaceBanner POST /api/v1/spaces/:id/banner/review
// 通过时走 Delta PATCH /servers/:id 写入 banner，和 App 端上传行为保持一致。
func (d Deps) ReviewSpaceBanner(c *gin.Context) {
	var req reviewBannerReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "请求体格式错误"})
		return
	}
	if req.Action != "approve" && req.Action != "reject" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "action 只能是 approve 或 reject"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	spaceID := c.Param("id")
	currentID, pending, err := d.loadSpaceBanner(ctx, spaceID)
	if err != nil {
		d.writeBannerReadError(c, err)
		return
	}
	if pending == nil || pending.AttachmentID != req.AttachmentID || pending.Status != bannerStatusPending {
		c.JSON(http.StatusConflict, gin.H{"error": "conflict", "message": "待审头图已变更，请刷新后重试"})
		return
	}

	note := strings.TrimSpace(req.Note)
	if req.Action == "reject" && (note == "" || len([]rune(note)) > 500) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "请填写驳回原因，最多 500 字"})
		return
	}

	reviews := d.AdminCol(spaceBannerCollection)
	filter := bson.M{"_id": spaceID, "attachment_id": req.AttachmentID, "status": bannerStatusPending}
	status := bannerStatusRejected
	now := time.Now().UTC()
	actor := c.GetString(middleware.CtxActorName)
	if req.Action == "approve" {
		result, err := reviews.UpdateOne(ctx, filter, bson.M{"$set": bson.M{"status": bannerStatusReviewing, "review_started_at": now, "reviewed_by": actor, "reviewed_at": now}})
		if !d.checkBannerReviewUpdate(c, result, err) {
			return
		}
		filter["status"] = bannerStatusReviewing
		filter["review_started_at"] = now
		patch, _ := json.Marshal(map[string]string{"banner": pending.AttachmentID})
		resp, err := d.Delta.Forward(ctx, http.MethodPatch, "/servers/"+spaceID, "", patch, "application/json")
		if err != nil || resp.StatusCode < 200 || resp.StatusCode >= 300 {
			recovery, cancel := context.WithTimeout(context.WithoutCancel(c.Request.Context()), 5*time.Second)
			defer cancel()
			if _, resetErr := reviews.UpdateOne(recovery, filter, bson.M{"$set": bson.M{"status": bannerStatusPending}}); resetErr != nil {
				d.Log.Error("restore banner review failed", "error", resetErr, "space", spaceID)
			}
			if err != nil {
				d.Log.Error("apply banner to delta failed", "error", err, "space", spaceID)
			} else {
				d.Log.Error("delta rejected banner", "status", resp.StatusCode, "space", spaceID)
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": "upstream", "message": "写入空间头图失败"})
			return
		}
		currentID = pending.AttachmentID
		status, note = bannerStatusApproved, ""
	}
	finalize, cancelFinalize := context.WithTimeout(context.WithoutCancel(c.Request.Context()), 5*time.Second)
	defer cancelFinalize()
	result, err := reviews.UpdateOne(finalize, filter, bson.M{"$set": bson.M{
		"status": status, "note": note, "reviewed_at": now, "reviewed_by": actor,
	}})
	if !d.checkBannerReviewUpdate(c, result, err) {
		return
	}
	pending.Status = status
	pending.Note = note
	pending.ReviewedAt = now
	pending.ReviewedBy = actor
	c.JSON(http.StatusOK, d.bannerView(currentID, pending))
}

func (d Deps) checkBannerReviewUpdate(c *gin.Context, result *mongo.UpdateResult, err error) bool {
	if err != nil {
		d.Log.Error("update banner review failed", "error", err, "space", c.Param("id"))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "保存审核结果失败"})
		return false
	}
	if result.MatchedCount == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "conflict", "message": "待审头图已变更，请刷新后重试"})
		return false
	}
	return true
}
