import requests

BASE = "http://localhost:8088/api"
r = requests.post(f"{BASE}/system/user/login", json={"username": "zhangcz", "password": "admin123"})
d = r.json()
td = d["data"]
token = td.get("token") or td.get("accessToken")
H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

ok = err = 0

def chk(method, path, **kw):
    global ok, err
    url = BASE + path
    try:
        resp = getattr(requests, method)(url, headers=H, timeout=5, **kw)
        d = resp.json()
        code = d.get("code", resp.status_code)
        msg = str(d.get("message", ""))[:40]
        data = d.get("data")
        cnt = ""
        if isinstance(data, list):
            cnt = f" [{len(data)}条]"
        elif isinstance(data, dict):
            cnt = f" [keys={list(data.keys())[:4]}]"
        mark = "✅" if code == 200 else "❌"
        if code == 200:
            ok += 1
        else:
            err += 1
        print(f"  {mark} {method.upper()} {path}  code={code}  {msg}{cnt}")
        return d
    except Exception as e:
        err += 1
        print(f"  💥 {path}  {e}")
        return {}

print("\n=== 仓库看板（4个子端点）===")
chk("get", "/warehouse/dashboard/stats")
chk("get", "/warehouse/dashboard/low-stock")
chk("get", "/warehouse/dashboard/recent-operations")
chk("get", "/warehouse/dashboard/trend", params={"range": "week", "type": "fabric"})

print("\n=== 成品库存 & 出库 ===")
chk("get", "/warehouse/finished-inventory/list", params={"page": 1, "size": 10})
chk("get", "/warehouse/shipment/list", params={"page": 1, "size": 10})
chk("get", "/warehouse/outbound/list", params={"page": 1, "size": 10})

print("\n=== 面辅料出库/库存 ===")
chk("get", "/production/material/stock/list", params={"page": 1, "size": 10})
chk("get", "/production/material/inbound/list", params={"pageNum": 1, "pageSize": 10})
chk("get", "/production/material/outbound/list", params={"pageNum": 1, "pageSize": 10})

print("\n=== 财务结算（5个模块）===")
chk("get", "/finance/finished-settlement/list", params={"page": 1, "size": 5})
chk("get", "/finance/material-settlement/list", params={"page": 1, "size": 5})
chk("get", "/finance/material-reconciliation/list", params={"page": 1, "size": 5})
chk("get", "/finance/shipment-reconciliation/list", params={"page": 1, "size": 5})
chk("get", "/finance/payroll-settlement/list", params={"page": 1, "size": 5})

print("\n=== 供应商 ===")
chk("get", "/system/supplier/list", params={"page": 1, "size": 5})
chk("get", "/production/supplier/list", params={"page": 1, "size": 5})

print("\n=== 小程序接口 ===")
chk("get", "/wechat/factory/list")
chk("get", "/wechat/order/list", params={"page": 1, "size": 5})
chk("get", "/wechat/scan/history", params={"page": 1, "size": 5})

print("\n=== 出货/发货管理 ===")
chk("get", "/warehouse/shipment/list", params={"page": 1, "size": 5})
chk("get", "/finance/shipment/list", params={"page": 1, "size": 5})
chk("get", "/finance/shipment-reconciliation/list", params={"page": 1, "size": 5})

print("\n=== 裁剪任务 ===")
chk("get", "/production/cutting-task/list", params={"page": 1, "size": 5})
chk("get", "/production/cutting-task/stats")
chk("get", "/production/cutting/list", params={"page": 1, "size": 5})

print("\n=== 数据中心 ===")
chk("get", "/datacenter/order-analysis")
chk("get", "/datacenter/production-stats")
chk("get", "/datacenter/stats")
chk("get", "/datacenter/list", params={"page": 1, "size": 5})

print("\n=== 系统设置补充 ===")
chk("get", "/system/permission/list")
chk("get", "/system/menu/list")
chk("get", "/system/tenant/info")

print(f"\n{'='*50}")
print(f"  ✅ 通过: {ok}   ❌ 异常: {err}")
print(f"{'='*50}")
