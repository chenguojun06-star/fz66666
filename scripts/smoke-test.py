#!/usr/bin/env python3
"""P0-P2 上线冒烟测试 - 精简版"""
import json, urllib.request, urllib.error, sys, subprocess, time

BASE = "http://localhost:8088"
TOKEN = None
PASS_N = 0
FAIL_N = 0
RESULTS = []

def req(method, path, body=None, use_token=True):
    url = BASE + path
    data = json.dumps(body).encode() if body else None
    hdrs = {"Content-Type": "application/json"}
    if use_token and TOKEN:
        hdrs["Authorization"] = "Bearer " + TOKEN
    r = urllib.request.Request(url, data=data, headers=hdrs, method=method)
    try:
        with urllib.request.urlopen(r, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            b = json.loads(e.read().decode())
        except Exception:
            b = {}
        return e.code, b
    except Exception as e:
        return 0, {"error": str(e)}

def test(name, ok):
    global PASS_N, FAIL_N
    if ok:
        PASS_N += 1
        RESULTS.append("  PASS  " + name)
    else:
        FAIL_N += 1
        RESULTS.append("  FAIL  " + name)

def check_col(table, col):
    cmd = (
        "docker exec fashion-mysql-simple mysql -uroot -pchangeme "
        "fashion_supplychain -N -e "
        "\"SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_SCHEMA=DATABASE() "
        "AND TABLE_NAME='" + table + "' "
        "AND COLUMN_NAME='" + col + "'\""
    )
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    return r.stdout.strip() == "1"

# ============ P0: 基础环境 ============
print("=" * 50)
print("P0: 基础环境与核心流程")
print("=" * 50)

code, data = req("GET", "/actuator/health", use_token=False)
test("健康检查", code == 200 and data.get("status") == "UP")

code, data = req("POST", "/api/system/user/login",
    {"username": "admin", "password": "admin123"}, use_token=False)
login_ok = code == 200 and data.get("code") == 200
if login_ok:
    TOKEN = data.get("data", {}).get("token")
test("登录功能", login_ok and TOKEN is not None)

code2, _ = req("GET", "/api/production/order/list", use_token=False)
test("无token访问拦截", code2 in [401, 403])

# ============ P0: 核心API冒烟 ============
print("\nP0: 核心API冒烟测试")

get_eps = [
    ("/api/production/order/list", "生产订单列表"),
    ("/api/system/user/list", "用户列表"),
    ("/api/system/role/list", "角色列表"),
    ("/api/style/process/list?styleId=1", "工序列表"),
    ("/api/production/scan/list", "扫码记录列表"),
    ("/api/production/material/stock/list", "面料库存列表"),
    ("/api/dashboard", "仪表板首页"),
    ("/api/style/info/list", "款式列表"),
    ("/api/finance/finished-settlement/list", "成品结算列表"),
]
for path, name in get_eps:
    code, data = req("GET", path)
    ok = code == 200
    test(name, ok)

# (款式列表和成品结算已移到GET列表中)

# ============ P0: 智能模块 ============
print("\nP0: 智能模块API")

code, data = req("GET", "/api/intelligence/action-center")
test("行动中心", code == 200)

code, data = req("GET", "/api/intelligence/mind-push/status")
test("MindPush状态", code == 200)

code, data = req("POST", "/api/intelligence/mind-push/check")
test("MindPush检查", code == 200)

code, data = req("GET", "/api/dashboard/daily-brief")
test("智能日报", code == 200)

# ============ P1: 数据库列检查 ============
print("\nP1: 数据库一致性")

db_checks = [
    ("t_user", "avatar_url", "用户头像列"),
    ("t_user", "last_login_time", "最后登录时间"),
    ("t_production_order", "notify_time_start", "推送时间列"),
    ("t_production_order", "procurement_manually_completed", "采购确认列"),
    ("t_organization_unit", "manager_user_id", "组织管理者列"),
]
for table, col, name in db_checks:
    test("DB:" + name, check_col(table, col))

# ============ P1: 写操作 ============
print("\nP1: 写操作验证")

code, data = req("POST", "/api/style/info", {
    "styleNo": "SMOKE-" + str(int(time.time())),
    "styleName": "smoke-test",
    "category": "upper",
    "season": "2026SS"
})
test("创建款式", code == 200 and data.get("code") == 200)

# ============ P2: 前端编译 ============
print("\nP2: 前端编译检查")
r = subprocess.run(
    ["npx", "tsc", "--noEmit"],
    cwd="/Users/guojunmini4/Documents/服装66666/frontend",
    capture_output=True, text=True, timeout=120
)
test("TypeScript编译", r.returncode == 0)

# ============ 总结 ============
print("\n" + "=" * 50)
print("测试结果汇总")
print("=" * 50)
for r in RESULTS:
    print(r)

total = PASS_N + FAIL_N
pct = round(PASS_N / total * 100) if total > 0 else 0
print("\n总计: {} | 通过: {} | 失败: {} | 通过率: {}%".format(
    total, PASS_N, FAIL_N, pct))

if FAIL_N == 0:
    print("\n>>> ALL TESTS PASSED - READY TO DEPLOY <<<")
else:
    print("\n>>> {} FAILED - NEEDS FIX <<<".format(FAIL_N))

sys.exit(0 if FAIL_N == 0 else 1)
