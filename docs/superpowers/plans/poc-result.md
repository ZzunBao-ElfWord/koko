# PoC 结论（2026-10-XX）

> **状态：待人工验证填写。** 本文件为 Phase 1 Task 1 PoC 决策门的结果模板。
> 布尔值留空，由工程师在 App 内（Windows 桌面端 / Android）执行 Step 7 验证后填写。
> 代码改动已完成并提交（见 git log），仅缺运行时验证。

## 验证步骤（人工执行）

1. `cd C:\Projects\koko-app && flutter run -d windows`
2. 登录后，在左侧栏找到「小程序中心 (PoC)」入口（`Icons.apps` 圆形按钮，位于「创建或加入空间」按钮下方）。
3. 点击进入 PoC 页面，WebView 会从 `http://localhost:8080/poc/index.html` 加载。
4. 等待 `onLoadStop` 触发，观察页面 `<pre id="out">` 区域是否自动出现：
   `{"dir":"flutter→js","payload":{"uid":"poc-user-001","token":"poc-token"}}`。
5. 点击网页「调用 Flutter Handler」按钮，观察底部日志区是否出现：
   `pocHandler 收到: [{ts: ...}]`。
6. 点击网页「探测 ext-apps SDK」按钮，观察 `<pre id="out">` 是否出现：
   `{"dir":"probe","probe":{...}}`。

## 验证结果

- Flutter → JS（`evaluateJavascript` 注入 `window.pocReceiveFromFlutter`）：☐ ✅ / ☐ ❌
- JS → Flutter（`addJavaScriptHandler('pocHandler')` 回调）：☐ ✅ / ☐ ❌
- `@modelcontextprotocol/ext-apps` SDK 加载（`window.ModelContextProtocol` 定义）：☐ ✅ / ☐ ❌
- `document.modelContext.registerTool` 可调用：☐ ✅ / ☐ ❌
- 注册的工具能被外部 invoke（在网页 console 触发 `poc_test`）：☐ ✅ / ☐ ❌

> 验证项 1-2 是「双向通信」判定，3-5 是「ext-apps SDK 可用性」判定。

## 决策

- **若全部 ✅**：走 MCP Apps 标准方案（Task 4 主路径：`@modelcontextprotocol/ext-apps` SDK + `document.modelContext.registerTool`）。
- **若 ext-apps SDK ❌ 但双向通信 ✅**：走回退方案（Task 4 备选：网页侧 `window.kokoMCP` 自定义接口，Flutter 侧 `addJavaScriptHandler('kokoMCP')` 直调，不依赖 MCP Apps SDK）。`mcp-bridge.js` 内已含自动回退逻辑。
- **若双向通信 ❌**：停止，重新评估容器选型（如 wakana_webview 或纯 `file://` 加载 + `JavaScriptChannel`）。

## 实施记录（已完成，不依赖运行时验证）

- `pubspec.yaml`：添加 `flutter_inappwebview: ^6.1.5` 与 `assets/miniapps/` 声明。
- `assets/miniapps/poc/index.html`：PoC 测试页，含 3 个验证函数（`pocReceiveFromFlutter` / `callFlutter` / `probeExtApps`）。
- `lib/features/miniapp/miniapp_page.dart`：PoC 版 WebView 页面，含 `InAppLocalhostServer` 启停（`documentRoot: 'assets/miniapps'`，6.x API 参数名）、`pocHandler` 注册、`onLoadStop` 内 `evaluateJavascript` 注入、`onConsoleMessage` 回显。
- `lib/features/home/desktop_scaffold.dart`：在 `_DesktopRail` 的「创建或加入空间」按钮下方插入临时 `_RailCircleButton`（`Icons.apps`），`onTap` 推入 `MiniappPage`。
- `flutter pub get`：exit 0，安装 flutter_inappwebview 6.1.5 + 各平台子包（android/ios/macos/web/windows）。
- `flutter analyze`：`No issues found!`（0 error 0 warning）。

## 与计划的偏差

- 计划 Step 6 写的是 `InAppLocalhostServer(port: 8080, directory: 'assets/miniapps')`，但 flutter_inappwebview 6.x 的实际参数名是 `documentRoot`（不是 `directory`）。已用 `documentRoot: 'assets/miniapps'`。
- 计划 Step 4 的 `consoleLog:` 回调在 6.x 不存在，正确名是 `onConsoleMessage: (controller, ConsoleMessage consoleMessage)`，已采用正确签名。
- `_controller` 字段在 PoC 阶段未被读取（仅在 `onWebViewCreated` 赋值），用 `// ignore: unused_field` 暂时抑制；Task 3/6 接入 IdentityBridge/McpBridge 后会读取，可移除该抑制注释。

## 待人工验证后的下一步

填写完上方布尔值后，根据决策分支选择 Task 4 的主路径或备选路径。
