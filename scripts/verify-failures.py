#!/usr/bin/env python3
"""验证之前失败的4个测试项"""
import urllib.request, urllib.error, json

BASE = "http://localhost:8088"

def http_req(method, path, data=None, token=None):
    url = f"{BASE}{path}"
    payload = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=payload, method=method)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode())
        except:
            body = {}
        return e.code, body
    except Exception as e:
        return 0, {"error": str(e)}

# Login
code, resp = http_req("POST", "/api/system/user/login", {"username": "admin", "password": "admin123"})
token = resp["data"]["token"]
print(f"Login: OK (token={len(token)} chars)")

# Test 1: Cutting summary (was 400 - needs orderId param)
print("\n--- Test 1: Cutting Summary ---")
code, body = http_req("GET", "/api/production/cutting/summary?orderId=1", token=token)
print(f"  With orderId=1: HTTP {code}, code={body.get('code')}")
code2, body2 = http_req("GET", "/api/production/cutting/summary", token=token)
print(f"  Without params: HTTP {code2}, code={body2.get('code')}")

# Test 2: MindPush check (was 500 - missing column, now fixed)
print("\n--- Test 2: MindPush Check ---")
code, body = http_req("POST", "/api/intelligence/mind-push/check", {}, token)
print(f"  HTTP {code}, code={body.get('code')}")
if code == 200 and body.get("data"):
    data = body["data"]
    if isinstance(data, dict):
        print(f"  data keys: {list(data.keys())[:5]}")
    elif isinstance(data, list):
        print(f"  data: list of {len(data)} items")
    else:
        print(f"  data type: {type(data).__name__}")

# Test 3: MindPush status (was passing, double-check)
print("\n--- Test 3: MindPush Status ---")
code, body = http_req("GET", "/api/intelligence/mind-push/status", token=token)
print(f"  HTTP {code}, code={body.get('code')}")

# Test 4: MindPush push-time
print("\n--- Test 4: MindPush Push-Time ---")
code, body = http_req("POST", "/api/intelligence/mind-push/push-time",
                       {"notifyTimeStart": "08:00", "notifyTimeEnd": "22:00"}, token)
print(f"  HTTP {code}, code={body.get('code')}")

# Test 5: ActionCenter endpoints
print("\n--- Test 5: ActionCenter ---")
for path in ["/api/intelligence/action-center/pending",
             "/api/intelligence/action-center/list"]:
    code, body = http_req("GET", path, token=token)
    print(f"  GET {path.split('/')[-1]}: HTTP {code}")

# Test 6: Additional intelligence endpoints
print("\n--- Test 6: Intelligence Endpoints ---")
for path in ["/api/intelligence/nl/intent",
             "/api/intelligence/execution/execute"]:
    code, body = http_req("POST", path, {"query": "test"}, token)
    print(f"  POST {path.split('/')[-1]}: HTTP {code}")

print("\n=== DONE ===")
