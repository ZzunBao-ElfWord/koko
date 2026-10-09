# AGENTS.md — KOKO 管理后台（koko-admin）

> 本文件是所有 AI 员工（Trae / Claude Code / Cursor 等）进入本仓库的**第一份必读文件**。
> 开始任何任务前先通读本文件；不确定时，按本文件的约束执行，不要自由发挥。

## 1. 项目是什么

KOKO空空（基于 Stoat/Revolt 的 IM 业务）的**运营与审核管理后台**，管理对象：
用户、举报队列、消息、空间(servers)、频道、语音房(LiveKit)、媒体文件(Autumn/MinIO)、运营数据。

**关键事实：Stoat/Revolt 官方没有管理 API。** Delta 的 `routes/safety` 仅保留普通用户提交举报接口，
旧版 admin API 已于 2023-08 移除。因此本后台的数据通道只有两条：

1. **MongoDB 直连**：举报队列、用户封禁(flags)、聚合统计 —— 只读为主，写仅限白名单集合；
2. **Delta REST API 代理**：删消息、封空间成员、管频道等 —— 使用服务端持有的管理员会话 Token。

**架构铁律：前端永远不允许直连 MongoDB，也不允许持有 Delta 管理员 Token。
所有操作必须经 BFF；BFF 之外没有第二条路。**

## 2. 技术栈（已拍板，不得擅自更换）

| 层 | 选型 |
|---|---|
| 前端 | Vite 6 + React 19 + TypeScript(strict) + Tailwind CSS v4 + TanStack Query v5 + React Router v7 + axios |
| 后端 | Go 1.23 + Gin + 官方 mongo-go-driver + golang-jwt/v5 + bcrypt |
| 部署 | **单容器**：Web 构建产物 `go:embed` 进 Go 二进制；distroless 静态镜像 |
| 接入 | 现有 Caddy 反代 `admin.kokokongkong.com → koko-admin:8093` |

- 前端 UI 基座：先使用本仓库 `src/components/ui/` 的手写原子组件；
  扩展复杂组件时用 `npx shadcn@latest init` + `npx shadcn@latest add <组件>` 引入 shadcn/ui（源码进仓库，可直接改）。
- 依赖白名单之外的新依赖，必须在任务说明中先提出并说明理由。

## 3. 目录约定

```
koko-admin/
├── AGENTS.md                 # 本文件
├── docker-compose.yml        # 服务器部署（单服务 koko-admin）
├── .env.example              # 环境变量模板（.env 不入库）
├── deploy/
│   ├── mongo-init.js         # MongoDB 最小权限账号初始化（在服务器执行一次）
│   └── Caddyfile.snippet     # 接入现有 Caddy 的配置片段
├── bff/                      # Go BFF
│   ├── Dockerfile            # 多阶段：node 构建前端 → go build → distroless
│   ├── cmd/server/main.go    # 入口（含管理员种子逻辑）
│   └── internal/
│       ├── config/           # 环境变量配置
│       ├── model/            # 领域模型、角色常量、UserFlags 位定义
│       ├── store/            # Mongo 连接
│       ├── auth/             # bcrypt、JWT
│       ├── middleware/       # JWT 鉴权、RBAC、审计
│       ├── delta/            # Delta REST 客户端
│       ├── ulid/             # ULID 边界生成（按天聚合用）
│       ├── handler/          # HTTP handler
│       ├── router/           # 路由表
│       └── web/              # //go:embed dist（前端产物）
└── web/                      # React 前端
    └── src/
        ├── api/              # axios 实例、接口类型与调用
        ├── auth/             # AuthContext
        ├── components/ui/    # 三个基座组件：DataTable / ConfirmDialog / 通用原子
        ├── layouts/          # AdminLayout（侧边栏+顶栏）
        └── pages/            # 一个页面对应一个文件
```

## 4. 权限模型（固定三角色，不引入 Casbin）

| 角色 | 能做什么 |
|---|---|
| `super_admin` | 全部，含后台账号管理 |
| `moderator` | 举报处理、用户封禁/解封、消息/空间处置（Delta 代理） |
| `operator` | 仅数据看板、审计日志查看 |

- 前端菜单与路由按角色过滤只是**体验层**；真正的权限闸门在 BFF 路由中间件，**两边都必须配**。
- 新增写操作时，必须同时：①后端挂 `RequireRole`；②前端路由 meta 标 roles；③记入审计。

## 5. Revolt/Stoat 数据模型须知（动手前必读）

- 主库名默认 `revolt`（以 `.env` 的 `MONGO_REVOLT_DB` 为准）。
- 关键集合：`users`、`servers`、`channels`、`messages`、`server_members`、`safety_reports`。
- 主键 `_id` 均为 **ULID 字符串**（26 位，字典序=时间序）。按时间范围统计时，
  用 `internal/ulid` 生成当天 00:00 / 次日 00:00 的边界串做 `$gte/$lt`，不要试图聚合解码。
- 用户处置位（`users.flags`，int32 位运算）：
  `Suspended=1, Deleted=2, Banned=4, Spammer=8`。
  写操作必须用 Mongo `$bit`（or 置位 / and 清位），**禁止整条覆盖 users 文档**。
- `safety_reports` 的字段以线上实际集合为准（代码按可选字段宽松解码）：
  `_id / author_id / target_id / reason / context / notes / status`。
  报告状态在不同版本可能是字符串或对象，前端展示要兼容；改动处置写入逻辑前，
  先用只读查询确认线上文档形状，再回来改代码。

## 6. 接口约定

- 统一前缀 `/api/v1`；统一 JSON；统一返回：
  - 正常：业务 JSON；分页：`{ items, total, page, page_size }`
  - 错误：`{ "error": "机器可读码", "message": "中文说明" }`，HTTP 状态码语义正确
- 鉴权：`Authorization: Bearer <jwt>`
- Delta 透传：`/api/v1/delta/*path`（ANY）→ BFF 附加管理员会话头后转发，仅 moderator/super_admin
- 所有变更类请求（POST/PUT/PATCH/DELETE，登录除外）自动写审计日志，
  审计字段：操作人、角色、方法、路径、响应码、IP、UA、时间；**请求体不入库**（避免泄密）

## 7. AI 员工工作纪律

1. **一个任务 = 一个接口 + 一个 TS 类型 + 一个页面**，范围小、可编译验收、可回滚。
2. 改动后必须保证两道闸门通过：
   - 后端：`go build ./... && go vet ./...`
   - 前端：`tsc --noEmit && vite build`
   本机无工具链时，在服务器或 Docker 内验证（见第 9 节），不允许把未验证的代码标记为完成。
3. 高危操作（封禁、删消息、处理举报）必须走 `<ConfirmDialog>`，禁止单击直接执行。
4. 不打印/不记录 Token、密码、完整 Mongo URI；日志中 URI 必须脱敏。
5. 不新增定时任务、消息队列等常驻组件；统计实时查 Mongo，后续有性能压力再讨论物化集合。
6. 配置只走环境变量；禁止把任何密钥、内网地址硬编码进代码或前端。
7. 前端禁止绕过 `api/client.ts` 自行 fetch；后端 handler 之间复用 `Deps`，不要新建全局变量。

## 8. 本地开发

需要 Go 1.23+ 与 Node 22+（可选；也可完全用 Docker）。

```powershell
# 后端（PowerShell）
$env:MONGO_URI="mongodb://..."  # 或写 bff/.env
cd bff; go run ./cmd/server

# 前端
cd web; npm install; npm run dev   # http://localhost:5199 ，/api 自动代理到 8093
```

## 9. 构建与部署（服务器，零本地工具链路径）

```bash
# 1) 在服务器 Mongo 中创建最小权限账号（仅一次）
docker exec -i <mongo容器名> mongosh --authenticationDatabase admin -u <root> -p '<root密码>' < deploy/mongo-init.js
# 脚本读取环境变量 MONGO_ADMIN_BFF_PWD 作为新账号密码

# 2) 配置并构建单镜像
cp .env.example .env   # 按注释填齐，尤其 JWT_SECRET / MONGO_URI / DELTA_*
docker compose build
docker compose up -d

# 3) 接入 Caddy：把 deploy/Caddyfile.snippet 内容并入现有 Caddyfile，reload
```

- 首次启动若设置了 `BOOTSTRAP_ADMIN_USERNAME/PASSWORD` 且账号表为空，会自动创建一个 super_admin。
- 容器必须与现有 Caddy / Mongo / Delta 在同一 Docker 网络（`.env` 的 `REVOLT_NETWORK`）。
