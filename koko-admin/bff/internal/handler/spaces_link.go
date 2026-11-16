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
)

// 空间头部卡片跳转链接：直接存在 Delta 的 servers 文档上，一个空间一个。
const spaceHeaderLinkField = "koko_header_link"

type spaceHeaderLink struct {
	HeaderLink string `bson:"koko_header_link" json:"header_link"`
}

type updateSpaceHeaderLinkReq struct {
	HeaderLink string `json:"header_link"`
}

// normalizeSpaceHeaderLink 校验并规整链接；空字符串表示清空（未配置）。
func normalizeSpaceHeaderLink(raw string) (string, bool) {
	link := strings.TrimSpace(raw)
	if link == "" {
		return "", true
	}
	if len(link) > 2048 {
		return "", false
	}
	u, err := url.Parse(link)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return "", false
	}
	return link, true
}

func (d Deps) loadSpaceHeaderLink(ctx context.Context, spaceID string) (string, error) {
	var doc spaceHeaderLink
	err := d.RevoltCol("servers").
		FindOne(ctx, bson.M{"_id": spaceID},
			options.FindOne().SetProjection(bson.M{spaceHeaderLinkField: 1})).
		Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return "", nil
	}
	return doc.HeaderLink, err
}

// GetSpaceHeaderLink GET /api/v1/spaces/:id/header-link
func (d Deps) GetSpaceHeaderLink(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	link, err := d.loadSpaceHeaderLink(ctx, c.Param("id"))
	if err != nil {
		d.Log.Error("load space header link failed", "error", err, "space", c.Param("id"))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "读取链接失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"header_link": link})
}

// UpdateSpaceHeaderLink PATCH /api/v1/spaces/:id/header-link
func (d Deps) UpdateSpaceHeaderLink(c *gin.Context) {
	var req updateSpaceHeaderLinkReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "请求体格式错误"})
		return
	}

	link, ok := normalizeSpaceHeaderLink(req.HeaderLink)
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "链接必须是以 http:// 或 https:// 开头、长度不超过 2048 的地址"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	spaceID := c.Param("id")
	res, err := d.RevoltCol("servers").UpdateOne(ctx,
		bson.M{"_id": spaceID},
		bson.M{"$set": bson.M{spaceHeaderLinkField: link}})
	if err != nil {
		d.Log.Error("update space header link failed", "error", err, "space", spaceID)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "保存链接失败"})
		return
	}
	if res.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "空间不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"header_link": link})
}

// GetPublicSpaceHeaderLink GET /api/v1/public/spaces/:id/header-link
// App 匿名读取当前空间的头部跳转链接，未配置时返回空串。
func (d Deps) GetPublicSpaceHeaderLink(c *gin.Context) {
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("Cache-Control", "public, max-age=60")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	link, err := d.loadSpaceHeaderLink(ctx, c.Param("id"))
	if err != nil {
		d.Log.Error("public load space header link failed", "error", err, "space", c.Param("id"))
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "读取链接失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"header_link": link})
}
