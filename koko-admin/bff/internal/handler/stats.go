package handler

import (
	"context"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/ulid"
)

// 命中统计的扫描上限：近 N 天消息量 × 词表规模，防止大表拖垮查询。
const hitStatsScanLimit = 5000

type wordStat struct {
	Word  string `json:"word"`
	Hits  int    `json:"hits"`
	Users int    `json:"users"` // 命中过的不同作者数
}

// BannedWordStats GET /api/v1/banned-words/stats?days=7
// 敏感词命中统计：扫描近 N 天消息（上限 5000 条），对每个敏感词计数命中次数与涉及作者数。
// 实时计算（无物化表），消息量大时仅覆盖最近 5000 条，返回 capped 标记供前端提示。
func (d Deps) BannedWordStats(c *gin.Context) {
	days, _ := strconv.Atoi(c.DefaultQuery("days", "7"))
	if days < 1 || days > 30 {
		days = 7
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	words := d.loadBannedWords(ctx)
	if len(words) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"items": []wordStat{}, "days": days, "scanned": 0, "capped": false,
		})
		return
	}

	// ULID 字典序即时间序，用下界限制扫描范围
	lower, _ := ulid.DayBounds(time.Now().AddDate(0, 0, -(days - 1)))
	filter := bson.M{
		"_id": bson.M{"$gte": lower},
	}
	// 仅拉取需要的字段，减少内存
	cursor, err := d.RevoltCol("messages").Find(ctx, filter,
		options.Find().
			SetSort(bson.D{{Key: "_id", Value: -1}}).
			SetLimit(hitStatsScanLimit).
			SetProjection(bson.M{"content": 1, "author": 1}))
	if err != nil {
		d.Log.Error("banned word stats scan failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "统计扫描失败"})
		return
	}
	defer cursor.Close(ctx)

	type msg struct {
		Author  string `bson:"author"`
		Content string `bson:"content"`
	}
	var raw []msg
	if err := cursor.All(ctx, &raw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析消息失败"})
		return
	}

	// 预处理：小写化词表
	lowerWords := make([]string, len(words))
	for i, w := range words {
		lowerWords[i] = strings.ToLower(w)
	}

	// 累加命中
	hits := make([]int, len(words))
	users := make([]map[string]bool, len(words))
	for i := range users {
		users[i] = map[string]bool{}
	}
	for _, m := range raw {
		lc := strings.ToLower(m.Content)
		for i, lw := range lowerWords {
			if strings.Contains(lc, lw) {
				hits[i]++
				if m.Author != "" {
					users[i][m.Author] = true
				}
			}
		}
	}

	items := make([]wordStat, 0, len(words))
	for i, w := range words {
		if hits[i] == 0 {
			continue
		}
		items = append(items, wordStat{
			Word:  w,
			Hits:  hits[i],
			Users: len(users[i]),
		})
	}
	// 按命中数倒序
	for i := 0; i < len(items); i++ {
		for j := i + 1; j < len(items); j++ {
			if items[j].Hits > items[i].Hits {
				items[i], items[j] = items[j], items[i]
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"items":   items,
		"days":    days,
		"scanned": len(raw),
		"capped":  len(raw) >= hitStatsScanLimit,
	})
}

// ===== 数据看板 =====

// dayCount 单日计数序列元素（前端 BarSeries 消费）。
type dayCount struct {
	Date  string `json:"date"`
	Count int64  `json:"count"`
}

// lastNDays 返回最近 n 个 UTC 自然日（从旧到新），用于按天统计。
func lastNDays(n int) []time.Time {
	now := time.Now().UTC()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	out := make([]time.Time, 0, n)
	for i := n - 1; i >= 0; i-- {
		out = append(out, today.AddDate(0, 0, -i))
	}
	return out
}

// StatsOverview GET /api/v1/stats/overview
// 数据看板：总量、近 7 天新增/DAU、存储用量、活跃频道、最近注册用户。
// 全部实时查 Mongo（AGENTS.md 第 5 节：聚合统计走 ULID 边界串，不物化）。
func (d Deps) StatsOverview(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 20*time.Second)
	defer cancel()

	totals := gin.H{
		"users":    d.countDocs(ctx, "users"),
		"servers":  d.countDocs(ctx, "servers"),
		"channels": d.countDocs(ctx, "channels"),
		"messages": d.countDocs(ctx, "messages"),
	}

	days := lastNDays(7)
	lower7, _ := ulid.DayBounds(days[0])

	c.JSON(http.StatusOK, gin.H{
		"totals":           totals,
		"new_users_7d":     d.countPerDay(ctx, "users", days),
		"new_spaces_7d":    d.countPerDay(ctx, "servers", days),
		"new_messages_7d":  d.countPerDay(ctx, "messages", days),
		"dau_7d":           d.dauPerDay(ctx, days),
		"storage":          d.storageSummary(ctx),
		"top_channels_7d":  d.topChannels(ctx, lower7),
		"recent_users":     d.recentUsers(ctx),
		"generated_at":     time.Now().UTC().Format(time.RFC3339),
	})
}

// countDocs 集合文档总数（看板低频，用精确 CountDocuments）。
func (d Deps) countDocs(ctx context.Context, col string) int64 {
	n, err := d.RevoltCol(col).CountDocuments(ctx, bson.M{})
	if err != nil {
		d.Log.Error("count docs failed", "collection", col, "error", err)
		return 0
	}
	return n
}

// countPerDay 按 UTC 自然日统计某集合新增文档数（主键 ULID 字典序=时间序）。
func (d Deps) countPerDay(ctx context.Context, col string, days []time.Time) []dayCount {
	out := make([]dayCount, 0, len(days))
	for _, day := range days {
		lower, upper := ulid.DayBounds(day)
		n, err := d.RevoltCol(col).CountDocuments(ctx, bson.M{
			"_id": bson.M{"$gte": lower, "$lt": upper},
		})
		if err != nil {
			n = 0
		}
		out = append(out, dayCount{Date: day.Format("2006-01-02"), Count: n})
	}
	return out
}

// dauPerDay 按天统计日活：当天有发消息的去重作者数（messages.author distinct）。
func (d Deps) dauPerDay(ctx context.Context, days []time.Time) []dayCount {
	out := make([]dayCount, 0, len(days))
	col := d.RevoltCol("messages")
	for _, day := range days {
		lower, upper := ulid.DayBounds(day)
		authors, err := col.Distinct(ctx, "author", bson.M{
			"_id": bson.M{"$gte": lower, "$lt": upper},
		})
		if err != nil {
			out = append(out, dayCount{Date: day.Format("2006-01-02"), Count: 0})
			continue
		}
		out = append(out, dayCount{Date: day.Format("2006-01-02"), Count: int64(len(authors))})
	}
	return out
}

// storageSummary 附件存储用量（复用 AttachmentStats 的聚合逻辑）。
func (d Deps) storageSummary(ctx context.Context) gin.H {
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
		return gin.H{"total_count": 0, "total_bytes": 0, "by_tag": []gin.H{}}
	}
	defer cursor.Close(ctx)

	var rows []struct {
		Tag   string `bson:"_id"`
		Count int64  `bson:"count"`
		Bytes int64  `bson:"bytes"`
	}
	_ = cursor.All(ctx, &rows)

	byTag := make([]gin.H, 0, len(rows))
	totalCount, totalBytes := int64(0), int64(0)
	for _, r := range rows {
		byTag = append(byTag, gin.H{"tag": r.Tag, "count": r.Count, "bytes": r.Bytes})
		totalCount += r.Count
		totalBytes += r.Bytes
	}
	return gin.H{"total_count": totalCount, "total_bytes": totalBytes, "by_tag": byTag}
}

// topChannels 近 7 天消息量 TOP5 频道（联查频道名与所属空间名）。
func (d Deps) topChannels(ctx context.Context, lower7 string) []gin.H {
	pipeline := mongo.Pipeline{
		{{Key: "$match", Value: bson.M{"_id": bson.M{"$gte": lower7}}}},
		{{Key: "$group", Value: bson.M{"_id": "$channel", "count": bson.M{"$sum": 1}}}},
		{{Key: "$sort", Value: bson.M{"count": -1}}},
		{{Key: "$limit", Value: 5}},
	}
	cursor, err := d.RevoltCol("messages").Aggregate(ctx, pipeline)
	if err != nil {
		return []gin.H{}
	}
	defer cursor.Close(ctx)

	var rows []struct {
		Channel string `bson:"_id"`
		Count   int64  `bson:"count"`
	}
	_ = cursor.All(ctx, &rows)

	out := make([]gin.H, 0, len(rows))
	for _, r := range rows {
		if r.Channel == "" {
			continue
		}
		channelName, serverName := "", ""
		var ch struct {
			Name   string `bson:"name"`
			Server string `bson:"server"`
		}
		if err := d.RevoltCol("channels").FindOne(ctx, bson.M{"_id": r.Channel},
			options.FindOne().SetProjection(bson.M{"name": 1, "server": 1})).Decode(&ch); err == nil {
			channelName = ch.Name
			if ch.Server != "" {
				var srv struct {
					Name string `bson:"name"`
				}
				if err := d.RevoltCol("servers").FindOne(ctx, bson.M{"_id": ch.Server},
					options.FindOne().SetProjection(bson.M{"name": 1})).Decode(&srv); err == nil {
					serverName = srv.Name
				}
			}
		}
		out = append(out, gin.H{
			"channel_id": r.Channel,
			"channel":    channelName,
			"server":     serverName,
			"count":      r.Count,
		})
	}
	return out
}

// recentUsers 最近注册的 10 个用户（按主键倒序，即注册时间倒序）。
func (d Deps) recentUsers(ctx context.Context) []gin.H {
	cursor, err := d.RevoltCol("users").Find(ctx, bson.M{},
		options.Find().
			SetSort(bson.D{{Key: "_id", Value: -1}}).
			SetLimit(10).
			SetProjection(bson.M{"username": 1}))
	if err != nil {
		return []gin.H{}
	}
	defer cursor.Close(ctx)

	var users []struct {
		ID       string `bson:"_id"`
		Username string `bson:"username"`
	}
	_ = cursor.All(ctx, &users)

	out := make([]gin.H, 0, len(users))
	for _, u := range users {
		joinedAt := ""
		if t, ok := ulid.TimeOf(u.ID); ok {
			joinedAt = t.Format(time.RFC3339)
		}
		out = append(out, gin.H{"id": u.ID, "username": u.Username, "joined_at": joinedAt})
	}
	return out
}
