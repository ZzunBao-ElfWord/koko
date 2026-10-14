package handler

import (
	"context"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// 语音房管理：Stoat 的语音频道以声网频道形式存在，channel name = 频道 ID（ULID）。
// 声网只返回数字 uid，数字 uid ↔ Stoat 用户 ULID 的映射由 koko-auth 发号时
// 写入 revolt.agora_uids 集合（{_id: 用户ULID, uid: 数字uid}），这里反查补齐用户名。

type voiceRoomRow struct {
	Room            string `json:"room"` // 声网频道名（= 频道 ID）
	ChannelName     string `json:"channel_name"`
	ServerName      string `json:"server_name"`
	NumParticipants int    `json:"num_participants"`
}

// voiceChannelInfo 频道 → 名称与所属空间。
type voiceChannelInfo struct {
	ID     string `bson:"_id"`
	Name   string `bson:"name"`
	Server string `bson:"server"`
}

// voiceUnavailable 语音凭据未配置时的统一降级响应。
func voiceUnavailable(c *gin.Context) {
	c.JSON(http.StatusServiceUnavailable, gin.H{"error": "voice_unconfigured", "message": "语音服务未配置"})
}

// ListVoiceRooms GET /api/v1/voice/rooms
func (d Deps) ListVoiceRooms(c *gin.Context) {
	if d.Agora == nil {
		voiceUnavailable(c)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	rooms, err := d.Agora.ListRooms(ctx)
	if err != nil {
		d.Log.Error("agora list rooms failed", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "查询语音房失败"})
		return
	}

	// 联查频道与空间名
	names := make([]string, 0, len(rooms))
	for _, r := range rooms {
		names = append(names, r.ChannelName)
	}
	chanMap := map[string]voiceChannelInfo{}
	serverIDs := make([]string, 0)
	if len(names) > 0 {
		cc, err := d.RevoltCol("channels").Find(ctx, bson.M{"_id": bson.M{"$in": names}},
			options.Find().SetProjection(bson.M{"name": 1, "server": 1}))
		if err == nil {
			var chans []voiceChannelInfo
			_ = cc.All(ctx, &chans)
			seen := map[string]bool{}
			for _, ch := range chans {
				chanMap[ch.ID] = ch
				if ch.Server != "" && !seen[ch.Server] {
					seen[ch.Server] = true
					serverIDs = append(serverIDs, ch.Server)
				}
			}
		}
	}
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

	items := make([]voiceRoomRow, 0, len(rooms))
	for _, r := range rooms {
		ch := chanMap[r.ChannelName]
		items = append(items, voiceRoomRow{
			Room:            r.ChannelName,
			ChannelName:     ch.Name,
			ServerName:      serverMap[ch.Server],
			NumParticipants: r.UserCount,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type voiceParticipantRow struct {
	Identity string `json:"identity"` // 声网数字 uid（字符串形式，踢人接口入参）
	UserID   string `json:"user_id"`  // Stoat 用户 ULID（映射缺失时为空）
	Username string `json:"username"`
	Role     string `json:"role"` // broadcaster / audience
}

// ListVoiceParticipants GET /api/v1/voice/rooms/:room/participants
func (d Deps) ListVoiceParticipants(c *gin.Context) {
	if d.Agora == nil {
		voiceUnavailable(c)
		return
	}
	room := c.Param("room")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	parts, err := d.Agora.ListParticipants(ctx, room)
	if err != nil {
		d.Log.Error("agora list participants failed", "error", err, "room", room)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "查询参与者失败"})
		return
	}

	// 声网数字 uid → Stoat ULID：查 koko-auth 发号时落库的 agora_uids 集合
	uids := make([]int64, 0, len(parts))
	for _, p := range parts {
		uids = append(uids, p.UID)
	}
	uidToStoat := map[int64]string{}
	stoatIDs := make([]string, 0, len(uids))
	if len(uids) > 0 {
		uc, err := d.RevoltCol("agora_uids").Find(ctx, bson.M{"uid": bson.M{"$in": uids}},
			options.Find().SetProjection(bson.M{"uid": 1}))
		if err == nil {
			var rows []struct {
				ID  string `bson:"_id"`
				UID int64  `bson:"uid"`
			}
			_ = uc.All(ctx, &rows)
			for _, r := range rows {
				uidToStoat[r.UID] = r.ID
				stoatIDs = append(stoatIDs, r.ID)
			}
		} else {
			d.Log.Warn("query agora_uids failed", "error", err)
		}
	}

	// Stoat ULID → 用户名
	userMap := map[string]string{}
	if len(stoatIDs) > 0 {
		mc, err := d.RevoltCol("users").Find(ctx, bson.M{"_id": bson.M{"$in": stoatIDs}},
			options.Find().SetProjection(bson.M{"username": 1}))
		if err == nil {
			var users []struct {
				ID       string `bson:"_id"`
				Username string `bson:"username"`
			}
			_ = mc.All(ctx, &users)
			for _, u := range users {
				userMap[u.ID] = u.Username
			}
		}
	}

	items := make([]voiceParticipantRow, 0, len(parts))
	for _, p := range parts {
		stoatID := uidToStoat[p.UID]
		items = append(items, voiceParticipantRow{
			Identity: strconv.FormatInt(p.UID, 10),
			UserID:   stoatID,
			Username: userMap[stoatID],
			Role:     string(p.Role),
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "room": room})
}

// DeleteVoiceRoom DELETE /api/v1/voice/rooms/:room
// 声网没有「删除频道」接口：频道在最后一人离开时自动销毁。
// 解散 = 对房内每个人创建 join_channel 封禁规则（1 分钟），全员下线后频道即销毁，
// 短封同时避免客户端自动重连导致房间瞬间复活；频道本身（Stoat 侧）不受影响。
func (d Deps) DeleteVoiceRoom(c *gin.Context) {
	if d.Agora == nil {
		voiceUnavailable(c)
		return
	}
	room := c.Param("room")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 15*time.Second)
	defer cancel()

	parts, err := d.Agora.ListParticipants(ctx, room)
	if err != nil {
		d.Log.Error("agora list participants for dismiss failed", "error", err, "room", room)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "解散语音房失败"})
		return
	}

	const banMinutes = 1
	var (
		wg     sync.WaitGroup
		mu     sync.Mutex
		failed []int64
	)
	for _, p := range parts {
		wg.Add(1)
		go func(uid int64) {
			defer wg.Done()
			if err := d.Agora.BanJoin(ctx, room, uid, banMinutes); err != nil {
				d.Log.Error("agora ban participant failed", "error", err, "room", room, "uid", uid)
				mu.Lock()
				failed = append(failed, uid)
				mu.Unlock()
			}
		}(p.UID)
	}
	wg.Wait()

	if len(failed) > 0 {
		c.JSON(http.StatusBadGateway, gin.H{
			"error":       "partial_failed",
			"message":     "部分参与者移出失败，请稍后重试",
			"total":       len(parts),
			"kicked":      len(parts) - len(failed),
			"failed_uids": failed,
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "total": len(parts)})
}

// KickVoiceParticipant DELETE /api/v1/voice/rooms/:room/participants/:identity
// 将指定用户移出语音房（:identity 为声网数字 uid）。不封禁账号，用户可立即重新加入。
func (d Deps) KickVoiceParticipant(c *gin.Context) {
	if d.Agora == nil {
		voiceUnavailable(c)
		return
	}
	room := c.Param("room")
	uid, err := strconv.ParseInt(c.Param("identity"), 10, 64)
	if err != nil || uid <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_uid", "message": "参与者标识不正确"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if err := d.Agora.Kick(ctx, room, uid); err != nil {
		d.Log.Error("agora kick participant failed", "error", err, "room", room, "uid", uid)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "移出参与者失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
