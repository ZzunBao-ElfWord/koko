package router

import (
	"io/fs"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/mongo"

	"koko-admin-bff/internal/handler"
	"koko-admin-bff/internal/middleware"
	"koko-admin-bff/internal/model"
	"koko-admin-bff/internal/web"
)

// New 组装全部路由。
func New(d handler.Deps, auditCol *mongo.Collection, adminUsersCol *mongo.Collection) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(requestLogger(d))
	r.Use(corsMiddleware(d.Cfg.CORSOrigins))

	// 健康检查（容器/反代探活）
	r.GET("/api/v1/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"ok": true, "ts": time.Now().Unix()})
	})

	api := r.Group("/api/v1")

	// 公开：登录
	api.POST("/auth/login", d.Login)

	// 公开：B 端合作申请（限流，无 JWT）
	api.POST("/public/b2b-apply", middleware.RateLimit(5, time.Minute), d.SubmitB2bApply)

	// 需登录
	authed := api.Group("")
	authed.Use(middleware.JWTAuth(d.Cfg.JWTSecret, adminUsersCol))
	authed.Use(middleware.Audit(auditCol, d.Log))

	authed.GET("/auth/me", d.Me)
	// 修改自己的密码（三角色均可）
	authed.POST("/auth/change-password", d.ChangePassword)

	// 数据看板：三角色均可
	authed.GET("/stats/overview",
		middleware.RequireRole(model.RoleSuperAdmin, model.RoleModerator, model.RoleOperator),
		d.StatsOverview)

	// 服务健康：三角色均可（只读探测，不含凭据）
	authed.GET("/system/health",
		middleware.RequireRole(model.RoleSuperAdmin, model.RoleModerator, model.RoleOperator),
		d.SystemHealth)

	// 审核能力：super / moderator
	modOnly := middleware.RequireRole(model.RoleSuperAdmin, model.RoleModerator)
	{
		authed.GET("/users", modOnly, d.ListUsers)
		authed.GET("/users/export.csv", modOnly, d.ExportUsersCSV)
		authed.GET("/users/:id/profile", modOnly, d.UserDetail)
		authed.POST("/users/:id/flag", modOnly, d.SetFlag)
		authed.DELETE("/users/:id/flag/:flag", modOnly, d.ClearFlag)
		authed.POST("/users/:id/freeze", modOnly, d.SetAccountFrozen)
		authed.GET("/users/:id/sessions", modOnly, d.ListUserSessions)
		authed.DELETE("/users/:id/sessions/:sid", modOnly, d.DeleteUserSession)

		authed.GET("/reports", modOnly, d.ListReports)
		authed.POST("/reports/:id/status", modOnly, d.SetReportStatus)

		// 消息管理（Mongo 查 + Delta 删）
		authed.GET("/messages/search", modOnly, d.SearchMessages)
		authed.GET("/channels/:cid/messages", modOnly, d.ListMessages)
		authed.DELETE("/channels/:cid/messages/:mid", modOnly, d.DeleteMessage)

		// 媒体文件运营（Autumn 落库只读 + 深链定位 + 删除）
		authed.GET("/attachments", modOnly, d.ListAttachments)
		authed.GET("/attachments/stats", modOnly, d.AttachmentStats)
		authed.DELETE("/attachments/:id", modOnly, d.DeleteAttachment)

		// 空间管理（Mongo 查 + Delta 封禁/移出/删频道）
		authed.GET("/spaces", modOnly, d.ListSpaces)
		authed.GET("/spaces/:id/members", modOnly, d.ListSpaceMembers)
		authed.GET("/spaces/:id/channels", modOnly, d.ListSpaceChannels)
		authed.GET("/spaces/:id/bans", modOnly, d.ListSpaceBans)
		authed.PUT("/spaces/:id/bans/:uid", modOnly, d.BanSpaceMember)
		authed.DELETE("/spaces/:id/bans/:uid", modOnly, d.UnbanSpaceMember)
		authed.DELETE("/spaces/:id/members/:uid", modOnly, d.KickSpaceMember)
		authed.DELETE("/channels/:cid", modOnly, d.DeleteChannel)

	// 连接精灵链（NFT 融合）：查询 super/moderator；写操作在 handler 内仅放行 super
		authed.Any("/chain/*proxy", modOnly, d.LinkSpriteProxy)

		// B 端合作申请管理
		authed.GET("/b2b/applications", modOnly, d.ListB2bApplications)
		authed.PATCH("/b2b/applications/:id", modOnly, d.UpdateB2bApplicationStatus)

	// Delta 管理动作透传（兜底通道）
	authed.Any("/delta/*proxy", modOnly, d.DeltaProxy)
	}

	// 审计：super / operator
	authed.GET("/audit",
		middleware.RequireRole(model.RoleSuperAdmin, model.RoleOperator),
		d.ListAudit)
	authed.GET("/audit/export.csv",
		middleware.RequireRole(model.RoleSuperAdmin, model.RoleOperator),
		d.ExportAuditCSV)

	// 敏感词库：super / moderator
	{
		authed.GET("/banned-words", modOnly, d.ListBannedWords)
		authed.POST("/banned-words", modOnly, d.AddBannedWord)
		authed.DELETE("/banned-words/:id", modOnly, d.RemoveBannedWord)
		authed.GET("/banned-words/stats", modOnly, d.BannedWordStats)
	}

	// 运营公告板：super / moderator
	{
		authed.GET("/announcements", modOnly, d.ListAnnouncements)
		authed.POST("/announcements", modOnly, d.CreateAnnouncement)
		authed.PATCH("/announcements/:id", modOnly, d.UpdateAnnouncement)
		authed.PATCH("/announcements/:id/active", modOnly, d.SetAnnouncementActive)
		authed.DELETE("/announcements/:id", modOnly, d.DeleteAnnouncement)
	}

	// 语音房管理（LiveKit）：super / moderator
	{
		authed.GET("/voice/rooms", modOnly, d.ListVoiceRooms)
		authed.GET("/voice/rooms/:room/participants", modOnly, d.ListVoiceParticipants)
		authed.DELETE("/voice/rooms/:room", modOnly, d.DeleteVoiceRoom)
		authed.DELETE("/voice/rooms/:room/participants/:identity", modOnly, d.KickVoiceParticipant)
		authed.GET("/voice/history", modOnly, d.VoiceRoomHistory)
	}

	// 后台账号管理：仅 super
	{
		authed.GET("/admin-users",
			middleware.RequireRole(model.RoleSuperAdmin), d.ListAdminUsers)
		authed.POST("/admin-users",
			middleware.RequireRole(model.RoleSuperAdmin), d.CreateAdminUser)
		authed.PUT("/admin-users/:id/password",
			middleware.RequireRole(model.RoleSuperAdmin), d.ResetAdminPassword)
		authed.DELETE("/admin-users/:id",
			middleware.RequireRole(model.RoleSuperAdmin), d.DeleteAdminUser)
	}

	serveFrontend(r)
	return r
}

func serveFrontend(r *gin.Engine) {
	sub, err := web.Dist()
	if err != nil {
		return
	}
	indexHTML, indexErr := fs.ReadFile(sub, "index.html")
	fileServer := http.FileServer(http.FS(sub))

	r.NoRoute(func(c *gin.Context) {
		p := c.Request.URL.Path
		if strings.HasPrefix(p, "/api/") {
			c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "接口不存在"})
			return
		}

		rel := strings.TrimPrefix(p, "/")
		if rel == "" {
			rel = "index.html"
		}
		if f, openErr := sub.Open(rel); openErr == nil {
			_ = f.Close()
			fileServer.ServeHTTP(c.Writer, c.Request)
			return
		}

		// 非静态资源路径一律回退 index.html（前端路由 SPA fallback）
		if indexErr == nil {
			c.Data(http.StatusOK, "text/html; charset=utf-8", indexHTML)
			return
		}
		c.String(http.StatusNotFound, "admin frontend not built")
	})
}

// requestLogger 轻量访问日志（slog JSON）。
func requestLogger(d handler.Deps) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		c.Next()
		d.Log.Info("http",
			"method", c.Request.Method,
			"path", c.Request.URL.Path,
			"status", c.Writer.Status(),
			"cost_ms", time.Since(start).Milliseconds(),
			"ip", c.ClientIP())
	}
}

// corsMiddleware 仅放行配置中的本地开发来源；生产同源不需要 CORS。
func corsMiddleware(allowed []string) gin.HandlerFunc {
	allow := make(map[string]bool, len(allowed))
	for _, o := range allowed {
		allow[o] = true
	}
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && allow[origin] {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
			c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		}
		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
