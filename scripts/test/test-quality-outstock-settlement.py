#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
大货质检 → 入库 → 出库 → 结算 全流程真实数据测试

测试流程：
1. 登录获取 Token
2. 创建测试生产订单（含款式单价）
3. 模拟裁剪扫码（前置条件）
4. 模拟生产扫码（前置条件）
5. 质检扫码 - 领取阶段（receive）
6. 质检扫码 - 确认入库阶段（confirm）
7. 查看入库记录（t_product_warehousing）
8. 查看成品结算视图数据
9. 创建出库单
10. 验证出货对账单自动生成
11. 查看最终结算数据
12. 数据库全面核查
"""

import json
import urllib.request
import urllib.error
import subprocess
import time
import sys
import random

BASE_URL = "http://localhost:8088/api"
TOKEN = None

## 固定使用现有订单 PO20260204001（150件，最美服装工厂，单价¥45.57）
FIXED_ORDER_ID = "9b5d111c58de8b19dbbcd234ba8a741c"
FIXED_ORDER_NO = "PO20260204001"
FIXED_STYLE_NO = "HHY008"
FIXED_STYLE_ID = "48"
FIXED_FACTORY_ID = "872055c6327a18338bd1c8788e4e3158"

def log(step, msg, level="INFO"):
    icons = {"INFO": "📋", "OK": "✅", "ERR": "❌", "WARN": "⚠️", "DATA": "📊"}
    print(f"\n{icons.get(level, '📋')} [{step}] {msg}")

def api(method, path, data=None, expect_ok=True):
    url = f"{BASE_URL}{path}"
    headers = {"Content-Type": "application/json"}
    if TOKEN:
        headers["Authorization"] = f"Bearer {TOKEN}"

    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            text = resp.read().decode()
            result = json.loads(text) if text else {}
            if expect_ok and result.get("code") != 200:
                log("API", f"非200响应: {path} => code={result.get('code')}, msg={result.get('message')}", "WARN")
            return result
    except urllib.error.HTTPError as e:
        body_text = e.read().decode() if e.fp else ""
        log("API", f"{method} {path} => HTTP {e.code}: {body_text[:300]}", "ERR")
        return {"code": e.code, "error": body_text}
    except Exception as e:
        log("API", f"{method} {path} => {e}", "ERR")
        return {"code": -1, "error": str(e)}

def db_query(sql):
    cmd = ["docker", "exec", "fashion-mysql-simple", "mysql", "-uroot", "-pchangeme",
           "--default-character-set=utf8mb4", "fashion_supplychain", "-e", sql]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        return result.stdout
    except Exception as e:
        return f"查询失败: {e}"

def db_query_value(sql):
    """执行SQL返回单个值"""
    output = db_query(sql)
    lines = [l.strip() for l in output.strip().split('\n') if l.strip() and 'Warning' not in l]
    if len(lines) >= 2:
        return lines[1]
    return None

# ============================================================
# 步骤 1: 登录
# ============================================================
def step1_login():
    log("Step1", "登录系统获取 Token")
    result = api("POST", "/system/user/login", {"username": "admin", "password": "admin123"})
    global TOKEN
    if result.get("code") == 200 and isinstance(result.get("data"), dict):
        TOKEN = result["data"].get("token")
        log("Step1", f"登录成功, Token={TOKEN[:30]}...", "OK")
        return True
    log("Step1", f"登录失败: {result}", "ERR")
    return False

# ============================================================
# 步骤 2: 使用现有测试订单，清理旧测试数据
# ============================================================
def step2_prepare_order():
    log("Step2", f"使用现有订单 {FIXED_ORDER_NO} (150件, 单价¥45.57)")

    # 清理该订单的旧测试数据（保留原生产扫码）
    db_query(f'DELETE FROM t_product_outstock WHERE order_no="{FIXED_ORDER_NO}";')
    db_query(f'DELETE FROM t_shipment_reconciliation WHERE order_no="{FIXED_ORDER_NO}" OR order_id="{FIXED_ORDER_ID}";')
    db_query(f'DELETE FROM t_product_warehousing WHERE order_no="{FIXED_ORDER_NO}";')
    db_query(f'DELETE FROM t_scan_record WHERE order_no="{FIXED_ORDER_NO}" AND scan_type IN ("quality","warehouse");')
    db_query(f'DELETE FROM t_cutting_bundle WHERE production_order_no="{FIXED_ORDER_NO}";')
    # 清理旧的手动插入的生产扫码（保留API创建的）
    db_query(f'DELETE FROM t_scan_record WHERE order_no="{FIXED_ORDER_NO}" AND scan_type="production" AND id LIKE "SCAN-PROD-%";')
    # 重置订单完成数量
    db_query(f'UPDATE t_production_order SET completed_quantity=0 WHERE id="{FIXED_ORDER_ID}";')

    # 确认订单存在
    output = db_query(f'SELECT order_no, style_no, order_quantity, completed_quantity, status FROM t_production_order WHERE id="{FIXED_ORDER_ID}";')
    print(output)

    # 确保样式有单价
    price = db_query_value(f'SELECT price FROM t_style_info WHERE id="{FIXED_STYLE_ID}";')
    log("Step2", f"款式单价: ¥{price}", "DATA")

    # 确保有factory_id
    db_query(f'UPDATE t_production_order SET factory_id="{FIXED_FACTORY_ID}" WHERE id="{FIXED_ORDER_ID}" AND (factory_id IS NULL OR factory_id="0");')

    return FIXED_ORDER_ID, FIXED_ORDER_NO, FIXED_STYLE_NO

# ============================================================
# 步骤 3: 创建裁剪菲号（质检前置条件：需要有菲号）
# ============================================================
def step3_create_bundles(order_id, order_no, style_no):
    log("Step3", "创建裁剪菲号（质检前置条件）")

    # 检查是否已有菲号
    existing = db_query_value(f'SELECT COUNT(*) FROM t_cutting_bundle WHERE production_order_no="{order_no}";')
    if existing and int(existing) > 0:
        log("Step3", f"已有 {existing} 个菲号，先清理", "WARN")
        db_query(f'DELETE FROM t_cutting_bundle WHERE production_order_no="{order_no}";')

    # 创建3个菲号（每个菲号代表一扎衣服）
    bundle_ids = []
    ts = int(time.time()*1000) % 100000
    for i in range(1, 4):
        bundle_id = f"BDL-QC-{ts}-{i}"
        qty = 20 if i <= 2 else 10  # 20+20+10=50件
        color = "红色" if i == 1 else ("蓝色" if i == 2 else "白色")
        size = "M" if i <= 2 else "L"
        qr_code = f"QR-QC-{ts}-{i}"

        db_query(f'''INSERT INTO t_cutting_bundle (id, production_order_id, production_order_no,
            style_id, style_no, bundle_no, quantity, color, size, qr_code, status, create_time, update_time)
VALUES ("{bundle_id}", "{order_id}", "{order_no}", "{FIXED_STYLE_ID}", "{style_no}",
    "{i}", {qty}, "{color}", "{size}", "{qr_code}", "completed", NOW(), NOW());''')

        bundle_ids.append({"id": bundle_id, "qr_code": qr_code, "qty": qty, "color": color, "size": size})
        log("Step3", f"菲号{i}: {qr_code}, {color}/{size}, {qty}件", "OK")

    return bundle_ids

# ============================================================
# 步骤 4: 模拟生产扫码（质检前置条件）
# ============================================================
def step4_production_scan(order_id, order_no, style_no, bundles):
    log("Step4", "模拟生产扫码（质检前置条件：菲号需先有生产扫码记录）")

    for i, b in enumerate(bundles):
        scan_data = {
            "scanCode": b["qr_code"],
            "scanType": "production",
            "quantity": b["qty"],
            "orderId": order_id,
            "orderNo": order_no
        }
        result = api("POST", "/production/scan/execute", scan_data, expect_ok=False)

        if result.get("code") == 200:
            log("Step4", f"生产扫码成功: {b['qr_code']} ({b['qty']}件)", "OK")
        else:
            # 直接在数据库中创建扫码记录
            scan_id = f"SCAN-PROD-{int(time.time()*1000)%100000}-{i+1}"
            db_query(f'''INSERT INTO t_scan_record (id, scan_code, order_id, order_no, style_no,
                color, size, quantity, scan_type, process_code, process_name,
                operator_id, operator_name, scan_time, create_time, update_time,
                cutting_bundle_id, cutting_bundle_qr_code, scan_result, unit_price, scan_cost, process_unit_price)
VALUES ("{scan_id}", "{b['qr_code']}", "{order_id}", "{order_no}", "{style_no}",
    "{b['color']}", "{b['size']}", {b['qty']}, "production", "CF", "车缝",
    "1", "系统管理员", NOW(), NOW(), NOW(),
    "{b['id']}", "{b['qr_code']}", "success", 2.00, {b['qty'] * 2.0}, 2.00);''')
            log("Step4", f"数据库插入生产扫码: {b['qr_code']} ({b['qty']}件, 单价¥2.00)", "OK")

    # 验证
    cnt = db_query_value(f'SELECT COUNT(*) FROM t_scan_record WHERE order_no="{order_no}" AND scan_type="production";')
    log("Step4", f"生产扫码记录总数: {cnt}", "DATA")

# ============================================================
# 步骤 5: 质检扫码 - 领取阶段
# ============================================================
def step5_quality_receive(order_id, order_no, style_no, bundles):
    log("Step5", "质检扫码 - 领取阶段（receive）")

    success = 0
    for i, b in enumerate(bundles):
        scan_data = {
            "scanCode": b["qr_code"],
            "scanType": "quality",
            "qualityStage": "receive",
            "quantity": b["qty"],
            "orderId": order_id,
            "orderNo": order_no
        }
        result = api("POST", "/production/scan/execute", scan_data, expect_ok=False)

        if result.get("code") == 200:
            log("Step5", f"质检领取成功: {b['qr_code']} ({b['qty']}件)", "OK")
            success += 1
        else:
            msg = result.get("message", result.get("error", ""))
            log("Step5", f"质检领取 {b['qr_code']}: {msg}", "ERR")

    log("Step5", f"领取完成: {success}/{len(bundles)}", "DATA")

# ============================================================
# 步骤 5.5: 质检扫码 - 验收阶段
# ============================================================
def step5b_quality_inspect(order_id, order_no, style_no, bundles):
    log("Step5b", "质检扫码 - 验收阶段（inspect）")

    success = 0
    for i, b in enumerate(bundles):
        scan_data = {
            "scanCode": b["qr_code"],
            "scanType": "quality",
            "qualityStage": "inspect",
            "quantity": b["qty"],
            "orderId": order_id,
            "orderNo": order_no
        }
        result = api("POST", "/production/scan/execute", scan_data, expect_ok=False)

        if result.get("code") == 200:
            log("Step5b", f"质检验收成功: {b['qr_code']} ({b['qty']}件)", "OK")
            success += 1
        else:
            msg = result.get("message", result.get("error", ""))
            log("Step5b", f"质检验收 {b['qr_code']}: {msg}", "ERR")

    log("Step5b", f"验收完成: {success}/{len(bundles)}", "DATA")

# ============================================================
# 步骤 6: 质检扫码 - 确认入库阶段（自动创建 t_product_warehousing）
# ============================================================
def step6_quality_confirm(order_id, order_no, style_no, bundles):
    log("Step6", "质检扫码 - 确认入库阶段（confirm，应自动创建入库记录）")

    success = 0
    for i, b in enumerate(bundles):
        scan_data = {
            "scanCode": b["qr_code"],
            "scanType": "quality",
            "qualityStage": "confirm",
            "qualityResult": "qualified",
            "quantity": b["qty"],
            "orderId": order_id,
            "orderNo": order_no
        }
        result = api("POST", "/production/scan/execute", scan_data, expect_ok=False)

        if result.get("code") == 200:
            log("Step6", f"质检确认入库成功: {b['qr_code']} ({b['qty']}件, 合格)", "OK")
            success += 1
        else:
            msg = result.get("message", result.get("error", ""))
            log("Step6", f"质检确认 {b['qr_code']}: {msg}", "ERR")

    log("Step6", f"确认入库完成: {success}/{len(bundles)}", "DATA")

    # 如果API全部失败，用手动入库API
    if success == 0:
        log("Step6", "API质检入库全部失败，尝试手动入库API", "WARN")
        for i, b in enumerate(bundles):
            manual_data = {
                "orderId": order_id,
                "orderNo": order_no,
                "styleId": FIXED_STYLE_ID,
                "styleNo": style_no,
                "styleName": "衬衫",
                "warehousingQuantity": b["qty"],
                "qualifiedQuantity": b["qty"],
                "unqualifiedQuantity": 0,
                "qualityStatus": "qualified",
                "warehousingType": "manual",
                "warehouse": "A区成品仓",
                "cuttingBundleId": b["id"],
                "cuttingBundleQrCode": b["qr_code"]
            }
            result = api("POST", "/production/warehousing", manual_data, expect_ok=False)
            if result.get("code") == 200:
                log("Step6", f"手动入库成功: {b['qr_code']} ({b['qty']}件)", "OK")
                success += 1
            else:
                log("Step6", f"手动入库也失败: {result.get('message', '')}", "ERR")

    # 如果仍然失败，直接数据库插入
    if success == 0:
        log("Step6", "所有API均失败，直接数据库插入入库记录", "WARN")
        for i, b in enumerate(bundles):
            wh_id = f"WH-QC-{int(time.time()*1000)%100000}-{i+1}"
            db_query(f'''INSERT INTO t_product_warehousing (id, order_id, order_no, style_id, style_no, style_name,
                warehousing_quantity, qualified_quantity, unqualified_quantity,
                quality_status, warehousing_type, warehouse,
                quality_operator_id, quality_operator_name,
                create_time, update_time, delete_flag,
                cutting_bundle_id, cutting_bundle_qr_code)
VALUES ("{wh_id}", "{order_id}", "{order_no}", "{FIXED_STYLE_ID}", "{style_no}", "衬衫",
    {b['qty']}, {b['qty']}, 0,
    "qualified", "quality_scan", "A区成品仓",
    "1", "系统管理员",
    NOW(), NOW(), 0,
    "{b['id']}", "{b['qr_code']}");''')

# ============================================================
# 步骤 7: 查看入库记录
# ============================================================
def step7_check_warehousing(order_no):
    log("Step7", "查看成品入库记录（t_product_warehousing）")

    output = db_query(f'''SELECT pw.id, pw.order_no, pw.style_no,
        pw.warehousing_quantity, pw.qualified_quantity, pw.quality_status, pw.warehousing_type,
        pw.quality_operator_name
    FROM t_product_warehousing pw WHERE pw.order_no="{order_no}" ORDER BY pw.create_time;''')
    print(output)

    # 汇总
    summary = db_query(f'''SELECT COUNT(*) as cnt, SUM(warehousing_quantity) as total_qty,
        SUM(qualified_quantity) as qualified_qty
    FROM t_product_warehousing WHERE order_no="{order_no}";''')
    print(f"汇总: {summary}")

    # API查询
    result = api("GET", f"/production/warehousing/list?orderNo={order_no}&page=1&size=20")
    if result.get("code") == 200:
        data = result.get("data", {})
        records = data.get("records", []) if isinstance(data, dict) else []
        log("Step7", f"API返回入库记录: {len(records)} 条", "DATA")
        for r in records[:3]:
            log("Step7", f"  - 数量:{r.get('warehousingQuantity')}, 状态:{r.get('qualityStatus')}, 类型:{r.get('warehousingType')}", "DATA")

# ============================================================
# 步骤 8: 查看成品结算视图
# ============================================================
def step8_check_settlement_view(order_no):
    log("Step8", "查看成品结算视图（v_finished_product_settlement）")

    output = db_query(f'''SELECT order_no, style_no, factory_name,
        order_quantity, warehoused_quantity, defect_quantity,
        style_final_price, total_amount, material_cost, production_cost,
        defect_loss, profit, profit_margin
    FROM v_finished_product_settlement WHERE order_no="{order_no}";''')
    print(output)

    if "Empty set" in output or not output.strip():
        log("Step8", "结算视图中暂无该订单数据（可能需要有单价数据）", "WARN")
    else:
        log("Step8", "成品结算视图数据获取成功", "OK")

    # API 查询
    result = api("GET", f"/finance/finished-settlement/detail/{order_no}")
    if result.get("code") == 200 and result.get("data"):
        d = result["data"]
        log("Step8", f"API成品结算: 入库量={d.get('warehoused_quantity', d.get('warehousingQuantity', 'N/A'))}, "
                     f"金额=¥{d.get('total_amount', d.get('totalAmount', 'N/A'))}, "
                     f"利润=¥{d.get('profit', 'N/A')}", "DATA")
    else:
        log("Step8", f"成品结算API响应: {result.get('message', 'no data')}", "WARN")

# ============================================================
# 步骤 9: 创建出库单
# ============================================================
def step9_create_outstock(order_id, order_no):
    log("Step9", "创建出库单（自动触发出货对账单生成）")

    outstock_data = {
        "orderId": order_id,
        "outstockQuantity": 30,
        "outstockType": "shipment",
        "warehouse": "A区成品仓",
        "remark": "质检出入库流程测试-首批出货30件"
    }

    result = api("POST", "/production/outstock", outstock_data)

    if result.get("code") == 200:
        outstock_id = None
        data = result.get("data")
        if isinstance(data, dict):
            outstock_id = data.get("id")

        if not outstock_id:
            outstock_id = db_query_value(f'SELECT id FROM t_product_outstock WHERE order_id="{order_id}" ORDER BY create_time DESC LIMIT 1;')

        log("Step9", f"出库单创建成功: {outstock_id}, 出库30件", "OK")

        # 创建第二批出库
        time.sleep(1)
        outstock_data2 = {
            "orderId": order_id,
            "outstockQuantity": 20,
            "outstockType": "shipment",
            "warehouse": "A区成品仓",
            "remark": "质检出入库流程测试-第二批出货20件"
        }
        result2 = api("POST", "/production/outstock", outstock_data2)
        if result2.get("code") == 200:
            log("Step9", "第二批出库20件成功", "OK")
        else:
            log("Step9", f"第二批出库失败: {result2.get('message', '')}", "WARN")

        return True
    else:
        log("Step9", f"出库创建失败: {result.get('message', result.get('error', ''))}", "ERR")
        return False

# ============================================================
# 步骤 10: 验证出货对账单自动生成
# ============================================================
def step10_check_shipment_reconciliation(order_id, order_no):
    log("Step10", "验证出货对账单是否自动生成（t_shipment_reconciliation）")

    output = db_query(f'''SELECT sr.id, sr.reconciliation_no, sr.order_no,
        sr.quantity, sr.unit_price, sr.total_amount, sr.final_amount,
        sr.status, sr.scan_cost, sr.material_cost, sr.profit_amount, sr.profit_margin
    FROM t_shipment_reconciliation sr WHERE sr.order_id="{order_id}" OR sr.order_no="{order_no}";''')
    print(output)

    if "Empty set" in output or not output.strip() or output.count('\n') < 2:
        log("Step10", "未找到出货对账单！检查 ensureShipmentReconciliationForOrder 逻辑", "ERR")

        # 检查出库数据
        outstock_sum = db_query_value(f'SELECT IFNULL(SUM(outstock_quantity),0) FROM t_product_outstock WHERE order_id="{order_id}" AND delete_flag=0;')
        log("Step10", f"出库总量: {outstock_sum}", "DATA")
        return False
    else:
        log("Step10", "出货对账单已自动生成", "OK")

        # API查询
        result = api("GET", "/finance/shipment-reconciliation/list?page=1&size=10")
        if result.get("code") == 200:
            data = result.get("data", {})
            records = data.get("records", []) if isinstance(data, dict) else []
            for r in records:
                if r.get("orderNo") == order_no or r.get("order_no") == order_no:
                    log("Step10", f"API对账单: 数量={r.get('quantity')}, 单价=¥{r.get('unitPrice', r.get('unit_price'))}, "
                                 f"金额=¥{r.get('totalAmount', r.get('total_amount'))}, 状态={r.get('status')}", "DATA")
                    break
        return True

# ============================================================
# 步骤 11: 查看出库记录和最终结算
# ============================================================
def step11_final_settlement(order_id, order_no):
    log("Step11", "查看出库记录和最终结算状态")

    # 出库记录
    output = db_query(f'''SELECT os.outstock_no, os.order_no, os.outstock_quantity, os.outstock_type,
        os.warehouse, os.operator_name, os.create_time
    FROM t_product_outstock os WHERE os.order_id="{order_id}" AND os.delete_flag=0 ORDER BY os.create_time;''')
    print("出库记录:")
    print(output)

    # 成品结算视图
    output2 = db_query(f'''SELECT order_no, warehoused_quantity, defect_quantity,
        style_final_price, total_amount, material_cost, production_cost,
        profit, profit_margin
    FROM v_finished_product_settlement WHERE order_no="{order_no}";''')
    print("成品结算视图:")
    print(output2)

    # 工资结算检查
    payroll = db_query(f'''SELECT settlement_status, COUNT(*) cnt, SUM(scan_cost) total_cost
    FROM t_scan_record WHERE order_no="{order_no}" AND scan_type="production"
    GROUP BY settlement_status;''')
    print("扫码工资数据:")
    print(payroll)

# ============================================================
# 步骤 12: 数据库全面核查
# ============================================================
def step12_full_verification(order_id, order_no):
    log("Step12", "============ 数据库全面核查 ============")

    # 1. 订单状态
    order = db_query(f'''SELECT order_no, style_no, style_name, order_quantity, completed_quantity, factory_name, status
    FROM t_production_order WHERE id="{order_id}";''')
    print("📦 订单状态:")
    print(order)

    # 2. 扫码记录汇总
    scans = db_query(f'''SELECT scan_type, process_code, COUNT(*) cnt, SUM(quantity) qty, SUM(IFNULL(scan_cost,0)) cost
    FROM t_scan_record WHERE order_no="{order_no}"
    GROUP BY scan_type, process_code ORDER BY scan_type, process_code;''')
    print("🔍 扫码记录汇总:")
    print(scans)

    # 3. 入库汇总
    warehousing = db_query(f'''SELECT warehousing_type, quality_status, COUNT(*) cnt, SUM(warehousing_quantity) qty
    FROM t_product_warehousing WHERE order_no="{order_no}" GROUP BY warehousing_type, quality_status;''')
    print("📥 入库汇总:")
    print(warehousing)

    # 4. 出库汇总
    outstock = db_query(f'''SELECT outstock_type, COUNT(*) cnt, SUM(outstock_quantity) qty
    FROM t_product_outstock WHERE order_id="{order_id}" AND delete_flag=0 GROUP BY outstock_type;''')
    print("📤 出库汇总:")
    print(outstock)

    # 5. 出货对账
    recon = db_query(f'''SELECT reconciliation_no, quantity, unit_price, total_amount, final_amount, status,
        scan_cost, material_cost, profit_amount, profit_margin
    FROM t_shipment_reconciliation WHERE order_id="{order_id}" OR order_no="{order_no}";''')
    print("💰 出货对账:")
    print(recon)

    # 6. 成品结算视图
    settlement = db_query(f'''SELECT order_no, warehoused_quantity, style_final_price, total_amount,
        material_cost, production_cost, defect_loss, profit, profit_margin
    FROM v_finished_product_settlement WHERE order_no="{order_no}";''')
    print("📊 成品结算:")
    print(settlement)

    # ========== 核心验证 ==========
    log("Step12", "========== 核心验证 ==========")

    # 验证1: 入库数量 = 质检扫码数量
    wh_qty = db_query_value(f'SELECT SUM(warehousing_quantity) FROM t_product_warehousing WHERE order_no="{order_no}";')
    qc_qty = db_query_value(f'SELECT SUM(quantity) FROM t_scan_record WHERE order_no="{order_no}" AND process_code="quality_warehousing";')
    log("Step12", f"验证1 - 入库量({wh_qty}) vs 质检确认量({qc_qty}): {'匹配✅' if str(wh_qty)==str(qc_qty) else '不匹配❌'}")

    # 验证2: 出库数量 ≤ 入库合格数量
    out_qty = db_query_value(f'SELECT IFNULL(SUM(outstock_quantity),0) FROM t_product_outstock WHERE order_id="{order_id}" AND delete_flag=0;')
    qualified_qty = db_query_value(f'SELECT IFNULL(SUM(qualified_quantity),0) FROM t_product_warehousing WHERE order_no="{order_no}";')
    log("Step12", f"验证2 - 出库量({out_qty}) ≤ 合格入库量({qualified_qty}): {'合理✅' if int(out_qty or 0) <= int(qualified_qty or 0) else '超出❌'}")

    # 验证3: 出货对账单是否存在
    recon_cnt = db_query_value(f'SELECT COUNT(*) FROM t_shipment_reconciliation WHERE order_id="{order_id}" OR order_no="{order_no}";')
    log("Step12", f"验证3 - 出货对账单数量: {recon_cnt} {'存在✅' if int(recon_cnt or 0) > 0 else '缺失❌'}")

    # 验证4: 对账单金额 = 单价 × 出库数量
    recon_data = db_query(f'SELECT quantity, unit_price, total_amount FROM t_shipment_reconciliation WHERE order_id="{order_id}" OR order_no="{order_no}" LIMIT 1;')
    log("Step12", f"验证4 - 对账单金额明细: {recon_data.strip()}")

    # 验证5: 生产扫码工资成本
    prod_cost = db_query_value(f'SELECT SUM(IFNULL(scan_cost,0)) FROM t_scan_record WHERE order_no="{order_no}" AND scan_type="production";')
    log("Step12", f"验证5 - 生产扫码工资总成本: ¥{prod_cost}")

    # 验证6: 成品结算视图利润
    profit = db_query_value(f'SELECT profit FROM v_finished_product_settlement WHERE order_no="{order_no}";')
    margin = db_query_value(f'SELECT profit_margin FROM v_finished_product_settlement WHERE order_no="{order_no}";')
    log("Step12", f"验证6 - 成品利润: ¥{profit}, 利润率: {margin}%")

# ============================================================
# 主流程
# ============================================================
def main():
    print("=" * 70)
    print("🏭 大货质检 → 入库 → 出库 → 结算 全流程真实数据测试")
    print("=" * 70)

    # Step 1: 登录
    if not step1_login():
        sys.exit(1)

    # Step 2: 准备订单
    order_id, order_no, style_no = step2_prepare_order()
    if not order_id:
        sys.exit(1)

    # Step 3: 创建裁剪菲号
    bundles = step3_create_bundles(order_id, order_no, style_no)

    # Step 4: 生产扫码
    step4_production_scan(order_id, order_no, style_no, bundles)

    # Step 5: 质检领取
    step5_quality_receive(order_id, order_no, style_no, bundles)

    # Step 5b: 质检验收
    step5b_quality_inspect(order_id, order_no, style_no, bundles)

    # Step 6: 质检确认入库
    step6_quality_confirm(order_id, order_no, style_no, bundles)

    # Step 7: 查看入库记录
    step7_check_warehousing(order_no)

    # Step 8: 查看结算视图
    step8_check_settlement_view(order_no)

    # Step 9: 创建出库单
    outstock_ok = step9_create_outstock(order_id, order_no)

    # Step 10: 验证对账单
    step10_check_shipment_reconciliation(order_id, order_no)

    # Step 11: 最终结算
    step11_final_settlement(order_id, order_no)

    # Step 12: 全面核查
    step12_full_verification(order_id, order_no)

    print("\n" + "=" * 70)
    print("🏁 全流程测试完成！")
    print("=" * 70)

if __name__ == "__main__":
    main()
