#!/usr/bin/env python3
# 全系统 API 综合测试脚本
import urllib.request, json, sys

BASE = "http://localhost:8088"
results = {"pass": 0, "fail": 0, "warn": 0}

def ok(msg):   results["pass"] += 1; print(f"  [OK]   {msg}")
def fail(msg): results["fail"] += 1; print(f"  [FAIL] {msg}")
def warn(msg): results["warn"] += 1; print(f"  [WARN] {msg}")
def section(title): print(f"\n{'='*50}\n  {title}\n{'='*50}")

def http_get(path, token):
    r = urllib.request.Request(BASE + path, headers={"Authorization": f"Bearer {token}"})
    try:
        return json.loads(urllib.request.urlopen(r, timeout=10).read())
    except Exception as e:
        return {"code": "ERR", "error": str(e)}

def http_post(path, body, token):
    r = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    )
    try:
        return json.loads(urllib.request.urlopen(r, timeout=10).read())
    except Exception as e:
        return {"code": "ERR", "error": str(e)}

def get_total(d):
    r = d.get("data", {})
    if isinstance(r, dict):
        return r.get("total", len(r.get("records", r.get("list", []))))
    if isinstance(r, list):
        return len(r)
    return "?"

def get_first(d):
    r = d.get("data", {})
    if isinstance(r, dict):
        recs = r.get("records", r.get("list", []))
    elif isinstance(r, list):
        recs = r
    else:
        recs = []
    return recs[0] if recs else None

def check_fields(d, fields):
    rec = get_first(d)
    if rec is None:
        warn("暂无数据，跳过字段检查")
        return
    for f in fields:
        v = rec.get(f)
        if v is not None and v != "":
            ok(f"  {f} = {v}")
        else:
            warn(f"  {f} = NULL（缺失）")

# ══ 0. 登录 ══════════════════════════════════
section("0. 登录 & 获取 Token")
# admin 登录（租户106，用于权限测试）
admin_resp = http_post("/api/system/user/login", {"username": "admin", "password": "admin123"}, "")
if admin_resp.get("code") != 200:
    fail(f"admin 登录失败: {admin_resp}")
    sys.exit(1)
ADMIN_TOKEN = admin_resp["data"]["token"]
ok("admin 登录成功 → 系统管理员 (tenantId=106)")

# test_user 登录（租户99，包含实际业务数据）
test_resp = http_post("/api/system/user/login", {"username": "test_user", "password": "admin123"}, "")
if test_resp.get("code") != 200:
    fail(f"test_user 登录失败: {test_resp}")
    sys.exit(1)
TOKEN = test_resp["data"]["token"]
uname = test_resp["data"]["user"]["name"]
ok(f"test_user 登录成功 → {uname} (tenantId=99，含业务数据)")

def get(path):  return http_get(path, TOKEN)
def post(path, body={}): return http_post(path, body, TOKEN)
def admin_get(path): return http_get(path, ADMIN_TOKEN)
def admin_post(path, body={}): return http_post(path, body, ADMIN_TOKEN)

# ══ 1. 维护接口 修复历史NULL ════════════════════
section("1. 维护接口 - 修复历史 NULL 数据")
d = admin_post("/api/internal/maintenance/reinit-process-tracking")
if d.get("code") == 200:
    ok(f"维护接口: {d.get('data', '')}")
else:
    warn(f"维护接口: code={d.get('code')} → {str(d)[:200]}")

# ══ 2. 生产订单 单价&操作人&时间 ══════════════
section("2. 生产订单 (关键字段检查)")
d = get("/api/production/order/list?page=1&pageSize=5")
if d.get("code") == 200:
    ok(f"生产订单列表: 共 {get_total(d)} 条")
    check_fields(d, ["orderNo", "creatorName", "createTime", "status"])
else:
    fail(f"生产订单接口: code={d.get('code')} {str(d)[:150]}")

# ══ 3. 扫码记录 单价&操作人&时间 ════════════════
section("3. 扫码记录 (单价 / 操作人 / 扫码时间)")
d = get("/api/production/scan/list?page=1&pageSize=5")
if d.get("code") == 200:
    ok(f"扫码记录: 共 {get_total(d)} 条")
    check_fields(d, ["operatorName", "scanTime", "unitPrice", "processName", "bundleNo"])
else:
    fail(f"扫码记录: code={d.get('code')}")

# ══ 4. 工序进度追踪 ════════════════════════════
section("4. 工序进度追踪 (单价 / 操作人 / 时间)")
od = get("/api/production/order/list?page=1&pageSize=1")
oid = get_first(od).get("id") if get_first(od) else None
if oid:
    d = get(f"/api/production/process-tracking/order/{oid}")
    if d.get("code") == 200:
        ok(f"工序追踪 (订单ID={oid})")
        check_fields(d, ["operatorName", "scanTime", "unitPrice", "processCode", "completedQuantity"])
    else:
        warn(f"工序追踪: code={d.get('code')}")
else:
    warn("无可用订单ID，跳过工序追踪")

# ══ 5. 面辅料入库 ════════════════════════════════
section("5. 面辅料入库 & 库存")
d = get("/api/production/material/inbound/list?page=1&pageSize=5")
if d.get("code") == 200:
    ok(f"面辅料入库: 共 {get_total(d)} 条")
    check_fields(d, ["materialName", "inboundQuantity", "operatorName", "inboundTime"])
else:
    fail(f"面辅料入库: code={d.get('code')}")

d = get("/api/production/material/stock/list?page=1&pageSize=5")
if d.get("code") == 200:
    ok(f"面辅料库存: 共 {get_total(d)} 条")
    check_fields(d, ["materialName", "quantity", "unitPrice", "updateTime"])
else:
    warn(f"面辅料库存: code={d.get('code')}")

d = get("/api/production/picking/list?page=1&pageSize=5")
if d.get("code") == 200:
    ok(f"面辅料领料(出库): 共 {get_total(d)} 条")
else:
    warn(f"面辅料领料: code={d.get('code')}（可能暂无数据）")

# ══ 6. 成品出入库 ════════════════════════════════
section("6. 成品出入库")
d = get("/api/production/warehousing/list?page=1&pageSize=5")
if d.get("code") == 200:
    ok(f"成品入库: 共 {get_total(d)} 条")
    check_fields(d, ["orderNo", "quantity", "unitPrice", "operatorName", "warehousingDate"])
else:
    fail(f"成品入库: code={d.get('code')}")

d = get("/api/production/outstock/list?page=1&pageSize=5")
if d.get("code") == 200:
    ok(f"成品出库: 共 {get_total(d)} 条")
    check_fields(d, ["orderNo", "quantity", "operatorName", "outstockDate"])
else:
    warn(f"成品出库: code={d.get('code')}（可能暂无数据）")

# ══ 7. 财务结算管理 ════════════════════════════
section("7. 财务结算管理")
d = get("/api/finance/finished-settlement/list?page=1&pageSize=5")
if d.get("code") == 200:
    ok(f"成品结算: 共 {get_total(d)} 条")
    # 成品结算是利润综合视图，字段：styleFinalPrice(目标售价), materialCost, productionCost, totalAmount
    check_fields(d, ["orderNo", "totalAmount", "status", "styleFinalPrice", "orderQuantity"])
else:
    fail(f"成品结算: code={d.get('code')}")

d = post("/api/finance/payroll-settlement/operator-summary", {"page": 1, "pageSize": 5})
if d.get("code") == 200:
    ok(f"工资结算汇总: 共 {get_total(d)} 条")
    # 工资结算汇总：actualOperatorName=工人名, recordCount=扫码次数, unitPrice=工序单价
    check_fields(d, ["actualOperatorName", "totalAmount", "recordCount", "processName"])
else:
    warn(f"工资结算汇总: code={d.get('code')}")

# ══ 8. 主管权限 ═══════════════════════════════
section("8. 主管/管理员权限验证")
d = admin_get("/api/system/user/permissions")
if d.get("code") == 200:
    cnt = len(d.get("data", [])) if isinstance(d.get("data"), list) else "?"
    ok(f"权限项: {cnt} 条 (admin)")
else:
    warn(f"权限接口: code={d.get('code')}")

d = admin_get("/api/system/user/list?page=1&size=3")
c = d.get("code")
if c == 200:
    ok(f"用户管理可访问 (admin): {get_total(d)} 名用户")
elif c == 403:
    fail("用户管理 403 → 权限不足！")
else:
    warn(f"用户管理: code={c}")

d = admin_get("/api/system/role/list?page=1&size=5")
if d.get("code") == 200:
    ok(f"角色列表 (admin): {get_total(d)} 个角色")
else:
    warn(f"角色: code={d.get('code')}")

d = admin_get("/api/system/factory/list?page=1&size=5")
if d.get("code") == 200:
    ok(f"工厂列表 (admin): {get_total(d)} 个工厂")
else:
    warn(f"工厂: code={d.get('code')}")

# ══ 9. 操作日志 ════════════════════════════════
section("9. 操作日志 (有意义事件验证)")
d = admin_get("/api/system/operation-log/list?page=1&pageSize=30")
if d.get("code") == 200:
    total = get_total(d)
    ok(f"操作日志: 共 {total} 条")
    r = d.get("data", {})
    recs = r.get("records", r.get("list", [])) if isinstance(r, dict) else (r if isinstance(r, list) else [])
    types = {}
    for item in recs:
        t = item.get("operationType") or item.get("action") or item.get("module") or "unknown"
        # 操作日志字段：module(模块), operation(操作类型), operatorName(操作人)
        desc = f"{item.get('operation','')} by {item.get('operatorName','')}"[:60]
        types.setdefault(t, []).append(desc)
    if types:
        for t, ds in sorted(types.items()):
            print(f"     类型[{t}] ({len(ds)}条): {ds[0]}")
    else:
        warn("  操作日志中无条目（可能尚未触发任何记录）")
else:
    warn(f"操作日志: code={d.get('code')}")

d = admin_get("/api/system/login-log/list?page=1&pageSize=5")
if d.get("code") == 200:
    ok(f"登录日志: {get_total(d)} 条")
else:
    warn(f"登录日志: code={d.get('code')}")

# ══ 10. 数据完整性自检 ════════════════════════
section("10. 数据完整性自检 (生产订单前10条)")
d = get("/api/production/order/list?page=1&pageSize=10")
if d.get("code") == 200:
    r = d.get("data", {})
    recs = r.get("records", r.get("list", [])) if isinstance(r, dict) else (r if isinstance(r, list) else [])
    print(f"  抽检 {len(recs)} 条订单")
    for field in ["orderNo", "creatorName", "createTime", "status"]:
        nulls = sum(1 for x in recs if not x.get(field))
        if nulls:
            warn(f"  {field}: {nulls}/{len(recs)} 条为空")
        else:
            ok(f"  {field}: 全部有值")
    # 扫描单价字段
    for pf in ["processUnitPrice", "unitPrice", "workerUnitPrice", "price"]:
        vals = [x.get(pf) for x in recs if x.get(pf) is not None]
        if vals:
            ok(f"  单价字段[{pf}]: {len(vals)}/{len(recs)} 有值，示例={vals[0]}")
            break
    else:
        warn("  单价提示: 订单主表无单价字段（正常，单价在扫码/工序层维护）")

# ══ 汇总 ═══════════════════════════════════════
print()
print("=" * 50)
print("  测试汇总")
print("=" * 50)
print(f"  总计: {results['pass'] + results['fail'] + results['warn']} 项")
print(f"  通过: {results['pass']} ✅")
print(f"  失败: {results['fail']} ❌")
print(f"  警告: {results['warn']} ⚠️")
if results["fail"] == 0:
    print("\n  所有核心接口验证通过！")
else:
    print(f"\n  有 {results['fail']} 项失败，请检查！")
