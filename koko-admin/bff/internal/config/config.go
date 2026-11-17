package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Config 全部来自环境变量（见 .env.example）。禁止硬编码密钥。
type Config struct {
	Port                string
	MongoURI            string
	RevoltDB            string
	AdminDB             string
	JWTSecret           string
	JWTTTL              time.Duration
	DeltaBaseURL        string
	DeltaAdminToken     string
	DeltaTokenHeader    string
	AutumnBaseURL       string
	AutumnPublicURL     string // 附件对外访问前缀，后台预览头图用
	MinioEndpoint       string
	MinioAccessKey      string
	MinioSecretKey      string
	MinioBucket         string
	AgoraAPIBase        string // 声网云端 REST API 域名（默认 https://api.agora.io，备用 https://api.sd-rtn.com）
	AgoraAppID          string
	AgoraCustomerID     string
	AgoraCustomerSecret string
	LinkSpriteBaseURL   string
	LinkSpriteAPIKey    string
	AllowedIPs          map[string]bool // 登录 IP 白名单；空 = 不限制
	CORSOrigins         []string
	BootstrapUsername   string
	BootstrapPassword   string
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Load 读取并校验环境变量。关键项缺失时返回的零值由调用方决定是否致命，
// 这里保持宽容以便 `go run` 本地调试（连不上 Mongo 会在启动时报错）。
func Load() *Config {
	ttlHours, _ := strconv.Atoi(env("JWT_TTL_HOURS", "12"))
	if ttlHours <= 0 {
		ttlHours = 12
	}

	rawOrigins := env("CORS_ORIGINS", "http://localhost:5199")
	origins := make([]string, 0)
	for _, o := range strings.Split(rawOrigins, ",") {
		if o = strings.TrimSpace(o); o != "" {
			origins = append(origins, o)
		}
	}

	header := env("DELTA_TOKEN_HEADER", "X-Session-Token")

	// 登录 IP 白名单（逗号分隔）；为空表示不限制来源
	allowedIPs := map[string]bool{}
	for _, ip := range strings.Split(env("ALLOWED_IPS", ""), ",") {
		if ip = strings.TrimSpace(ip); ip != "" {
			allowedIPs[ip] = true
		}
	}

	return &Config{
		Port:                env("PORT", "8093"),
		MongoURI:            os.Getenv("MONGO_URI"),
		RevoltDB:            env("MONGO_REVOLT_DB", "revolt"),
		AdminDB:             env("MONGO_ADMIN_DB", "koko_admin"),
		JWTSecret:           os.Getenv("JWT_SECRET"),
		JWTTTL:              time.Duration(ttlHours) * time.Hour,
		DeltaBaseURL:        env("DELTA_BASE_URL", "http://delta:8000"),
		DeltaAdminToken:     os.Getenv("DELTA_ADMIN_TOKEN"),
		DeltaTokenHeader:    header,
		AutumnBaseURL:       env("AUTUMN_BASE_URL", "http://autumn:14704"),
		AutumnPublicURL:     env("AUTUMN_PUBLIC_URL", "https://kokokongkong.com/autumn"),
		MinioEndpoint:       env("MINIO_ENDPOINT", "minio:9000"),
		MinioAccessKey:      os.Getenv("MINIO_ACCESS_KEY"),
		MinioSecretKey:      os.Getenv("MINIO_SECRET_KEY"),
		MinioBucket:         env("MINIO_BUCKET", "revolt-uploads"),
		AgoraAPIBase:        env("AGORA_API_BASE", "https://api.agora.io"),
		AgoraAppID:          os.Getenv("AGORA_APP_ID"),
		AgoraCustomerID:     os.Getenv("AGORA_CUSTOMER_ID"),
		AgoraCustomerSecret: os.Getenv("AGORA_CUSTOMER_SECRET"),
		LinkSpriteBaseURL:   env("LINKSPRITE_BASE_URL", "http://linksprite-backend:8080/api"),
		LinkSpriteAPIKey:    os.Getenv("LINKSPRITE_API_KEY"),
		AllowedIPs:          allowedIPs,
		CORSOrigins:         origins,
		BootstrapUsername:   os.Getenv("BOOTSTRAP_ADMIN_USERNAME"),
		BootstrapPassword:   os.Getenv("BOOTSTRAP_ADMIN_PASSWORD"),
	}
}
