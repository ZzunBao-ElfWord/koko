# Phase 1 MVP 实施计划 · KOKO App 内 AI 原生网页小程序生态

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 KOKO空空 App 内搭建最小可用网页小程序容器，让客户能在 App 内使用 nft-generator 网页小程序，并通过 MCP 工具协议被外部调用。

**Architecture:** Flutter App 内用 flutter_inappwebview 加载本地离线包 HTML；网页侧用 `@modelcontextprotocol/ext-apps` SDK 声明 MCP 工具；Flutter 侧自研 JSON-RPC 2.0 over `addJavaScriptHandler` Bridge，提供 Identity（uid/token）注入与工具调用信道；后端暂复用 linksprite-backend 现有接口。

**Tech Stack:**
- Flutter 3.13+ + flutter_inappwebview 6.x（App 容器）
- TypeScript/JS + `@modelcontextprotocol/ext-apps` SDK（网页 MCP 工具声明）
- JSON-RPC 2.0 over `addJavaScriptHandler`（自研 Bridge 协议）
- InAppLocalhostServer（离线包托管，跨平台一致）
- linksprite-backend 现有 REST API（后端不动）

**承载项目：**
- App 侧：`C:\Projects\koko-app`（Flutter 跨端，移动+桌面，v1.1.7+9）
- 网页侧：`c:\官网html\KOKO\nft-generator-prototype`（4 文件：api.js / mock.js / index.html / styles.css）

**Spec 来源：** `c:\官网html\KOKO\docs\superpowers\specs\2026-10-12-in-app-ai-native-webapp-mini-program-architecture-design.md`（Phase 1 章节）

**Phase 1 成功标准（来自 spec）：**
1. App 内能加载 nft-generator 网页
2. 网页能通过 Identity Bridge 拿到当前用户身份
3. api.js 中的 MCP 工具能被调用并返回结果

**关键决策点：** Task 1 是 PoC 决策门。若 `@modelcontextprotocol/ext-apps` SDK 在 flutter_inappwebview 内不可用，则切回退方案（网页侧改用 `window.kokoMCP` 自定义接口，Flutter 侧用 `addJavaScriptHandler` 直接调用，不依赖 MCP Apps SDK）。回退方案在 Task 4 备选步骤中给出。

**关于 spec 中「koko:// scheme」的调整说明：** flutter_inappwebview 6.x 的 `onLoadResourceCustomScheme` 在 iOS 主框架导航上有限制，跨平台不一致。Phase 1 改用 `InAppLocalhostServer` 托管离线包（URL: `http://localhost:8080/nft-generator/index.html`），跨平台一致且更稳。`koko://` scheme 作为 Phase 2 优化项（用 onLoadResourceCustomScheme 增强子资源加载）。

---

## 文件结构

### A. App 侧（`C:\Projects\koko-app`）

| 文件 | 责任 | 新建/修改 |
|---|---|---|
| `pubspec.yaml` | 新增 flutter_inappwebview 依赖 + 声明 miniapps assets | 修改 |
| `lib/features/miniapp/miniapp_page.dart` | 小程序中心 Tab 页面（WebView 容器 + 加载离线包） | 新建 |
| `lib/features/miniapp/miniapp_host_controller.dart` | InAppWebView 控制器管理 + InAppLocalhostServer 启停 | 新建 |
| `lib/features/miniapp/identity_bridge.dart` | 注入 uid/token 的 JS Handler | 新建 |
| `lib/features/miniapp/mcp_bridge.dart` | JSON-RPC 2.0 over addJavaScriptHandler（tools/list、tools/call） | 新建 |
| `lib/features/miniapp/miniapp_registry.dart` | 小程序清单（id/name/url/icon） | 新建 |
| `lib/features/home/desktop_scaffold.dart` | 桌面端集成小程序中心 Tab | 修改 |
| `test/miniapp/identity_bridge_test.dart` | Identity Bridge 单测 | 新建 |
| `test/miniapp/mcp_bridge_test.dart` | MCP Bridge 协议单测 | 新建 |
| `assets/miniapps/nft-generator/` | nft-generator 离线包目录（4 文件复制） | 新建目录 |

### B. 网页侧（`c:\官网html\KOKO\nft-generator-prototype`）

| 文件 | 责任 | 新建/修改 |
|---|---|---|
| `mcp-bridge.js` | MCP 工具声明层：用 ext-apps SDK 注册 6 个工具（或回退方案 window.kokoMCP） | 新建 |
| `manifest.json` | MCP App 元数据（name/version/tools 声明） | 新建 |
| `api.js` | 6 桩函数返回值适配 MCP 工具响应格式（保持函数签名不变） | 修改 |
| `index.html` | 注入 ext-apps SDK + mcp-bridge.js + Identity Bridge 客户端 | 修改 |
| `styles.css` | 不动 | 不动 |
| `mock.js` | 不动 | 不动 |

### C. 离线包同步

`c:\官网html\KOKO\nft-generator-prototype\*` → `C:\Projects\koko-app\assets\miniapps\nft-generator\*`（Task 2 中复制并声明 assets）

---

## Task 1: PoC — flutter_inappwebview 双向通信与 MCP Apps SDK 可用性验证

**决策门 Task。** 验证 flutter_inappwebview 加载本地 HTML + `addJavaScriptHandler` 双向通信 + `@modelcontextprotocol/ext-apps` SDK 在 WebView 内的可用性。预计 2-3 天。

**Files:**
- Modify: `C:\Projects\koko-app\pubspec.yaml`
- Create: `C:\Projects\koko-app\lib\features\miniapp\miniapp_page.dart`（PoC 最小版）
- Create: `C:\Projects\koko-app\assets\miniapps\poc\index.html`（PoC 测试页）

- [ ] **Step 1: 新增 flutter_inappwebview 依赖**

打开 `C:\Projects\koko-app\pubspec.yaml`，在 dependencies 段（`flutter_ali_auth` 之后）追加：

```yaml
  # 网页小程序容器（MCP App Host）
  flutter_inappwebview: ^6.1.5
```

同时在该文件末尾 `flutter:` 段的 `assets:` 下追加：

```yaml
    - assets/miniapps/
```

完整的 assets 段应为：

```yaml
  assets:
    - assets/images/koko_logo.jpg
    - assets/miniapps/
```

- [ ] **Step 2: 拉取依赖**

Run:
```bash
cd C:\Projects\koko-app && flutter pub get
```

Expected: `Process exited with exit code 0`，依赖解析成功。若版本冲突，先尝试 `flutter pub get --no-pub` 排查；与 `flutter_secure_storage: ^9.2.2` + `device_info_plus: ^12.4.0` 的 win32 版本约束应兼容（flutter_inappwebview 6.x 不依赖 win32）。

- [ ] **Step 3: 创建 PoC 测试网页**

创建目录与文件 `C:\Projects\koko-app\assets\miniapps\poc\index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PoC 测试页</title>
</head>
<body>
<h1>MCP Apps PoC</h1>
<button onclick="callFlutter()">调用 Flutter Handler</button>
<button onclick="probeExtApps()">探测 ext-apps SDK</button>
<pre id="out"></pre>

<script src="https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps@0.1.0/dist/index.umd.js"></script>
<script>
function log(msg) {
  document.getElementById('out').textContent += JSON.stringify(msg) + '\n';
}

// 1. 验证 Flutter → JS 方向：Flutter 用 evaluateJavascript 调此函数
window.pocReceiveFromFlutter = function(payload) {
  log({ dir: 'flutter→js', payload });
  return { ok: true, echo: payload };
};

// 2. 验证 JS → Flutter 方向：网页通过 addJavaScriptHandler 调 Flutter
async function callFlutter() {
  try {
    const res = await window.flutter_inappwebview.callHandler('pocHandler', { ts: Date.now() });
    log({ dir: 'js→flutter', res });
  } catch (e) {
    log({ dir: 'js→flutter', error: String(e) });
  }
}

// 3. 探测 @modelcontextprotocol/ext-apps SDK 可用性
async function probeExtApps() {
  const probe = {
    hasModelContext: typeof document.modelContext !== 'undefined',
    hasRegisterTool: typeof document.modelContext?.registerTool === 'function',
    hasWindowMcp: typeof window.mcp !== 'undefined',
    sdkLoaded: typeof window.ModelContextProtocol !== 'undefined',
  };
  log({ dir: 'probe', probe });

  // 尝试注册一个测试工具
  if (probe.hasRegisterTool) {
    try {
      document.modelContext.registerTool('poc_test', {
        description: 'PoC test tool',
        inputSchema: { type: 'object', properties: { x: { type: 'number' } } }
      }, async (args) => {
        log({ dir: 'tool-called', args });
        return { result: args.x * 2 };
      });
      log({ dir: 'registerTool', ok: true });
    } catch (e) {
      log({ dir: 'registerTool', error: String(e) });
    }
  }
}
</script>
</body>
</html>
```

- [ ] **Step 4: 创建 PoC 最小 WebView 页面**

创建 `C:\Projects\koko-app\lib\features\miniapp\miniapp_page.dart`（PoC 版）：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter/services.dart' show rootBundle;

class MiniappPage extends StatefulWidget {
  const MiniappPage({super.key});
  @override
  State<MiniappPage> createState() => _MiniappPageState();
}

class _MiniappPageState extends State<MiniappPage> {
  InAppWebViewController? _controller;
  final _logs = <String>[];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('小程序中心 (PoC)')),
      body: Column(
        children: [
          Expanded(
            child: InAppWebView(
              initialUrlRequest: URLRequest(
                url: WebUri('http://localhost:8080/poc/index.html'),
              ),
              initialSettings: InAppWebViewSettings(
                javaScriptEnabled: true,
                allowFileAccessFromFileURLs: true,
                allowUniversalAccessFromFileURLs: true,
              ),
              onWebViewCreated: (controller) {
                _controller = controller;
                // 注册 PoC Handler：验证 JS → Flutter 方向
                controller.addJavaScriptHandler(
                  handlerName: 'pocHandler',
                  callback: (args) {
                    setState(() {
                      _logs.add('pocHandler 收到: ${args.toString()}');
                    });
                    return { 'received': true, 'echo': args };
                  },
                );
              },
              onLoadStop: (controller, url) async {
                // 验证 Flutter → JS 方向：注入身份信息
                await controller.evaluateJavascript(source: '''
                  if (window.pocReceiveFromFlutter) {
                    window.pocReceiveFromFlutter({ uid: 'poc-user-001', token: 'poc-token' });
                  }
                ''');
                setState(() => _logs.add('页面加载完成: $url'));
              },
              consoleLog: (controller, message) {
                setState(() => _logs.add('[console] ${message.message}'));
              },
            ),
          ),
          Container(
            height: 120,
            color: Colors.black12,
            child: ListView.builder(
              itemCount: _logs.length,
              itemBuilder: (_, i) => ListTile(
                dense: true,
                title: Text(_logs[i], style: const TextStyle(fontSize: 12)),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 5: 临时集成到桌面端入口**

打开 `C:\Projects\koko-app\lib\features\home\desktop_scaffold.dart`，在最简位置（如标题栏右侧或临时按钮）插入入口。先 Grep 定位：

Run:
```bash
cd C:\Projects\koko-app && grep -n "AppBar\|actions:" lib/features/home/desktop_scaffold.dart | head -20
```

在合适位置（如标题栏 actions）临时加一个按钮：

```dart
// 在 desktop_scaffold.dart 顶部 import
import '../miniapp/miniapp_page.dart';

// 在 AppBar actions 列表末尾追加
IconButton(
  icon: const Icon(Icons.apps),
  tooltip: '小程序中心 (PoC)',
  onPressed: () => Navigator.of(context).push(
    MaterialPageRoute(builder: (_) => const MiniappPage()),
  ),
),
```

（具体行号由 PoC 工程师根据 desktop_scaffold.dart 实际结构调整，目标：App 启动后能点按钮进入 PoC 页面。）

- [ ] **Step 6: 启动 InAppLocalhostServer 托管离线包**

在 `miniapp_page.dart` 顶部新增 Server 初始化逻辑。修改 `_MiniappPageState`：

```dart
class _MiniappPageState extends State<MiniappPage> {
  InAppWebViewController? _controller;
  final _logs = <String>[];
  static final _localhostServer = InAppLocalhostServer(
    port: 8080,
    directory: 'assets/miniapps',
  );

  @override
  void initState() {
    super.initState();
    _localhostServer.start();
  }

  @override
  void dispose() {
    _localhostServer.close();
    super.dispose();
  }
  // ... 余下 build 不变
}
```

> 注意：`InAppLocalhostServer` 在 flutter_inappwebview 6.x 的 `flutter_inappwebview_platform` 中。如果 import 找不到，先用：
> `import 'package:flutter_inappwebview/flutter_inappwebview.dart';` 然后查 `InAppLocalhostServer` 是否在该库的导出中。若没有，回退用 `WebUri('file:///android_asset/flutter_assets/assets/miniapps/poc/index.html')` + `allowFileAccessFromFileURLs: true`（Android 可用，桌面端需用 `file://` 绝对路径）。

- [ ] **Step 7: 运行 App 并执行 PoC 验证**

Run（Windows 桌面）:
```bash
cd C:\Projects\koko-app && flutter run -d windows
```

Run（Android）:
```bash
cd C:\Projects\koko-app && flutter run -d <emulator_or_device>
```

进入 PoC 页面后执行三个验证：

1. **Flutter → JS 验证**：页面加载完成（`onLoadStop`）应自动注入 `{ uid, token }`，网页 `<pre id="out">` 应显示 `{"dir":"flutter→js","payload":{"uid":"poc-user-001","token":"poc-token"}}`。
2. **JS → Flutter 验证**：点击网页「调用 Flutter Handler」按钮，底部日志区应显示 `pocHandler 收到: [{ts:...}]`。
3. **ext-apps SDK 验证**：点击「探测 ext-apps SDK」按钮，应显示 `{"dir":"probe","probe":{"hasModelContext":...,"hasRegisterTool":...,"sdkLoaded":...}}`。

- [ ] **Step 8: 记录 PoC 结论并决策**

创建 `c:\官网html\KOKO\docs\superpowers\plans\poc-result.md`（PoC 记录文件），写入三组验证结果截图描述与布尔判定：

```markdown
# PoC 结论（2026-10-XX）

## 验证结果
- Flutter → JS（evaluateJavascript）: ✅ / ❌
- JS → Flutter（addJavaScriptHandler）: ✅ / ❌
- @modelcontextprotocol/ext-apps SDK 加载: ✅ / ❌
- document.modelContext.registerTool 可调用: ✅ / ❌
- 注册的工具能否被外部 invoke: ✅ / ❌（需在网页内触发，看 console 输出）

## 决策
- 若全部 ✅：走 MCP Apps 标准方案（Task 4 主路径）
- 若 ext-apps SDK ❌ 但双向通信 ✅：走回退方案（Task 4 备选，window.kokoMCP 自定义接口）
- 若双向通信 ❌：停止，需重新评估容器选型（如 wakana_webview 或纯 file:// 加载）
```

- [ ] **Step 9: 提交 PoC**

```bash
cd C:\Projects\koko-app
git add pubspec.yaml lib/features/miniapp/miniapp_page.dart lib/features/home/desktop_scaffold.dart assets/miniapps/poc/index.html
git commit -m "feat(miniapp): PoC flutter_inappwebview 双向通信与 ext-apps SDK 探测"
```

```bash
cd c:\官网html\KOKO
git add docs/superpowers/plans/poc-result.md
git commit -m "docs: PoC 结论记录"
```

---

## Task 2: 离线包同步与 assets 声明

**目标：** 把 nft-generator-prototype 4 个文件复制到 App assets，作为离线包；确认 InAppLocalhostServer 能正确托管。

**Files:**
- Create: `C:\Projects\koko-app\assets\miniapps\nft-generator\api.js`
- Create: `C:\Projects\koko-app\assets\miniapps\nft-generator\mock.js`
- Create: `C:\Projects\koko-app\assets\miniapps\nft-generator\index.html`
- Create: `C:\Projects\koko-app\assets\miniapps\nft-generator\styles.css`
- 已修改: `C:\Projects\koko-app\pubspec.yaml`（Task 1 已声明 assets/miniapps/，此处不需再改）

- [ ] **Step 1: 复制 nft-generator-prototype 4 文件到 App assets**

Run（PowerShell）:
```powershell
$src = "c:\官网html\KOKO\nft-generator-prototype"
$dst = "C:\Projects\koko-app\assets\miniapps\nft-generator"
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Copy-Item "$src\api.js" "$dst\api.js" -Force
Copy-Item "$src\mock.js" "$dst\mock.js" -Force
Copy-Item "$src\index.html" "$dst\index.html" -Force
Copy-Item "$src\styles.css" "$dst\styles.css" -Force
Get-ChildItem $dst
```

Expected: 4 个文件列出。

- [ ] **Step 2: 验证 InAppLocalhostServer 能托管该目录**

在 PoC 页面（Task 1 的 `miniapp_page.dart`）基础上，临时把 `initialUrlRequest` 改为：

```dart
initialUrlRequest: URLRequest(
  url: WebUri('http://localhost:8080/nft-generator/index.html'),
),
```

Run:
```bash
cd C:\Projects\koko-app && flutter run -d windows
```

Expected: PoC 页面加载 nft-generator 完整 UI（含 5 个图层、Canvas、生成按钮）。若 404，检查 `InAppLocalhostServer` 的 `directory` 参数是否为 `'assets/miniapps'`（Task 1 Step 6 设置）。

- [ ] **Step 3: 提交**

```bash
cd C:\Projects\koko-app
git add assets/miniapps/nft-generator/
git commit -m "feat(miniapp): 同步 nft-generator 离线包到 assets"
```

> **同步约定：** 后续 nft-generator-prototype 改动（Task 4/5）后，需重新执行 Step 1 的 Copy-Item 命令把最新版本同步到 assets。建议在 Phase 1 末尾把该复制命令写进 `scripts/sync-miniapp.ps1`。

---

## Task 3: Identity Bridge — 注入 uid/token

**目标：** Flutter 侧通过 `addJavaScriptHandler` 暴露 `getIdentity()`，网页侧通过 `window.kokoIdentity.getIdentity()` 拿到当前用户身份。

**Files:**
- Create: `C:\Projects\koko-app\lib\features\miniapp\identity_bridge.dart`
- Create: `C:\Projects\koko-app\test\miniapp\identity_bridge_test.dart`
- Modify: `C:\Projects\koko-app\lib\features\miniapp\miniapp_page.dart`（接入 IdentityBridge）

- [ ] **Step 1: 写失败测试**

创建 `C:\Projects\koko-app\test\miniapp\identity_bridge_test.dart`：

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:koko_app/features/miniapp/identity_bridge.dart';

void main() {
  group('IdentityBridge', () {
    test('getIdentity returns current user info when logged in', () async {
      final bridge = IdentityBridge(
        currentUid: () => 'u17689250596',
        currentToken: () => 'test-session-token',
        currentWalletAddress: () => null,
      );
      final identity = await bridge.getIdentity();
      expect(identity.uid, 'u17689250596');
      expect(identity.token, 'test-session-token');
      expect(identity.walletAddress, isNull);
    });

    test('getIdentity returns empty identity when not logged in', () async {
      final bridge = IdentityBridge(
        currentUid: () => null,
        currentToken: () => null,
        currentWalletAddress: () => null,
      );
      final identity = await bridge.getIdentity();
      expect(identity.uid, isNull);
      expect(identity.token, isNull);
    });

    test('toJson serializes for JS injection', () {
      final identity = KokoIdentity(
        uid: 'u17689250596',
        token: 'tok',
        walletAddress: '0xabc',
      );
      final json = identity.toJson();
      expect(json['uid'], 'u17689250596');
      expect(json['token'], 'tok');
      expect(json['walletAddress'], '0xabc');
    });
  });
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd C:\Projects\koko-app && flutter test test/miniapp/identity_bridge_test.dart
```

Expected: FAIL with `Error: Library not found` 或 `IdentityBridge not defined`。

- [ ] **Step 3: 实现 IdentityBridge**

创建 `C:\Projects\koko-app\lib\features\miniapp\identity_bridge.dart`：

```dart
/// 当前用户身份数据（注入到网页小程序）
class KokoIdentity {
  final String? uid;
  final String? token;
  final String? walletAddress;

  const KokoIdentity({this.uid, this.token, this.walletAddress});

  Map<String, dynamic> toJson() => {
    'uid': uid,
    'token': token,
    'walletAddress': walletAddress,
  };
}

/// 注入身份信息给网页小程序的 Bridge。
///
/// 通过 InAppWebView.addJavaScriptHandler 暴露 `kokoIdentity` handler，
/// 网页侧用 `await window.flutter_inappwebview.callHandler('kokoIdentity')` 调用。
class IdentityBridge {
  final String? Function() currentUid;
  final String? Function() currentToken;
  final String? Function() currentWalletAddress;

  IdentityBridge({
    required this.currentUid,
    required this.currentToken,
    required this.currentWalletAddress,
  });

  Future<KokoIdentity> getIdentity() async {
    return KokoIdentity(
      uid: currentUid(),
      token: currentToken(),
      walletAddress: currentWalletAddress(),
    );
  }

  /// 注册到 InAppWebViewController
  void register(InAppWebViewController controller) {
    controller.addJavaScriptHandler(
      handlerName: 'kokoIdentity',
      callback: (args) async {
        final identity = await getIdentity();
        return identity.toJson();
      },
    );
  }
}
```

并在文件顶部加 import：
```dart
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
cd C:\Projects\koko-app && flutter test test/miniapp/identity_bridge_test.dart
```

Expected: `All tests passed!`

- [ ] **Step 5: 接入到 MiniappPage**

修改 `C:\Projects\koko-app\lib\features\miniapp\miniapp_page.dart`，在 `onWebViewCreated` 内注册 IdentityBridge（替换 PoC 版的 pocHandler）：

```dart
// 顶部 import 追加
import 'identity_bridge.dart';
// 假设当前用户身份从某个全局 provider 拿（这里先用桩，Phase 1 末再接真实 provider）
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

class _MiniappPageState extends State<MiniappPage> {
  InAppWebViewController? _controller;
  final _logs = <String>[];
  static final _localhostServer = InAppLocalhostServer(
    port: 8080,
    directory: 'assets/miniapps',
  );
  late final IdentityBridge _identityBridge;

  @override
  void initState() {
    super.initState();
    _localhostServer.start();
    const storage = FlutterSecureStorage();
    _identityBridge = IdentityBridge(
      currentUid: () => _cachedUid,
      currentToken: () => _cachedToken,
      currentWalletAddress: () => null,
    );
    _loadIdentity();
  }

  String? _cachedUid;
  String? _cachedToken;

  Future<void> _loadIdentity() async {
    const storage = FlutterSecureStorage();
    _cachedUid = await storage.read(key: 'uid');
    _cachedToken = await storage.read(key: 'session_token');
  }

  @override
  void dispose() {
    _localhostServer.close();
    super.dispose();
  }

  // onWebViewCreated 内注册：
  // _identityBridge.register(controller);
}
```

在 `onWebViewCreated` 回调末尾追加：
```dart
_identityBridge.register(controller);
```

- [ ] **Step 6: 网页侧调用 Identity Bridge 验证**

在 nft-generator-prototype 的 `index.html`（源目录 `c:\官网html\KOKO\nft-generator-prototype\index.html`，需同步到 assets）的 `<body>` 末尾临时加一个测试按钮：

```html
<button onclick="testIdentity()" style="position:fixed;top:10px;right:10px;z-index:9999;">测身份</button>
<script>
async function testIdentity() {
  try {
    const id = await window.flutter_inappwebview.callHandler('kokoIdentity');
    alert(JSON.stringify(id));
  } catch (e) { alert('身份获取失败: ' + e); }
}
</script>
```

同步到 assets:
```powershell
Copy-Item "c:\官网html\KOKO\nft-generator-prototype\index.html" "C:\Projects\koko-app\assets\miniapps\nft-generator\index.html" -Force
```

Run:
```bash
cd C:\Projects\koko-app && flutter run -d windows
```

登录后进入小程序页面，点「测身份」按钮，应弹出 `{uid: '...', token: '...'}`。

- [ ] **Step 7: 提交**

```bash
cd C:\Projects\koko-app
git add lib/features/miniapp/identity_bridge.dart test/miniapp/identity_bridge_test.dart lib/features/miniapp/miniapp_page.dart
git commit -m "feat(miniapp): Identity Bridge 注入 uid/token"
```

```bash
cd c:\官网html\KOKO
git add nft-generator-prototype/index.html
git commit -m "feat(nft-gen): 添加 Identity Bridge 测试按钮"
```

---

## Task 4: nft-generator-prototype MCP 工具声明（网页侧）

**目标：** 把 api.js 的 6 个桩函数声明为 MCP 工具，供外部 Agent 调用。路径选择取决于 Task 1 PoC 结论。

**Files:**
- Create: `c:\官网html\KOKO\nft-generator-prototype\mcp-bridge.js`
- Create: `c:\官网html\KOKO\nft-generator-prototype\manifest.json`
- Modify: `c:\官网html\KOKO\nft-generator-prototype\index.html`

### 主路径（PoC 全部 ✅ 时）：用 `@modelcontextprotocol/ext-apps` SDK

- [ ] **Step 1A: 创建 manifest.json**

创建 `c:\官网html\KOKO\nft-generator-prototype\manifest.json`：

```json
{
  "name": "nft-generator",
  "version": "0.1.0",
  "description": "连接精灵链 NFT 生成器：图层配置、稀有度权重、批量生成 PNG/GIF",
  "tools": [
    { "name": "fetch_layers", "description": "获取图层与配件配置" },
    { "name": "update_weight", "description": "更新某图层某配件的稀有度权重" },
    { "name": "generate_preview", "description": "随机生成一个预览组合" },
    { "name": "generate_batch", "description": "批量生成 NFT 系列（含进度回调）" },
    { "name": "download_nft", "description": "下载单个 NFT" },
    { "name": "download_batch", "description": "批量下载 NFT" }
  ]
}
```

- [ ] **Step 2A: 创建 mcp-bridge.js（标准方案）**

创建 `c:\官网html\KOKO\nft-generator-prototype\mcp-bridge.js`：

```javascript
/* ===== mcp-bridge.js · MCP 工具声明层 =====
 * 用 @modelcontextprotocol/ext-apps SDK 把 api.js 的 6 个函数暴露为 MCP 工具。
 * 外部 Agent 通过 document.modelContext 调用这些工具。
 */
(function () {
  'use strict';

  function registerMcpTools() {
    const mc = document.modelContext;
    if (!mc || typeof mc.registerTool !== 'function') {
      console.error('[mcp-bridge] document.modelContext 不可用，回退 window.kokoMCP');
      registerFallback();
      return;
    }

    // 1. fetch_layers
    mc.registerTool('fetch_layers', {
      description: '获取图层与配件配置',
      inputSchema: { type: 'object', properties: {}, required: [] }
    }, async () => {
      const layers = await fetchLayers();
      return { layers };
    });

    // 2. update_weight
    mc.registerTool('update_weight', {
      description: '更新某图层某配件的稀有度权重',
      inputSchema: {
        type: 'object',
        properties: {
          layerId: { type: 'string' },
          traitId: { type: 'string' },
          weight: { type: 'number', minimum: 0, maximum: 100 }
        },
        required: ['layerId', 'traitId', 'weight']
      }
    }, async (args) => {
      const { layerId, traitId, weight } = args;
      const res = await updateWeight(layerId, traitId, weight);
      return { ok: res.ok, layerId, traitId, weight };
    });

    // 3. generate_preview
    mc.registerTool('generate_preview', {
      description: '随机生成一个预览组合',
      inputSchema: {
        type: 'object',
        properties: {
          layers: { type: 'array', description: '可选，指定图层配置；不传则用当前配置' }
        }
      }
    }, async (args) => {
      const layers = args?.layers || await fetchLayers();
      const combo = await generatePreview(layers);
      return { combo };
    });

    // 4. generate_batch
    mc.registerTool('generate_batch', {
      description: '批量生成 NFT 系列',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', minimum: 1, maximum: 100000 },
          format: { type: 'string', enum: ['2d', 'gif'] },
          layers: { type: 'array' }
        },
        required: ['count', 'format']
      }
    }, async (args) => {
      const { count, format, layers: layerArg } = args;
      const layers = layerArg || await fetchLayers();
      const res = await generateBatch(count, format, layers);
      return { results: res.results, format: res.format };
    });

    // 5. download_nft
    mc.registerTool('download_nft', {
      description: '下载单个 NFT',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'number' },
          format: { type: 'string', enum: ['png', 'gif'] }
        },
        required: ['id', 'format']
      }
    }, async (args) => {
      const res = await downloadNft(args.id, args.format);
      return res;
    });

    // 6. download_batch
    mc.registerTool('download_batch', {
      description: '批量下载 NFT',
      inputSchema: {
        type: 'object',
        properties: {
          ids: { type: 'array', items: { type: 'number' } },
          format: { type: 'string', enum: ['png', 'gif'] }
        },
        required: ['ids', 'format']
      }
    }, async (args) => {
      const res = await downloadBatch(args.ids, args.format);
      return res;
    });

    console.log('[mcp-bridge] 6 个 MCP 工具已注册 (标准方案)');
  }

  // 回退方案：window.kokoMCP 自定义接口（不依赖 ext-apps SDK）
  function registerFallback() {
    window.kokoMCP = {
      listTools: async () => ([
        { name: 'fetch_layers', description: '获取图层与配件配置', inputSchema: { type: 'object', properties: {} } },
        { name: 'update_weight', description: '更新稀有度权重', inputSchema: { type: 'object', properties: { layerId: { type: 'string' }, traitId: { type: 'string' }, weight: { type: 'number' } }, required: ['layerId', 'traitId', 'weight'] } },
        { name: 'generate_preview', description: '随机生成预览组合', inputSchema: { type: 'object', properties: { layers: { type: 'array' } } } },
        { name: 'generate_batch', description: '批量生成 NFT 系列', inputSchema: { type: 'object', properties: { count: { type: 'number' }, format: { type: 'string' }, layers: { type: 'array' } }, required: ['count', 'format'] } },
        { name: 'download_nft', description: '下载单个 NFT', inputSchema: { type: 'object', properties: { id: { type: 'number' }, format: { type: 'string' } }, required: ['id', 'format'] } },
        { name: 'download_batch', description: '批量下载 NFT', inputSchema: { type: 'object', properties: { ids: { type: 'array' }, format: { type: 'string' } }, required: ['ids', 'format'] } },
      ]),
      callTool: async (name, args) => {
        switch (name) {
          case 'fetch_layers': return { layers: await fetchLayers() };
          case 'update_weight': {
            const r = await updateWeight(args.layerId, args.traitId, args.weight);
            return { ok: r.ok, layerId: args.layerId, traitId: args.traitId, weight: args.weight };
          }
          case 'generate_preview': {
            const layers = args?.layers || await fetchLayers();
            return { combo: await generatePreview(layers) };
          }
          case 'generate_batch': {
            const layers = args?.layers || await fetchLayers();
            const r = await generateBatch(args.count, args.format, layers);
            return { results: r.results, format: r.format };
          }
          case 'download_nft': return await downloadNft(args.id, args.format);
          case 'download_batch': return await downloadBatch(args.ids, args.format);
          default: throw new Error(`未知工具: ${name}`);
        }
      }
    };
    console.log('[mcp-bridge] 6 个 MCP 工具已注册 (回退方案 window.kokoMCP)');
  }

  // 等 DOM + api.js 就绪后注册
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerMcpTools);
  } else {
    registerMcpTools();
  }
})();
```

- [ ] **Step 3A: 修改 index.html 注入 SDK 与 mcp-bridge.js**

打开 `c:\官网html\KOKO\nft-generator-prototype\index.html`，在 `</body>` 之前追加（保持现有 `<script src="api.js"></script>` 等不变）：

```html
<!-- MCP Apps SDK + Bridge -->
<script src="https://cdn.jsdelivr.net/npm/@modelcontextprotocol/ext-apps@0.1.0/dist/index.umd.js"></script>
<script src="mcp-bridge.js"></script>
```

> 若 index.html 原本没有显式 `<script src="api.js">` 引用（如通过其他方式加载），先 Grep 确认：
> ```bash
> grep -n "api.js\|mock.js" "c:\官网html\KOKO\nft-generator-prototype\index.html"
> ```
> 确保 api.js 在 mcp-bridge.js 之前加载（mcp-bridge.js 依赖 fetchLayers 等全局函数）。

- [ ] **Step 4A: 同步到 assets 并测试**

Run（PowerShell）:
```powershell
$src = "c:\官网html\KOKO\nft-generator-prototype"
$dst = "C:\Projects\koko-app\assets\miniapps\nft-generator"
Copy-Item "$src\mcp-bridge.js" "$dst\mcp-bridge.js" -Force
Copy-Item "$src\manifest.json" "$dst\manifest.json" -Force
Copy-Item "$src\index.html" "$dst\index.html" -Force
```

Run:
```bash
cd C:\Projects\koko-app && flutter run -d windows
```

进入小程序页面，打开 WebView 的 console（通过 PoC 页面 _logs 区或 Chrome DevTools 远程调试），应看到 `[mcp-bridge] 6 个 MCP 工具已注册 (标准方案)` 或 `(回退方案 window.kokoMCP)`。

- [ ] **Step 5A: 提交**

```bash
cd c:\官网html\KOKO
git add nft-generator-prototype/mcp-bridge.js nft-generator-prototype/manifest.json nft-generator-prototype/index.html
git commit -m "feat(nft-gen): 注入 MCP ext-apps SDK 与 mcp-bridge.js 声明 6 个工具"
```

```bash
cd C:\Projects\koko-app
git add assets/miniapps/nft-generator/
git commit -m "feat(miniapp): 同步 nft-generator MCP 工具声明到离线包"
```

### 备选路径（PoC 中 ext-apps SDK ❌ 时）

如果 Task 1 PoC 结论是 `@modelcontextprotocol/ext-apps` SDK 不可用，则：

- 跳过 Step 1A-3A 的 SDK 注入（不引用 ext-apps UMD）
- 直接执行 Step 2A 的 `registerFallback()` 分支（mcp-bridge.js 内已包含回退逻辑，会自动检测并切换）
- 网页侧工具通过 `window.kokoMCP` 暴露，Flutter 侧通过 `addJavaScriptHandler('kokoMCP_*')` 调用（见 Task 6 备选步骤）

mcp-bridge.js 已内建自动回退（`document.modelContext` 不存在时调 `registerFallback()`），所以无论 PoC 结论如何，mcp-bridge.js 文件内容不变，只需决定 index.html 是否引用 ext-apps SDK。

---

## Task 5: api.js 返回值适配 MCP 工具响应

**目标：** 让 api.js 的 6 个函数返回值结构化、可序列化为 MCP 工具响应。保持函数签名不变（mcp-bridge.js 已依赖原签名）。

**Files:**
- Modify: `c:\官网html\KOKO\nft-generator-prototype\api.js`

- [ ] **Step 1: 修改 api.js，给 6 个函数返回值加结构化字段**

打开 `c:\官网html\KOKO\nft-generator-prototype\api.js`，用以下内容替换（保持函数签名与 mock.js 依赖不变，仅给返回值加结构化字段）：

```javascript
/* ===== api.js · API Stubs (未来对接后端时的替换点) =====
 * Phase 1：返回值结构化为 MCP 工具响应格式。
 * 后续对接 linksprite-backend 时，仅替换函数体内的网络调用部分。
 */

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * 获取图层配置
 * TODO: replace with GET /api/wallet/layers
 */
async function fetchLayers() {
  await delay(200);
  return JSON.parse(JSON.stringify(MOCK_LAYERS));
}

/**
 * 更新稀有度权重
 * TODO: replace with PATCH /api/wallet/layers/{layerId}/traits/{traitId} — body: { weight }
 */
async function updateWeight(layerId, traitId, weight) {
  await delay(100);
  return { ok: true, layerId, traitId, weight, updatedAt: Date.now() };
}

/**
 * 生成预览（随机组合）
 * TODO: replace with POST /api/nft/preview — body: { layers }
 */
async function generatePreview(layers) {
  await delay(300);
  const combo = randomCombination(layers);
  const rarity = calcRarity(combo);
  return { combo, rarity };
}

/**
 * 批量生成
 * TODO: replace with POST /api/nft/generate — body: { count, format, layers, weights }
 * onProgress 回调模拟进度
 */
async function generateBatch(count, format, layers, onProgress) {
  const total = count;
  const results = [];
  const batchSize = Math.max(1, Math.ceil(count / 20)); // 20 批
  for (let i = 0; i < 20; i++) {
    await delay(120 + Math.random() * 80);
    const batch = generateResults(Math.min(batchSize, total - results.length), layers);
    results.push(...batch);
    if (onProgress) onProgress(results.length / total, results.length, total);
    if (results.length >= total) break;
  }
  return { results, format, count: results.length, generatedAt: Date.now() };
}

/**
 * 下载单个 NFT
 * TODO: replace with GET /api/nft/{id}/download?format=png|gif
 */
async function downloadNft(id, format) {
  await delay(200);
  return { ok: true, id, format, url: `#download-${id}-${format}`, expiresAt: Date.now() + 3600000 };
}

/**
 * 批量下载
 * TODO: replace with POST /api/nft/download-batch — body: { ids, format }
 */
async function downloadBatch(ids, format) {
  await delay(500);
  return { ok: true, ids, format, url: '#batch-download', count: ids.length, expiresAt: Date.now() + 3600000 };
}
```

变更点：
- `updateWeight` 返回值加 `layerId/traitId/weight/updatedAt`
- `generatePreview` 返回值加 `rarity`（来自 mock.js 的 `calcRarity`）
- `generateBatch` 返回值加 `count/generatedAt`
- `downloadNft` 返回值加 `id/format/expiresAt`
- `downloadBatch` 返回值加 `ids/count/expiresAt`

- [ ] **Step 2: 同步到 assets**

Run:
```powershell
Copy-Item "c:\官网html\KOKO\nft-generator-prototype\api.js" "C:\Projects\koko-app\assets\miniapps\nft-generator\api.js" -Force
```

- [ ] **Step 3: 浏览器手动验证（快速）**

在浏览器打开 `c:\官网html\KOKO\nft-generator-prototype\index.html`，按 F12 控制台执行：

```javascript
fetchLayers().then(l => console.log('fetchLayers:', l.length, 'layers'));
updateWeight('body', 'bd1', 50).then(console.log);
generatePreview(MOCK_LAYERS).then(r => console.log('combo:', r.combo.length, 'rarity:', r.rarity.tier));
generateBatch(5, '2d', MOCK_LAYERS).then(r => console.log('batch:', r.count, 'format:', r.format));
downloadNft(1, 'png').then(console.log);
downloadBatch([1,2,3], 'png').then(console.log);
```

Expected: 6 个调用均返回带新字段的对象，无报错。

- [ ] **Step 4: 提交**

```bash
cd c:\官网html\KOKO
git add nft-generator-prototype/api.js
git commit -m "refactor(nft-gen): api.js 6 个函数返回值适配 MCP 工具响应格式"
```

```bash
cd C:\Projects\koko-app
git add assets/miniapps/nft-generator/api.js
git commit -m "chore(miniapp): 同步 api.js 结构化返回值到离线包"
```

---

## Task 6: MCP-over-addJavaScriptHandler Bridge（Flutter 侧）

**目标：** Flutter 侧实现 JSON-RPC 2.0 Bridge，让外部（如同一 App 内其他网页 / 外部 Agent）能列出并调用网页小程序的 MCP 工具。Phase 1 范围内只做「App 内网页工具被 Flutter 调用」单向链路（外部 Agent 经 MCP Server 暴露是 Phase 2）。

**Files:**
- Create: `C:\Projects\koko-app\lib\features\miniapp\mcp_bridge.dart`
- Create: `C:\Projects\koko-app\test\miniapp\mcp_bridge_test.dart`
- Modify: `C:\Projects\koko-app\lib\features\miniapp\miniapp_page.dart`

- [ ] **Step 1: 写失败测试**

创建 `C:\Projects\koko-app\test\miniapp\mcp_bridge_test.dart`：

```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:koko_app/features/miniapp/mcp_bridge.dart';

void main() {
  group('McpBridge', () {
    test('listTools returns JSON-RPC response with tools array', () async {
      // 模拟网页侧 window.kokoMCP.listTools 返回的工具列表
      final bridge = McpBridge(
        jsInvoker: (source) async {
          // 模拟 evaluateJavascript 的返回（JSON 字符串）
          return '[{"name":"fetch_layers","description":"获取图层"}]';
        },
      );
      final resp = await bridge.handleRequest({
        'jsonrpc': '2.0',
        'id': 1,
        'method': 'tools/list',
      });
      expect(resp['jsonrpc'], '2.0');
      expect(resp['id'], 1);
      expect(resp['result'], isA<Map>());
      expect(resp['result']['tools'], isA<List>());
      expect((resp['result']['tools'] as List).first['name'], 'fetch_layers');
    });

    test('callTool dispatches to jsInvoker with tool name', () async {
      final bridge = McpBridge(
        jsInvoker: (source) async {
          // 简单断言 source 含 callTool('fetch_layers')
          expect(source, contains('fetch_layers'));
          return '{"layers":[]}';
        },
      );
      final resp = await bridge.handleRequest({
        'jsonrpc': '2.0',
        'id': 2,
        'method': 'tools/call',
        'params': {'name': 'fetch_layers', 'arguments': {}},
      });
      expect(resp['id'], 2);
      expect(resp['result'], isA<Map>());
    });

    test('unknown method returns error', () async {
      final bridge = McpBridge(jsInvoker: (_) async => null);
      final resp = await bridge.handleRequest({
        'jsonrpc': '2.0',
        'id': 3,
        'method': 'resources/list',
      });
      expect(resp['error']['code'], -32601);
      expect(resp['error']['message'], contains('Method not found'));
    });

    test('malformed request returns parse error', () async {
      final bridge = McpBridge(jsInvoker: (_) async => null);
      final resp = await bridge.handleRequest({'id': 4});
      expect(resp['error']['code'], -32600);
    });
  });
}
```

- [ ] **Step 2: 运行测试确认失败**

Run:
```bash
cd C:\Projects\koko-app && flutter test test/miniapp/mcp_bridge_test.dart
```

Expected: FAIL with `McpBridge not defined`。

- [ ] **Step 3: 实现 McpBridge**

创建 `C:\Projects\koko-app\lib\features\miniapp\mcp_bridge.dart`：

```dart
import 'dart:convert';

/// JSON-RPC 2.0 over addJavaScriptHandler 的 MCP Bridge。
///
/// Flutter 侧通过 evaluateJavascript 调用网页内的 `window.kokoMCP` 接口，
/// 把 MCP 请求（tools/list, tools/call）路由到网页小程序。
///
/// 协议：
/// - Flutter → JS: evaluateJavascript("await window.kokoMCP.listTools()")
/// - Flutter → JS: evaluateJavascript("await window.kokoMCP.callTool('name', args)")
/// - 返回值：JSON 字符串，由 Bridge 解析为 Dart Map
typedef JsInvoker = Future<String?> Function(String source);

class McpBridge {
  final JsInvoker jsInvoker;
  McpBridge({required this.jsInvoker});

  /// 处理一个 JSON-RPC 2.0 请求，返回 JSON-RPC 2.0 响应。
  Future<Map<String, dynamic>> handleRequest(Map<String, dynamic> req) async {
    final id = req['id'];
    if (req['jsonrpc'] != '2.0' || req['method'] == null) {
      return _error(id, -32600, 'Invalid Request');
    }
    final method = req['method'] as String;
    final params = req['params'] as Map<String, dynamic>? ?? {};

    try {
      switch (method) {
        case 'tools/list':
          final jsResult = await jsInvoker(
            '(async () => { try { const t = await window.kokoMCP.listTools(); return JSON.stringify(t); } catch(e) { return JSON.stringify({error:String(e)}); } })()',
          );
          final tools = _parseJsResult(jsResult);
          if (tools is Map && tools['error'] != null) {
            return _error(id, -32603, 'Internal error: ${tools['error']}');
          }
          return {
            'jsonrpc': '2.0',
            'id': id,
            'result': {'tools': tools is List ? tools : []},
          };

        case 'tools/call':
          final toolName = params['name'] as String?;
          final args = params['arguments'] as Map<String, dynamic>? ?? {};
          if (toolName == null) {
            return _error(id, -32602, 'Missing params.name');
          }
          final jsResult = await jsInvoker(
            '(async () => { try { const r = await window.kokoMCP.callTool(${jsonEncode(toolName)}, ${jsonEncode(args)}); return JSON.stringify(r); } catch(e) { return JSON.stringify({error:String(e)}); } })()',
          );
          final result = _parseJsResult(jsResult);
          if (result is Map && result['error'] != null) {
            return _error(id, -32603, 'Tool error: ${result['error']}');
          }
          return {
            'jsonrpc': '2.0',
            'id': id,
            'result': {'content': result},
          };

        default:
          return _error(id, -32601, 'Method not found: $method');
      }
    } catch (e) {
      return _error(id, -32603, 'Internal error: $e');
    }
  }

  dynamic _parseJsResult(String? jsResult) {
    if (jsResult == null || jsResult.isEmpty) return null;
    try {
      return jsonDecode(jsResult);
    } catch (_) {
      return jsResult;
    }
  }

  Map<String, dynamic> _error(dynamic id, int code, String message) => {
    'jsonrpc': '2.0',
    'id': id,
    'error': {'code': code, 'message': message},
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run:
```bash
cd C:\Projects\koko-app && flutter test test/miniapp/mcp_bridge_test.dart
```

Expected: `All tests passed!`

- [ ] **Step 5: 接入 MiniappPage（注册 kokoMCP handler）**

修改 `C:\Projects\koko-app\lib\features\miniapp\miniapp_page.dart`，在 `onWebViewCreated` 内追加 McpBridge 注册：

```dart
// 顶部 import 追加
import 'mcp_bridge.dart';

// _MiniappPageState 内追加字段
late final McpBridge _mcpBridge;

// initState 内追加
_mcpBridge = McpBridge(
  jsInvoker: (source) async {
    if (_controller == null) return null;
    final res = await _controller!.evaluateJavascript(source: source);
    return res?.toString();
  },
);

// onWebViewCreated 内（_identityBridge.register 之后）追加
controller.addJavaScriptHandler(
  handlerName: 'kokoMCP',
  callback: (args) async {
    // args[0] 是 JSON-RPC 请求 Map
    if (args.isEmpty || args[0] is! Map) {
      return {'jsonrpc': '2.0', 'id': null, 'error': {'code': -32600, 'message': 'Invalid Request'}};
    }
    final resp = await _mcpBridge.handleRequest(Map<String, dynamic>.from(args[0] as Map));
    return resp;
  },
);
```

- [ ] **Step 6: 提交**

```bash
cd C:\Projects\koko-app
git add lib/features/miniapp/mcp_bridge.dart test/miniapp/mcp_bridge_test.dart lib/features/miniapp/miniapp_page.dart
git commit -m "feat(miniapp): MCP-over-addJavaScriptHandler Bridge (tools/list + tools/call)"
```

---

## Task 7: MiniappPage 小程序中心 Tab 与桌面端集成

**目标：** 把 MiniappPage 改造为正式的小程序中心 Tab（卡片列表 + WebView），并集成到 desktop_scaffold。

**Files:**
- Modify: `C:\Projects\koko-app\lib\features\miniapp\miniapp_page.dart`（卡片列表 + WebView 切换）
- Create: `C:\Projects\koko-app\lib\features\miniapp\miniapp_registry.dart`
- Modify: `C:\Projects\koko-app\lib\features\home\desktop_scaffold.dart`

- [ ] **Step 1: 创建 miniapp_registry.dart**

创建 `C:\Projects\koko-app\lib\features\miniapp\miniapp_registry.dart`：

```dart
/// 已上架的小程序清单（Phase 1 仅 1 个，后续从远端拉取）
class MiniappEntry {
  final String id;
  final String name;
  final String description;
  final String icon;
  final String localPath; // 相对 assets/miniapps/ 的路径

  const MiniappEntry({
    required this.id,
    required this.name,
    required this.description,
    required this.icon,
    required this.localPath,
  });

  String get url => 'http://localhost:8080/$localPath';
}

class MiniappRegistry {
  static const List<MiniappEntry> entries = [
    MiniappEntry(
      id: 'nft-generator',
      name: 'NFT 生成器',
      description: '连接精灵链 · 图层配置 / 稀有度权重 / 批量生成 PNG/GIF',
      icon: '🎨',
      localPath: 'nft-generator/index.html',
    ),
  ];
}
```

- [ ] **Step 2: 重写 miniapp_page.dart 为正式版**

打开 `C:\Projects\koko-app\lib\features\miniapp\miniapp_page.dart`，整体替换为正式版（保留 PoC 的 _localhostServer / IdentityBridge / McpBridge 接入）：

```dart
import 'package:flutter/material.dart';
import 'package:flutter_inappwebview/flutter_inappwebview.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'identity_bridge.dart';
import 'mcp_bridge.dart';
import 'miniapp_registry.dart';

class MiniappPage extends StatefulWidget {
  final MiniappEntry? initialEntry;
  const MiniappPage({super.key, this.initialEntry});

  @override
  State<MiniappPage> createState() => _MiniappPageState();
}

class _MiniappPageState extends State<MiniappPage> {
  InAppWebViewController? _controller;
  MiniappEntry? _active;
  final _logs = <String>[];
  static final _localhostServer = InAppLocalhostServer(
    port: 8080,
    directory: 'assets/miniapps',
  );
  late final IdentityBridge _identityBridge;
  late final McpBridge _mcpBridge;
  String? _cachedUid;
  String? _cachedToken;

  @override
  void initState() {
    super.initState();
    _localhostServer.start();
    _active = widget.initialEntry;
    _identityBridge = IdentityBridge(
      currentUid: () => _cachedUid,
      currentToken: () => _cachedToken,
      currentWalletAddress: () => null,
    );
    _mcpBridge = McpBridge(
      jsInvoker: (source) async {
        if (_controller == null) return null;
        final res = await _controller!.evaluateJavascript(source: source);
        return res?.toString();
      },
    );
    _loadIdentity();
  }

  Future<void> _loadIdentity() async {
    const storage = FlutterSecureStorage();
    _cachedUid = await storage.read(key: 'uid');
    _cachedToken = await storage.read(key: 'session_token');
  }

  @override
  void dispose() {
    _localhostServer.close();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_active == null) return _buildGrid();
    return _buildWebView(_active!);
  }

  Widget _buildGrid() {
    return Scaffold(
      appBar: AppBar(title: const Text('小程序中心')),
      body: GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
          maxCrossAxisExtent: 200,
          childAspectRatio: 1,
          crossAxisSpacing: 12,
          mainAxisSpacing: 12,
        ),
        itemCount: MiniappRegistry.entries.length,
        itemBuilder: (_, i) {
          final e = MiniappRegistry.entries[i];
          return Card(
            child: InkWell(
              onTap: () => setState(() => _active = e),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(e.icon, style: const TextStyle(fontSize: 36)),
                  const SizedBox(height: 8),
                  Text(e.name, style: Theme.of(context).textTheme.titleSmall),
                  const SizedBox(height: 4),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    child: Text(
                      e.description,
                      style: Theme.of(context).textTheme.bodySmall,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                    ),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildWebView(MiniappEntry entry) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => setState(() => _active = null),
        ),
        title: Text(entry.name),
      ),
      body: Column(
        children: [
          Expanded(
            child: InAppWebView(
              initialUrlRequest: URLRequest(url: WebUri(entry.url)),
              initialSettings: InAppWebViewSettings(
                javaScriptEnabled: true,
                allowFileAccessFromFileURLs: true,
                allowUniversalAccessFromFileURLs: true,
              ),
              onWebViewCreated: (controller) {
                _controller = controller;
                _identityBridge.register(controller);
                controller.addJavaScriptHandler(
                  handlerName: 'kokoMCP',
                  callback: (args) async {
                    if (args.isEmpty || args[0] is! Map) {
                      return {'jsonrpc': '2.0', 'id': null, 'error': {'code': -32600, 'message': 'Invalid Request'}};
                    }
                    return await _mcpBridge.handleRequest(Map<String, dynamic>.from(args[0] as Map));
                  },
                );
              },
              consoleLog: (controller, message) {
                setState(() => _logs.add('[console] ${message.message}'));
              },
            ),
          ),
          if (_logs.isNotEmpty)
            Container(
              height: 80,
              color: Colors.black87,
              child: ListView.builder(
                itemCount: _logs.length,
                itemBuilder: (_, i) => ListTile(
                  dense: true,
                  title: Text(_logs[i], style: const TextStyle(fontSize: 11, color: Colors.white70)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
```

- [ ] **Step 3: 集成到 desktop_scaffold.dart**

Grep 定位 desktop_scaffold.dart 的 Tab/侧栏结构：

Run:
```bash
cd C:\Projects\koko-app && grep -n "NavigationBar\|TabBar\|DesktopScaffold\|_selectedIndex\|NavigationRail" lib/features/home/desktop_scaffold.dart | head -30
```

在侧栏（NavigationRail 或类似）末尾追加一个 Tab 项（图标 `Icons.apps`，label 「小程序」），选中时 body 渲染 `MiniappPage()`。具体行号由工程师根据 desktop_scaffold.dart 实际结构调整。

参考改动模式：

```dart
// 顶部 import
import '../miniapp/miniapp_page.dart';

// 在侧栏 destinations 列表末尾追加
// (假设原有 4 个 Tab：空间/私信/联系人/我的)
const NavigationRailDestination(
  icon: Icon(Icons.apps_outlined),
  selectedIcon: Icon(Icons.apps),
  label: Text('小程序'),
),

// 在 body 的 IndexedStack / 切换逻辑中追加 case
case 4: return const MiniappPage();
```

- [ ] **Step 4: 手动验证**

Run:
```bash
cd C:\Projects\koko-app && flutter run -d windows
```

Expected:
1. App 启动后侧栏多一个「小程序」Tab
2. 点击进入 → 看到卡片列表（1 个卡片：NFT 生成器）
3. 点卡片 → WebView 加载 nft-generator 完整 UI
4. WebView 底部 console 区显示 `[mcp-bridge] 6 个 MCP 工具已注册`

- [ ] **Step 5: 提交**

```bash
cd C:\Projects\koko-app
git add lib/features/miniapp/miniapp_registry.dart lib/features/miniapp/miniapp_page.dart lib/features/home/desktop_scaffold.dart
git commit -m "feat(miniapp): 小程序中心 Tab 与桌面端侧栏集成"
```

---

## Task 8: 端到端验收测试

**目标：** 验证 Phase 1 三个成功标准全部达成，并写一个 E2E 测试脚本固化。

**Files:**
- Create: `C:\Projects\koko-app\test\miniapp\e2e_test.dart`
- Create: `c:\官网html\KOKO\scripts\sync-miniapp.ps1`（离线包同步脚本）

- [ ] **Step 1: 写同步脚本**

创建 `c:\官网html\KOKO\scripts\sync-miniapp.ps1`：

```powershell
# 把 nft-generator-prototype 同步到 koko-app 的 assets 离线包目录
# 用法: pwsh sync-miniapp.ps1
$ErrorActionPreference = 'Stop'
$src = "c:\官网html\KOKO\nft-generator-prototype"
$dst = "C:\Projects\koko-app\assets\miniapps\nft-generator"
if (-not (Test-Path $src)) { throw "源目录不存在: $src" }
New-Item -ItemType Directory -Force -Path $dst | Out-Null
Get-ChildItem $src -File | ForEach-Object {
    Copy-Item $_.FullName "$dst\$($_.Name)" -Force
    Write-Host "synced: $($_.Name)"
}
Write-Host "完成。共 $((Get-ChildItem $dst -File).Count) 个文件。"
```

Run:
```powershell
pwsh "c:\官网html\KOKO\scripts\sync-miniapp.ps1"
```

Expected: 列出 6 个文件（api.js / mock.js / index.html / styles.css / mcp-bridge.js / manifest.json）。

- [ ] **Step 2: 写 E2E 测试（集成测试，需 WebView）**

创建 `C:\Projects\koko-app\test\miniapp\e2e_test.dart`：

```dart
// 集成测试：需在真机/模拟器/桌面端运行，验证端到端链路。
// 由于 InAppWebView 在 widget test 环境不可用，本测试需手动执行：
// flutter test integration_test/miniapp_e2e_test.dart -d windows
//
// Phase 1 E2E 验收清单（人工执行）：
// 1. App 启动后进入「小程序」Tab
// 2. 点击「NFT 生成器」卡片，WebView 加载网页
// 3. 网页 console 显示「[mcp-bridge] 6 个 MCP 工具已注册」
// 4. 点网页内「测身份」按钮，alert 显示 {uid, token} 非空
// 5. 在 Flutter 控制台执行（通过 DevTools 或 console handler）调用 tools/list，
//    返回 6 个工具名
// 6. 调用 tools/call fetch_layers，返回 layers 数组（5 个图层）

import 'package:test/test.dart';

void main() {
  test('Phase 1 E2E 验收清单 - 人工执行', () {
    // 占位测试：仅提醒执行清单
    print('''
Phase 1 E2E 验收清单（人工执行）：
  [ ] 1. App 内能加载 nft-generator 网页（WebView 显示完整 UI）
  [ ] 2. 网页能通过 Identity Bridge 拿到当前用户身份（alert 显示 uid/token）
  [ ] 3. api.js 中的 MCP 工具能被调用并返回结果（tools/list 返回 6 个，tools/call fetch_layers 返回图层）
''');
    expect(true, isTrue);  // 占位，实际验收靠人工
  });
}
```

- [ ] **Step 3: 执行 E2E 验收**

Run:
```bash
cd C:\Projects\koko-app && flutter run -d windows
```

登录（账号 `帅` / 密码...或测试账号 19900000000 / 888888），进入「小程序」Tab，按 E2E 清单逐项验证：

1. **加载验证**：点 NFT 生成器卡片 → 网页 UI 完整显示（5 个图层、Canvas、生成按钮）
2. **身份验证**：点网页「测身份」按钮 → alert 含 `uid` 与 `token` 非空
3. **MCP 工具验证**：在 DevTools 或 WebView console 执行：

```javascript
// 验证工具列表
const tools = await window.kokoMCP.listTools();
console.log('tools count:', tools.length); // 期望 6
console.log('tool names:', tools.map(t => t.name).join(', '));
// 期望: fetch_layers, update_weight, generate_preview, generate_batch, download_nft, download_batch

// 验证工具调用
const r = await window.kokoMCP.callTool('fetch_layers', {});
console.log('layers count:', r.layers.length); // 期望 5
console.log('first layer:', r.layers[0].name); // 期望 '背景'
```

- [ ] **Step 4: 跨平台冒烟（Android）**

Run:
```bash
cd C:\Projects\koko-app && flutter run -d <android_emulator_or_device>
```

重复 Step 3 的 1-2 项（Android 端 Identity Bridge 与 WebView 加载验证）。

- [ ] **Step 5: 提交**

```bash
cd C:\Projects\koko-app
git add test/miniapp/e2e_test.dart
git commit -m "test(miniapp): Phase 1 E2E 验收清单"
```

```bash
cd c:\官网html\KOKO
git add scripts/sync-miniapp.ps1
git commit -m "chore: 添加 nft-generator 离线包同步脚本"
```

- [ ] **Step 6: 更新 spec 状态**

打开 `c:\官网html\KOKO\docs\superpowers\specs\2026-10-12-in-app-ai-native-webapp-mini-program-architecture-design.md`，第 2 行 `**状态**：设计审阅中` 改为：

```markdown
**状态**：Phase 1 MVP 已实施（待验收）
```

并在文末追加「Phase 1 实施记录」段：

```markdown
---

## 附录：Phase 1 实施记录

- 实施计划：`docs/superpowers/plans/2026-10-12-phase-1-mvp-implementation-plan.md`
- PoC 结论：`docs/superpowers/plans/poc-result.md`
- 实际决策（koko:// scheme → InAppLocalhostServer）：见计划文档「关于 spec 中 koko:// scheme 的调整说明」
- 验收结果：[填写 E2E 验收清单完成情况]
```

提交:
```bash
cd c:\官网html\KOKO
git add docs/superpowers/specs/2026-10-12-in-app-ai-native-webapp-mini-program-architecture-design.md
git commit -m "docs: 更新 spec 状态为 Phase 1 已实施"
```

---

## 自检（writing-plans self-review）

### 1. Spec 覆盖检查

| Spec Phase 1 要求 | 对应 Task |
|---|---|
| 改造 nft-generator-prototype 为 MCP App（6 桩函数转 MCP 工具） | Task 4 + Task 5 |
| index.html 注入 `@modelcontextprotocol/ext-apps` SDK | Task 4 Step 3A |
| 通过 `document.modelContext.registerTool()` 注册工具 | Task 4 Step 2A（mcp-bridge.js 内） |
| Flutter 内 flutter_inappwebview + 基础 Identity Bridge（注入 uid/token） | Task 1（PoC）+ Task 3（Identity Bridge） |
| 离线包：本地资源 + `koko://` scheme | Task 2（InAppLocalhostServer 替代 koko://，已在「调整说明」段交代） |
| 后端暂用 linksprite-backend 现有接口 | Phase 1 不动后端；Task 5 的 api.js 桩函数保留 TODO 注释指向 linksprite-backend 接口路径 |
| 成功标准 1：App 内能加载 nft-generator 网页 | Task 8 Step 3 项 1 |
| 成功标准 2：网页能通过 Identity Bridge 拿到当前用户身份 | Task 8 Step 3 项 2 |
| 成功标准 3：api.js 中的 MCP 工具能被调用并返回结果 | Task 8 Step 3 项 3 |
| PoC 风险（flutter_inappwebview 与 MCP Apps Host 集成可行性） | Task 1（决策门） |
| 回退方案（自研 WebView + 自定义 MCP-over-postMessage 协议） | Task 4 备选路径 + Task 6 McpBridge（基于 addJavaScriptHandler，本质即自定义协议） |

无遗漏。

### 2. 占位扫描

- 「具体行号由 PoC 工程师根据 desktop_scaffold.dart 实际结构调整」（Task 1 Step 5、Task 7 Step 3）：这是必要的探索性步骤，因 desktop_scaffold.dart 结构未完全读取。计划已给出「在最简位置（如标题栏 actions）插入入口」与「在侧栏 destinations 列表末尾追加」的具体改动模式，工程师可照做。可接受。
- Task 8 Step 2 的 e2e_test.dart 含 `expect(true, isTrue)`：是占位测试，因 InAppWebView 在 widget test 不可用，必须人工执行。已在注释中说明，可接受。
- 无「TBD」「TODO implement later」「Add appropriate error handling」等空洞占位。

### 3. 类型与方法名一致性

- `KokoIdentity`（Task 3）→ `toJson()` 在 Task 3 Step 3 与 Task 6 测试中一致。
- `IdentityBridge.register(InAppWebViewController)`（Task 3）→ Task 7 Step 2 调用 `_identityBridge.register(controller)` 一致。
- `McpBridge.handleRequest(Map<String, dynamic>)`（Task 6）→ Task 7 Step 2 调用 `_mcpBridge.handleRequest(Map<String, dynamic>.from(args[0] as Map))` 一致。
- `MiniappEntry` 与 `MiniappRegistry.entries`（Task 7 Step 1）→ Task 7 Step 2 `MiniappRegistry.entries` 调用一致。
- 网页侧 `window.kokoMCP.listTools()` / `callTool(name, args)`（Task 4 mcp-bridge.js）→ Task 6 McpBridge 的 jsInvoker 字符串调用一致。
- api.js 函数名（fetchLayers/updateWeight/generatePreview/generateBatch/downloadNft/downloadBatch）→ mcp-bridge.js 调用一致 → Task 5 修改后签名不变。

无不一致。

---

## Execution Handoff

计划已保存到 `c:\官网html\KOKO\docs\superpowers\plans\2026-10-12-phase-1-mvp-implementation-plan.md`。

两种执行方式可选：

**1. Subagent-Driven（推荐）** — 每个 Task 派一个 fresh subagent 执行，两阶段 review，快速迭代

**2. Inline Execution** — 在当前会话用 executing-plans skill 批量执行，带 checkpoint 审阅

请告诉我选哪种。
