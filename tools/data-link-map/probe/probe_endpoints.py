#!/usr/bin/env python3
"""
数据链路地图 - 实时探测器
========================
定时 ping 关键接口，404/500 标红点，结果写入 probe-result.json

用法：
  python3 probe/probe_endpoints.py --base-url http://localhost:8088
  python3 probe/probe_endpoints.py --base-url https://www.webyszl.cn
"""
import argparse
import json
import time
import ssl
import urllib.request
import urllib.error
from pathlib import Path
from datetime import datetime

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "data"

# 探测用 SSL 上下文（不验证证书，仅用于内部探测）
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# 全系统端点探测清单（96 个 GET 端点，覆盖全部 17 个模块）
# chain: A=款式开发 B=扫码入库 C=工资财务 D=智能跨端
PROBE_ENDPOINTS = [
    # ===== 链路 A：款式开发（12 个）=====
    {"id": "endpoint:GET-/api/style/info/list", "method": "GET", "path": "/api/style/info/list", "chain": "A"},
    {"id": "endpoint:GET-/api/style/info/development-stats", "method": "GET", "path": "/api/style/info/development-stats", "chain": "A"},
    {"id": "endpoint:GET-/api/style/sku/list", "method": "GET", "path": "/api/style/sku/list", "chain": "A"},
    {"id": "endpoint:GET-/api/style/process/list", "method": "GET", "path": "/api/style/process/list", "chain": "A"},
    {"id": "endpoint:GET-/api/style/size-price/list", "method": "GET", "path": "/api/style/size-price/list", "chain": "A"},
    {"id": "endpoint:GET-/api/style/bom/list", "method": "GET", "path": "/api/style/bom/list", "chain": "A"},
    {"id": "endpoint:GET-/api/style/operation-log/list", "method": "GET", "path": "/api/style/operation-log/list", "chain": "A"},
    {"id": "endpoint:GET-/api/style/size/list", "method": "GET", "path": "/api/style/size/list", "chain": "A"},
    {"id": "endpoint:GET-/api/style/secondary-process/list", "method": "GET", "path": "/api/style/secondary-process/list", "chain": "A"},
    {"id": "endpoint:GET-/api/style/attachment/list", "method": "GET", "path": "/api/style/attachment/list", "chain": "A"},
    {"id": "endpoint:GET-/api/crm/customers/active-list", "method": "GET", "path": "/api/crm/customers/active-list", "chain": "A"},
    {"id": "endpoint:GET-/api/crm/sales-return/list", "method": "GET", "path": "/api/crm/sales-return/list", "chain": "A"},

    # ===== 链路 B：扫码 → 工序 → 质检 → 入库（18 个）=====
    {"id": "endpoint:GET-/api/production/scan/list", "method": "GET", "path": "/api/production/scan/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/scan/my-quality-tasks", "method": "GET", "path": "/api/production/scan/my-quality-tasks", "chain": "B"},
    {"id": "endpoint:GET-/api/production/warehousing/list", "method": "GET", "path": "/api/production/warehousing/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/order/list", "method": "GET", "path": "/api/production/order/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/order/transfer/list", "method": "GET", "path": "/api/production/order/transfer/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/purchase/list", "method": "GET", "path": "/api/production/purchase/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/purchase-return/list", "method": "GET", "path": "/api/production/purchase-return/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/cutting/list", "method": "GET", "path": "/api/production/cutting/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/cutting/summary", "method": "GET", "path": "/api/production/cutting/summary", "chain": "B"},
    {"id": "endpoint:GET-/api/production/cutting-bom/list", "method": "GET", "path": "/api/production/cutting-bom/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/cutting-bom/list-by-style-no", "method": "GET", "path": "/api/production/cutting-bom/list-by-style-no", "chain": "B"},
    {"id": "endpoint:GET-/api/production/outstock/list", "method": "GET", "path": "/api/production/outstock/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/material/inbound/list", "method": "GET", "path": "/api/production/material/inbound/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/material/stock/list", "method": "GET", "path": "/api/production/material/stock/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/material/stock/summary", "method": "GET", "path": "/api/production/material/stock/summary", "chain": "B"},
    {"id": "endpoint:GET-/api/production/picking/list", "method": "GET", "path": "/api/production/picking/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/pattern/list", "method": "GET", "path": "/api/production/pattern/list", "chain": "B"},
    {"id": "endpoint:GET-/api/production/pattern/scan-records/my-history", "method": "GET", "path": "/api/production/pattern/scan-records/my-history", "chain": "B"},

    # ===== 链路 C：工资结算 + 财务对账（10 个）=====
    {"id": "endpoint:GET-/api/finance/payroll-settlement/operator-summary", "method": "GET", "path": "/api/finance/payroll-settlement/operator-summary", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/payroll-settlement/list", "method": "GET", "path": "/api/finance/payroll-settlement/list", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/ec-revenue/summary", "method": "GET", "path": "/api/finance/ec-revenue/summary", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/ec-revenue/list", "method": "GET", "path": "/api/finance/ec-revenue/list", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/bill-aggregation/list", "method": "GET", "path": "/api/finance/bill-aggregation/list", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/payable/list", "method": "GET", "path": "/api/finance/payable/list", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/reconciliation/list", "method": "GET", "path": "/api/finance/reconciliation/list", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/expense-reimbursement/list", "method": "GET", "path": "/api/finance/expense-reimbursement/list", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/finished-settlement/list", "method": "GET", "path": "/api/finance/finished-settlement/list", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/finished-settlement/summary", "method": "GET", "path": "/api/finance/finished-settlement/summary", "chain": "C"},

    # ===== 链路 D：智能中心 + 跨端 + 系统基础（25 个）=====
    {"id": "endpoint:GET-/api/intelligence/patrol/summary", "method": "GET", "path": "/api/intelligence/patrol/summary", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/feedback-reason/list", "method": "GET", "path": "/api/intelligence/feedback-reason/list", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/pending-tasks/my", "method": "GET", "path": "/api/intelligence/pending-tasks/my", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/pending-tasks/summary", "method": "GET", "path": "/api/intelligence/pending-tasks/summary", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/action-center/task-feedback/list", "method": "GET", "path": "/api/intelligence/action-center/task-feedback/list", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/orphan-data/list", "method": "GET", "path": "/api/intelligence/orphan-data/list", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/meeting/list", "method": "GET", "path": "/api/intelligence/meeting/list", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/background-task/active", "method": "GET", "path": "/api/intelligence/background-task/active", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/background-task/list", "method": "GET", "path": "/api/intelligence/background-task/list", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/pain-point/list", "method": "GET", "path": "/api/intelligence/pain-point/list", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/task-center/my-tasks", "method": "GET", "path": "/api/intelligence/task-center/my-tasks", "chain": "D"},
    {"id": "endpoint:GET-/api/intelligence/evolution/active-overrides", "method": "GET", "path": "/api/intelligence/evolution/active-overrides", "chain": "D"},
    {"id": "endpoint:GET-/api/system/system-status", "method": "GET", "path": "/api/system/system-status", "chain": "D"},
    {"id": "endpoint:GET-/api/dashboard", "method": "GET", "path": "/api/dashboard", "chain": "D"},
    {"id": "endpoint:GET-/api/system/user/info", "method": "GET", "path": "/api/system/user/info", "chain": "D"},
    {"id": "endpoint:GET-/api/system/user/list", "method": "GET", "path": "/api/system/user/list", "chain": "D"},
    {"id": "endpoint:GET-/api/system/menu/list", "method": "GET", "path": "/api/system/menu/list", "chain": "D"},
    {"id": "endpoint:GET-/api/system/role/list", "method": "GET", "path": "/api/system/role/list", "chain": "D"},
    {"id": "endpoint:GET-/api/system/role/all", "method": "GET", "path": "/api/system/role/all", "chain": "D"},
    {"id": "endpoint:GET-/api/system/permission/list", "method": "GET", "path": "/api/system/permission/list", "chain": "D"},
    {"id": "endpoint:GET-/api/system/dict/list", "method": "GET", "path": "/api/system/dict/list", "chain": "D"},
    {"id": "endpoint:GET-/api/system/factory/list", "method": "GET", "path": "/api/system/factory/list", "chain": "D"},
    {"id": "endpoint:GET-/api/system/operation-log/list", "method": "GET", "path": "/api/system/operation-log/list", "chain": "D"},
    {"id": "endpoint:GET-/api/system/login-log/list", "method": "GET", "path": "/api/system/login-log/list", "chain": "D"},
    {"id": "endpoint:GET-/api/system/approval/my", "method": "GET", "path": "/api/system/approval/my", "chain": "D"},

    # ===== 仓库管理（10 个）=====
    {"id": "endpoint:GET-/api/warehouse/area/list", "method": "GET", "path": "/api/warehouse/area/list", "chain": "B"},
    {"id": "endpoint:GET-/api/warehouse/area/list-by-type", "method": "GET", "path": "/api/warehouse/area/list-by-type", "chain": "B"},
    {"id": "endpoint:GET-/api/warehouse/transfer/list", "method": "GET", "path": "/api/warehouse/transfer/list", "chain": "B"},
    {"id": "endpoint:GET-/api/warehouse/finished-inventory/list", "method": "GET", "path": "/api/warehouse/finished-inventory/list", "chain": "B"},
    {"id": "endpoint:GET-/api/warehouse/change-log/list", "method": "GET", "path": "/api/warehouse/change-log/list", "chain": "B"},
    {"id": "endpoint:GET-/api/warehouse/location/list", "method": "GET", "path": "/api/warehouse/location/list", "chain": "B"},
    {"id": "endpoint:GET-/api/warehouse/location/list-by-type", "method": "GET", "path": "/api/warehouse/location/list-by-type", "chain": "B"},
    {"id": "endpoint:GET-/api/warehouse/inventory-check/summary", "method": "GET", "path": "/api/warehouse/inventory-check/summary", "chain": "B"},
    {"id": "endpoint:GET-/api/warehouse/material-stock/list", "method": "GET", "path": "/api/warehouse/material-stock/list", "chain": "B"},
    {"id": "endpoint:GET-/api/warehouse/material-inbound/list", "method": "GET", "path": "/api/warehouse/material-inbound/list", "chain": "B"},

    # ===== 外部对接 + 电商 + B2B（10 个）=====
    {"id": "endpoint:GET-/api/integration/jushuitan/order/list", "method": "GET", "path": "/api/integration/jushuitan/order/list", "chain": "D"},
    {"id": "endpoint:GET-/api/integration/ec-order/list", "method": "GET", "path": "/api/integration/ec-order/list", "chain": "D"},
    {"id": "endpoint:GET-/api/distributor/order/list", "method": "GET", "path": "/api/distributor/order/list", "chain": "D"},
    {"id": "endpoint:GET-/api/distributor/list", "method": "GET", "path": "/api/distributor/list", "chain": "D"},
    {"id": "endpoint:GET-/api/btb/order/list", "method": "GET", "path": "/api/btb/order/list", "chain": "D"},
    {"id": "endpoint:GET-/api/openapi/order/list", "method": "GET", "path": "/api/openapi/order/list", "chain": "D"},
    {"id": "endpoint:GET-/api/logistics/provider/list", "method": "GET", "path": "/api/logistics/provider/list", "chain": "D"},
    {"id": "endpoint:GET-/api/logistics/callback/list", "method": "GET", "path": "/api/logistics/callback/list", "chain": "D"},
    {"id": "endpoint:GET-/api/ec/stock/list", "method": "GET", "path": "/api/ec/stock/list", "chain": "D"},
    {"id": "endpoint:GET-/api/ec/stock/allocations", "method": "GET", "path": "/api/ec/stock/allocations", "chain": "D"},

    # ===== 其他模块（11 个）=====
    {"id": "endpoint:GET-/api/stock/sample/list", "method": "GET", "path": "/api/stock/sample/list", "chain": "B"},
    {"id": "endpoint:GET-/api/stock/sample/loan/list", "method": "GET", "path": "/api/stock/sample/loan/list", "chain": "B"},
    {"id": "endpoint:GET-/api/finance/tax-config/list", "method": "GET", "path": "/api/finance/tax-config/list", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/tax-config/active", "method": "GET", "path": "/api/finance/tax-config/active", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/period/list", "method": "GET", "path": "/api/finance/period/list", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/dashboard/summary", "method": "GET", "path": "/api/finance/dashboard/summary", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/shipment-reconciliation/list", "method": "GET", "path": "/api/finance/shipment-reconciliation/list", "chain": "C"},
    {"id": "endpoint:GET-/api/finance/material-reconciliation/list", "method": "GET", "path": "/api/finance/material-reconciliation/list", "chain": "C"},
    {"id": "endpoint:GET-/api/template-library/list", "method": "GET", "path": "/api/template-library/list", "chain": "A"},
    {"id": "endpoint:GET-/api/supplier-user/list", "method": "GET", "path": "/api/supplier-user/list", "chain": "D"},
    {"id": "endpoint:GET-/api/factory-worker/list", "method": "GET", "path": "/api/factory-worker/list", "chain": "C"},
]

def probe_endpoint(base_url, endpoint, timeout=5):
    """探测单个端点"""
    url = base_url + endpoint["path"]
    # 对 list 类接口加最小分页参数
    if "list" in endpoint["path"]:
        url += "?page=1&pageSize=1"
    req = urllib.request.Request(url, method=endpoint["method"])
    req.add_header("Accept", "application/json")
    start = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=SSL_CTX) as resp:
            status = resp.status
            elapsed_ms = int((time.time() - start) * 1000)
            # 401 是正常的（需要登录），算绿点
            if status in (200, 401):
                return {"id": endpoint["id"], "status": "green", "httpStatus": status, "elapsedMs": elapsed_ms, "error": None}
            else:
                return {"id": endpoint["id"], "status": "yellow", "httpStatus": status, "elapsedMs": elapsed_ms, "error": f"HTTP {status}"}
    except urllib.error.HTTPError as e:
        elapsed_ms = int((time.time() - start) * 1000)
        if e.code == 404:
            return {"id": endpoint["id"], "status": "red", "httpStatus": 404, "elapsedMs": elapsed_ms, "error": "404 Not Found - 接口不存在或后端未部署最新代码"}
        elif e.code == 401:
            return {"id": endpoint["id"], "status": "green", "httpStatus": 401, "elapsedMs": elapsed_ms, "error": None}
        elif e.code >= 500:
            return {"id": endpoint["id"], "status": "red", "httpStatus": e.code, "elapsedMs": elapsed_ms, "error": f"服务器错误 {e.code}"}
        else:
            return {"id": endpoint["id"], "status": "yellow", "httpStatus": e.code, "elapsedMs": elapsed_ms, "error": f"HTTP {e.code}"}
    except urllib.error.URLError as e:
        elapsed_ms = int((time.time() - start) * 1000)
        return {"id": endpoint["id"], "status": "red", "httpStatus": 0, "elapsedMs": elapsed_ms, "error": f"连接失败: {str(e.reason)}"}
    except Exception as e:
        elapsed_ms = int((time.time() - start) * 1000)
        return {"id": endpoint["id"], "status": "red", "httpStatus": 0, "elapsedMs": elapsed_ms, "error": str(e)}

def main():
    parser = argparse.ArgumentParser(description="数据链路地图实时探测器")
    parser.add_argument("--base-url", default="http://localhost:8088", help="后端 base URL")
    parser.add_argument("--timeout", type=int, default=5, help="请求超时秒数")
    parser.add_argument("--output", default=None, help="输出文件路径")
    args = parser.parse_args()

    print(f"🔍 探测 {len(PROBE_ENDPOINTS)} 个端点 @ {args.base_url}")
    print()

    results = []
    for i, ep in enumerate(PROBE_ENDPOINTS, 1):
        result = probe_endpoint(args.base_url, ep, args.timeout)
        result["path"] = ep["path"]
        result["chain"] = ep["chain"]
        result["module"] = ep.get("module", "unknown")
        results.append(result)
        icon = {"green": "🟢", "yellow": "🟡", "red": "🔴"}[result["status"]]
        print(f"  [{i}/{len(PROBE_ENDPOINTS)}] {icon} {ep['method']} {ep['path']:<60} {result['elapsedMs']}ms {result.get('error') or ''}")

    # 统计
    green = sum(1 for r in results if r["status"] == "green")
    yellow = sum(1 for r in results if r["status"] == "yellow")
    red = sum(1 for r in results if r["status"] == "red")

    # 按链路统计
    chain_stats = {}
    for r in results:
        c = r.get("chain", "D")
        if c not in chain_stats:
            chain_stats[c] = {"green": 0, "yellow": 0, "red": 0, "total": 0}
        chain_stats[c][r["status"]] += 1
        chain_stats[c]["total"] += 1

    output = {
        "probed_at": datetime.now().isoformat(),
        "base_url": args.base_url,
        "summary": {"green": green, "yellow": yellow, "red": red, "total": len(results)},
        "chain_stats": chain_stats,
        "results": results
    }

    output_path = Path(args.output) if args.output else OUTPUT_DIR / "probe-result.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print()
    print(f"✅ 探测完成: {output_path}")
    print(f"   🟢 正常 {green} / 🟡 告警 {yellow} / 🔴 断链 {red}")
    print()
    print("按链路统计:")
    for c in sorted(chain_stats.keys()):
        s = chain_stats[c]
        chain_name = {"A": "款式开发", "B": "扫码入库", "C": "工资财务", "D": "智能跨端"}.get(c, c)
        print(f"   链路{c} {chain_name}: 🟢 {s['green']} / 🟡 {s['yellow']} / 🔴 {s['red']} / 共 {s['total']}")

if __name__ == "__main__":
    main()
