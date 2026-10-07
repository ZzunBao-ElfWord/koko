package handler

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
)

// DeltaProxy ANY /api/v1/delta/*path
// 前端把要对 Delta 执行的管理动作发到这里，BFF 附加服务端管理员会话头后原样转发。
// 这样 Delta Token 永不暴露到浏览器；所有转发自动经过 RBAC 与审计中间件。
func (d Deps) DeltaProxy(c *gin.Context) {
	body := []byte{}
	if c.Request.Body != nil {
		b, err := io.ReadAll(io.LimitReader(c.Request.Body, 4<<20)) // 请求体上限 4MiB
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "请求体读取失败"})
			return
		}
		body = b
	}

	resp, err := d.Delta.Forward(
		c.Request.Context(),
		c.Request.Method,
		c.Param("proxy"),
		c.Request.URL.RawQuery,
		body,
		c.GetHeader("Content-Type"),
	)
	if err != nil {
		d.Log.Error("delta proxy failed", "error", err, "path", c.Param("proxy"))
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "Delta 服务调用失败"})
		return
	}
	c.Data(resp.StatusCode, resp.ContentType, resp.Body)
}
