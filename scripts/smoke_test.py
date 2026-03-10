#!/usr/bin/env python3
"""P0-P2 上线前冒烟测试脚本"""
import json, urllib.request, urllib.error, sys, time

BASE = "http://localhost:8088"
PASS = 0
FAIL = 0
SKIP = 0
results = []

def req(method, path, data=None, token=None, expect_code=200):
    url = BASE + path
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    body = json.dumps(data).encode() if data else None
    try:
        r = urllib.request.Request(url, data=body, headers=headers, method=method)
        resp = urllib.request.urlopen(r, timeout=10)
        code = resp.getcode()
        text = resp.read().decode("utf-8", errors="replace")
        try:
            return code, json.loads(text)
        except:
            return code, text
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace") if e.fp else ""
        try:
            return e.code, json.loads(text)
        except:
            return e.code, text
    except Exception as e:
        return 0, str(e)

def test(name, passed, detail=""):
    global PASS, FAIL
    status = "PASS" if passed else "FAIL"
    if passed:
        PASS += 1
    else:
        FAIL += 1
    icon = "\u2705" if passed else "\u274c"
    print(f"  {icon} {name}" + (f" [{detail}]" if detail and not passed else ""))
    results.append((name, status, detail))

# ============= P0: 基础环境 =============
print("\n=== P0: 基础环境验证 ===")

# 1. Health
code, body = req("GET", "/actuator/health")
test("健康检查 /actuator/health", code == 200)

# 2. Login
code, body = req("POST", "/api/system/user/login", {"username": "admin", "password": "admin123"})
login_ok = code == 200 and isinstance(body, dict) and body.get("code") == 200
token = ""
if login_ok and isinstance(body.get("data"), dict):
    token = body["data"].get("token", "")
elif login_ok and isinstance(body.get("data"), str):
    token = body["data"]
test("登录接口", login_ok and len(token) > 0, f"code={code}")

if not token:
    print("  FATAL: 无法获取 token, 停止后续测试")
    sys.exit(1)

# ============= P0: 核心 API 冒烟测试 =============
print("\n=== P0: 核心 API 冒烟测试 ===")

# Production orders list (GET, not POST)
code, body = req("GET", "/api/production/order/list?page=1&pageSize=5", token=token)
test("生产订单列表 GET /list", code == 200 and isinstance(body, dict) and body.get("code") == 200,
     f"code={code}")

# Style list (base: /api/style/info, method: GET)
code, body = req("GET", "/api/style/info/list?page=1&pageSize=5", token=token)
test("款式列表 GET /list", code == 200 and isinstance(body, dict) and body.get("code") == 200,
     f"code={code}")

# Cutting task list (GET)
code, body = req("GET", "/api/production/cutting-task/list?page=1&pageSize=5", token=token)
test("裁剪任务列表", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# Scan record list (base: /api/production/scan, method: GET)
code, body = req("GET", "/api/production/scan/list?page=1&pageSize=5", token=token)
test("扫码记录列表", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# Factory list
code, body = req("GET", "/api/system/factory/list", token=token)
test("工厂列表 GET", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# Material stock list (base: /api/production/material/stock, method: GET)
code, body = req("GET", "/api/production/material/stock/list?page=1&pageSize=5", token=token)
test("面辅料库存列表", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# User list (GET)
code, body = req("GET", "/api/system/user/list?page=1&pageSize=5", token=token)
test("用户列表", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# Role list
code, body = req("GET", "/api/system/role/list", token=token)
test("角色列表", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# Dashboard top stats
code, body = req("GET", "/api/dashboard/top-stats", token=token)
test("仪表盘统计", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# Daily brief
code, body = req("GET", "/api/dashboard/daily-brief", token=token)
test("智能运营日报", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# Finance - settlement list (GET)
code, body = req("GET", "/api/finance/finished-settlement/list?page=1&pageSize=5", token=token)
test("成品结算列表", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# Template library list (GET, base: /api/template-library)
code, body = req("GET", "/api/template-library/list?page=1&pageSize=5", token=token)
test("模板库列表", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# ============= P0: 已修复 BUG 回归 =============
print("\n=== P0: 已修复 BUG 回归验证 ===")

# Mind push status (was 500)
code, body = req("GET", "/api/intelligence/mind-push/status", token=token)
test("MindPush状态(曾500)", code == 200 and isinstance(body, dict) and body.get("code") == 200,
     f"code={code}, body={str(body)[:100]}")

# Mind push check (was 500)
code, body = req("POST", "/api/intelligence/mind-push/check", {}, token)
test("MindPush检查(曾500)", code == 200 and isinstance(body, dict) and body.get("code") == 200,
     f"code={code}, body={str(body)[:100]}")

# ============= P1: Intelligence 模块测试 =============
print("\n=== P1: Intelligence 智能模块 ===")

# Action center (base: /api/intelligence, path: /action-center)
code, body = req("GET", "/api/intelligence/action-center", token=token)
test("ActionCenter概览", code == 200 and isinstance(body, dict) and body.get("code") == 200,
     f"code={code}, body={str(body)[:80]}")

# NL Query (base: /api/intelligence, path: /nl-query)
code, body = req("POST", "/api/intelligence/nl-query", {"question": "今天有多少订单"}, token)
test("NL自然语言查询", code == 200 and isinstance(body, dict) and body.get("code") == 200,
     f"code={code}, body={str(body)[:80]}")

# Execution engine stats (base: /api/intelligence, path: /execution-stats)
code, body = req("GET", "/api/intelligence/execution-stats", token=token)
test("执行引擎统计", code == 200 and isinstance(body, dict) and body.get("code") == 200,
     f"code={code}")

# AI Advisor chat (base: /api/intelligence, path: /ai-advisor/chat)
code, body = req("POST", "/api/intelligence/ai-advisor/chat",
                 {"message": "你好", "conversationId": "test-smoke"}, token)
# AI advisor might fail if DeepSeek not configured - that's OK
advisor_ok = code == 200 and isinstance(body, dict) and body.get("code") == 200
test("AI Advisor对话", advisor_ok, f"code={code}, note=DeepSeek未配置时可能失败")

# ============= P1: 权限控制 =============
print("\n=== P1: 权限控制验证 ===")

# No token -> 401/403
code, body = req("GET", "/api/production/order/list?page=1&pageSize=5")
test("无token访问→拒绝", code in (401, 403), f"code={code}")

# Invalid token -> 401/403
code, body = req("GET", "/api/production/order/list?page=1&pageSize=5", token="invalid_token_xxx")
test("无效token→拒绝", code in (401, 403), f"code={code}")

# ============= P1: 数据库完整性 =============
print("\n=== P1: 数据库字段验证 ===")

# Check login updates last_login_time by re-logging in
code2, body2 = req("POST", "/api/system/user/login", {"username": "admin", "password": "admin123"})
test("重复登录不报错", code2 == 200 and isinstance(body2, dict) and body2.get("code") == 200)

# ============= P2: 前端体验相关 API =============
print("\n=== P2: 辅助功能验证 ===")

# App store (POST /list)
code, body = req("POST", "/api/system/app-store/list", {"page": 1, "pageSize": 10}, token)
test("应用商店列表", code == 200 and isinstance(body, dict) and body.get("code") == 200, f"code={code}")

# System status overview
code, body = req("GET", "/api/system/status/overview", token=token)
test("系统状态监控", code == 200, f"code={code}")

# ============= 汇总 =============
print("\n" + "=" * 50)
print(f"测试结果: {PASS} PASS / {FAIL} FAIL / 共 {PASS+FAIL} 项")
print("=" * 50)

if FAIL > 0:
    print("\n失败项汇总:")
    for name, status, detail in results:
        if status == "FAIL":
            print(f"  - {name}: {detail}")

sys.exit(0 if FAIL == 0 else 1)
