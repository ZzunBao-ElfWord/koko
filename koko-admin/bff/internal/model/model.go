package model

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

// 三角色（固定，不引入 Casbin）。
const (
	RoleSuperAdmin = "super_admin"
	RoleModerator  = "moderator"
	RoleOperator   = "operator"
)

// ValidRoles 供创建账号等场景校验。
var ValidRoles = map[string]bool{
	RoleSuperAdmin: true,
	RoleModerator:  true,
	RoleOperator:   true,
}

// UserFlags —— Stoat/Revolt users.flags（int32 位标志）。
// 处置时必须用 $bit 改这一位，禁止整条覆盖 users 文档（见 AGENTS.md 第 5 节）。
const (
	FlagSuspended int32 = 1
	FlagDeleted   int32 = 2
	FlagBanned    int32 = 4
	FlagSpammer   int32 = 8
)

// FlagNames 对外使用的小写名称 ↔ 位值。
var FlagNames = map[string]int32{
	"suspended": FlagSuspended,
	"deleted":   FlagDeleted,
	"banned":    FlagBanned,
	"spammer":   FlagSpammer,
}

// AdminUser 后台账号，存于独立库 koko_admin.admin_users。
// PwdChangedAt 用于"改密后旧 JWT 立即失效"：签发时间早于此时间的 token 一律拒绝。
type AdminUser struct {
	ID           string     `bson:"_id" json:"id"`
	Username     string     `bson:"username" json:"username"`
	PasswordHash string     `bson:"password_hash" json:"-"`
	Role         string     `bson:"role" json:"role"`
	CreatedAt    time.Time  `bson:"created_at" json:"created_at"`
	PwdChangedAt *time.Time `bson:"pwd_changed_at,omitempty" json:"-"`
}

// AuditLog 审计日志，存于 koko_admin.audit_logs。
type AuditLog struct {
	ID        string    `bson:"_id" json:"id"`
	ActorID   string    `bson:"actor_id" json:"actor_id"`
	ActorName string    `bson:"actor_name" json:"actor_name"`
	Role      string    `bson:"role" json:"role"`
	Method    string    `bson:"method" json:"method"`
	Path      string    `bson:"path" json:"path"`
	Status    int       `bson:"status" json:"status"`
	IP        string    `bson:"ip" json:"ip"`
	UserAgent string    `bson:"ua" json:"ua"`
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}

// NewID 生成 128 位随机十六进制 ID（后台自有集合使用；业务库主键沿用 ULID）。
func NewID() string {
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		// crypto/rand 失败意味着系统级熵源异常，继续运行已无安全意义。
		panic(err)
	}
	return hex.EncodeToString(b[:])
}
