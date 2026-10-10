package handler

import (
	"io"
	"net/http"

	"github.com/gin-gonic/gin"

	"koko-admin-bff/internal/middleware"
	"koko-admin-bff/internal/model"
)

// LinkSpriteProxy ANY /api/v1/chain/*proxy
// 前端把连接精灵链管理动作发到这里，BFF 附加 X-API-Key 后原样转发到 linksprite-backend。
// API-Key 只存 BFF 环境变量，永不下发浏览器；所有转发自动经过 JWT 与审计中间件。
// 路径映射：/api/v1/chain/<rest> -> 上游 <LINKSPRITE_BASE_URL>/<rest>（默认 .../api/<rest>）。
// 角色控制：GET 查询 super/moderator（路由层 modOnly 兜底）；POST/PUT/DELETE/PATCH 链上写操作仅 super。
func (d Deps) LinkSpriteProxy(c *gin.Context) {
	role, _ := c.Get(middleware.CtxRole)
	if c.Request.Method != http.MethodGet && role != model.RoleSuperAdmin {
		c.JSON(http.StatusForbidden, gin.H{"error": "forbidden", "message": "链上写操作仅超级管理员可执行"})
		return
	}

	body := []byte{}
	if c.Request.Body != nil {
		b, err := io.ReadAll(io.LimitReader(c.Request.Body, 4<<20)) // 请求体上限 4MiB
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "请求体读取失败"})
			return
		}
		body = b
	}

	resp, err := d.LinkSprite.Forward(
		c.Request.Context(),
		c.Request.Method,
		c.Param("proxy"),
		c.Request.URL.RawQuery,
		body,
		c.GetHeader("Content-Type"),
	)
	if err != nil {
		d.Log.Error("linksprite proxy failed", "error", err, "path", c.Param("proxy"))
		c.JSON(http.StatusBadGateway, gin.H{"error": "upstream_error", "message": "连接精灵链服务调用失败"})
		return
	}
	c.Data(resp.StatusCode, resp.ContentType, resp.Body)
}
