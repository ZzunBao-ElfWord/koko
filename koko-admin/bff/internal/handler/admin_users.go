package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/auth"
	"koko-admin-bff/internal/middleware"
	"koko-admin-bff/internal/model"
)

// ListAdminUsers GET /api/v1/admin-users（仅 super_admin）
func (d Deps) ListAdminUsers(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	opts := options.Find().
		SetSort(bson.D{{Key: "created_at", Value: -1}}).
		SetProjection(bson.M{"password_hash": 0})

	cursor, err := d.AdminCol("admin_users").Find(ctx, bson.M{}, opts)
	if err != nil {
		d.Log.Error("find admin users failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "查询后台账号失败"})
		return
	}
	defer cursor.Close(ctx)

	items := make([]model.AdminUser, 0)
	if err := cursor.All(ctx, &items); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "解析后台账号失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

type createAdminRequest struct {
	Username string `json:"username" binding:"required,min=2,max=64"`
	Password string `json:"password" binding:"required,min=8,max=128"`
	Role     string `json:"role" binding:"required"`
}

// CreateAdminUser POST /api/v1/admin-users（仅 super_admin）
func (d Deps) CreateAdminUser(c *gin.Context) {
	var req createAdminRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "参数不合法（密码至少 8 位）"})
		return
	}
	if !model.ValidRoles[req.Role] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_role", "message": "角色不存在"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	col := d.AdminCol("admin_users")
	if n, _ := col.CountDocuments(ctx, bson.M{"username": req.Username}); n > 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "conflict", "message": "用户名已存在"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "密码处理失败"})
		return
	}

	user := model.AdminUser{
		ID:           model.NewID(),
		Username:     req.Username,
		PasswordHash: hash,
		Role:         req.Role,
		CreatedAt:    time.Now().UTC(),
	}
	if _, err := col.InsertOne(ctx, user); err != nil {
		d.Log.Error("create admin user failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "创建失败"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"ok": true, "id": user.ID})
}

type resetPasswordRequest struct {
	Password string `json:"password" binding:"required,min=8,max=128"`
}

// ResetAdminPassword PUT /api/v1/admin-users/:id/password（仅 super_admin）
// 重置任意后台账号密码；pwd_changed_at 使该账号既有 JWT 立即失效（见 middleware.JWTAuth）。
func (d Deps) ResetAdminPassword(c *gin.Context) {
	var req resetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "密码至少 8 位"})
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "密码处理失败"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	res, err := d.AdminCol("admin_users").UpdateByID(ctx, c.Param("id"),
		bson.M{"$set": bson.M{"password_hash": hash, "pwd_changed_at": time.Now().UTC()}})
	if err != nil {
		d.Log.Error("reset admin password failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "重置失败"})
		return
	}
	if res.MatchedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "账号不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteAdminUser DELETE /api/v1/admin-users/:id（仅 super_admin）
// 删除后台账号。安全约束：禁止删除自己；系统至少保留一个 super_admin。
// 删除后该账号既有 JWT 因中间件查不到记录而立即失效。
func (d Deps) DeleteAdminUser(c *gin.Context) {
	targetID := c.Param("id")
	actorID := c.GetString(middleware.CtxActorID)
	if targetID == actorID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "不能删除当前登录账号"})
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 5*time.Second)
	defer cancel()

	col := d.AdminCol("admin_users")
	// 禁止删除最后一个 super_admin
	var target struct {
		Role string `bson:"role"`
	}
	if err := col.FindOne(ctx, bson.M{"_id": targetID},
		options.FindOne().SetProjection(bson.M{"role": 1})).Decode(&target); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "账号不存在"})
		return
	}
	if target.Role == model.RoleSuperAdmin {
		n, err := col.CountDocuments(ctx, bson.M{"role": model.RoleSuperAdmin})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "检查超管数量失败"})
			return
		}
		if n <= 1 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "bad_request", "message": "至少保留一个超级管理员账号"})
			return
		}
	}

	res, err := col.DeleteOne(ctx, bson.M{"_id": targetID})
	if err != nil {
		d.Log.Error("delete admin user failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "删除失败"})
		return
	}
	if res.DeletedCount == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not_found", "message": "账号不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
