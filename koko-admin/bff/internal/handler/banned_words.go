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

type bannedWord struct {
	ID        string    `bson:"_id" json:"id"`
	Word      string    `bson:"word" json:"word"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	CreatedBy string    `bson:"created_by" json:"created_by"`
}

type bannedWordReq struct {
	Word string `json:"word" binding:"required,min=1,max=128"`
}

// ListBannedWords GET /api/v1/banned-words
func (d Deps) ListBannedWords(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	col := d.AdminCol("banned_words")
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	cursor, err := col.Find(ctx, bson.M{}, opts)
	if err != nil {
		d.Log.Error("list banned words failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询敏感词失败"})
		return
	}
	defer cursor.Close(ctx)

	// 空结果必须返回 [] 而非 null（前端直接取 length）
	items := make([]bannedWord, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析敏感词失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

// AddBannedWord POST /api/v1/banned-words
func (d Deps) AddBannedWord(c *gin.Context) {
	var req bannedWordReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "敏感词内容不能为空"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	actor, _ := c.Get(middleware.CtxActorID)
	actorID, _ := actor.(string)

	col := d.AdminCol("banned_words")
	// 幂等：已存在则直接返回已有 ID
	var exist bannedWord
	if err := col.FindOne(ctx, bson.M{"word": req.Word}).Decode(&exist); err == nil {
		c.JSON(http.StatusOK, gin.H{"id": exist.ID, "word": exist.Word, "existed": true})
		return
	}

	_, err := col.InsertOne(ctx, bson.M{
		"_id":        model.NewID(),
		"word":       req.Word,
		"created_at": time.Now().UTC(),
		"created_by": actorID,
	})
	if err != nil {
		d.Log.Error("insert banned word failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "添加敏感词失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// RemoveBannedWord DELETE /api/v1/banned-words/:id
func (d Deps) RemoveBannedWord(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	res, err := d.AdminCol("banned_words").DeleteOne(ctx, bson.M{"_id": c.Param("id")})
	if err != nil {
		d.Log.Error("delete banned word failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "删除敏感词失败"})
		return
	}
	if res.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "敏感词不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
