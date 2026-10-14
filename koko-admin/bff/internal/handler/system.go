package handler

import (
	"context"
	"net"
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// serviceHealth 单个下游服务的探测结果。
type serviceHealth struct {
	Name      string `json:"name"`
	Target    string `json:"target"`
	OK        bool   `json:"ok"`
	LatencyMs int64  `json:"latency_ms"`
	Error     string `json:"error,omitempty"`
}

// healthProbe 探测描述：name 展示名，target host:port，httpPath 非空走 HTTP 否则 TCP。
type healthProbe struct {
	name     string
	target   string
	httpPath string
}

// SystemHealth GET /api/v1/system/health
// BFF 与全部下游容器同处 stoat_default 网络，按容器名并发探测，2 秒超时。
// 该接口只读，不含任何凭据，三角色均可访问。
func (d Deps) SystemHealth(c *gin.Context) {
	probes := []healthProbe{
		{"MongoDB", "database:27017", ""},
		{"Redis", "redis:6379", ""},
		{"RabbitMQ", "rabbit:5672", ""},
		{"Delta API", "api:14702", "/"},
		{"Events", "events:14703", ""},
		{"Autumn 文件", "autumn:14704", ""},
		{"January 代理", "january:14705", ""},
		{"Gifbox", "gifbox:14706", ""},
		{"MinIO 对象存储", "minio:9000", "/minio/health/live"},
		// 语音为声网 Agora 云端 SaaS（外网 API），不在内网容器探测列表；
		// 其可用性由语音房页面的实时查询直接体现。
	}

	items := make([]serviceHealth, len(probes))
	var wg sync.WaitGroup
	for i, p := range probes {
		wg.Add(1)
		go func(i int, p healthProbe) {
			defer wg.Done()
			items[i] = d.runProbe(c.Request.Context(), p)
		}(i, p)
	}
	wg.Wait()

	c.JSON(http.StatusOK, gin.H{
		"items":      items,
		"checked_at": time.Now().UTC().Format(time.RFC3339),
	})
}

func (d Deps) runProbe(ctx context.Context, p healthProbe) serviceHealth {
	start := time.Now()
	res := serviceHealth{Name: p.name, Target: p.target}

	if p.httpPath != "" {
		req, err := http.NewRequestWithContext(ctx, "GET", "http://"+p.target+p.httpPath, nil)
		if err != nil {
			res.Error = err.Error()
			return res
		}
		client := &http.Client{Timeout: 2 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			res.Error = err.Error()
			res.LatencyMs = time.Since(start).Milliseconds()
			return res
		}
		_ = resp.Body.Close()
		// 任何 HTTP 响应（含 4xx）都说明进程在线；5xx 视为异常
		res.OK = resp.StatusCode < 500
		if !res.OK {
			res.Error = "HTTP " + http.StatusText(resp.StatusCode)
		}
		res.LatencyMs = time.Since(start).Milliseconds()
		return res
	}

	dialer := net.Dialer{Timeout: 2 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", p.target)
	if err != nil {
		res.Error = err.Error()
		res.LatencyMs = time.Since(start).Milliseconds()
		return res
	}
	_ = conn.Close()
	res.OK = true
	res.LatencyMs = time.Since(start).Milliseconds()
	return res
}
