// Package delta 封装对 Stoat/Revolt Delta REST API 的服务端转发。
// 管理员会话 Token 只存在于 BFF 环境变量与本进程内存中，永不下发前端。
package delta

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL string
	token   string
	header  string
	hc      *http.Client
}

func New(baseURL, token, header string) *Client {
	if strings.TrimSpace(header) == "" {
		header = "X-Session-Token"
	}
	return &Client{
		baseURL: strings.TrimRight(baseURL, "/"),
		token:   strings.TrimSpace(token),
		header:  header,
		hc:      &http.Client{Timeout: 30 * time.Second},
	}
}

// Response 转发结果，Body 由调用方原样写回。
type Response struct {
	StatusCode  int
	Body        []byte
	ContentType string
}

// Forward 转发一次请求。path 形如 /channels/abc/messages/xyz（不含 query）。
func (c *Client) Forward(ctx context.Context, method, path, rawQuery string, body []byte, contentType string) (*Response, error) {
	url := c.baseURL + "/" + strings.TrimPrefix(path, "/")
	if rawQuery != "" {
		url += "?" + rawQuery
	}

	var reader io.Reader
	if len(body) > 0 {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, reader)
	if err != nil {
		return nil, err
	}
	if c.token != "" {
		req.Header.Set(c.header, c.token)
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.hc.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20)) // 单次响应上限 8MiB
	if err != nil {
		return nil, err
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "application/json; charset=utf-8"
	}
	return &Response{StatusCode: resp.StatusCode, Body: payload, ContentType: ct}, nil
}
