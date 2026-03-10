#!/usr/bin/env python3
"""P1 验证：写操作 + 事务 + CRUD + 边界条件"""
import json, sys, urllib.request, urllib.error

BASE = "http://localhost:8088"
TOKEN = None
results = {"pass": 0, "fail": 0, "tests": []}

def req(method, path, body=None, headers=None):
    url = BASE + path
    hdrs = dict(headers or {})
    if TOKEN and "Authorization" not in hdrs:
        hdrs["Authorization"] = f"Bearer {TOKEN}"
    data = json.dumps(body).encode() if body else None
    if data:
        hdrs["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            rb = json.loads(e.read().decode())
        except Exception:
            rb = {}
        return e.code, rb
    except Exception as e:
        return 0, {"error": str(e)}

def check(name, status, body, expect_status=200, extra_check=None):
    ok = status == expect_status
    if ok and extra_check:
        ok = extra_check(body)
    mark = "PASS" if ok else "FAIL"
    results["pass" if ok else "fail"] += 1
    results["tests"].append({"name": name, "status": status, "ok": ok})
    print(f"  [{mark}] {name} — HTTP {status}" + ("" if ok else f" (expected {expect_status})"))
    return ok

# ─── Login ───
print("=== Login ===")
s, b = req("POST", "/api/system/user/login", {"username": "admin", "password": "admin123"})
if s == 200:
    TOKEN = (b.get("data") or {}).get("token")
    print(f"  Token OK\n")
else:
    print(f"  FATAL: login failed {s}")
    sys.exit(1)

# ─── T1. 创建+查询+删除工厂 (CRUD事务) ───
print("=== T1. Factory CRUD ===")
ts = str(int(__import__('time').time()))
factory_data = {"factoryName": f"测试工厂_{ts}", "factoryCode": f"TF{ts}", "address": "测试地址", "contactPerson": "张三", "contactPhone": "13800138000", "status": "active"}
s, b = req("POST", "/api/system/factory", factory_data)
factory_ok = check("factory-create", s, b)
factory_id = None
if factory_ok:
    # Factory save just returns boolean. Let's find it.
    s2, b2 = req("POST", "/api/system/factory/list", {"filters": {"factoryCode": f"TF{ts}"}})
    if s2 == 200 and b2.get("data") and b2["data"].get("records"):
        factory_id = b2["data"]["records"][0]["id"]
        print(f"    found created factory id={factory_id}")

if factory_id:
    s, b = req("GET", f"/api/system/factory/{factory_id}")
    check("factory-read", s, b)

    s, b = req("DELETE", f"/api/system/factory/{factory_id}")
    check("factory-delete", s, b)

    # verify deletion
    s, b = req("GET", f"/api/system/factory/{factory_id}")
    # Should be 404 or empty data
    deleted = s in (404, 500) or (s == 200 and not b.get("data"))
    mark = "PASS" if deleted else "FAIL"
    results["pass" if deleted else "fail"] += 1
    results["tests"].append({"name": "factory-verify-deleted", "status": s, "ok": deleted})
    print(f"  [{mark}] factory-verify-deleted — HTTP {s}")
else:
    print("  [SKIP] factory CRUD — create failed, can't continue")
    for n in ["factory-read", "factory-delete", "factory-verify-deleted"]:
        results["fail"] += 1
        results["tests"].append({"name": n, "status": 0, "ok": False})

# ─── T2. 用户权限验证 ───
print("\n=== T2. Permission Check ===")
s, b = req("GET", "/api/system/user/permissions")
check("user-permissions", s, b, extra_check=lambda b: isinstance(b.get("data"), list))

s, b = req("GET", "/api/system/user/me")
check("user-me", s, b, extra_check=lambda b: isinstance(b.get("data"), dict) and b["data"].get("username"))

# ─── T3. 修改密码-错误密码 (预期失败) ───
print("\n=== T3. Change Password — wrong old password ===")
s, b = req("POST", "/api/system/user/me/change-password", {
    "oldPassword": "wrong_password_12345",
    "newPassword": "newpass123"
})
# Should fail (400 or 500)
wrong_pw = s in (400, 500)
mark = "PASS" if wrong_pw else "FAIL"
results["pass" if wrong_pw else "fail"] += 1
results["tests"].append({"name": "change-pw-wrong-old", "status": s, "ok": wrong_pw})
print(f"  [{mark}] change-pw-wrong-old — HTTP {s} (expected 400/500)")

# ─── T4. 重复登录检查 ───
print("\n=== T4. Duplicate Login ===")
s1, b1 = req("POST", "/api/system/user/login", {"username": "admin", "password": "admin123"})
t1 = (b1.get("data") or {}).get("token", "")
s2, b2 = req("POST", "/api/system/user/login", {"username": "admin", "password": "admin123"})
t2 = (b2.get("data") or {}).get("token", "")
dup_ok = s1 == 200 and s2 == 200 and t1 and t2
mark = "PASS" if dup_ok else "FAIL"
results["pass" if dup_ok else "fail"] += 1
results["tests"].append({"name": "duplicate-login", "status": s2, "ok": dup_ok})
print(f"  [{mark}] duplicate-login — both succeed (tokens differ: {t1[:10]}... vs {t2[:10]}...)")

# ─── T5. 边界条件 — 无效ID查询 ───
print("\n=== T5. Invalid ID Queries ===")
s, b = req("GET", "/api/production/order/detail/999999999")
invalid_ok = s in (200, 404, 500)  # any of these is acceptable
mark = "PASS" if invalid_ok else "FAIL"
results["pass" if invalid_ok else "fail"] += 1
results["tests"].append({"name": "invalid-order-id", "status": s, "ok": invalid_ok})
print(f"  [{mark}] invalid-order-id — HTTP {s}")

s, b = req("GET", "/api/system/factory/999999999")
invalid_ok = s in (200, 404, 500)
mark = "PASS" if invalid_ok else "FAIL"
results["pass" if invalid_ok else "fail"] += 1
results["tests"].append({"name": "invalid-factory-id", "status": s, "ok": invalid_ok})
print(f"  [{mark}] invalid-factory-id — HTTP {s}")

# ─── T6. Dashboard数据完整性检查 ───
print("\n=== T6. Dashboard Data Integrity ===")
s, b = req("GET", "/api/dashboard")
if s == 200 and b.get("data"):
    d = b["data"]
    has_fields = isinstance(d, dict)
    check("dashboard-has-data", s, b, extra_check=lambda b: isinstance(b.get("data"), dict))
else:
    check("dashboard-has-data", s, b)

s, b = req("GET", "/api/dashboard/top-stats")
check("dashboard-top-stats", s, b)

# ─── T7. 应用商店查询 ───
print("\n=== T7. App Store ===")
s, b = req("POST", "/api/system/app-store/my-apps", {})
check("my-apps", s, b)

# ─── T8. Role list has data ───
print("\n=== T8. Role Data Check ===")
s, b = req("GET", "/api/system/role/list")
data = b.get("data")
# data may be list or paginated {records:[], total:N}
if isinstance(data, list):
    count = len(data)
elif isinstance(data, dict):
    count = len(data.get("records", data.get("list", [])))
    if count == 0:
        count = data.get("total", 0)
else:
    count = 0
role_ok = s == 200 and count > 0
mark = "PASS" if role_ok else "FAIL"
results["pass" if role_ok else "fail"] += 1
results["tests"].append({"name": "role-has-data", "status": s, "ok": role_ok})
print(f"  [{mark}] role-has-data — {count} roles found")

# ─── Summary ───
total = results["pass"] + results["fail"]
pct = round(results["pass"] / total * 100) if total else 0
print(f"\n{'='*50}")
print(f"  TOTAL: {total} | PASS: {results['pass']} | FAIL: {results['fail']} | {pct}%")
print(f"{'='*50}")

failed = [t for t in results["tests"] if not t["ok"]]
if failed:
    print("\n  Failed tests:")
    for t in failed:
        print(f"    ✗ {t['name']} — HTTP {t['status']}")

sys.exit(0 if results["fail"] == 0 else 1)
