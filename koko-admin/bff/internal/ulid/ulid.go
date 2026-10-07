// Package ulid 仅实现"按时间生成 ULID 字典序边界"这一个能力。
// Stoat/Revolt 各集合主键 _id 是 26 位 ULID（Crockford Base32），字典序即时间序，
// 因此按天统计不需要解码线上数据，只要生成当天起止边界串做 $gte/$lt 即可。
package ulid

import (
	"strings"
	"time"
)

const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

// encodeTime 将毫秒时间戳编码为 ULID 的前 10 个字符。
func encodeTime(ms uint64) string {
	var out [10]byte
	for i := 9; i >= 0; i-- {
		out[i] = alphabet[ms%32]
		ms /= 32
	}
	return string(out[:])
}

// LowerAt 返回 t 时刻（含）的最小 ULID，用于 $gte。
func LowerAt(t time.Time) string {
	return encodeTime(uint64(t.UnixMilli())) + strings.Repeat("0", 16)
}

// UpperAt 返回 t 时刻（不含）的上界 ULID，用于 $lt。
func UpperAt(t time.Time) string {
	return encodeTime(uint64(t.UnixMilli())) + strings.Repeat("Z", 16)
}

// DayBounds 返回 t 所在 UTC 自然日的 [lower, upper) 边界。
func DayBounds(t time.Time) (lower string, upper string) {
	day := time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, time.UTC)
	return LowerAt(day), LowerAt(day.Add(24 * time.Hour))
}

// TimeOf 解码单个 ULID 前 10 字符（Crockford Base32）为毫秒时间戳。
// 仅用于单对象展示（如用户注册时间）；聚合统计仍必须走边界串（见 AGENTS.md 第 5 节）。
func TimeOf(id string) (time.Time, bool) {
	if len(id) < 10 {
		return time.Time{}, false
	}
	var ms uint64
	for i := 0; i < 10; i++ {
		v, ok := decodeChar(id[i])
		if !ok {
			return time.Time{}, false
		}
		ms = ms*32 + uint64(v)
	}
	return time.UnixMilli(int64(ms)).UTC(), true
}

// decodeChar 按 Crockford Base32 字母表解码单字符（与 encodeTime 的 alphabet 一一对应）。
func decodeChar(b byte) (uint64, bool) {
	switch {
	case b >= '0' && b <= '9':
		return uint64(b - '0'), true
	case b >= 'A' && b <= 'H':
		return uint64(b-'A') + 10, true
	case b == 'J' || b == 'K':
		return uint64(b-'J') + 18, true
	case b == 'M' || b == 'N':
		return uint64(b-'M') + 20, true
	case b >= 'P' && b <= 'T':
		return uint64(b-'P') + 22, true
	case b >= 'V' && b <= 'Z':
		return uint64(b-'V') + 27, true
	}
	return 0, false
}
