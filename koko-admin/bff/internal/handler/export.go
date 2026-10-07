package handler

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"koko-admin-bff/internal/ulid"
)

// exportRowLimit 导出硬上限，防止一次性拉取拖垮数据库。
const exportRowLimit = 10000

// utf8BOM 让 Excel 双击打开时正确识别 UTF-8 编码。
var utf8BOM = []byte{0xEF, 0xBB, 0xBF}

// ExportUsersCSV GET /api/v1/users/export.csv?q=
// 用户名单导出（最多 10000 条）：ID、用户名、状态位、冻结状态、注册时间。
func (d Deps) ExportUsersCSV(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	filter := bson.M{}
	if q := c.Query("q"); q != "" {
		filter["username"] = bson.M{"$regex": regexp.QuoteMeta(q), "$options": "i"}
	}

	cursor, err := d.RevoltCol("users").Find(ctx, filter,
		options.Find().
			SetSort(bson.D{{Key: "_id", Value: -1}}).
			SetLimit(exportRowLimit).
			SetProjection(bson.M{"username": 1, "flags": 1}))
	if err != nil {
		d.Log.Error("export users failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "导出失败"})
		return
	}
	defer cursor.Close(ctx)

	var users []struct {
		ID       string `bson:"_id"`
		Username string `bson:"username"`
		Flags    int32  `bson:"flags"`
	}
	if err := cursor.All(ctx, &users); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "导出失败"})
		return
	}

	// 联查冻结状态
	frozenMap := map[string]bool{}
	if len(users) > 0 {
		ids := make([]string, 0, len(users))
		for _, u := range users {
			ids = append(ids, u.ID)
		}
		if ac, err := d.RevoltCol("accounts").Find(ctx,
			bson.M{"_id": bson.M{"$in": ids}},
			options.Find().SetProjection(bson.M{"disabled": 1})); err == nil {
			var accs []struct {
				ID       string `bson:"_id"`
				Disabled bool   `bson:"disabled"`
			}
			_ = ac.All(ctx, &accs)
			for _, a := range accs {
				frozenMap[a.ID] = a.Disabled
			}
		}
	}

	rows := [][]string{{"用户ID", "用户名", "状态标记", "登录冻结", "注册时间(UTC)"}}
	for _, u := range users {
		flags := userFlagLabels(u.Flags)
		if flags == "" {
			flags = "正常"
		}
		frozen := ""
		if frozenMap[u.ID] {
			frozen = "已冻结"
		}
		joinedAt := ""
		if t, ok := ulid.TimeOf(u.ID); ok {
			joinedAt = t.UTC().Format("2006-01-02 15:04:05")
		}
		rows = append(rows, []string{u.ID, u.Username, flags, frozen, joinedAt})
	}

	writeCSV(c, "users-"+time.Now().Format("20060102")+".csv", rows)
}

// userFlagLabels 把 users.flags 位组合翻译为中文短语，与前端 Users 页保持一致。
func userFlagLabels(flags int32) string {
	labels := make([]string, 0, 4)
	if flags&1 != 0 {
		labels = append(labels, "已停用")
	}
	if flags&2 != 0 {
		labels = append(labels, "已注销")
	}
	if flags&4 != 0 {
		labels = append(labels, "已封禁")
	}
	if flags&8 != 0 {
		labels = append(labels, "营销号")
	}
	return strings.Join(labels, "/")
}

// ExportAuditCSV GET /api/v1/audit/export.csv?method=&actor=&q=
// 审计日志导出（最多 10000 条），筛选条件与页面一致。
func (d Deps) ExportAuditCSV(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	filter := bson.M{}
	if m := strings.ToUpper(strings.TrimSpace(c.Query("method"))); m != "" {
		filter["method"] = m
	}
	if actor := strings.TrimSpace(c.Query("actor")); actor != "" {
		filter["$or"] = bson.A{
			bson.M{"actor_name": bson.M{"$regex": regexp.QuoteMeta(actor), "$options": "i"}},
			bson.M{"actor_id": actor},
		}
	}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		filter["path"] = bson.M{"$regex": regexp.QuoteMeta(q), "$options": "i"}
	}

	cursor, err := d.AdminCol("audit_logs").Find(ctx, filter,
		options.Find().
			SetSort(bson.D{{Key: "created_at", Value: -1}}).
			SetLimit(exportRowLimit))
	if err != nil {
		d.Log.Error("export audit failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "导出失败"})
		return
	}
	defer cursor.Close(ctx)

	var logs []struct {
		ActorName string    `bson:"actor_name"`
		Role      string    `bson:"role"`
		Method    string    `bson:"method"`
		Path      string    `bson:"path"`
		Status    int       `bson:"status"`
		IP        string    `bson:"ip"`
		CreatedAt time.Time `bson:"created_at"`
	}
	if err := cursor.All(ctx, &logs); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "internal", "message": "导出失败"})
		return
	}

	rows := [][]string{{"时间(UTC)", "操作人", "角色", "方法", "路径", "状态码", "IP"}}
	for _, l := range logs {
		rows = append(rows, []string{
			l.CreatedAt.UTC().Format("2006-01-02 15:04:05"),
			l.ActorName,
			l.Role,
			l.Method,
			l.Path,
			fmt.Sprintf("%d", l.Status),
			l.IP,
		})
	}

	writeCSV(c, "audit-"+time.Now().Format("20060102")+".csv", rows)
}

// writeCSV 统一输出 CSV：BOM 头、下载文件名、表格内容。
func writeCSV(c *gin.Context, filename string, rows [][]string) {
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	_, _ = c.Writer.Write(utf8BOM)

	w := csv.NewWriter(c.Writer)
	_ = w.WriteAll(rows)
	w.Flush()
}
