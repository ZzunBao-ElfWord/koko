// Package agora 封装对声网 Agora 云端频道管理 REST API 的调用。
// 仅使用「频道列表 / 频道用户列表 / 创建踢人规则」三个接口，
// Customer ID / Customer Secret 只存在于 BFF 环境变量与进程内存，永不下发前端。
// 文档：https://docs.agora.io/en/api-reference/api-ref/rtc/channel-management-rest-api
package agora

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL        string
	appID          string
	customerID     string
	customerSecret string
	hc             *http.Client
}

// New 创建客户端；appID / customerID / customerSecret 任一为空时返回 nil
// （语音房管理功能降级为不可用）。
func New(baseURL, appID, customerID, customerSecret string) *Client {
	if strings.TrimSpace(appID) == "" ||
		strings.TrimSpace(customerID) == "" ||
		strings.TrimSpace(customerSecret) == "" {
		return nil
	}
	if strings.TrimSpace(baseURL) == "" {
		baseURL = "https://api.agora.io"
	}
	return &Client{
		baseURL:        strings.TrimRight(baseURL, "/"),
		appID:          appID,
		customerID:     customerID,
		customerSecret: customerSecret,
		hc:             &http.Client{Timeout: 10 * time.Second},
	}
}

// flexNumber 兼容声网返回里数字 / 字符串数字两种编码。
type flexNumber int64

func (f *flexNumber) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), `"`)
	if s == "" || s == "null" {
		*f = 0
		return nil
	}
	v, err := strconv.ParseInt(s, 10, 64)
	if err != nil {
		return err
	}
	*f = flexNumber(v)
	return nil
}

// uidRef 兼容用户列表里 uid 元素的两种形态：裸值（"100001"/100001）或对象（{"uid":"100001"}）。
type uidRef struct {
	UID int64
}

func (u *uidRef) UnmarshalJSON(b []byte) error {
	trimmed := bytes.TrimSpace(b)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		return nil
	}
	if trimmed[0] == '{' {
		var obj struct {
			UID flexNumber `json:"uid"`
		}
		if err := json.Unmarshal(trimmed, &obj); err != nil {
			return err
		}
		u.UID = int64(obj.UID)
		return nil
	}
	var n flexNumber
	if err := json.Unmarshal(trimmed, &n); err != nil {
		return err
	}
	u.UID = int64(n)
	return nil
}

// Room 在线频道（声网频道名 = Stoat 语音频道 ID/ULID）。
type Room struct {
	ChannelName string
	UserCount   int
}

// ParticipantRole 频道内角色。客户端统一以 broadcaster 入会（数据流要求主播角色），
// 但解析时保留观众兜底。
type ParticipantRole string

const (
	RoleBroadcaster ParticipantRole = "broadcaster"
	RoleAudience    ParticipantRole = "audience"
)

type Participant struct {
	UID  int64
	Role ParticipantRole
}

type apiEnvelope struct {
	// 两类接口成功标志不同：频道查询返回 {"success": true}，
	// 踢人规则返回 {"status": "success"}。用指针区分「字段缺失」与「显式 false」。
	Success *bool           `json:"success"`
	Status  string          `json:"status"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func (c *Client) authHeader() string {
	raw := c.customerID + ":" + c.customerSecret
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(raw))
}

func (c *Client) do(ctx context.Context, method, path string, body any, out *apiEnvelope) error {
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", c.authHeader())
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := c.hc.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("声网 API %s %s 返回 %d: %s", method, path, resp.StatusCode, string(raw))
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("解析声网响应失败: %w（body: %s）", err, string(raw))
	}
	if out.Success != nil && !*out.Success {
		return fmt.Errorf("声网 API %s 返回失败: %s", path, out.Message)
	}
	if out.Status != "" && out.Status != "success" {
		return fmt.Errorf("声网 API %s 返回失败: %s", path, out.Message)
	}
	return nil
}

// ListRooms 列出当前全部在线频道。声网无「创建时间」字段。
func (c *Client) ListRooms(ctx context.Context) ([]Room, error) {
	if c == nil {
		return nil, errors.New("声网未配置")
	}
	var env apiEnvelope
	if err := c.do(ctx, http.MethodGet, "/dev/v1/channel/"+c.appID, nil, &env); err != nil {
		return nil, err
	}
	var data struct {
		Channels []struct {
			ChannelName string     `json:"channel_name"`
			UserCount   flexNumber `json:"user_count"`
		} `json:"channels"`
		TotalSize flexNumber `json:"total_size"`
	}
	if err := json.Unmarshal(env.Data, &data); err != nil {
		return nil, err
	}
	rooms := make([]Room, 0, len(data.Channels))
	for _, ch := range data.Channels {
		rooms = append(rooms, Room{ChannelName: ch.ChannelName, UserCount: int(ch.UserCount)})
	}
	return rooms, nil
}

// ListParticipants 列出指定频道内全部用户（主播 + 观众）。
func (c *Client) ListParticipants(ctx context.Context, channel string) ([]Participant, error) {
	if c == nil {
		return nil, errors.New("声网未配置")
	}
	path := fmt.Sprintf("/dev/v1/channel/user/%s/%s", c.appID, url.PathEscape(channel))
	var env apiEnvelope
	if err := c.do(ctx, http.MethodGet, path, nil, &env); err != nil {
		return nil, err
	}
	var data struct {
		// LIVE_BROADCASTING 配置下返回 broadcasters / audience 两个数组
		Broadcasters []uidRef `json:"broadcasters"`
		Audience     []uidRef `json:"audience"`
		// COMMUNICATION 配置下只有 users 数组（兜底）
		Users []uidRef `json:"users"`
	}
	if err := json.Unmarshal(env.Data, &data); err != nil {
		return nil, err
	}
	out := make([]Participant, 0, len(data.Broadcasters)+len(data.Audience)+len(data.Users))
	for _, u := range data.Broadcasters {
		if u.UID != 0 {
			out = append(out, Participant{UID: u.UID, Role: RoleBroadcaster})
		}
	}
	for _, u := range data.Audience {
		if u.UID != 0 {
			out = append(out, Participant{UID: u.UID, Role: RoleAudience})
		}
	}
	for _, u := range data.Users {
		if u.UID != 0 {
			out = append(out, Participant{UID: u.UID, Role: RoleBroadcaster})
		}
	}
	return out, nil
}

// Kick 将用户踢出频道且不封禁（time=0 为声网特殊值：立即下线，可马上重新加入）。
func (c *Client) Kick(ctx context.Context, channel string, uid int64) error {
	return c.createKickRule(ctx, channel, uid, map[string]any{"time": 0})
}

// BanJoin 踢出用户并在 banMinutes 分钟内禁止其重新加入该频道（1~1440 分钟）。
// 用于「解散房间」：全员短封，避免客户端自动重连导致房间瞬间复活。
func (c *Client) BanJoin(ctx context.Context, channel string, uid int64, banMinutes int) error {
	if banMinutes < 1 {
		banMinutes = 1
	}
	if banMinutes > 1440 {
		banMinutes = 1440
	}
	return c.createKickRule(ctx, channel, uid, map[string]any{"time": banMinutes})
}

func (c *Client) createKickRule(ctx context.Context, channel string, uid int64, extra map[string]any) error {
	if c == nil {
		return errors.New("声网未配置")
	}
	body := map[string]any{
		"appid":      c.appID,
		"cname":      channel,
		"uid":        uid,
		"privileges": []string{"join_channel"},
	}
	for k, v := range extra {
		body[k] = v
	}
	var env apiEnvelope
	if err := c.do(ctx, http.MethodPost, "/dev/v1/kicking-rule", body, &env); err != nil {
		return err
	}
	return nil
}
