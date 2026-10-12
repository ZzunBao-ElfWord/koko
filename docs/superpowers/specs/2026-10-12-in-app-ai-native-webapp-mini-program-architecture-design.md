# KOKO App 内 AI 原生网页小程序生态架构设计

**日期**：2026-10-12
**状态**：Phase 1 MVP 已实施（待验收）
**承载项目**：KOKO空空 App（Flutter 跨端，移动 + 桌面）

---

## 一、目标与背景

### 1.1 目标

在 KOKO空空 App 内搭建一个**网页小程序容器生态**，让客户能在 App 内使用一系列网页小程序工具，并为未来「AI 原生开放生态」打基础——网页小程序内自带 AI 服务，跨小程序的 AI 间能顺畅协作，对外（Claude/ChatGPT/Cursor 等外部 Agent）能高效应答。

### 1.2 核心约束（已与用户澄清确认）

| 约束 | 决定 |
|---|---|
| 开发者来源 | 以内部团队为主 + 少量第三方合作方 |
| 原生能力需求 | 跨小程序业务调用 + 设备能力调用（最高复杂度 Bridge） |
| 部署与更新 | 混合模式（核心高频打进 App 包 + 长尾/合作方走远端 URL） |
| 承载主体 | KOKO空空 App（Flutter，移动+桌面） |
| 入口形态 | 独立「小程序中心」Tab/页面 |
| 首个落地 | nft-generator-prototype（位于 c:\官网html\KOKO\nft-generator-prototype） |
| 未来方向 | 开放 AI 生态：框架内 AI 间顺畅交互 + 对外高效应答 |

### 1.3 业界标准发现（2026 调研结论）

| 标准 | 全称 | 解决问题 | 状态 |
|---|---|---|---|
| MCP | Model Context Protocol | Agent↔工具/网页 | 2026 业界事实标准 |
| MCP Apps | MCP Interactive UIs 扩展（SEP-1865） | 网页小程序 = MCP 工具返回 HTML UI | 2026-01 转 Final |
| A2A | Agent2Agent Protocol | Agent↔Agent 跨框架通信 | Google 2025 推，已捐 Linux Foundation |
| WebMCP | WebMCP | 网页对客户端 LLM 共享工具（无 API key） | 2026-05 v1.0 |

**关键结论**：用户所需的「网页小程序」在业界就是「MCP App」。完全采用开放标准，与外部 AI 生态天然互通，避免重造轮子。

---

## 二、系统架构（5 层）

```
┌──────────────────────────────────────────────────────────┐
│  Flutter KOKO App（移动+桌面）                            │
│  ┌────────────────────────────────────────────────────┐  │
│  │ L1 UI 层：小程序中心 Tab、内嵌 WebView 渲染容器      │  │
│  │   - flutter_inappwebview（沙箱 iframe）             │  │
│  │   - MCP Host 渲染层（加载 ui:// 资源）              │  │
│  │   - 离线包版本管理 + 热更新                          │  │
│  └────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────┐  │
│  │ L2 Bridge 层：JS Bridge（postMessage JSON-RPC）      │  │
│  │   - Device API：相机/定位/存储/推送                  │  │
│  │   - Business API：跳转/付款/分享/订单                │  │
│  │   - Identity API：uid/token/钱包地址注入             │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
            ↑ postMessage / JSON-RPC（沙箱内）
┌──────────────────────────────────────────────────────────┐
│ L3 网页小程序层（每个=1 个 MCP App）                      │
│   - HTML/JS bundle + ui:// 资源声明                      │
│   - 内嵌 PageAgent（阿里开源）或 @dudko.dev/agent-web     │
│   - WebMCP：通过 document.modelContext 注册工具           │
│   - nft-generator-prototype 为首个改造对象                │
└──────────────────────────────────────────────────────────┘
            ↑ MCP（agent↔tool）      ↑ A2A（agent↔agent）
┌──────────────────────────────────────────────────────────┐
│ L4 编排后端层（基于 OpenAgent v2.93 复用）                │
│   - MCP Server：暴露网页小程序能力对外（StreamableHTTP）  │
│   - A2A Server：跨小程序 agent 通信                       │
│   - Casbin 权限引擎 + 审计日志 + Agent Hub               │
│   - 30+ LLM 提供商接入 + RAG 知识库                      │
└──────────────────────────────────────────────────────────┘
            ↑ HTTPS / SSE
┌──────────────────────────────────────────────────────────┐
│ L5 外部 AI 生态层                                         │
│   - Claude/ChatGPT/Cursor 作为 MCP Client 调用你的小程序  │
│   - 任何 A2A-compliant agent 与你的 agents 协作          │
│   - WebMCP 让网页对客户端 LLM 共享工具无需 API key         │
└──────────────────────────────────────────────────────────┘
```

---

## 三、核心模块与职责

### L1 App 内 MCP Host 容器（自研）

- 用 `flutter_inappwebview` 加载 HTML bundle
- 实现 MCP Apps Host 渲染层：沙箱 iframe + postMessage JSON-RPC
- 自研 Device/Business/Identity 三类 Bridge
- 离线包：本地资源 + 自定义 `koko://` scheme
- 热更新：版本管理服务（基于 OpenAgent 复用）

### L2 JS Bridge 层（自研）

- **Device API**：相机、定位、本地存储、推送、文件系统
- **Business API**：跨小程序跳转、付款、社交分享、订单
- **Identity API**：注入 uid/token/钱包地址（基础能力，所有网页默认可用）
- 协议：postMessage JSON-RPC 2.0
- 沙箱：合作方网页需申请调用某能力，经审核通过后授权

### L3 网页小程序运行时（基于开源）

- 每个 HTML bundle = 一个 MCP App
- 用 `@modelcontextprotocol/ext-apps` SDK 声明 UI 资源
- **网页内 AI 底座**（二选一）：
  - **PageAgent**（[alibaba/page-agent](https://github.com/alibaba/page-agent)，26k stars，MIT）：inside-out 架构，DOM 文本化操作，BYO LLM
  - **@dudko.dev/agent-web**：Vercel AI SDK + WebGPU 本地模型
- **WebMCP**：网页通过 `document.modelContext.registerTool()` 暴露工具给客户端 LLM
- 沙箱：origin 隔离 + CSP 白名单 + Cookie/localStorage 独立

### L4 编排后端（复用 + 自研）

**复用**：OpenAgent v2.93（[the-open-agent/openagent](https://github.com/the-open-agent/openagent)，Apache 2.0，5.6k stars）
- 单二进制 Go 部署，内嵌 React UI
- 30+ LLM 接入、Casbin 权限引擎、Agent Hub（Star/Fork/Issue）
- MCP 支持（SSE/Stdio/StreamableHTTP 三种传输）
- BPMN 工作流、定时任务、多租户、SSO、审计日志

**自研**：
- MCP Server：把网页小程序能力对外暴露（StreamableHTTP 传输）
- A2A Server：跨小程序 agent 通信
- 版本管理 + 热更新增量包服务

### L5 外部 AI 生态接入

- Claude/ChatGPT/Cursor 配置你的 MCP Server 后即可调用网页小程序
- 任何 A2A-compliant agent 框架（LangGraph/CrewAI/Semantic Kernel 等）可与你的 agents 协作
- WebMCP 让网页对客户端 LLM 共享工具无需 API key（用户运行本地 WebMCP proxy）

---

## 四、数据流（三个典型场景）

### 场景 A：客户在 App 内使用 NFT 生成器

1. 客户在小程序中心点击 NFT 生成器卡片
2. Flutter MCP Host 加载 `ui://nft-generator` 资源（离线包或远端）
3. 网页内 PageAgent 初始化，通过 Identity Bridge 读取用户身份
4. 客户说「帮我配置一个赛博朋克风格」→ PageAgent 调用 fetchLayers MCP 工具 → DOM 操作配置
5. 客户点击生成 → generateBatch MCP 工具 → onProgress 回调实时进度
6. 完成后通过 Business Bridge 跳转订单页或付款

### 场景 B：外部 Claude 用户调用你的 NFT 生成器

1. 用户在 Claude Desktop 配置你的 MCP Server URL
2. Claude `tools/list` → 发现 fetchLayers/updateWeight/generateBatch 等工具
3. Claude `tools/call` → 你的 MCP Server 转发到网页小程序或后端
4. 工具响应含 `_meta.ui.resourceUri: "ui://nft-generator"` → Claude 渲染交互式 UI
5. 用户在 Claude 内直接配置图层、生成 NFT，无需跳转 App

### 场景 C：跨小程序 AI 协作

1. 用户在 NFT 生成器网页内说「用我刚生成的 NFT 创建推广文案」
2. PageAgent 通过 A2A 发现「营销文案」小程序的 agent
3. A2A `send message` → 营销文案 agent 生成文案 → 返回结果
4. NFT 生成器内嵌显示文案 + 一键发布按钮

---

## 五、技术栈

| 层 | 选型 | 备注 |
|---|---|---|
| App 容器 | Flutter + flutter_inappwebview | 8k+ stars，社区活跃 |
| 网页运行时 | TypeScript + @modelcontextprotocol/ext-apps | MCP Apps 官方 SDK |
| 网页内 AI | PageAgent（推荐） | 阿里开源，BYO LLM |
| 后端编排 | OpenAgent v2.93（复用） | Go 单二进制，Apache 2.0 |
| 跨 agent 通信 | A2A Protocol（a2a-js / a2a-python SDK） | 6 语言官方 SDK |
| 工具暴露 | MCP（modelcontextprotocol/sdk） | 业界事实标准 |
| 网页对客户端 LLM | WebMCP | TypeScript 框架 |
| 部署 | Docker Compose（后端）+ 离线包（App 内）+ CDN（远端 URL） | 混合部署 |

---

## 六、实施阶段（3 阶段递进）

### Phase 1 — MVP 闭环（2-3 周）

**目标**：验证 Flutter + WebView + MCP App 基础链路通

**范围**：
- 改造 nft-generator-prototype 为 MCP App：
  - api.js 中 6 个桩函数（fetchLayers/updateWeight/generatePreview/generateBatch/downloadNft/downloadBatch）转为 MCP 工具声明
  - index.html 注入 `<script src="https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps">`
  - 通过 `document.modelContext.registerTool()` 注册工具
- Flutter 内 flutter_inappwebview + 基础 Identity Bridge（注入 uid/token）
- 离线包：本地资源 + `koko://` scheme
- 后端暂用 linksprite-backend 现有接口（不上 OpenAgent）

**成功标准**：
- App 内能加载 nft-generator 网页
- 网页能通过 Identity Bridge 拿到当前用户身份
- api.js 中的 MCP 工具能被调用并返回结果

### Phase 2 — AI 原生（3-4 周）

**目标**：网页内自带 AI + 对外暴露给外部 Agent

**范围**：
- 集成 PageAgent 到 nft-generator 网页
- 自研 MCP Server 暴露网页工具
- 让外部 Claude Desktop 可调用 NFT 生成器（验证场景 B）
- 在 nft-generator 网页内通过 PageAgent 实现「自然语言配置图层/稀有度」

**成功标准**：
- 用户在网页内能通过自然语言配置 NFT 参数
- Claude Desktop 配置 MCP Server 后能列出并调用 NFT 生成器工具
- Claude 内能渲染交互式 NFT 生成器 UI

### Phase 3 — 生态化（4-6 周）

**目标**：跨小程序 agent 通信 + 完整生态底座

**范围**：
- 引入 OpenAgent v2.93 作为编排后端
- 集成 A2A SDK（a2a-python 或 a2a-js），跨小程序 agent 通信（验证场景 C）
- 实现热更新服务（版本管理 + 增量包 + 灰度发布）
- 实现小程序中心 Tab UI（卡片列表 + 搜索 + 分类）
- 第二个网页小程序上架（候选：藏珍录、电竞陪玩面板）

**成功标准**：
- 两个网页小程序间能通过 A2A 协议完成跨小程序任务委派
- OpenAgent 后端能管理 agent 编排、权限、审计
- 热更新能让用户拿到最新版网页小程序无需重装 App

---

## 七、风险与缓解

| 风险 | 缓解 |
|---|---|
| MCP Apps 较新（2026-01 Final），实战经验少 | Phase 1 前先做 PoC：验证 flutter_inappwebview 与 MCP Apps Host 集成可行性（预计 2-3 天） |
| 多技术栈集成复杂（Flutter + TS + Go） | Phase 1 先做最小闭环，逐步引入 AI 能力 |
| iframe + postMessage 跨域开销 | 高频交互场景评估，必要时用 SharedArrayBuffer 或降级到原生组件 |
| 离线包更新延迟（用户拿到旧版） | 版本检查 + 强制升级机制 + 灰度发布 |
| PageAgent 依赖外部 LLM API key | Phase 2 起接入 koko-admin 后端代理 LLM 调用，避免网页直连用户 API key |
| 沙箱与原生能力调用的安全边界 | 合作方网页能力申请制，Casbin 权限引擎审计每次调用 |

---

## 八、与现有 KOKO 生态的集成

| 现有系统 | 集成方式 |
|---|---|
| linksprite-backend（Java） | 复用 wallet/nft 现有接口；MCP Server 作为薄包装层调用 |
| koko-auth | 复用 Session/JWT，通过 Identity Bridge 注入网页 |
| chain_wallets 集合 | 复用查询钱包地址（已有 GET /koko/wallet/{uid}） |
| koko-admin BFF | 透传 MCP/A2A 管理接口（参考现有 /api/v1/chain/*proxy 模式） |
| Caddy 路由 | nft.kokokongkong.com 域下新增 /api/v1/mcp/* 转发至 MCP Server |
| nft-generator-prototype | 首个改造对象：6 桩函数转 MCP 工具，注入 PageAgent |

---

## 九、成功标准（整体）

1. **场景 A 可用**：客户在 KOKO App 内通过小程序中心使用 NFT 生成器，能通过自然语言配置参数
2. **场景 B 可用**：外部 Claude Desktop 配置 MCP Server 后能调用 NFT 生成器，在 Claude 内渲染交互式 UI
3. **场景 C 可用**：两个网页小程序间通过 A2A 协议完成跨小程序任务委派
4. **混合部署可用**：核心网页小程序打进 App 包离线可用，长尾走远端 URL
5. **沙箱与权限可用**：合作方网页不能越权调用未授权能力，Casbin 审计每次调用

---

## 十、开放问题与未决影响

1. **flutter_inappwebview 与 MCP Apps Host 集成可行性**：MCP Apps 规范未明确 Flutter 集成路径，Phase 1 前需 PoC 验证（2-3 天）。若不可行，回退方案：自研 WebView + 自定义 MCP-over-postMessage 协议（不依赖 MCP Apps SDK）。
2. **PageAgent 商用许可**：MIT 许可，可商用；但依赖外部 LLM API key，需在 Phase 2 决定 LLM 代理路径（koko-admin 后端代理 vs 用户自带 key）。
3. **OpenAgent v2.93 中文支持**：未在调研中明确，Phase 3 前需验证中文 prompt 与 RAG 效果。
4. **A2A 跨小程序 agent 身份模型**：每个网页小程序的 agent 身份如何注册与发现，需 Phase 3 设计具体方案（候选：基于 OpenAgent Agent Hub）。
5. **iOS 平台 MCP Apps 渲染限制**：iOS WebView 对 iframe + postMessage 的限制需在 Phase 1 PoC 验证。
6. **合作方网页沙箱强度**：完全 origin 隔离 vs 同 origin 不同 path，需在 Phase 2 设计具体 CSP 策略。

---

## 十一、参考资料

### 协议与标准
- MCP Apps（SEP-1865）：https://modelcontextprotocol.io/seps/1865-mcp-apps-interactive-user-interfaces-for-mcp
- MCP Apps 发布博客（2026-01-26）：https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- A2A Protocol：https://a2a-protocol.org/
- A2A 规范：https://a2a-protocol.org/latest/specification/
- WebMCP：https://github.com/jasonjmcghee/WebMCP
- @modelcontextprotocol/ext-apps SDK：https://github.com/modelcontextprotocol/ext-apps

### 开源项目
- PageAgent（阿里）：https://github.com/alibaba/page-agent
- @dudko.dev/agent-web：https://www.npmjs.com/package/@dudko.dev/agent-web
- flutter_inappwebview：https://github.com/pichillilorenzo/flutter_inappwebview
- OpenAgent v2.93：https://github.com/the-open-agent/openagent
- CrewForm（备选）：https://github.com/CrewForm/crewform
- A2A SDK 6 语言：Python/Go/JS/Java/.NET/Rust（见 https://a2a-protocol.org/dev/）
- Microsoft Agent Framework：https://devblogs.microsoft.com/foundry/introducing-microsoft-agent-framework-the-open-source-engine-for-agentic-ai-apps/

### 现有 KOKO 资源
- nft-generator-prototype：c:\官网html\KOKO\nft-generator-prototype\
- KOKO 官网：c:\官网html\KOKO\index.html
- linksprite-backend 部署：服务器 8.137.33.244 /opt/linksprite（Docker 容器）
- koko-admin BFF：admin.kokokongkong.com，主账号 admin

---

## 附录：Phase 1 实施记录

- 实施计划：`docs/superpowers/plans/2026-10-12-phase-1-mvp-implementation-plan.md`
- PoC 结论：`docs/superpowers/plans/poc-result.md`（待人工验证填写）
- 实际决策（koko:// scheme → InAppLocalhostServer）：见计划文档「关于 spec 中 koko:// scheme 的调整说明」
- flutter_inappwebview 6.x API 偏差：`InAppLocalhostServer` 参数名 `documentRoot`（非 `directory`）；console 回调名 `onConsoleMessage`（非 `consoleLog`）
- 验收结果：[待填写 E2E 验收清单完成情况]
