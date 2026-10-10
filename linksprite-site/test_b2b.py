import json, urllib.request, urllib.error

base = "https://nft.kokokongkong.com"
host = "nft.kokokongkong.com:443:127.0.0.1"

# 1. Test static page
try:
    req = urllib.request.Request(f"{base}/")
    resp = urllib.request.urlopen(req)
    html = resp.read().decode()
    print(f"[1] Static page: HTTP {resp.status}, {len(html)} bytes, has 'B端合作': {'B端合作' in html}")
except Exception as e:
    print(f"[1] Static page FAILED: {e}")

# 2. Test B2B apply
payload = json.dumps({
    "company": "测试公司",
    "contact": "张三",
    "phone": "wx_test123",
    "ipType": "出版",
    "workDesc": "测试作品描述"
}).encode()

try:
    req = urllib.request.Request(f"{base}/api/v1/public/b2b-apply", data=payload, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    print(f"[2] B2B apply: HTTP {resp.status}, body={resp.read().decode()}")
except urllib.error.HTTPError as e:
    print(f"[2] B2B apply: HTTP {e.code}, body={e.read().decode()}")
except Exception as e:
    print(f"[2] B2B apply FAILED: {e}")

# 3. Test missing field
bad = json.dumps({"company": "x"}).encode()
try:
    req = urllib.request.Request(f"{base}/api/v1/public/b2b-apply", data=bad, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    print(f"[3] Bad apply (unexpected success): {resp.read().decode()}")
except urllib.error.HTTPError as e:
    print(f"[3] Bad apply: HTTP {e.code} (expected 400)")

# 4. Test linksprite-backend still works
try:
    req = urllib.request.Request(f"{base}/api/health")
    resp = urllib.request.urlopen(req)
    print(f"[4] Chain health: HTTP {resp.status}, body={resp.read().decode()[:100]}")
except urllib.error.HTTPError as e:
    print(f"[4] Chain health: HTTP {e.code} (expected 401, linksprite-backend alive)")
except Exception as e:
    print(f"[4] Chain health FAILED: {e}")

# 5. Test rate limit (send 6 more quickly)
print("[5] Rate limit test (sending 6 more)...")
for i in range(6):
    try:
        req = urllib.request.Request(f"{base}/api/v1/public/b2b-apply", data=payload, headers={"Content-Type": "application/json"})
        resp = urllib.request.urlopen(req)
        print(f"  attempt {i+1}: HTTP {resp.status}")
    except urllib.error.HTTPError as e:
        print(f"  attempt {i+1}: HTTP {e.code} {'(rate limited!)' if e.code == 429 else ''}")
