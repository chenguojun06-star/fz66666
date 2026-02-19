import requests, warnings
warnings.filterwarnings('ignore')

BASE = "http://localhost:8088/api"
r = requests.post(f"{BASE}/system/user/login", json={"username": "zhangcz", "password": "admin123"}, timeout=5)
td = r.json()["data"]
token = td.get("token") or td.get("accessToken")
H = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

ok_list = []
err_list = []

def chk(method, path, label="", **kw):
    url = BASE + path
    try:
        resp = requests.request(method.upper(), url, headers=H, timeout=5, **kw)
        d = resp.json()
        code = d.get("code", resp.status_code)
        data = d.get("data")
        cnt = ""
        if isinstance(data, list):
            cnt = f"[{len(data)}条]"
        elif isinstance(data, dict):
            r2 = data.get("records")
            cnt = f"[{len(r2)}条]" if isinstance(r2, list) else f"[keys={list(data.keys())[:3]}]"
        (ok_list if code == 200 else err_list).append(label or path)
        print(f"  {'✅' if code == 200 else '❌'} {label or path}  code={code}  {cnt}")
        return d
    except Exception as e:
        err_list.append(label or path)
        print(f"  💥 {label or path}  {e}")
        return {}


print("\n── 仓库看板 4个子端点 ──")
chk("get", "/warehouse/dashboard/stats", "仓库统计")
chk("get", "/warehouse/dashboard/low-stock", "低库存预警")
chk("get", "/warehouse/dashboard/recent-operations", "今日出入库")
chk("get", "/warehouse/dashboard/trend", "趋势图", params={"range": "week", "type": "fabric"})

print("\n── 面辅料出库（正确路径 outstock）──")
chk("get", "/production/outstock/list", "面辅料出库列表", params={"page": 1, "size": 10})

print("\n── 财务结算 ──")
chk("get", "/finance/finished-settlement/list", "成品结算", params={"page": 1, "size": 5})
chk("get", "/finance/material-reconciliation/list", "面辅料对账", params={"page": 1, "size": 5})
chk("get", "/finance/shipment-reconciliation/list", "出货对账", params={"page": 1, "size": 5})
chk("get", "/finance/payroll-settlement/list", "工资结算列表", params={"page": 1, "size": 5})
chk("post", "/finance/payroll-settlement/operator-summary", "操工工资汇总",
    json={"startDate": "2026-01-01", "endDate": "2026-12-31"})

print("\n── 数据中心（正确路径 data-center，注意连字符）──")
chk("get", "/data-center/list", "数据中心列表", params={"page": 1, "size": 5})
chk("get", "/data-center/order-analysis", "订单分析")
chk("get", "/data-center/stats", "数据中心统计")

print("\n── 小程序接口（正确路径 wechat/mini-program）──")
chk("get", "/wechat/mini-program/factories", "工厂列表(小程序)")
chk("get", "/wechat/mini-program/orders", "订单列表(小程序)", params={"page": 1, "size": 5})

print("\n── 出货对账 ──")
chk("get", "/finance/reconciliation/status", "对账状态汇总")
chk("get", "/finance/shipment-reconciliation/list", "出货对账列表", params={"page": 1, "size": 5})

print("\n── 系统设置 ──")
chk("get", "/system/permission/list", "权限列表", params={"page": 1, "size": 5})
chk("get", "/system/role/list", "角色列表")
chk("get", "/system/tenant/list", "租户列表")
chk("get", "/system/dict/list", "字典列表", params={"page": 1, "size": 5})
chk("get", "/system/login-log/list", "登录日志", params={"page": 1, "size": 5})
chk("get", "/system/operation-log/list", "操作日志", params={"page": 1, "size": 5})

print("\n── 裁剪任务 ──")
chk("get", "/production/cutting-task/list", "裁剪任务列表", params={"page": 1, "size": 5})
chk("get", "/production/cutting-task/stats", "裁剪任务统计")
chk("get", "/production/cutting/list", "裁剪菲号列表", params={"page": 1, "size": 5})

print("\n── 其他模块 ──")
chk("get", "/order-management/list", "订单管理", params={"page": 1, "size": 5})
chk("get", "/stock/sample/list", "样衣库存", params={"page": 1, "size": 5})
chk("get", "/production/process-tracking/list", "工序追踪", params={"page": 1, "size": 5})
chk("get", "/material/database/list", "物料数据库", params={"page": 1, "size": 5})
chk("get", "/template-library/list", "模板库", params={"page": 1, "size": 5})
chk("get", "/finance/expense-reimbursement/list", "费用报销", params={"page": 1, "size": 5})
chk("get", "/pattern-revision/list", "版型修订", params={"page": 1, "size": 5})
chk("get", "/production/purchase/list", "采购列表", params={"page": 1, "size": 5})

print(f"\n{'=' * 55}")
print(f"  ✅ 通过 {len(ok_list)} 个   ❌ 异常 {len(err_list)} 个")
if err_list:
    print(f"\n  ❌ 异常项:")
    for e in err_list:
        print(f"     - {e}")
print(f"{'=' * 55}")
