package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// 语音房管理：Stoat 的语音频道以 LiveKit room 形式存在，room name = 频道 ID（ULID）。
// 列表联查 channels/servers 集合补齐频道名与空间名，参与者 identity 即用户 ULID。

type voiceRoomRow struct {
	Room           string `json:"room"` // LiveKit room name（= 频道 ID）
	ChannelName    string `json:"channel_name"`
	ServerName     string `json:"server_name"`
	NumParticipants int   `json:"num_participants"`
	CreatedAt      string `json:"created_at"`
}

// voiceChannelInfo 频道 → 名称与所属空间。
type voiceChannelInfo struct {
	ID     string `bson:"_id"`
	Name   string `bson:"name"`
	Server string `bson:"server"`
}

// ListVoiceRooms GET /api/v1/voice/rooms
func (d Deps) ListVoiceRooms(c *gin.Context) {
	if d.LiveKit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "livekit_unconfigured", "message": "语音服务未配置"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	rooms, err := d.LiveKit.ListRooms(ctx)
	if err != nil {
		d.Log.Error("livekit list rooms failed", "error", err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "查询语音房失败"})
		return
	}

	// 联查频道与空间名
	names := make([]string, 0, len(rooms))
	for _, r := range rooms {
		names = append(names, r.Name)
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
		ch := chanMap[r.Name]
		at := ""
		if t := int64(r.CreationTime); t > 0 {
			at = time.Unix(t, 0).UTC().Format(time.RFC3339)
		}
		items = append(items, voiceRoomRow{
			Room:            r.Name,
			ChannelName:     ch.Name,
			ServerName:      serverMap[ch.Server],
			NumParticipants: r.NumParticipants,
			CreatedAt:       at,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type voiceParticipantRow struct {
	Identity string `json:"identity"` // 用户 ULID
	Username string `json:"username"`
	State    string `json:"state"`
	JoinedAt string `json:"joined_at"`
}

// ListVoiceParticipants GET /api/v1/voice/rooms/:room/participants
func (d Deps) ListVoiceParticipants(c *gin.Context) {
	if d.LiveKit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "livekit_unconfigured", "message": "语音服务未配置"})
		return
	}
	room := c.Param("room")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	parts, err := d.LiveKit.ListParticipants(ctx, room)
	if err != nil {
		d.Log.Error("livekit list participants failed", "error", err, "room", room)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "查询参与者失败"})
		return
	}

	// 联查用户名（identity = 用户 ULID）
	ids := make([]string, 0, len(parts))
	for _, p := range parts {
		ids = append(ids, p.Identity)
	}
	userMap := map[string]string{}
	if len(ids) > 0 {
		uc, err := d.RevoltCol("users").Find(ctx, bson.M{"_id": bson.M{"$in": ids}},
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

	items := make([]voiceParticipantRow, 0, len(parts))
	for _, p := range parts {
		at := ""
		if t := int64(p.JoinedAt); t > 0 {
			at = time.Unix(t, 0).UTC().Format(time.RFC3339)
		}
		name := userMap[p.Identity]
		if name == "" {
			name = p.Name // 回退到 LiveKit 侧登记名
		}
		items = append(items, voiceParticipantRow{
			Identity: p.Identity,
			Username: name,
			State:    p.State,
			JoinedAt: at,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": items, "room": room})
}

// DeleteVoiceRoom DELETE /api/v1/voice/rooms/:room
// 解散语音房：所有参与者被强制断开；房间为频道内临时资源，不影响频道本身。
func (d Deps) DeleteVoiceRoom(c *gin.Context) {
	if d.LiveKit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "livekit_unconfigured", "message": "语音服务未配置"})
		return
	}
	room := c.Param("room")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if err := d.LiveKit.DeleteRoom(ctx, room); err != nil {
		d.Log.Error("livekit delete room failed", "error", err, "room", room)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "解散语音房失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// KickVoiceParticipant DELETE /api/v1/voice/rooms/:room/participants/:identity
// 将指定用户移出语音房（不封禁账号，用户可重新加入）。
func (d Deps) KickVoiceParticipant(c *gin.Context) {
	if d.LiveKit == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "livekit_unconfigured", "message": "语音服务未配置"})
		return
	}
	room := c.Param("room")
	identity := c.Param("identity")

	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	if err := d.LiveKit.RemoveParticipant(ctx, room, identity); err != nil {
		d.Log.Error("livekit remove participant failed", "error", err, "room", room, "identity", identity)
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "移出参与者失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
