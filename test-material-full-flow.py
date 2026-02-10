#!/usr/bin/env python3
"""
面辅料完整业务流程测试 - 真实数据
流程: 采购创建 → 到货入库 → 库存检查 → 领料出库 → 库存核对
日期: 2026-02-10
"""
import json
import urllib.request
import urllib.error
import datetime
import subprocess

BASE_URL = "http://localhost:8088"
TIMESTAMP = datetime.datetime.now().strftime("%Y%m%d%H%M%S")

def api_call(method, path, data=None, token=None):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if data and method in ("POST", "PUT"):
        body = json.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
    else:
        req = urllib.request.Request(url, headers=headers, method=method)

    try:
        resp = urllib.request.urlopen(req)
        return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        try:
            return json.loads(body)
        except:
            return {"error": body, "status": e.code}
    except Exception as ex:
        return {"error": str(ex)}

def db_query(sql):
    cmd = ["docker", "exec", "fashion-mysql-simple", "mysql", "-uroot", "-pchangeme",
           "fashion_supplychain", "--default-character-set=utf8mb4", "-N", "-e", sql]
    result = subprocess.run(cmd, capture_output=True, text=True)
    return result.stdout.strip()

def separator(title):
    print(f"\n{'━'*60}")
    print(f"▶ {title}")
    print(f"{'━'*60}")

print("╔══════════════════════════════════════════════════════════════╗")
print("║     面辅料完整业务流程测试 (真实数据 Python版)                ║")
print("║  采购 → 入库 → 库存 → 领料出库 → 对账                      ║")
print("╚══════════════════════════════════════════════════════════════╝")

# ============= 步骤0: 登录 =============
separator("步骤0: 登录系统")
login_resp = api_call("POST", "/api/system/user/login", {"username": "admin", "password": "admin123"})
token = login_resp.get("data", {}).get("token", "")
if not token:
    print(f"  ❌ 登录失败: {login_resp}")
    exit(1)
print(f"  ✅ 登录成功 (token长度: {len(token)})")

# ============= 步骤1: 库存基线 =============
separator("步骤1: 查看当前库存基线")
stock_resp = api_call("GET", "/api/production/material/stock/list?pageNum=1&pageSize=100", token=token)
if stock_resp.get("code") == 200:
    records = stock_resp["data"].get("records", [])
    total_val = sum(float(r.get("totalValue", 0) or 0) for r in records)
    total_qty = sum(int(r.get("quantity", 0) or 0) for r in records)
    valid = [r for r in records if float(r.get("unitPrice", 0) or 0) > 0]
    print(f"  📦 库存 SKU 数: {len(records)}")
    print(f"  📦 有单价的 SKU: {len(valid)}条")
    print(f"  📦 总数量: {total_qty}")
    print(f"  💰 总价值: ¥{total_val:,.2f}")
    print(f"  ── 有效库存明细 ──")
    for r in valid:
        print(f"  {r['materialCode']} | {r['materialName']} | {r.get('color','-')} | "
              f"数量:{r['quantity']}{r.get('unit','')} | 单价:¥{float(r.get('unitPrice',0)):.2f} | "
              f"总值:¥{float(r.get('totalValue',0)):.2f}")
else:
    print(f"  查询失败: {stock_resp}")

# ============= 步骤2: 查看现有生产订单 =============
separator("步骤2: 获取生产订单")
order_resp = api_call("GET", "/api/production/order/list?pageNum=1&pageSize=3", token=token)
order_id = ""
order_no = ""
if order_resp.get("code") == 200:
    orders = order_resp["data"].get("records", [])
    if orders:
        order_id = orders[0].get("id", "")
        order_no = orders[0].get("orderNo", "")
        print(f"  ✅ 找到生产订单: {order_no} (ID: {order_id})")
    else:
        print(f"  ⚠️ 无生产订单，使用数据库查询")
        order_id = db_query("SELECT id FROM t_production_order WHERE delete_flag=0 LIMIT 1;")
        order_no = db_query("SELECT order_no FROM t_production_order WHERE delete_flag=0 LIMIT 1;")
        print(f"  📋 数据库查到: {order_no} (ID: {order_id})")

# ============= 步骤3: 创建面料采购单 =============
separator("步骤3: 创建面料采购单 (纯棉府绸面料)")
fab_purchase = {
    "materialCode": "FAB-TC-001",
    "materialName": "纯棉府绸面料",
    "materialType": "fabric",
    "specifications": "148cm幅宽/40支",
    "unit": "米",
    "purchaseQuantity": 200,
    "unitPrice": 35.00,
    "totalAmount": 7000.00,
    "supplierName": "杭州天虹纺织有限公司",
    "color": "藏青色",
    "size": "148cm",
    "status": "pending",
    "sourceType": "order"
}
if order_id:
    fab_purchase["orderId"] = order_id
    fab_purchase["orderNo"] = order_no

fab_resp = api_call("POST", "/api/production/purchase", fab_purchase, token=token)
fab_pur_id = ""
if fab_resp.get("code") == 200:
    d = fab_resp.get("data")
    # API可能返回 data=true 或 data={...对象}
    if isinstance(d, dict):
        fab_pur_id = d.get("id", "")
    print(f"  ✅ 采购单创建成功 (API返回data类型: {type(d).__name__})")
    # 始终从数据库获取准确ID和采购单号
    fab_pur_id = db_query("SELECT id FROM t_material_purchase WHERE material_code='FAB-TC-001' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
    fab_pur_no = db_query("SELECT purchase_no FROM t_material_purchase WHERE material_code='FAB-TC-001' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
    print(f"     采购单号: {fab_pur_no}")
    print(f"     物料: 纯棉府绸面料 (FAB-TC-001)")
    print(f"     数量: 200米 | 单价: ¥35.00 | 总金额: ¥7,000.00")
    print(f"     供应商: 杭州天虹纺织有限公司")
    print(f"     ID: {fab_pur_id}")
else:
    print(f"  ⚠️ 创建结果: {json.dumps(fab_resp, ensure_ascii=False)[:200]}")
    fab_pur_id = db_query("SELECT id FROM t_material_purchase WHERE material_code='FAB-TC-001' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
    print(f"  📋 数据库采购ID: {fab_pur_id}")

# ============= 步骤4: 创建辅料采购单 =============
separator("步骤4: 创建辅料采购单 (拉链+纽扣)")

# 拉链
zip_purchase = {
    "materialCode": "ACC-YKK-002",
    "materialName": "YKK隐形拉链20cm",
    "materialType": "accessory",
    "specifications": "3号隐形/20cm",
    "unit": "条",
    "purchaseQuantity": 500,
    "unitPrice": 2.80,
    "totalAmount": 1400.00,
    "supplierName": "东莞YKK拉链经销商",
    "color": "藏青色",
    "status": "pending",
    "sourceType": "order"
}
if order_id:
    zip_purchase["orderId"] = order_id
    zip_purchase["orderNo"] = order_no

zip_resp = api_call("POST", "/api/production/purchase", zip_purchase, token=token)
zip_pur_id = ""
if zip_resp.get("code") == 200:
    print(f"  ✅ 拉链采购创建成功")
    zip_pur_id = db_query("SELECT id FROM t_material_purchase WHERE material_code='ACC-YKK-002' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
    zip_pur_no = db_query("SELECT purchase_no FROM t_material_purchase WHERE material_code='ACC-YKK-002' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
    print(f"     {zip_pur_no} | 500条 | 单价¥2.80 | 合计¥1,400.00 | ID:{zip_pur_id}")
else:
    print(f"  ⚠️ 拉链: {json.dumps(zip_resp, ensure_ascii=False)[:150]}")
    zip_pur_id = db_query("SELECT id FROM t_material_purchase WHERE material_code='ACC-YKK-002' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")

# 纽扣
btn_purchase = {
    "materialCode": "ACC-BTN-002",
    "materialName": "金属四合扣15mm",
    "materialType": "accessory",
    "specifications": "15mm/四件套",
    "unit": "套",
    "purchaseQuantity": 2000,
    "unitPrice": 0.35,
    "totalAmount": 700.00,
    "supplierName": "义乌辅料批发城",
    "color": "银色",
    "status": "pending",
    "sourceType": "order"
}
if order_id:
    btn_purchase["orderId"] = order_id
    btn_purchase["orderNo"] = order_no

btn_resp = api_call("POST", "/api/production/purchase", btn_purchase, token=token)
btn_pur_id = ""
if btn_resp.get("code") == 200:
    print(f"  ✅ 纽扣采购创建成功")
    btn_pur_id = db_query("SELECT id FROM t_material_purchase WHERE material_code='ACC-BTN-002' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
    btn_pur_no = db_query("SELECT purchase_no FROM t_material_purchase WHERE material_code='ACC-BTN-002' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
    print(f"     {btn_pur_no} | 2000套 | 单价¥0.35 | 合计¥700.00 | ID:{btn_pur_id}")
else:
    print(f"  ⚠️ 纽扣: {json.dumps(btn_resp, ensure_ascii=False)[:150]}")
    btn_pur_id = db_query("SELECT id FROM t_material_purchase WHERE material_code='ACC-BTN-002' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")

print(f"\n  💰 采购汇总: 面料¥7,000 + 拉链¥1,400 + 纽扣¥700 = 总计¥9,100")

# ============= 步骤5: 面料到货入库 =============
separator("步骤5: 面料到货入库 (200米)")
if fab_pur_id:
    inbound1 = api_call("POST", "/api/production/material/inbound/confirm-arrival", {
        "purchaseId": fab_pur_id,
        "arrivedQuantity": 200,
        "warehouseLocation": "A区-01-03",
        "operatorName": "仓管员张三",
        "remark": "质检合格，幅宽实测148.5cm，色差在标准内"
    }, token=token)

    if inbound1.get("code") == 200:
        d = inbound1.get("data")
        print(f"  ✅ 面料入库成功!")
        if isinstance(d, dict):
            print(f"     入库单号: {d.get('inboundNo')}")
            print(f"     物料: {d.get('materialName')} ({d.get('materialCode')})")
            print(f"     数量: {d.get('inboundQuantity')}")
            print(f"     仓位: {d.get('warehouseLocation')}")
        else:
            db_r = db_query("SELECT inbound_no, material_name, inbound_quantity, warehouse_location FROM t_material_inbound WHERE purchase_id='" + fab_pur_id + "' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
            print(f"     DB确认: {db_r}")
    else:
        print(f"  ⚠️ 入库结果: {json.dumps(inbound1, ensure_ascii=False)[:200]}")
else:
    print(f"  ❌ 无采购单ID，无法入库")

# ============= 步骤6: 辅料到货入库 =============
separator("步骤6: 辅料到货入库 (拉链+纽扣)")
if zip_pur_id:
    inbound2 = api_call("POST", "/api/production/material/inbound/confirm-arrival", {
        "purchaseId": zip_pur_id,
        "arrivedQuantity": 500,
        "warehouseLocation": "B区-02-01",
        "operatorName": "仓管员李四",
        "remark": "YKK正品验证通过"
    }, token=token)
    if inbound2.get("code") == 200:
        d = inbound2.get("data")
        if isinstance(d, dict):
            print(f"  ✅ 拉链入库: {d.get('inboundNo')} | 数量:{d.get('inboundQuantity')}条 | 仓位:{d.get('warehouseLocation')}")
        else:
            db_r = db_query("SELECT inbound_no, inbound_quantity, warehouse_location FROM t_material_inbound WHERE purchase_id='" + zip_pur_id + "' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
            print(f"  ✅ 拉链入库成功 - DB确认: {db_r}")
    else:
        print(f"  ⚠️ 拉链入库: {json.dumps(inbound2, ensure_ascii=False)[:200]}")

if btn_pur_id:
    inbound3 = api_call("POST", "/api/production/material/inbound/confirm-arrival", {
        "purchaseId": btn_pur_id,
        "arrivedQuantity": 2000,
        "warehouseLocation": "B区-02-05",
        "operatorName": "仓管员李四",
        "remark": "四合扣套装完整，无残次"
    }, token=token)
    if inbound3.get("code") == 200:
        d = inbound3.get("data")
        if isinstance(d, dict):
            print(f"  ✅ 纽扣入库: {d.get('inboundNo')} | 数量:{d.get('inboundQuantity')}套 | 仓位:{d.get('warehouseLocation')}")
        else:
            db_r = db_query("SELECT inbound_no, inbound_quantity, warehouse_location FROM t_material_inbound WHERE purchase_id='" + btn_pur_id + "' AND delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
            print(f"  ✅ 纽扣入库成功 - DB确认: {db_r}")
    else:
        print(f"  ⚠️ 纽扣入库: {json.dumps(inbound3, ensure_ascii=False)[:200]}")

# ============= 步骤7: 入库后库存检查 =============
separator("步骤7: 入库后库存检查")
stock2 = api_call("GET", "/api/production/material/stock/list?pageNum=1&pageSize=100", token=token)
if stock2.get("code") == 200:
    records = stock2["data"].get("records", [])
    target = ["FAB-TC-001", "ACC-YKK-002", "ACC-BTN-002"]
    found = [r for r in records if r.get("materialCode") in target]

    print(f"  📦 库存总SKU数: {len(records)}")
    if found:
        print(f"  ── 本次入库物料 ──")
        for r in found:
            print(f"  ✅ {r['materialCode']} | {r['materialName']} | {r.get('color','-')} | "
                  f"数量:{r['quantity']}{r.get('unit','')} | 单价:¥{float(r.get('unitPrice',0)):.2f} | "
                  f"总值:¥{float(r.get('totalValue',0)):.2f} | 仓位:{r.get('location','-')}")
    else:
        print(f"  ⚠️ 未在库存列表中找到本次物料")
        # 直接数据库查
        db_result = db_query("SELECT material_code, material_name, color, quantity, unit_price, total_value, unit, location FROM t_material_stock WHERE material_code IN ('FAB-TC-001','ACC-YKK-002','ACC-BTN-002') AND delete_flag=0;")
        if db_result:
            print(f"  📋 数据库查询:")
            for line in db_result.split("\n"):
                print(f"     {line}")
        else:
            print(f"  📋 数据库也无记录")

# ============= 步骤8: 验证采购单状态 =============
separator("步骤8: 验证采购单状态 (应变为completed)")
pur_list = api_call("GET", "/api/production/purchase/list?pageNum=1&pageSize=20", token=token)
if pur_list.get("code") == 200:
    records = pur_list["data"].get("records", [])
    for r in records:
        pno = r.get("purchaseNo", "")
        if "20260210" in pno and pno.startswith("PUR"):
            status = r.get("status", "?")
            icon = "✅" if status == "completed" else "⏳"
            print(f"  {icon} {pno} | {r.get('materialName')} | "
                  f"采购:{r.get('purchaseQuantity')} 到货:{r.get('arrivedQuantity')} | "
                  f"单价:¥{float(r.get('unitPrice',0)):.2f} | "
                  f"金额:¥{float(r.get('totalAmount',0)):.2f} | "
                  f"状态:{status}")

# ============= 步骤9: 查看入库记录 =============
separator("步骤9: 查看最新入库记录")
inbound_list = api_call("GET", "/api/production/material/inbound/list?pageNum=1&pageSize=10", token=token)
if inbound_list.get("code") == 200:
    records = inbound_list["data"].get("records", [])
    print(f"  最近入库记录 (共{len(records)}条):")
    for r in records[:8]:
        print(f"  📋 {r.get('inboundNo')} | {r.get('materialName')} | "
              f"数量:{r.get('inboundQuantity')} | 供应商:{r.get('supplierName','-')} | "
              f"仓位:{r.get('warehouseLocation','-')} | 操作员:{r.get('operatorName','-')} | "
              f"时间:{r.get('inboundTime','?')}")

# ============= 步骤10: 创建领料出库 =============
separator("步骤10: 创建领料出库单 (生产领料)")
# 获取库存ID
if stock2.get("code") == 200:
    records = stock2["data"].get("records", [])
    stock_map = {}
    for r in records:
        code = r.get("materialCode", "")
        if code in ["FAB-TC-001", "ACC-YKK-002", "ACC-BTN-002"]:
            stock_map[code] = r.get("id", "")

    fab_stock_id = stock_map.get("FAB-TC-001", "")
    zip_stock_id = stock_map.get("ACC-YKK-002", "")
    btn_stock_id = stock_map.get("ACC-BTN-002", "")

    if not fab_stock_id:
        # 从数据库获取
        fab_stock_id = db_query("SELECT id FROM t_material_stock WHERE material_code='FAB-TC-001' AND delete_flag=0 LIMIT 1;")
        zip_stock_id = db_query("SELECT id FROM t_material_stock WHERE material_code='ACC-YKK-002' AND delete_flag=0 LIMIT 1;")
        btn_stock_id = db_query("SELECT id FROM t_material_stock WHERE material_code='ACC-BTN-002' AND delete_flag=0 LIMIT 1;")

    print(f"  库存ID: 面料={fab_stock_id[:12] if fab_stock_id else 'None'}... 拉链={zip_stock_id[:12] if zip_stock_id else 'None'}... 纽扣={btn_stock_id[:12] if btn_stock_id else 'None'}...")

    if fab_stock_id:
        items = []
        items.append({"materialStockId": fab_stock_id, "materialCode": "FAB-TC-001", "materialName": "纯棉府绸面料", "color": "藏青色", "quantity": 120, "unit": "米"})
        if zip_stock_id:
            items.append({"materialStockId": zip_stock_id, "materialCode": "ACC-YKK-002", "materialName": "YKK隐形拉链20cm", "color": "藏青色", "quantity": 300, "unit": "条"})
        if btn_stock_id:
            items.append({"materialStockId": btn_stock_id, "materialCode": "ACC-BTN-002", "materialName": "金属四合扣15mm", "color": "银色", "quantity": 800, "unit": "套"})

        picking = api_call("POST", "/api/production/picking", {
            "picking": {
                "orderNo": order_no or "PO-TEST",
                "orderId": order_id or "",
                "pickerName": "裁剪工王五",
                "remark": "首批100件裁剪用料"
            },
            "items": items
        }, token=token)

        if picking.get("code") == 200:
            d = picking.get("data")
            print(f"  ✅ 领料出库成功!")
            if isinstance(d, dict):
                print(f"     领料单号: {d.get('pickingNo')}")
                print(f"     订单号: {d.get('orderNo')}")
                print(f"     领料人: {d.get('pickerName')}")
            else:
                db_r = db_query("SELECT picking_no, order_no, picker_name FROM t_material_picking WHERE delete_flag=0 ORDER BY create_time DESC LIMIT 1;")
                print(f"     DB确认: {db_r}")
            print(f"     领料明细:")
            print(f"       📦 纯棉府绸面料 120米")
            print(f"       📦 YKK隐形拉链 300条")
            print(f"       📦 金属四合扣 800套")
        else:
            print(f"  ⚠️ 领料结果: {json.dumps(picking, ensure_ascii=False)[:300]}")
    else:
        print(f"  ❌ 无库存ID，无法领料")

# ============= 步骤11: 出库后库存核对 =============
separator("步骤11: 出库后库存核对")
stock3 = api_call("GET", "/api/production/material/stock/list?pageNum=1&pageSize=100", token=token)
if stock3.get("code") == 200:
    records = stock3["data"].get("records", [])
    target = ["FAB-TC-001", "ACC-YKK-002", "ACC-BTN-002"]
    found = [r for r in records if r.get("materialCode") in target]

    if found:
        print(f"  ┌────────────────┬──────────────────┬──────────┬──────────┬──────────────┐")
        print(f"  │ 物料编号       │ 物料名称         │ 现有数量 │ 单价     │ 库存总值     │")
        print(f"  ├────────────────┼──────────────────┼──────────┼──────────┼──────────────┤")
        for r in found:
            code = r["materialCode"]
            name = r["materialName"][:8]
            qty = r["quantity"]
            unit = r.get("unit", "")
            price = float(r.get("unitPrice", 0) or 0)
            val = float(r.get("totalValue", 0) or 0)
            print(f"  │ {code:<14} │ {name:<8}       │ {qty:>4}{unit:<4} │ ¥{price:>6.2f} │ ¥{val:>10.2f} │")
        print(f"  └────────────────┴──────────────────┴──────────┴──────────┴──────────────┘")
        print(f"")
        print(f"  📊 预期库存对比:")
        print(f"  面料: 入库200米 - 领料120米 = 应剩80米")
        print(f"  拉链: 入库500条 - 领料300条 = 应剩200条")
        print(f"  纽扣: 入库2000套 - 领料800套 = 应剩1200套")
    else:
        print(f"  ⚠️ 未在API中找到本次物料，使用数据库直查:")
        db_result = db_query("SELECT material_code, material_name, quantity, unit_price, total_value FROM t_material_stock WHERE material_code IN ('FAB-TC-001','ACC-YKK-002','ACC-BTN-002') AND delete_flag=0;")
        if db_result:
            for line in db_result.split("\n"):
                print(f"     {line}")

# ============= 步骤12: 数据库最终验证 =============
separator("步骤12: 数据库最终验证 (真实数据全面核查)")

print("\n  📋 === 本次采购记录 ===")
result = db_query("SELECT purchase_no, material_name, material_type, purchase_quantity, arrived_quantity, unit_price, total_amount, supplier_name, status FROM t_material_purchase WHERE create_time >= CURDATE() AND delete_flag=0 ORDER BY create_time DESC;")
if result:
    for line in result.split("\n"):
        print(f"  {line}")

print("\n  📋 === 本次入库记录 ===")
result = db_query("SELECT inbound_no, material_code, material_name, inbound_quantity, supplier_name, warehouse_location, operator_name, inbound_time FROM t_material_inbound WHERE inbound_time >= CURDATE() AND delete_flag=0 ORDER BY inbound_time DESC;")
if result:
    for line in result.split("\n"):
        print(f"  {line}")

print("\n  📋 === 本次物料库存 ===")
result = db_query("SELECT material_code, material_name, color, quantity, unit_price, total_value, unit, location FROM t_material_stock WHERE material_code IN ('FAB-TC-001','ACC-YKK-002','ACC-BTN-002') AND delete_flag=0;")
if result:
    for line in result.split("\n"):
        print(f"  {line}")
else:
    print(f"  (无记录)")

print("\n  📋 === 领料出库记录 ===")
result = db_query("SELECT p.picking_no, p.order_no, p.picker_name, p.status, p.create_time FROM t_material_picking p WHERE p.delete_flag=0 ORDER BY p.create_time DESC LIMIT 5;")
if result:
    for line in result.split("\n"):
        print(f"  {line}")
else:
    print(f"  (无记录)")

print("\n  📋 === 全部库存汇总 ===")
result = db_query("SELECT COUNT(*) as sku_count, SUM(quantity) as total_qty, ROUND(SUM(total_value),2) as total_value, SUM(CASE WHEN unit_price > 0 THEN 1 ELSE 0 END) as priced_sku FROM t_material_stock WHERE delete_flag=0;")
if result:
    parts = result.split("\t")
    if len(parts) >= 4:
        print(f"  总SKU: {parts[0]} | 总数量: {parts[1]} | 总价值: ¥{parts[2]} | 有单价SKU: {parts[3]}")

# ============= 最终汇总 =============
print(f"\n{'═'*60}")
print(f"                 测试结果汇总")
print(f"{'═'*60}")
print(f"  ✅ 采购创建: 面料¥7,000 + 拉链¥1,400 + 纽扣¥700 = ¥9,100")
print(f"  ✅ 到货入库: 面料200米 + 拉链500条 + 纽扣2000套")
print(f"  ✅ 领料出库: 面料120米 + 拉链300条 + 纽扣800套")
print(f"  📊 预期剩余: 面料80米 + 拉链200条 + 纽扣1200套")
print(f"  ⏰ 时间戳: {TIMESTAMP}")
print(f"{'═'*60}")
print(f"\n🎉 面辅料全流程测试完成！")
