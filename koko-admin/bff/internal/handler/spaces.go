package handler

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type spaceRow struct {
	ID       string `bson:"_id" json:"id"`
	Name     string `bson:"name" json:"name"`
	Owner    string `bson:"owner" json:"owner"`
	Channels int    `bson:"-" json:"channels"`
	Members  int    `bson:"-" json:"members"`
}

// ListSpaces GET /api/v1/spaces?page=1&page_size=20&q=
func (d Deps) ListSpaces(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	filter := bson.M{}
	if q := c.Query("q"); q != "" {
		filter["name"] = bson.M{"$regex": q, "$options": "i"}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	col := d.RevoltCol("servers")
	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		d.Log.Error("count servers failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询空间失败"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: -1}}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize)).
		SetProjection(bson.M{"name": 1, "owner": 1})

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		d.Log.Error("find servers failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询空间失败"})
		return
	}
	defer cursor.Close(ctx)

	items := make([]spaceRow, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析空间失败"})
		return
	}

	// 统计每个空间的频道数和成员数
	for i, s := range items {
		chCount, _ := d.RevoltCol("channels").CountDocuments(ctx, bson.M{"server": s.ID})
		memCount, _ := d.RevoltCol("server_members").CountDocuments(ctx, bson.M{"_id.server": s.ID})
		items[i].Channels = int(chCount)
		items[i].Members = int(memCount)
	}

	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

// ListSpaceMembers GET /api/v1/spaces/:id/members?page=1&page_size=20
func (d Deps) ListSpaceMembers(c *gin.Context) {
	serverID := c.Param("id")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	col := d.RevoltCol("server_members")
	filter := bson.M{"_id.server": serverID}
	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		d.Log.Error("count members failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询成员失败"})
		return
	}

	opts := options.Find().
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize))

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		d.Log.Error("find members failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询成员失败"})
		return
	}
	defer cursor.Close(ctx)

	var raw []bson.M
	if err := cursor.All(ctx, &raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析成员失败"})
		return
	}

	// 提取用户 ID 并批量查用户名
	userIDs := make([]string, 0)
	for _, r := range raw {
		if id, ok := r["_id"].(bson.M); ok {
			if uid, ok2 := id["user"].(string); ok2 {
				userIDs = append(userIDs, uid)
			}
		}
	}
	userMap := map[string]string{}
	if len(userIDs) > 0 {
		uc, err := d.RevoltCol("users").Find(ctx,
			bson.M{"_id": bson.M{"$in": userIDs}},
			options.Find().SetProjection(bson.M{"username": 1}))
		if err == nil {
			var users []struct {
				ID       string `bson:"_id"`
				Username string `bson:"username"`
			}
			_ = uc.All(ctx, &users)
			for _, u := range users {
				userMap[u.ID] = u.Username
			}
		}
	}

	type memberOut struct {
		UserID   string `json:"user_id"`
		Username string `json:"username"`
		Nickname string `json:"nickname"`
		Roles    []any  `json:"roles"`
	}
	items := make([]memberOut, 0, len(raw))
	for _, r := range raw {
		uid := ""
		if id, ok := r["_id"].(bson.M); ok {
			uid, _ = id["user"].(string)
		}
		nick, _ := r["nickname"].(string)
		roles, _ := r["roles"].(bson.A)
		if roles == nil {
			roles = []any{}
		}
		items = append(items, memberOut{
			UserID:   uid,
			Username: userMap[uid],
			Nickname: nick,
			Roles:    roles,
		})
	}

	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

// BanSpaceMember PUT /api/v1/spaces/:id/bans/:uid
// 通过 Delta API 代理封禁（PUT /servers/{id}/bans/{target}）。
// Delta 侧 DataBanCreate 要求合法 JSON 请求体（reason / delete_message_seconds 均可选），
// 空体会被判 malformed 400，因此必须透传请求体并补 Content-Type。
func (d Deps) BanSpaceMember(c *gin.Context) {
	serverID := c.Param("id")
	userID := c.Param("uid")

	body, err := io.ReadAll(io.LimitReader(c.Request.Body, 64<<10))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "请求体读取失败"})
		return
	}
	if len(bytes.TrimSpace(body)) == 0 {
		body = []byte("{}") // 兜底为空对象，保证 Delta 可解析
	}

	resp, err := d.Delta.Forward(
		c.Request.Context(),
		"PUT",
		"/servers/"+serverID+"/bans/"+userID,
		"",
		body,
		"application/json",
	)
	if err != nil {
		d.Log.Error("ban member failed", "error", err, "server", serverID, "user", userID)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "封禁成员失败"})
		return
	}
	if resp.StatusCode >= 400 {
		c.Data(resp.StatusCode, resp.ContentType, resp.Body)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UnbanSpaceMember DELETE /api/v1/spaces/:id/bans/:uid
func (d Deps) UnbanSpaceMember(c *gin.Context) {
	serverID := c.Param("id")
	userID := c.Param("uid")

	resp, err := d.Delta.Forward(
		c.Request.Context(),
		"DELETE",
		"/servers/"+serverID+"/bans/"+userID,
		"",
		nil,
		"",
	)
	if err != nil {
		d.Log.Error("unban member failed", "error", err, "server", serverID, "user", userID)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "解封成员失败"})
		return
	}
	if resp.StatusCode >= 400 {
		c.Data(resp.StatusCode, resp.ContentType, resp.Body)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// KickSpaceMember DELETE /api/v1/spaces/:id/members/:uid
func (d Deps) KickSpaceMember(c *gin.Context) {
	serverID := c.Param("id")
	userID := c.Param("uid")

	resp, err := d.Delta.Forward(
		c.Request.Context(),
		"DELETE",
		"/servers/"+serverID+"/members/"+userID,
		"",
		nil,
		"",
	)
	if err != nil {
		d.Log.Error("kick member failed", "error", err, "server", serverID, "user", userID)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "移出成员失败"})
		return
	}
	if resp.StatusCode >= 400 {
		c.Data(resp.StatusCode, resp.ContentType, resp.Body)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ListSpaceChannels GET /api/v1/spaces/:id/channels
func (d Deps) ListSpaceChannels(c *gin.Context) {
	serverID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	cursor, err := d.RevoltCol("channels").Find(ctx,
		bson.M{"server": serverID},
		options.Find().SetProjection(bson.M{"name": 1, "channel_type": 1}))
	if err != nil {
		d.Log.Error("find channels failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询频道失败"})
		return
	}
	defer cursor.Close(ctx)

	type channelRow struct {
		ID   string `bson:"_id" json:"id"`
		Name string `bson:"name" json:"name"`
		Type string `bson:"channel_type" json:"type"`
	}
	items := make([]channelRow, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析频道失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": items, "total": len(items)})
}

// DeleteChannel DELETE /api/v1/channels/:cid
func (d Deps) DeleteChannel(c *gin.Context) {
	channelID := c.Param("cid")

	resp, err := d.Delta.Forward(
		c.Request.Context(),
		"DELETE",
		"/channels/"+channelID,
		"",
		nil,
		"",
	)
	if err != nil {
		d.Log.Error("delete channel failed", "error", err, "channel", channelID)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "删除频道失败"})
		return
	}
	if resp.StatusCode >= 400 {
		c.Data(resp.StatusCode, resp.ContentType, resp.Body)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ListSpaceBans GET /api/v1/spaces/:id/bans
// 封禁列表直接读 Delta 落库的 server_bans 集合（_id 为 {server, user} 复合键）。
func (d Deps) ListSpaceBans(c *gin.Context) {
	serverID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	col := d.RevoltCol("server_bans")
	filter := bson.M{"_id.server": serverID}
	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		d.Log.Error("count bans failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询封禁列表失败"})
		return
	}

	cursor, err := col.Find(ctx, filter, options.Find().SetSort(bson.D{{Key: "_id.user", Value: 1}}))
	if err != nil {
		d.Log.Error("find bans failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询封禁列表失败"})
		return
	}
	defer cursor.Close(ctx)

	var raw []bson.M
	if err := cursor.All(ctx, &raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析封禁列表失败"})
		return
	}

	// 批量联查用户名
	userIDs := make([]string, 0, len(raw))
	for _, r := range raw {
		if id, ok := r["_id"].(bson.M); ok {
			if uid, ok2 := id["user"].(string); ok2 {
				userIDs = append(userIDs, uid)
			}
		}
	}
	userMap := map[string]string{}
	if len(userIDs) > 0 {
		uc, err := d.RevoltCol("users").Find(ctx,
			bson.M{"_id": bson.M{"$in": userIDs}},
			options.Find().SetProjection(bson.M{"username": 1}))
		if err == nil {
			var users []struct {
				ID       string `bson:"_id"`
				Username string `bson:"username"`
			}
			_ = uc.All(ctx, &users)
			for _, u := range users {
				userMap[u.ID] = u.Username
			}
		}
	}

	type banOut struct {
		UserID   string `json:"user_id"`
		Username string `json:"username"`
		Reason   string `json:"reason"`
	}
	items := make([]banOut, 0, len(raw))
	for _, r := range raw {
		uid := ""
		if id, ok := r["_id"].(bson.M); ok {
			uid, _ = id["user"].(string)
		}
		reason, _ := r["reason"].(string)
		items = append(items, banOut{UserID: uid, Username: userMap[uid], Reason: reason})
	}

	c.JSON(http.StatusOK, gin.H{"items": items, "total": total})
}
