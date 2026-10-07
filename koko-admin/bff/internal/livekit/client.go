// Package livekit 封装对 LiveKit Server API（Twirp）的调用。
// 仅使用 ListRooms / ListParticipants / DeleteRoom / RemoveParticipant 四个方法，
// 凭据（API Key/Secret）只存在于 BFF 环境变量与进程内存，永不下发前端。
package livekit

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// flexInt64 兼容 protojson 的字符串数字与裸数字两种编码。
type flexInt64 int64

func (f *flexInt64) UnmarshalJSON(b []byte) error {
	if len(b) == 0 {
		return nil
	}
	if b[0] == '"' {
		var s string
		if err := json.Unmarshal(b, &s); err != nil {
			return err
		}
		if s == "" {
			*f = 0
			return nil
		}
		v, err := strconv.ParseInt(s, 10, 64)
		if err != nil {
			return err
		}
		*f = flexInt64(v)
		return nil
	}
	return json.Unmarshal(b, (*int64)(f))
}

type Client struct {
	baseURL   string
	apiKey    string
	apiSecret string
	hc        *http.Client
}

// New 创建客户端；apiKey/apiSecret 为空时返回 nil（语音房管理功能降级为不可用）。
func New(baseURL, apiKey, apiSecret string) *Client {
	if strings.TrimSpace(apiKey) == "" || strings.TrimSpace(apiSecret) == "" {
		return nil
	}
	return &Client{
		baseURL:   strings.TrimRight(baseURL, "/"),
		apiKey:    apiKey,
		apiSecret: apiSecret,
		hc:        &http.Client{Timeout: 10 * time.Second},
	}
}

// Room 列表项（proto JSON 映射，字段按 LiveKit 实际返回宽松解析）。
type Room struct {
	SID             string    `json:"sid"`
	Name            string    `json:"name"`
	EmptyTimeout    int       `json:"empty_timeout"`
	MaxParticipants int       `json:"max_participants"`
	CreationTime    flexInt64 `json:"creation_time"`
	NumParticipants int       `json:"num_participants"`
}

// Participant 参与者（identity 为 Stoat 用户 ULID）。
type Participant struct {
	SID      string    `json:"sid"`
	Identity string    `json:"identity"`
	Name     string    `json:"name"`
	State    string    `json:"state"`
	JoinedAt flexInt64 `json:"joined_at"`
}

// adminToken 签发 roomAdmin/roomList/roomCreate 组合授权的服务端 JWT。
// LiveKit 每个 Twirp 方法校验各自 grant，列表类需要 roomList，管理类需要 roomAdmin。
func (c *Client) adminToken() (string, error) {
	now := time.Now()
	claims := jwt.MapClaims{
		"iss": c.apiKey,
		"sub": "koko-admin",
		"iat": now.Unix(),
		"nbf": now.Add(-10 * time.Second).Unix(),
		"exp": now.Add(5 * time.Minute).Unix(),
		"video": map[string]any{
			"roomCreate": true,
			"roomList":   true,
			"roomAdmin":  true,
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(c.apiSecret))
}

// call 发起一次 Twirp POST JSON 调用并解码响应。
func (c *Client) call(ctx context.Context, method string, reqBody any, out any) error {
	token, err := c.adminToken()
	if err != nil {
		return fmt.Errorf("签发 LiveKit 凭据失败: %w", err)
	}

	payload, err := json.Marshal(reqBody)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/twirp/livekit.RoomService/"+method, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("LiveKit %s 返回 %d: %s", method, resp.StatusCode, string(body))
	}
	return json.Unmarshal(body, out)
}

// ListRooms 列出当前全部语音房（含空房）。
func (c *Client) ListRooms(ctx context.Context) ([]Room, error) {
	if c == nil {
		return nil, errors.New("livekit 未配置")
	}
	var out struct {
		Rooms []Room `json:"rooms"`
	}
	if err := c.call(ctx, "ListRooms", map[string]any{}, &out); err != nil {
		return nil, err
	}
	if out.Rooms == nil {
		out.Rooms = []Room{}
	}
	return out.Rooms, nil
}

// ListParticipants 列出指定房间的参与者。
func (c *Client) ListParticipants(ctx context.Context, room string) ([]Participant, error) {
	if c == nil {
		return nil, errors.New("livekit 未配置")
	}
	var out struct {
		Participants []Participant `json:"participants"`
	}
	if err := c.call(ctx, "ListParticipants", map[string]any{"room": room}, &out); err != nil {
		return nil, err
	}
	if out.Participants == nil {
		out.Participants = []Participant{}
	}
	return out.Participants, nil
}

// DeleteRoom 解散房间（所有参与者被强制断开）。
func (c *Client) DeleteRoom(ctx context.Context, room string) error {
	if c == nil {
		return errors.New("livekit 未配置")
	}
	return c.call(ctx, "DeleteRoom", map[string]any{"room": room}, &map[string]any{})
}

// RemoveParticipant 将指定参与者移出房间。
func (c *Client) RemoveParticipant(ctx context.Context, room, identity string) error {
	if c == nil {
		return errors.New("livekit 未配置")
	}
	return c.call(ctx, "RemoveParticipant", map[string]any{"room": room, "identity": identity}, &map[string]any{})
}
