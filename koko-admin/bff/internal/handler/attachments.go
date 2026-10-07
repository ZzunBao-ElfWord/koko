package handler

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/minio/minio-go/v7"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// ListAttachments GET /api/v1/attachments?tag=&page=1&page_size=20
// 媒体文件运营：分页列出 Autumn 落库的附件/头像/图标，联查上传者用户名；
// 已被消息使用的文件反查所在频道，供前端"定位消息"深链。
func (d Deps) ListAttachments(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	filter := bson.M{}
	if tag := c.Query("tag"); tag != "" {
		filter["tag"] = tag
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	col := d.RevoltCol("attachments")
	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		d.Log.Error("count attachments failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询媒体文件失败"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "uploaded_at", Value: -1}}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		d.Log.Error("find attachments failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询媒体文件失败"})
		return
	}
	defer cursor.Close(ctx)

	var raw []bson.M
	if err := cursor.All(ctx, &raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析媒体文件失败"})
		return
	}

	// 批量联查上传者用户名
	uploaderIDs := make([]string, 0, len(raw))
	for _, r := range raw {
		if uid, ok := r["uploader_id"].(string); ok && uid != "" {
			uploaderIDs = append(uploaderIDs, uid)
		}
	}
	uploaderMap := map[string]string{}
	if len(uploaderIDs) > 0 {
		uc, err := d.RevoltCol("users").Find(ctx,
			bson.M{"_id": bson.M{"$in": uploaderIDs}},
			options.Find().SetProjection(bson.M{"username": 1}))
		if err == nil {
			var users []struct {
				ID       string `bson:"_id"`
				Username string `bson:"username"`
			}
			_ = uc.All(ctx, &users)
			for _, u := range users {
				uploaderMap[u.ID] = u.Username
			}
		}
	}

	// 反查消息附件所在频道（attachments._id 匹配消息内嵌附件数组）
	channelMap := map[string]string{}
	for _, r := range raw {
		used, _ := r["used_for"].(bson.M)
		if used == nil {
			continue
		}
		if t, _ := used["type"].(string); t != "Message" {
			continue
		}
		fid, _ := r["_id"].(string)
		if fid == "" {
			continue
		}
		var msg struct {
			Channel string `bson:"channel"`
		}
		if err := d.RevoltCol("messages").FindOne(ctx,
			bson.M{"attachments._id": fid},
			options.FindOne().SetProjection(bson.M{"channel": 1})).Decode(&msg); err == nil {
			channelMap[fid] = msg.Channel
		}
	}

	type attachmentOut struct {
		ID           string `json:"id"`
		Tag          string `json:"tag"`
		Filename     string `json:"filename"`
		ContentType  string `json:"content_type"`
		MetaType     string `json:"meta_type"`
		Size         int64  `json:"size"`
		UploadedAt   int64  `json:"uploaded_at"` // 毫秒时间戳
		UploaderID   string `json:"uploader_id"`
		UploaderName string `json:"uploader_name"`
		UsedType     string `json:"used_type"`
		UsedID       string `json:"used_id"`
		ChannelID    string `json:"channel_id"`
		URL          string `json:"url"` // 相对路径 /autumn/{tag}/{id}，前端拼主域访问
	}
	items := make([]attachmentOut, 0, len(raw))
	for _, r := range raw {
		id, _ := r["_id"].(string)
		tag, _ := r["tag"].(string)
		filename, _ := r["filename"].(string)
		contentType, _ := r["content_type"].(string)
		size, _ := r["size"].(int64)
		uploadedAt, _ := r["uploaded_at"].(int64)
		uploaderID, _ := r["uploader_id"].(string)

		metaType := ""
		if meta, ok := r["metadata"].(bson.M); ok {
			metaType, _ = meta["type"].(string)
		}

		usedType, usedID := "", ""
		if used, ok := r["used_for"].(bson.M); ok {
			usedType, _ = used["type"].(string)
			usedID, _ = used["id"].(string)
		}

		items = append(items, attachmentOut{
			ID:           id,
			Tag:          tag,
			Filename:     filename,
			ContentType:  contentType,
			MetaType:     metaType,
			Size:         size,
			UploadedAt:   uploadedAt,
			UploaderID:   uploaderID,
			UploaderName: uploaderMap[uploaderID],
			UsedType:     usedType,
			UsedID:       usedID,
			ChannelID:    channelMap[id],
			URL:          "/autumn/" + tag + "/" + id,
		})
	}

	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

// DeleteAttachment DELETE /api/v1/attachments/:id
// Autumn v0.15.5 不提供删除接口（实测 DELETE 返回 405），因此由 BFF 直接清理：
// 1) 删除 Mongo 索引文档；2) 若同 hash 无其他索引引用（内容寻址去重），删除 MinIO 对象。
func (d Deps) DeleteAttachment(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	var doc struct {
		Tag  string `bson:"tag"`
		Hash string `bson:"hash"`
	}
	err := d.RevoltCol("attachments").FindOne(ctx, bson.M{"_id": id},
		options.FindOne().SetProjection(bson.M{"tag": 1, "hash": 1})).Decode(&doc)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "媒体文件不存在"})
		return
	}

	res, err := d.RevoltCol("attachments").DeleteOne(ctx, bson.M{"_id": id})
	if err != nil || res.DeletedCount == 0 {
		d.Log.Error("delete attachment doc failed", "error", err, "id", id)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "删除索引失败"})
		return
	}

	objectDeleted := false
	if d.Minio == nil {
		// 未配置对象存储：索引已删，对象成为孤儿（不影响功能，占存储）
		d.Log.Warn("minio not configured, object left orphaned", "hash", doc.Hash)
	} else if doc.Hash != "" {
		// 内容寻址去重：还有其他附件指向同一 hash 时不能删对象
		refs, err := d.RevoltCol("attachments").CountDocuments(ctx, bson.M{"hash": doc.Hash})
		if err == nil && refs == 0 {
			if err := d.Minio.RemoveObject(ctx, d.Cfg.MinioBucket, doc.Hash, minio.RemoveObjectOptions{}); err != nil {
				d.Log.Error("remove minio object failed", "error", err, "hash", doc.Hash)
			} else {
				objectDeleted = true
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "object_deleted": objectDeleted})
}

// AttachmentStats GET /api/v1/attachments/stats
// 存储用量：按 tag 分桶统计文件数与字节数，另附总量。
func (d Deps) AttachmentStats(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	pipeline := mongo.Pipeline{
		{{Key: "$group", Value: bson.M{
			"_id":   "$tag",
			"count": bson.M{"$sum": 1},
			"bytes": bson.M{"$sum": "$size"},
		}}},
		{{Key: "$sort", Value: bson.M{"bytes": -1}}},
	}
	cursor, err := d.RevoltCol("attachments").Aggregate(ctx, pipeline)
	if err != nil {
		d.Log.Error("aggregate attachment stats failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "统计存储用量失败"})
		return
	}
	defer cursor.Close(ctx)

	var rows []struct {
		Tag   string `bson:"_id"`
		Count int64  `bson:"count"`
		Bytes int64  `bson:"bytes"`
	}
	if err := cursor.All(ctx, &rows); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析存储统计失败"})
		return
	}

	byTag := make([]gin.H, 0, len(rows))
	totalCount, totalBytes := int64(0), int64(0)
	for _, r := range rows {
		byTag = append(byTag, gin.H{"tag": r.Tag, "count": r.Count, "bytes": r.Bytes})
		totalCount += r.Count
		totalBytes += r.Bytes
	}

	c.JSON(http.StatusOK, gin.H{
		"total_count": totalCount,
		"total_bytes": totalBytes,
		"by_tag":      byTag,
	})
}
