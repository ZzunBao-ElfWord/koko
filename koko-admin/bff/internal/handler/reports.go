package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/middleware"
)

// Report 按线上文档宽松解码：不同 Stoat/Revolt 版本字段形状可能不同（见 AGENTS.md 第 5 节），
// Status 保留原始结构，由前端做展示兼容。确认线上形状后再收紧为强类型。
type Report struct {
	ID       string `bson:"_id" json:"id"`
	AuthorID string `bson:"author_id,omitempty" json:"author_id,omitempty"`
	TargetID string `bson:"target_id,omitempty" json:"target_id,omitempty"`
	Reason   string `bson:"reason,omitempty" json:"reason,omitempty"`
	Context  string `bson:"context,omitempty" json:"context,omitempty"`
	Notes    string `bson:"notes,omitempty" json:"notes,omitempty"`
	Status   any    `bson:"status,omitempty" json:"status,omitempty"`
}

type reportStatusRequest struct {
	Status string `json:"status" binding:"required"`
	Note   string `json:"note"`
}

// SetReportStatus POST /api/v1/reports/:id/status
// 状态流转：Resolved（核实处理）/ Rejected（驳回无效举报）。
// 注意：status 写入形状待按线上集合最终确认；审计日志(koko_admin.audit_logs)是处置的权威记录。
func (d Deps) SetReportStatus(c *gin.Context) {
	var req reportStatusRequest
	if err := c.ShouldBindJSON(&req); err != nil ||
		(req.Status != "Resolved" && req.Status != "Rejected") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "status 仅支持 Resolved / Rejected"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	update := bson.M{"$set": bson.M{
		"status":      req.Status,
		"resolved_by": c.GetString(middleware.CtxActorName),
		"resolved_at": time.Now().UTC(),
		"resolution":  req.Note,
	}}
	res, err := d.RevoltCol("safety_reports").UpdateByID(ctx, c.Param("id"), update)
	if err != nil {
		d.Log.Error("update report status failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "处置举报失败"})
		return
	}
	if res.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "举报不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ListReports GET /api/v1/reports?status=waiting|resolved|all
func (d Deps) ListReports(c *gin.Context) {
	filter := bson.M{}
	switch c.DefaultQuery("status", "waiting") {
	case "waiting":
		// 兼容 status 缺失、null、空串或 "Waiting" 的未处理记录
		filter["status"] = bson.M{"$in": bson.A{"Waiting", "", nil}}
	case "resolved":
		// 已办结：核实处理 + 驳回
		filter["status"] = bson.M{"$in": bson.A{"Resolved", "Rejected"}}
	case "all":
	default:
		filter["status"] = bson.M{"$in": bson.A{"Waiting", "", nil}}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: -1}}).
		SetLimit(200)

	cursor, err := d.RevoltCol("safety_reports").Find(ctx, filter, opts)
	if err != nil {
		d.Log.Error("find reports failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询举报失败"})
		return
	}
	defer cursor.Close(ctx)

	items := make([]Report, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析举报数据失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}
