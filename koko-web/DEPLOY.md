# KOKO Web 官网部署指南（kokokongkong.com）

## 构建产物位置

`koko-web/build/web/` —— Flutter Web release 构建产物（SPA）。

## 服务器文件放置

```bash
# 1. 官网 Flutter 产物
rsync -avz --delete koko-web/build/web/ root@服务器:/srv/koko-web/

# 2. 下载目录（APK + Windows 安装包）
# /srv/koko-downloads/KOKO.apk
# /srv/koko-downloads/KOKO_Setup.exe

# 3. 合规文档静态页（保留旧站 12 份子目录）
# /srv/koko-legal/privacy/index.html
# /srv/koko-legal/terms/index.html
# ... 其余 10 份同理
```

## Caddyfile 完整配置

把下面整段并入服务器现有 Caddyfile（与现有站点同级），然后：

```bash
docker exec <caddy容器> caddy reload --config /etc/caddy/Caddyfile
```

```caddyfile
# ===== kokokongkong.com：官网 + App 后端路径 =====
kokokongkong.com {
    encode gzip

    # Stoat API
    handle /api/* {
        reverse_proxy api:14702
    }

    # WebSocket（Stoat 实时消息）
    handle /ws* {
        reverse_proxy api:14702
    }

    # koko-auth 侧车（短信/图形认证/版本检查）
    handle /koko/* {
        uri strip_prefix /koko
        reverse_proxy koko-auth:8000
    }

    # Autumn 文件存储
    handle /autumn/* {
        reverse_proxy autumn:14704
    }

    # January 订阅
    handle /january/* {
        reverse_proxy january:14705
    }

    # 下载包
    handle /download/* {
        root * /srv/koko-downloads
        file_server
    }

    # 合规文档：优先伺服静态 HTML，爬虫/应用商店审核可 curl 直读
    handle /privacy*    { root * /srv/koko-legal; file_server }
    handle /terms*      { root * /srv/koko-legal; file_server }
    handle /code-of-conduct* { root * /srv/koko-legal; file_server }
    handle /account-deletion* { root * /srv/koko-legal; file_server }
    handle /youth*      { root * /srv/koko-legal; file_server }
    handle /partner/*   { root * /srv/koko-legal; file_server }
    handle /partner-agreement* { root * /srv/koko-legal; file_server }
    handle /ranking-guarantee* { root * /srv/koko-legal; file_server }
    handle /recharge*   { root * /srv/koko-legal; file_server }
    handle /service-standard* { root * /srv/koko-legal; file_server }
    handle /support*    { root * /srv/koko-legal; file_server }
    handle /help*       { root * /srv/koko-legal; file_server }

    # Flutter 官网 SPA（兜底回退）
    handle {
        root * /srv/koko-web
        try_files {path} /index.html
        file_server
    }
}

# 管理后台
admin.kokokongkong.com {
    encode gzip
    reverse_proxy koko-admin:8093
}

# NFT 后端
nft.kokokongkong.com {
    encode gzip
    reverse_proxy linksprite-backend:8080
}

# www 重定向到裸域
www.kokokongkong.com {
    redir https://kokokongkong.com{uri} permanent
}
```

## 切换顺序（严格按序执行）

1. **DNS**：`@`、`www`、`admin`、`nft` A 记录指向服务器，TTL 调 300s
2. **Caddy 后端先行**：只加主站块（`handle /api` / `/koko` / `/ws` 等后端路径），`handle {}` 先指旧静态站复制件 → 验证 API/版本检查都通
3. **合规文档上线**：把旧站 12 份子目录复制到 `/srv/koko-legal/`
4. **官网 Flutter 上线**：`flutter build web --release` → 产物传 `/srv/koko-web/` → Caddy `handle {}` 切到 `/srv/koko-web`
5. **App 出包**：改 `instance_config.dart` defaultHost → 升版本 1.2.0+4 → 服务器 `version/check` 配 `min_version=1.2.0`
6. **旧域名下线**：观察 1-2 周后，删除 `openelfai.cn` Caddy 块（保留 301 兜底 2-4 周）

## 关键验证命令

```bash
curl -s https://kokokongkong.com/api
curl "https://kokokongkong.com/koko/version/check?platform=android"
curl -s https://kokokongkong.com/privacy/ | grep "隐私政策"
curl -I https://admin.kokokongkong.com
curl -I https://nft.kokokongkong.com/api/health 2>/dev/null || echo "NFT backend check"
```

## 备注

- `/koko` strip 前缀、Autumn 上传 body 上限等细节，请对照服务器上旧域名现有 Caddyfile 逐字复制
- koko-auth 容器端口需以 `docker inspect koko-auth` 实测为准（常见 8000）
- 旧静态站目录不要删除，打 git tag 归档，法务留痕
