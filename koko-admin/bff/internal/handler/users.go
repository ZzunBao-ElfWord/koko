package handler

import (
	"context"
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/model"
	"koko-admin-bff/internal/ulid"
)

type userRow struct {
	ID       string `bson:"_id" json:"id"`
	Username string `bson:"username" json:"username"`
	Flags    int32  `bson:"flags" json:"flags"`
	Disabled bool   `bson:"-" json:"disabled"` // 联查 accounts.disabled（强登录拦截）
}

type flagRequest struct {
	Flag string `json:"flag" binding:"required"`
}

type freezeRequest struct {
	Frozen bool `json:"frozen"`
}

// ListUsers GET /api/v1/users?q=&page=1&page_size=20
func (d Deps) ListUsers(c *gin.Context) {
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
		filter["username"] = bson.M{"$regex": regexp.QuoteMeta(q), "$options": "i"}
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	col := d.RevoltCol("users")
	total, err := col.CountDocuments(ctx, filter)
	if err != nil {
		d.Log.Error("count users failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询用户失败"})
		return
	}

	opts := options.Find().
		SetSort(bson.D{{Key: "_id", Value: -1}}).
		SetSkip(int64((page - 1) * pageSize)).
		SetLimit(int64(pageSize)).
		SetProjection(bson.M{"username": 1, "flags": 1})

	cursor, err := col.Find(ctx, filter, opts)
	if err != nil {
		d.Log.Error("find users failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询用户失败"})
		return
	}
	defer cursor.Close(ctx)

	items := make([]userRow, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析用户数据失败"})
		return
	}

	// 联查 accounts.disabled：被冻结登录的用户在列表中明确标识
	if len(items) > 0 {
		ids := make([]string, 0, len(items))
		for _, u := range items {
			ids = append(ids, u.ID)
		}
		if ac, err := d.RevoltCol("accounts").Find(ctx,
			bson.M{"_id": bson.M{"$in": ids}},
			options.Find().SetProjection(bson.M{"disabled": 1})); err == nil {
			var accs []struct {
				ID       string `bson:"_id"`
				Disabled bool   `bson:"disabled"`
			}
			_ = ac.All(ctx, &accs)
			frozenMap := map[string]bool{}
			for _, a := range accs {
				frozenMap[a.ID] = a.Disabled
			}
			for i := range items {
				items[i].Disabled = frozenMap[items[i].ID]
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"items": items, "total": total, "page": page, "page_size": pageSize})
}

// SetAccountFrozen POST /api/v1/users/:id/freeze {"frozen":true|false}
// 冻结 = accounts.disabled=true（Delta 登录强拦截）并删除全部 sessions（立即踢下线）；
// 解冻仅复位 disabled。与 users.flags 位标记不同，这是运营级强处置。
func (d Deps) SetAccountFrozen(c *gin.Context) {
	var req freezeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "缺少 frozen 参数"})
		return
	}
	userID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	res, err := d.RevoltCol("accounts").UpdateByID(ctx, userID, bson.M{"$set": bson.M{"disabled": req.Frozen}})
	if err != nil {
		d.Log.Error("freeze account failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "冻结操作失败"})
		return
	}
	if res.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "用户账号不存在"})
		return
	}

	// 冻结时清除全部会话，保证现有 token 即时失效
	removed := int64(0)
	if req.Frozen {
		dr, err := d.RevoltCol("sessions").DeleteMany(ctx, bson.M{"user_id": userID})
		if err != nil {
			// disabled 已落库，会话删除失败不阻断，但要让运营感知
			d.Log.Error("delete sessions on freeze failed", "error", err, "user", userID)
		} else {
			removed = dr.DeletedCount
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "frozen": req.Frozen, "sessions_revoked": removed})
}

// SetFlag POST /api/v1/users/:id/flag  {"flag":"suspended|banned|spammer"}
func (d Deps) SetFlag(c *gin.Context) {
	bit, ok := parseFlag(c)
	if !ok {
		return
	}
	d.applyBit(c, bson.M{"$bit": bson.M{"flags": bson.M{"or": bit}}})
}

// ClearFlag DELETE /api/v1/users/:id/flag/:flag
func (d Deps) ClearFlag(c *gin.Context) {
	bit, ok := parseFlag(c)
	if !ok {
		return
	}
	// $bit and：按位与补码清位（int32 位运算，Mongo 按 32 位整数解释）。
	d.applyBit(c, bson.M{"$bit": bson.M{"flags": bson.M{"and": int32(^bit)}}})
}

func parseFlag(c *gin.Context) (int32, bool) {
	name := c.Param("flag")
	if name == "" {
		var req flagRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "缺少 flag 参数"})
			return 0, false
		}
		name = req.Flag
	}
	bit, ok := model.FlagNames[name]
	if !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_flag", "message": "不支持的处置类型"})
		return 0, false
	}
	return bit, true
}

func (d Deps) applyBit(c *gin.Context, update bson.M) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	res, err := d.RevoltCol("users").UpdateByID(ctx, c.Param("id"), update)
	if err != nil {
		d.Log.Error("update user flags failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "处置失败，请检查数据库权限"})
		return
	}
	if res.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "用户不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UserDetail GET /api/v1/users/:id/profile
// 只读聚合：基本信息 + 所在空间 + 最近 20 条消息，供管理员快速定位用户行为轨迹。
func (d Deps) UserDetail(c *gin.Context) {
	userID := c.Param("id")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	// 1) 用户基本信息（status.content 为个性签名，可能不存在）
	var base struct {
		ID       string `bson:"_id" json:"id"`
		Username string `bson:"username" json:"username"`
		Flags    int32  `bson:"flags" json:"flags"`
		Status   *struct {
			Content string `bson:"content" json:"content,omitempty"`
		} `bson:"status,omitempty" json:"status,omitempty"`
	}
	err := d.RevoltCol("users").FindOne(ctx, bson.M{"_id": userID},
		options.FindOne().SetProjection(bson.M{"username": 1, "flags": 1, "status.content": 1}),
	).Decode(&base)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "用户不存在"})
		return
	}

	joinedAt := ""
	if t, ok := ulid.TimeOf(userID); ok {
		joinedAt = t.Format(time.RFC3339)
	}

	// 2) 所在空间：server_members._id = {server, user}，联查 servers 取名称
	type spaceBrief struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	spaces := make([]spaceBrief, 0)
	memCursor, err := d.RevoltCol("server_members").Find(ctx, bson.M{"_id.user": userID})
	if err == nil {
		var mems []bson.M
		_ = memCursor.All(ctx, &mems)
		serverIDs := make([]string, 0, len(mems))
		for _, m := range mems {
			if id, ok := m["_id"].(bson.M); ok {
				if sid, ok2 := id["server"].(string); ok2 {
					serverIDs = append(serverIDs, sid)
				}
			}
		}
		if len(serverIDs) > 0 {
			sCursor, err := d.RevoltCol("servers").Find(ctx,
				bson.M{"_id": bson.M{"$in": serverIDs}},
				options.Find().SetProjection(bson.M{"name": 1}))
			if err == nil {
				var srvs []struct {
					ID   string `bson:"_id" json:"id"`
					Name string `bson:"name" json:"name"`
				}
				_ = sCursor.All(ctx, &srvs)
				for _, s := range srvs {
					spaces = append(spaces, spaceBrief{ID: s.ID, Name: s.Name})
				}
			}
		}
	}

	// 3) 最近 20 条消息（含附件消息 content 可能为空，前端展示兜底）
	type msgBrief struct {
		ID      string `bson:"_id" json:"id"`
		Channel string `bson:"channel" json:"channel"`
		Content string `bson:"content" json:"content"`
		At      string `json:"at"`
	}
	msgs := make([]msgBrief, 0)
	mCursor, err := d.RevoltCol("messages").Find(ctx, bson.M{"author": userID},
		options.Find().SetSort(bson.D{{Key: "_id", Value: -1}}).SetLimit(20).
			SetProjection(bson.M{"channel": 1, "content": 1}))
	if err == nil {
		var raw []msgBrief
		_ = mCursor.All(ctx, &raw)
		for _, m := range raw {
			if t, ok := ulid.TimeOf(m.ID); ok {
				m.At = t.Format(time.RFC3339)
			}
			msgs = append(msgs, m)
		}
	}

	bio := ""
	if base.Status != nil {
		bio = base.Status.Content
	}

	c.JSON(http.StatusOK, gin.H{
		"id":              base.ID,
		"username":        base.Username,
		"flags":           base.Flags,
		"bio":             bio,
		"joined_at":       joinedAt,
		"spaces":          spaces,
		"recent_messages": msgs,
	})
}
