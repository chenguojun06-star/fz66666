#!/usr/bin/env python3
"""探测未覆盖模块的可用性"""
import urllib.request, urllib.error, json

BASE = "http://localhost:8088"

def post(path, data, token=None):
    body = json.dumps(data).encode()
    req = urllib.request.Request(BASE + path, data=body,
                                  headers={"Content-Type": "application/json"})
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}"}
    except Exception as e:
        return {"error": str(e)[:50]}

def get(path, token=None):
    req = urllib.request.Request(BASE + path)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}"}
    except Exception as e:
        return {"error": str(e)[:50]}

# 登录
r = post("/api/system/user/login", {"username": "test_user", "password": "admin123"})
token = r.get("data", {}).get("token")
if not token:
    print("LOGIN FAILED:", r)
    exit(1)
print(f"Login OK, token={token[:20]}...")

# 绝大多数 list 接口是 GET + query param，不是 POST + JSON body
G = "GET"
P = "POST"
modules = [
    # ===== 款式模块（style） =====
    ("款式列表",         "/api/style/info/list",                           G, None),
    ("款式BOM",         "/api/style/bom/list",                            G, None),
    ("款式工序",         "/api/style/process/list",                        G, None),
    ("款式报价",         "/api/style/quotation",                           G, None),
    ("次工序",           "/api/style/secondary-process/list",              G, None),
    ("款式附件",         "/api/style/attachment/list",                     G, None),
    # ===== 生产模块（production） =====
    ("裁剪任务",         "/api/production/cutting-task/list",              G, None),
    ("裁剪菲号",         "/api/production/cutting/list",                   G, None),
    ("成品入库",         "/api/production/warehousing/list",               G, None),
    ("生产出库",         "/api/production/outstock/list",                  G, None),
    ("领料记录",         "/api/production/picking/list",                   G, None),
    ("物料采购",         "/api/production/material/list",                  G, None),
    ("版型修改",         "/api/pattern-revision/list",                     G, None),
    # ===== 仓库模块（warehouse） =====
    ("成品库存",         "/api/warehouse/finished-inventory/list",         P, {"pageNum":1,"pageSize":3}),
    ("仓库统计",         "/api/warehouse/dashboard/stats",                 G, None),
    # ===== 财务模块（finance） =====
    ("成品结算",         "/api/finance/finished-settlement/list",          G, None),
    ("物料对账",         "/api/finance/material-reconciliation/list",      G, None),
    ("出货对账",         "/api/finance/shipment-reconciliation/list",      G, None),
    ("费用报销",         "/api/finance/expense-reimbursement/list",        G, None),
    # ===== 库存 =====
    ("样品库存",         "/api/stock/sample/list",                         G, None),
    # ===== 系统基础数据 =====
    ("工厂列表",         "/api/system/factory/list",                       G, None),
    ("角色列表",         "/api/system/role/list",                          G, None),
    ("字典列表",         "/api/system/dict/list",                          G, None),
    # ===== 模板库 =====
    ("版型模板",         "/api/template-library/list",                     G, None),
    # ===== 仪表板 & 数据中心 =====
    ("主仪表板",         "/api/dashboard",                                 G, None),
    ("数据中心",         "/api/data-center/stats",                         G, None),
    # ===== 材料数据库 =====
    ("材料数据库",       "/api/material/database/list",                    G, None),
]

print(f"\n{'模块':<14} {'状态':<8} 数据信息")
print("-" * 55)
ok_count = 0
fail_count = 0
for name, path, method, data in modules:
    if method == G:
        d = get(path, token)
    else:
        d = post(path, data, token)

    if "error" in d:
        print(f"  {name:<12} {d['error']}")
        fail_count += 1
    else:
        code = d.get("code", "?")
        raw = d.get("data")
        if isinstance(raw, dict):
            total = raw.get("total", raw.get("count", "?"))
            info = f"total={total}"
        elif isinstance(raw, list):
            info = f"count={len(raw)}"
        elif raw is None:
            info = "null"
        else:
            info = str(raw)[:50]
        status = "OK" if code == 200 else f"ERR {code}"
        print(f"  {name:<12} {status:<8} {info}")
        if code == 200:
            ok_count += 1
        else:
            fail_count += 1

print(f"\nOK={ok_count}  FAIL={fail_count}")
