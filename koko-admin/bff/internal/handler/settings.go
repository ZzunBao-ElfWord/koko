package handler

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/middleware"
)

// 全局设置（koko_admin.settings）：单文档 _id=global。
// header_link 是 App 社区头部卡片的统一跳转链接，所有空间共用。
const globalSettingsID = "global"

type globalSettings struct {
	HeaderLink string     `bson:"header_link" json:"header_link"`
	UpdatedAt  *time.Time `bson:"updated_at,omitempty" json:"updated_at,omitempty"`
	UpdatedBy  string     `bson:"updated_by,omitempty" json:"updated_by,omitempty"`
}

type updateGlobalSettingsReq struct {
	HeaderLink string `json:"header_link"`
}

func (d Deps) loadGlobalSettings(ctx context.Context) (globalSettings, error) {
	var s globalSettings
	err := d.AdminCol("settings").
		FindOne(ctx, bson.M{"_id": globalSettingsID}).
		Decode(&s)
	if err == mongo.ErrNoDocuments {
		return globalSettings{}, nil
	}
	return s, err
}

// GetPublicSettings GET /api/v1/public/settings
// App 匿名读取，只返回头部跳转链接；允许跨域与短缓存。
func (d Deps) GetPublicSettings(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	s, err := d.loadGlobalSettings(ctx)
	if err != nil {
		d.Log.Error("load global settings failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "读取全局设置失败"})
		return
	}
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Cache-Control", "public, max-age=60")
	c.JSON(http.StatusOK, gin.H{"header_link": s.HeaderLink})
}

// GetSettings GET /api/v1/settings
func (d Deps) GetSettings(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	s, err := d.loadGlobalSettings(ctx)
	if err != nil {
		d.Log.Error("load global settings failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "读取全局设置失败"})
		return
	}
	c.JSON(http.StatusOK, s)
}

// UpdateSettings PATCH /api/v1/settings
func (d Deps) UpdateSettings(c *gin.Context) {
	var req updateGlobalSettingsReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "参数格式不正确"})
		return
	}

	link := strings.TrimSpace(req.HeaderLink)
	if len(link) > 2048 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_url", "message": "链接长度不能超过 2048 个字符"})
		return
	}
	if link != "" {
		u, err := url.Parse(link)
		if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid_url", "message": "链接必须以 http:// 或 https:// 开头"})
			return
		}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	now := time.Now().UTC()
	_, err := d.AdminCol("settings").UpdateOne(ctx,
		bson.M{"_id": globalSettingsID},
		bson.M{"$set": bson.M{
			"header_link": link,
			"updated_at":  now,
			"updated_by":  c.GetString(middleware.CtxActorName),
		}},
		options.Update().SetUpsert(true),
	)
	if err != nil {
		d.Log.Error("update global settings failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "保存全局设置失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "header_link": link})
}
