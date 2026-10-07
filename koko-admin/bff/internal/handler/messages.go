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

	"koko-admin-bff/internal/ulid"
)

type messageRow struct {
	ID        string   `bson:"_id" json:"id"`
	ChannelID string   `bson:"channel" json:"channel"`
	AuthorID  string   `bson:"author" json:"author_id"`     // 原始用户 ULID（处置操作要用）
	Author    string   `bson:"-" json:"author"`             // 展示用用户名（联查填充）
	Content   string   `bson:"content" json:"content"`
	HitWords  []string `bson:"-" json:"hit_words"`          // 命中的敏感词（空数组 = 未命中）
}

// loadBannedWords 读取当前全部敏感词（词表极小，每次请求实时查，保证增删后立即生效）。
func (d Deps) loadBannedWords(ctx context.Context) []string {
	cursor, err := d.AdminCol("banned_words").Find(ctx, bson.M{},
		options.Find().SetProjection(bson.M{"word": 1}))
	if err != nil {
		d.Log.Warn("load banned words for hit-mark failed", "error", err)
		return nil
	}
	defer cursor.Close(ctx)
	var rows []struct {
		Word string `bson:"word"`
	}
	if err := cursor.All(ctx, &rows); err != nil {
		return nil
	}
	words := make([]string, 0, len(rows))
	for _, r := range rows {
		if w := strings.TrimSpace(r.Word); w != "" {
			words = append(words, w)
		}
	}
	return words
}

// markHitWords 对消息内容做包含匹配（不区分大小写），原地填充 hit_words。
// 词表与单页消息量都很小，O(消息数×词数) 开销可忽略。
func markHitWords(contents []string, words []string) [][]string {
	out := make([][]string, len(contents))
	if len(words) == 0 {
		for i := range out {
			out[i] = []string{}
		}
		return out
	}
	lowerWords := make([]string, len(words))
	for i, w := range words {
		lowerWords[i] = strings.ToLower(w)
	}
	for i, content := range contents {
		hits := []string{}
		lc := strings.ToLower(content)
		for j, lw := range lowerWords {
			if strings.Contains(lc, lw) {
				hits = append(hits, words[j])
			}
		}
		out[i] = hits
	}
	return out
}

// ListMessages GET /api/v1/channels/:cid/messages?page=1&page_size=20&q=
// 通过 Mongo 直连查询（管理员需要浏览历史记录，Delta API 不提供频道消息历史列表）。
func (d Deps) ListMessages(c *gin.Context) {
	channelID := c.Param("cid")

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 {
		page = 1
	}
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))
	if pageSize < 1 || pageSize > 50 {
		pageSize = 20
	}

	filter := bson.M{"channel": channelID}
	if q := c.Query("q"); q != "" {
		filter["content"] = bson.M{"$regex": q, "$options": "i"}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	col := d.RevoltCol("messages")
	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		d.Log.Error("count messages failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询消息失败"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: -1}}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize)).
		SetProjection(bson.M{"channel": 1, "author": 1, "content": 1})

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		d.Log.Error("find messages failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询消息失败"})
		return
	}
	defer cursor.Close(ctx)

	items := make([]messageRow, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析消息失败"})
		return
	}

	// 填充作者用户名（从 users 集合批量查找）；AuthorID 保留原始 ULID 供处置操作
	authorIDs := make([]string, 0)
	authorSet := map[string]bool{}
	for _, m := range items {
		if m.AuthorID != "" && !authorSet[m.AuthorID] {
			authorSet[m.AuthorID] = true
			authorIDs = append(authorIDs, m.AuthorID)
		}
	}
	if len(authorIDs) > 0 {
		userCursor, err := d.RevoltCol("users").Find(ctx,
			bson.M{"_id": bson.M{"$in": authorIDs}},
			options.Find().SetProjection(bson.M{"username": 1}))
		if err == nil {
			var users []struct {
				ID       string `bson:"_id"`
				Username string `bson:"username"`
			}
			_ = userCursor.All(ctx, &users)
			userMap := map[string]string{}
			for _, u := range users {
				userMap[u.ID] = u.Username
			}
			for i, m := range items {
				if name, ok := userMap[m.AuthorID]; ok {
					items[i].Author = name
				}
			}
		}
	}

	// 敏感词命中标记（运营浏览/检索时即时发现违规内容）
	words := d.loadBannedWords(ctx)
	contents := make([]string, len(items))
	for i, m := range items {
		contents[i] = m.Content
	}
	hits := markHitWords(contents, words)
	for i := range items {
		items[i].HitWords = hits[i]
	}

	c.JSON(http.StatusOK, gin.H{
		"items": items, "total": total, "page": page, "page_size": pageSize,
		"channel": channelID,
	})
}

// DeleteMessage DELETE /api/v1/channels/:cid/messages/:mid
// 通过 Delta API 代理删除（Delta 有该路由，且会触发 WebSocket 通知所有客户端）。
func (d Deps) DeleteMessage(c *gin.Context) {
	channelID := c.Param("cid")
	messageID := c.Param("mid")

	resp, err := d.Delta.Forward(
		c.Request.Context(),
		"DELETE",
		"/channels/"+channelID+"/messages/"+messageID,
		"",
		nil,
		"",
	)
	if err != nil {
		d.Log.Error("delete message via delta failed", "error", err, "channel", channelID, "message", messageID)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "删除消息失败"})
		return
	}
	if resp.StatusCode >= 400 {
		c.Data(resp.StatusCode, resp.ContentType, resp.Body)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// searchMaxResults 全站搜索硬上限，防止无索引正则全表暴扫拖垮库。
const searchMaxResults = 100

// SearchMessages GET /api/v1/messages/search?q=关键字&author=&days=7
// 全站内容搜索：关键字正则（转义）+ 可选作者 + 限定近 N 天（ULID 时间下界走索引），
// 结果联查作者名、频道名与所属空间名，供举报核查时跨频道定位。
func (d Deps) SearchMessages(c *gin.Context) {
	q := c.Query("q")
	if len([]rune(q)) < 2 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "关键字至少 2 个字符"})
		return
	}
	if len([]rune(q)) > 32 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "关键字最长 32 个字符"})
		return
	}

	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	if days < 1 || days > 90 {
		days = 7
	}
	author := c.Query("author")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	// ULID 字典序即时间序：用近 N 天下界把正则扫描限制在小范围内
	lower, _ := ulid.DayBounds(time.Now().AddDate(0, 0, -(days - 1)))
	filter := bson.M{
		"_id":     bson.M{"$gte": lower},
		"content": bson.M{"$regex": regexp.QuoteMeta(q), "$options": "i"},
	}
	if author != "" {
		filter["author"] = author
	}

	cursor, err := d.RevoltCol("messages").Find(ctx, filter,
		options.Find().
			SetSort(bson.D{{Key: "_id", Value: -1}}).
			SetLimit(searchMaxResults).
			SetProjection(bson.M{"channel": 1, "author": 1, "content": 1}))
	if err != nil {
		d.Log.Error("search messages failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "全站搜索失败"})
		return
	}
	defer cursor.Close(ctx)

	var raw []messageRow
	if err := cursor.All(ctx, &raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析搜索结果失败"})
		return
	}

	// 批量联查作者名
	authorIDs := make([]string, 0)
	channelIDs := make([]string, 0)
	seenA, seenC := map[string]bool{}, map[string]bool{}
	for _, m := range raw {
		if m.AuthorID != "" && !seenA[m.AuthorID] {
			seenA[m.AuthorID] = true
			authorIDs = append(authorIDs, m.AuthorID)
		}
		if m.ChannelID != "" && !seenC[m.ChannelID] {
			seenC[m.ChannelID] = true
			channelIDs = append(channelIDs, m.ChannelID)
		}
	}

	userMap := map[string]string{}
	if len(authorIDs) > 0 {
		uc, err := d.RevoltCol("users").Find(ctx, bson.M{"_id": bson.M{"$in": authorIDs}},
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

	// 频道 → 频道名 + 空间 ID
	type chanInfo struct {
		ID     string `bson:"_id"`
		Name   string `bson:"name"`
		Server string `bson:"server"`
	}
	chanMap := map[string]chanInfo{}
	serverIDs := make([]string, 0)
	if len(channelIDs) > 0 {
		cc, err := d.RevoltCol("channels").Find(ctx, bson.M{"_id": bson.M{"$in": channelIDs}},
			options.Find().SetProjection(bson.M{"name": 1, "server": 1}))
		if err == nil {
			var chans []chanInfo
			_ = cc.All(ctx, &chans)
			seenS := map[string]bool{}
			for _, ch := range chans {
				chanMap[ch.ID] = ch
				if ch.Server != "" && !seenS[ch.Server] {
					seenS[ch.Server] = true
					serverIDs = append(serverIDs, ch.Server)
				}
			}
		}
	}

	// 空间 ID → 空间名
	serverMap := map[string]string{}
	if len(serverIDs) > 0 {
		sc, err := d.RevoltCol("servers").Find(ctx, bson.M{"_id": bson.M{"$in": serverIDs}},
			options.Find().SetProjection(bson.M{"name": 1}))
		if err == nil {
			var srvs []struct {
				ID   string `bson:"_id"`
				Name string `bson:"name"`
			}
			_ = sc.All(ctx, &srvs)
			for _, s := range srvs {
				serverMap[s.ID] = s.Name
			}
		}
	}

	type searchHit struct {
		ID         string   `json:"id"`
		ChannelID  string   `json:"channel"`
		Channel    string   `json:"channel_name"`
		ServerName string   `json:"server_name"`
		AuthorID   string   `json:"author_id"`
		Author     string   `json:"author"`
		Content    string   `json:"content"`
		At         string   `json:"at"`
		HitWords   []string `json:"hit_words"`
	}
	hits := make([]searchHit, 0, len(raw))

	// 敏感词命中标记
	words := d.loadBannedWords(ctx)
	contents := make([]string, len(raw))
	for i, m := range raw {
		contents[i] = m.Content
	}
	hitMarks := markHitWords(contents, words)

	for i, m := range raw {
		at := ""
		if t, ok := ulid.TimeOf(m.ID); ok {
			at = t.Format(time.RFC3339)
		}
		ch := chanMap[m.ChannelID]
		hits = append(hits, searchHit{
			ID:         m.ID,
			ChannelID:  m.ChannelID,
			Channel:    ch.Name,
			ServerName: serverMap[ch.Server],
			AuthorID:   m.AuthorID,
			Author:     userMap[m.AuthorID],
			Content:    m.Content,
			At:         at,
			HitWords:   hitMarks[i],
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"items":    hits,
		"days":     days,
		"capped":   len(hits) >= searchMaxResults,
		"max_rows": searchMaxResults,
	})
}
