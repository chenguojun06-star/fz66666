#!/usr/bin/env python3
"""Test the maintenance endpoint"""
import urllib.request, urllib.error, json, sys

BASE = "http://localhost:8088"

def post(path, data=None, token=None):
    body = json.dumps(data or {}).encode()
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"httpError": e.code, "body": e.read().decode()[:1000]}
    except Exception as ex:
        return {"error": str(ex)}

# 1. Login admin
resp = post("/api/system/user/login", {"username": "admin", "password": "admin123"})
admin_token = resp["data"]["token"]
print(f"Admin token ok ({len(admin_token)} chars)")

# 2. Login test_user (tenant 99)
resp2 = post("/api/system/user/login", {"username": "test_user", "password": "admin123"})
if resp2.get("code") == 200:
    user_token = resp2["data"]["token"]
    print(f"test_user token ok")
else:
    user_token = None
    print(f"test_user login failed: {resp2}")

# 3. Single order mode (test_user token, tenant-99 order)
order_id = "17e4223a-0ac7-11f1-9759-363b36779977"
print(f"\n=== Test 1: single order mode (test_user token, tenant-99 order) ===")
r = post("/api/internal/maintenance/reinit-process-tracking",
         {"orderId": order_id}, token=user_token)
print(json.dumps(r, ensure_ascii=False, indent=2))

# 4. Batch mode (test_user token - tenant 99 has 1000+ orders)
print(f"\n=== Test 2: batch mode (test_user token, tenant-99) ===")
r2 = post("/api/internal/maintenance/reinit-process-tracking", {}, token=user_token)
print(json.dumps(r2, ensure_ascii=False, indent=2))

# 5. Check what's in the DB now
import subprocess
res = subprocess.run(
    ["docker", "exec", "fashion-mysql-simple", "mysql", "-uroot", "-pchangeme",
     "fashion_supplychain", "-e",
     "SELECT COUNT(*) as cnt FROM t_production_process_tracking;"],
    capture_output=True, text=True
)
print(f"\n=== t_production_process_tracking row count ===")
print(res.stdout.strip())
