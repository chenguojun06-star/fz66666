#!/usr/bin/env python3
"""P0 终极冒烟测试"""
import urllib.request
import urllib.error
import json
import subprocess
import sys

BASE = "http://localhost:8088"
results = []

def log(status, name, detail):
    results.append((status, name, detail))
    mark = "✅" if status == "PASS" else "❌"
    print(f"  {mark} [{status}] {name}: {detail}")

def http_get(path, token=None):
    req = urllib.request.Request(f"{BASE}{path}")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, str(e)

def http_post(path, data=None, token=None):
    payload = json.dumps(data or {}).encode("utf-8")
    req = urllib.request.Request(f"{BASE}{path}", data=payload, method="POST")
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8")
            return resp.status, body
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return 0, str(e)

def mysql_query(sql):
    try:
        out = subprocess.check_output([
            "docker", "exec", "fashion-mysql-simple",
            "mysql", "-uroot", "-pchangeme", "fashion_supplychain", "-N", "-e", sql
        ], stderr=subprocess.DEVNULL, timeout=10)
        return out.decode("utf-8").strip()
    except:
        return None

print("=" * 56)
print("  P0 终极冒烟测试")
print("=" * 56)

# ===== 1. Login =====
print("\n--- 1. 登录全链路 ---")
code, body = http_post("/api/system/user/login", {"username": "admin", "password": "admin123"})
if code == 200:
    resp = json.loads(body)
    if resp.get("code") == 200:
        TOKEN = resp["data"]["token"]
        log("PASS", "登录API", f"code=200, token长度={len(TOKEN)}")
    else:
        log("FAIL", "登录API", f"业务码={resp.get('code')}, msg={resp.get('message')}")
        TOKEN = None
else:
    log("FAIL", "登录API", f"HTTP {code}")
    TOKEN = None

if not TOKEN:
    print("\n登录失败，无法继续测试")
    sys.exit(1)

# last_login_time
ll = mysql_query("SELECT CONCAT(COALESCE(last_login_time,'NULL'),'|',COALESCE(last_login_ip,'NULL')) FROM t_user WHERE username='admin'")
if ll and "|" in ll:
    log("PASS", "last_login_time回写", ll)
else:
    log("FAIL", "last_login_time回写", f"result={ll}")

# login_log
cnt = mysql_query("SELECT COUNT(*) FROM t_login_log WHERE username='admin'")
if cnt and int(cnt) > 0:
    log("PASS", "登录日志记录", f"共{cnt}条")
else:
    log("FAIL", "登录日志记录", f"count={cnt}")

# ===== 2. Permission =====
print("\n--- 2. 权限控制 ---")
code, _ = http_get("/api/system/user/list")
if code in (401, 403):
    log("PASS", "无token拦截", f"HTTP {code}")
else:
    log("FAIL", "无token拦截", f"HTTP {code} (期望401/403)")

code, _ = http_get("/api/system/user/list", TOKEN)
if code == 200:
    log("PASS", "有token访问", "HTTP 200")
else:
    log("FAIL", "有token访问", f"HTTP {code}")

# ===== 3. Core API Smoke =====
print("\n--- 3. 核心API冒烟测试 ---")

get_endpoints = [
    ("/api/system/user/me", "当前用户信息"),
    ("/api/system/user/permissions", "权限列表"),
    ("/api/system/user/list", "用户列表"),
    ("/api/style/info/list", "款式列表"),
    ("/api/production/cutting-task/list", "裁剪任务列表"),
    ("/api/production/cutting-task/stats", "裁剪任务统计"),
    ("/api/production/cutting/list", "裁剪菲号列表"),
    ("/api/production/scan/list", "扫码记录列表"),
    ("/api/dashboard", "Dashboard首页"),
    ("/api/dashboard/top-stats", "TopStats"),
    ("/api/dashboard/daily-brief", "智能运营日报"),
    ("/api/dashboard/urgent-events", "紧急事件"),
    ("/api/dashboard/delivery-alert", "交期预警"),
    ("/api/dashboard/quality-stats", "质量统计"),
    ("/api/dashboard/overdue-orders", "逾期订单"),
    ("/api/intelligence/mind-push/status", "MindPush状态"),
    ("/api/finance/finished-settlement/list", "成品结算列表"),
]

for path, name in get_endpoints:
    code, _ = http_get(path, TOKEN)
    if code == 200:
        log("PASS", f"GET {name}", "HTTP 200")
    else:
        log("FAIL", f"GET {name}", f"HTTP {code}")

summary_order_no = mysql_query(
    "SELECT COALESCE((SELECT order_no FROM t_production_order WHERE order_no IS NOT NULL AND order_no<>'' ORDER BY COALESCE(update_time, create_time) DESC LIMIT 1),'SMOKE-INT-20260318')"
)
summary_order_no = (summary_order_no or "SMOKE-INT-20260318").strip()
code, _ = http_get(f"/api/production/cutting/summary?orderNo={summary_order_no}", TOKEN)
if code == 200:
    log("PASS", "GET 裁剪汇总", f"HTTP 200 (orderNo={summary_order_no})")
else:
    log("FAIL", "GET 裁剪汇总", f"HTTP {code} (orderNo={summary_order_no})")

# ===== 4. Bug Regression =====
print("\n--- 4. 已修复BUG回归验证 ---")

# MindPush check (was 500)
code, body = http_post("/api/intelligence/mind-push/check", {}, TOKEN)
if code == 200:
    log("PASS", "MindPush check(修复500)", "HTTP 200")
else:
    log("FAIL", "MindPush check(修复500)", f"HTTP {code}")

# ActionCenter pending
code, _ = http_get("/api/intelligence/action-center/pending", TOKEN)
if code in (200, 404):
    log("PASS", "ActionCenter null安全", f"HTTP {code}")
else:
    log("FAIL", "ActionCenter null安全", f"HTTP {code}")

# ===== 5. Data Consistency =====
print("\n--- 5. 数据一致性检查 ---")

# Flyway version
fw = mysql_query("SELECT MAX(version) FROM flyway_schema_history WHERE success=1")
if fw:
    log("PASS", "Flyway最新版本", f"V{fw}")
else:
    log("FAIL", "Flyway最新版本", "查询失败")

# No failed migrations
fw_fail = mysql_query("SELECT COUNT(*) FROM flyway_schema_history WHERE success=0")
if fw_fail == "0":
    log("PASS", "Flyway无失败迁移", "failed=0")
else:
    log("FAIL", "Flyway有失败迁移", f"failed={fw_fail}")

# avatar_url column
ava = mysql_query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_user' AND COLUMN_NAME='avatar_url'")
if ava == "1":
    log("PASS", "t_user.avatar_url列", "存在")
else:
    log("FAIL", "t_user.avatar_url列", f"count={ava}")

# error_message TEXT
etype = mysql_query("SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_login_log' AND COLUMN_NAME='error_message'")
if etype and "text" in etype.lower():
    log("PASS", "login_log.error_message=TEXT", "OK")
else:
    log("FAIL", "login_log.error_message类型", f"type={etype}")

# Scan record indexes
idx = mysql_query("SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_scan_record' AND INDEX_NAME LIKE 'idx_scan_record%%'")
if idx and int(idx) > 0:
    log("PASS", "扫码记录性能索引", f"共{idx}个索引列")
else:
    log("FAIL", "扫码记录性能索引", f"count={idx}")

# ===== Summary =====
print("\n" + "=" * 56)
print("  测试结果汇总")
print("=" * 56)
pass_count = sum(1 for s, _, _ in results if s == "PASS")
fail_count = sum(1 for s, _, _ in results if s == "FAIL")
total = len(results)

print(f"\n  通过: {pass_count} | 失败: {fail_count} | 总计: {total}")

if fail_count > 0:
    print(f"\n  失败项目:")
    for s, n, d in results:
        if s == "FAIL":
            print(f"    X {n}: {d}")

print("\n" + "=" * 56)
if fail_count == 0:
    print("  ALL P0 TESTS PASSED - READY FOR PRODUCTION")
else:
    print(f"  WARNING: {fail_count} failures need investigation")
print("=" * 56)
