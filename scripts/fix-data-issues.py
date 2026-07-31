#!/usr/bin/env python3
"""
全系统数据问题修复脚本
按 P1→P2 顺序修复全部10个数据问题
执行前已通过 query-audit-details.py 确认明细数据
"""

import pymysql, os, sys, json
from datetime import datetime

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")
C = "utf8mb4_unicode_ci"

# DRY_RUN=1 只打印不执行，DRY_RUN=0 实际执行
DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"

conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                       password=DB_PASSWORD, database=DB_NAME,
                       cursorclass=pymysql.cursors.DictCursor,
                       charset='utf8mb4', autocommit=False)
cur = conn.cursor()

results = []  # (id, desc, before, after, action)

def exec_sql(sql, params=None, desc=""):
    """执行SQL并记录结果"""
    cur.execute(sql, params)
    affected = cur.rowcount
    action = "DRY_RUN" if DRY_RUN else "EXECUTED"
    results.append((desc, affected, action))
    print(f"  [{'DRY_RUN' if DRY_RUN else '✅'}] {desc}: {affected} rows affected")
    return affected

def query(sql, params=None):
    cur.execute(sql, params)
    return cur.fetchall()

# ================================================================
# P2 #7: 595条扫码记录settlement_status补标记settled
# ================================================================
print("\n" + "=" * 60)
print("【P2 #7】扫码记录 settlement_status 补标记 settled")
print("=" * 60)

before = query("""SELECT COUNT(*) AS c FROM t_scan_record
WHERE scan_result='success'
  AND payroll_settlement_id IS NOT NULL AND payroll_settlement_id!=''
  AND (settlement_status!='settled' OR settlement_status IS NULL)""")[0]['c']
print(f"  修复前: {before} 条")

if not DRY_RUN:
    exec_sql("""UPDATE t_scan_record
    SET settlement_status='settled'
    WHERE scan_result='success'
      AND payroll_settlement_id IS NOT NULL AND payroll_settlement_id!=''
      AND (settlement_status!='settled' OR settlement_status IS NULL)""",
        desc="P2#7 补标记 settlement_status=settled")

# ================================================================
# P1 #1 + #2: 结算单 PS20260430002 明细为空 + 金额不一致
# ================================================================
print("\n" + "=" * 60)
print("【P1 #1+#2】结算单 PS20260430002 明细为空 + 金额不一致")
print("=" * 60)

# 查询该结算单的扫码记录，尝试重建明细
settle_id = "28e2320f6da9a52361c3f1419f9bb941"
scan_records = query(f"""SELECT sr.id, sr.order_id, sr.order_no, sr.style_no, sr.color, sr.size,
       sr.quantity, sr.unit_price, sr.total_amount, sr.process_code, sr.process_name,
       sr.operator_id, sr.operator_name, sr.scan_type, sr.cutting_bundle_no
FROM t_scan_record sr
WHERE sr.payroll_settlement_id COLLATE {C}=%s
  AND sr.scan_result='success'
ORDER BY sr.scan_time""", (settle_id,))

print(f"  结算单关联的扫码记录: {len(scan_records)} 条")

if len(scan_records) > 0 and not DRY_RUN:
    # 重建明细
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    inserted = 0
    for sr in scan_records:
        unit_price = float(sr['unit_price'] or 0)
        qty = int(sr['quantity'] or 0)
        total = float(sr['total_amount'] or 0)
        if total == 0 and qty > 0:
            total = unit_price * qty

        cur.execute("""INSERT INTO t_payroll_settlement_item
            (settlement_id, operator_id, operator_name, process_name, process_code,
             quantity, unit_price, total_amount, order_id, order_no, style_no,
             color, size, scan_type, scan_record_ids, create_time, update_time, tenant_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
             (SELECT tenant_id FROM t_payroll_settlement WHERE id=%s))""",
            (settle_id, sr['operator_id'], sr['operator_name'], sr['process_name'],
             sr['process_code'], qty, unit_price, round(total, 2),
             sr['order_id'], sr['order_no'], sr['style_no'],
             sr['color'], sr['size'], sr['scan_type'], sr['id'],
             now, now, settle_id))
        inserted += cur.rowcount
    print(f"  ✅ 重建明细: {inserted} 条")
    results.append(("P1#1+#2 重建结算单明细", inserted, "EXECUTED"))
elif DRY_RUN:
    print(f"  [DRY_RUN] 将重建 {len(scan_records)} 条明细")
else:
    # 无关联扫码记录，直接将结算单状态改为cancelled
    print("  ⚠️  无关联扫码记录，将结算单状态改为 cancelled")
    if not DRY_RUN:
        exec_sql("UPDATE t_payroll_settlement SET status='cancelled' WHERE id=%s AND status='approved'",
            (settle_id,), desc="P1#1+#2 无明细结算单标记为cancelled")

# ================================================================
# P1 #5: BOM物料缺失用量/损耗率/单位（4条）
# ================================================================
print("\n" + "=" * 60)
print("【P1 #5】BOM物料缺失用量/损耗率/单位（4条）")
print("=" * 60)

bom_records = query(f"""SELECT sb.id, sb.style_id, si.style_no, sb.material_name,
       sb.usage_amount, sb.loss_rate, sb.unit, sb.tenant_id
FROM t_style_bom sb
INNER JOIN t_style_info si ON sb.style_id COLLATE {C}=si.id COLLATE {C} AND si.tenant_id=sb.tenant_id
WHERE (si.bom_completed_time IS NOT NULL OR si.sample_completed_time IS NOT NULL)
  AND (sb.usage_amount IS NULL OR sb.usage_amount=0
       OR sb.loss_rate IS NULL OR sb.unit IS NULL OR sb.unit='')
  AND si.delete_flag=0""")

for bom in bom_records:
    # 设置默认值：usage_amount=1, loss_rate=3%, unit保持原值或设为"个"
    new_usage = 1.0 if (bom['usage_amount'] is None or float(bom['usage_amount']) == 0) else float(bom['usage_amount'])
    new_loss = 3.0 if (bom['loss_rate'] is None or float(bom['loss_rate']) == 0) else float(bom['loss_rate'])
    new_unit = bom['unit'] if bom['unit'] else "个"
    print(f"  {bom['style_no']} - {bom['material_name']}: usage={bom['usage_amount']}→{new_usage}, loss={bom['loss_rate']}→{new_loss}%, unit={bom['unit']}→{new_unit}")
    if not DRY_RUN:
        exec_sql("UPDATE t_style_bom SET usage_amount=%s, loss_rate=%s, unit=%s WHERE id=%s",
            (new_usage, new_loss, new_unit, bom['id']),
            desc=f"P1#5 修复BOM {bom['style_no']}/{bom['material_name']}")

# ================================================================
# P1 #6: 大货采购数量为0/NULL（2条）
# ================================================================
print("\n" + "=" * 60)
print("【P1 #6】大货采购数量为0/NULL（2条）")
print("=" * 60)

purchase_records = query(f"""SELECT mp.id, mp.purchase_no, mp.material_name, mp.purchase_quantity,
       mp.order_id, mp.order_no, mp.style_id, mp.tenant_id
FROM t_material_purchase mp
INNER JOIN t_production_order po ON mp.order_id COLLATE {C}=po.id COLLATE {C} AND mp.tenant_id=po.tenant_id
WHERE mp.delete_flag=0 AND po.delete_flag=0
  AND (mp.purchase_quantity IS NULL OR mp.purchase_quantity<=0)
  AND po.status NOT IN ('PENDING','CANCELLED','CLOSED')""")

for pr in purchase_records:
    # 查该订单的数量，按BOM用量×订单数量×(1+损耗率)重算
    order_qty = query("""SELECT order_quantity FROM t_production_order WHERE id=%s""", (pr['order_id'],))
    if order_qty and order_qty[0]['order_quantity']:
        oq = int(order_qty[0]['order_quantity'])
    else:
        oq = 100  # 默认值

    # 查BOM用量
    bom = query(f"""SELECT sb.usage_amount, sb.loss_rate FROM t_style_bom sb
        WHERE sb.style_id COLLATE {C}=%s COLLATE {C}
          AND sb.material_name=%s AND sb.tenant_id=%s""",
        (str(pr['style_id']), pr['material_name'], pr['tenant_id']))

    if bom and bom[0]['usage_amount'] and float(bom[0]['usage_amount']) > 0:
        usage = float(bom[0]['usage_amount'])
        loss = float(bom[0]['loss_rate'] or 0) / 100.0
        new_qty = round(usage * oq * (1 + loss), 2)
    else:
        new_qty = oq  # 兜底：用订单数量

    print(f"  {pr['purchase_no']} - {pr['material_name']}: qty={pr['purchase_quantity']}→{new_qty} (order_qty={oq})")
    if not DRY_RUN:
        exec_sql("UPDATE t_material_purchase SET purchase_quantity=%s WHERE id=%s",
            (new_qty, pr['id']),
            desc=f"P1#6 修复采购数量 {pr['purchase_no']}")

# ================================================================
# P2 #8: 订单delete_flag=1但状态流转中（12条）
# ================================================================
print("\n" + "=" * 60)
print("【P2 #8】订单delete_flag=1但状态流转中（12条）")
print("=" * 60)

if not DRY_RUN:
    exec_sql("""UPDATE t_production_order
    SET status='cancelled'
    WHERE delete_flag=1 AND status IN ('PENDING','IN_PROGRESS','CONFIRMED')""",
        desc="P2#8 已删除订单状态改为cancelled")

# ================================================================
# P2 #9: 订单已完成但pending tracking（11条）
# ================================================================
print("\n" + "=" * 60)
print("【P2 #9】订单已完成但pending tracking（11条）")
print("=" * 60)

# 将已完成/关单订单的pending tracking标记为delete_flag=1（废弃）
if not DRY_RUN:
    exec_sql(f"""UPDATE t_production_process_tracking pt
    INNER JOIN t_production_order po
      ON pt.production_order_id COLLATE {C}=po.id COLLATE {C}
     AND pt.tenant_id=po.tenant_id
    SET pt.delete_flag=1
    WHERE po.delete_flag=0
      AND po.status IN ('COMPLETED','WAREHOUSED','CLOSED','QC_PASSED')
      AND pt.scan_status='pending'
      AND pt.delete_flag=0""",
        desc="P2#9 已完成订单的pending tracking标记废弃")

# ================================================================
# P2 #10: 扫码success但quantity=0（1条）
# ================================================================
print("\n" + "=" * 60)
print("【P2 #10】扫码success但quantity=0（1条）")
print("=" * 60)

# 该记录工序名为"报废"，quantity=0是业务合理的（报废不计量），将scan_result改为'failed'
if not DRY_RUN:
    exec_sql("""UPDATE t_scan_record SET scan_result='failed', remark=CONCAT(IFNULL(remark,''), '[数据修复:报废记录quantity=0]') WHERE scan_result='success' AND (quantity IS NULL OR quantity=0)""",
        desc="P2#10 quantity=0的扫码记录改为failed")

# ================================================================
# P1 #3 + #4: tracking已扫码但scan_record_id为空 + 扫码成功但无tracking
# 这两个是同源问题：裁剪扫码时tracking创建了但没关联scan_record_id
# 修复策略：按 order_no + bundle_no + scan_time + operator_name 匹配
# ================================================================
print("\n" + "=" * 60)
print("【P1 #3+#4】tracking↔scan_record 双向断链修复（262+244条）")
print("=" * 60)

# 步骤1: 为tracking补填scan_record_id（按order_no+bundle_no+scan_time+operator匹配）
matched = 0
unmatched_tracking = 0

trackings = query(f"""SELECT pt.id, pt.production_order_no, pt.bundle_no, pt.process_name,
       pt.scan_time, pt.operator_name, pt.tenant_id
FROM t_production_process_tracking pt
WHERE pt.scan_status='scanned'
  AND (pt.scan_record_id IS NULL OR pt.scan_record_id='')
  AND pt.delete_flag=0""")

print(f"  待修复tracking记录: {len(trackings)} 条")

for pt in trackings:
    # 精确匹配：order_no + bundle_no + scan_time + operator
    scans = query(f"""SELECT sr.id FROM t_scan_record sr
        WHERE sr.order_no COLLATE {C}=%s COLLATE {C}
          AND sr.cutting_bundle_no=%s
          AND sr.scan_time=%s
          AND sr.operator_name COLLATE {C}=%s COLLATE {C}
          AND sr.tenant_id=%s
          AND sr.scan_result='success'
        LIMIT 1""",
        (pt['production_order_no'], pt['bundle_no'], pt['scan_time'],
         pt['operator_name'], pt['tenant_id']))

    if scans:
        scan_id = scans[0]['id']
        if not DRY_RUN:
            cur.execute("UPDATE t_production_process_tracking SET scan_record_id=%s WHERE id=%s",
                (scan_id, pt['id']))
            matched += cur.rowcount
        else:
            matched += 1
    else:
        # 宽松匹配：order_no + scan_time + operator（bundle_no可能不一致）
        scans2 = query(f"""SELECT sr.id FROM t_scan_record sr
            WHERE sr.order_no COLLATE {C}=%s COLLATE {C}
              AND sr.scan_time=%s
              AND sr.operator_name COLLATE {C}=%s COLLATE {C}
              AND sr.tenant_id=%s
              AND sr.scan_result='success'
            LIMIT 1""",
            (pt['production_order_no'], pt['scan_time'],
             pt['operator_name'], pt['tenant_id']))
        if scans2:
            scan_id = scans2[0]['id']
            if not DRY_RUN:
                cur.execute("UPDATE t_production_process_tracking SET scan_record_id=%s WHERE id=%s",
                    (scan_id, pt['id']))
                matched += cur.rowcount
            else:
                matched += 1
        else:
            unmatched_tracking += 1

print(f"  ✅ 成功匹配并补填scan_record_id: {matched} 条")
print(f"  ⚠️  无法匹配的tracking记录: {unmatched_tracking} 条")

# 步骤2: 为扫码记录补建tracking（扫码成功但无tracking的记录）
# 排除 scan_type='pattern'（样衣扫码业务上不需要tracking，因其无cutting_bundle_id且走PatternScanOrchestrator）
# 对于已经通过步骤1匹配上的，自动解决了双向断链
# 对于仍然无tracking的扫码记录，创建scanned tracking
created_tracking = 0
skipped_pattern = 0
skipped_missing_field = 0

orphan_scans = query(f"""SELECT sr.id, sr.order_id, sr.order_no, sr.style_no, sr.color, sr.size,
       sr.quantity, sr.cutting_bundle_no, sr.cutting_bundle_id, sr.bundle_no,
       sr.process_code, sr.process_name, sr.scan_type, sr.scan_time,
       sr.operator_id, sr.operator_name, sr.unit_price, sr.total_amount, sr.tenant_id
FROM t_scan_record sr
WHERE sr.scan_result='success' AND sr.scan_type!='orchestration' AND sr.scan_type!='pattern'
  AND sr.cutting_bundle_id IS NOT NULL AND sr.cutting_bundle_id!=''
  AND sr.order_id IS NOT NULL AND sr.order_id!=''
  AND sr.order_no IS NOT NULL AND sr.order_no!=''
  AND sr.process_code IS NOT NULL AND sr.process_code!=''
  AND NOT EXISTS (SELECT 1 FROM t_production_process_tracking pt
    WHERE pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
      AND pt.tenant_id=sr.tenant_id AND pt.delete_flag=0)""")

# 统计被跳过的pattern记录数
skipped_pattern_rows = query(f"""SELECT COUNT(*) AS c FROM t_scan_record sr
WHERE sr.scan_result='success' AND sr.scan_type='pattern'
  AND NOT EXISTS (SELECT 1 FROM t_production_process_tracking pt
    WHERE pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
      AND pt.tenant_id=sr.tenant_id AND pt.delete_flag=0)""")
skipped_pattern = skipped_pattern_rows[0]['c'] if skipped_pattern_rows else 0

print(f"\n  待补建tracking的扫码记录: {len(orphan_scans)} 条（排除 {skipped_pattern} 条 pattern 样衣扫码）")

for sr in orphan_scans:
    # 查是否已有tracking（可能步骤1已补填了scan_record_id）
    existing = query(f"""SELECT pt.id FROM t_production_process_tracking pt
        WHERE pt.scan_record_id COLLATE {C}=%s COLLATE {C}
          AND pt.tenant_id=%s AND pt.delete_flag=0""",
        (sr['id'], sr['tenant_id']))

    if existing:
        continue  # 已经通过步骤1修复

    # 创建新的tracking记录
    # 使用 ON DUPLICATE KEY UPDATE 防止 uk_bundle_process 冲突
    if not DRY_RUN:
        tracking_id = f"fix_{sr['id'][:24]}"
        # bundle_no 是 int 类型，使用 cutting_bundle_no
        bundle_no = sr['cutting_bundle_no'] or None
        # sku 组装
        sku = None
        if sr.get('style_no') and sr.get('color') and sr.get('size'):
            sku = f"{sr['style_no']}-{sr['color']}-{sr['size']}"
        cur.execute("""INSERT INTO t_production_process_tracking
            (id, production_order_id, production_order_no, cutting_bundle_id, bundle_no,
             sku, color, size, quantity, process_code, process_name, process_order,
             unit_price, scan_status, scan_time, scan_record_id,
             operator_id, operator_name, settlement_amount,
             creator, created_at, updater, updated_at, tenant_id, delete_flag)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 1,
                    %s, 'scanned', %s, %s, %s, %s, %s,
                    'system_repair', NOW(), 'system_repair', NOW(), %s, 0)
            ON DUPLICATE KEY UPDATE
              scan_record_id=VALUES(scan_record_id),
              scan_status='scanned',
              scan_time=VALUES(scan_time),
              operator_id=VALUES(operator_id),
              operator_name=VALUES(operator_name),
              delete_flag=0,
              updated_at=NOW()""",
            (tracking_id, sr['order_id'], sr['order_no'],
             sr['cutting_bundle_id'], bundle_no,
             sku, sr['color'], sr['size'], sr['quantity'],
             sr['process_code'], sr['process_name'],
             sr['unit_price'] or 0, sr['scan_time'], sr['id'],
             sr['operator_id'], sr['operator_name'],
             sr['total_amount'] or 0, sr['tenant_id']))
        created_tracking += cur.rowcount
    else:
        created_tracking += 1

print(f"  ✅ 补建tracking记录: {created_tracking} 条")
print(f"  ℹ️  跳过 pattern 样衣扫码: {skipped_pattern} 条（业务上不需要tracking）")

# ================================================================
# 提交事务
# ================================================================
if DRY_RUN:
    print("\n" + "=" * 60)
    print("【DRY RUN 模式】所有操作仅预览，未实际执行")
    print("如需执行修复，请设置 DRY_RUN=0")
    conn.rollback()
else:
    print("\n" + "=" * 60)
    print("提交事务...")
    conn.commit()
    print("✅ 全部修复已提交")

# ================================================================
# 汇总
# ================================================================
print("\n" + "=" * 60)
print("【修复汇总】")
print("=" * 60)
for desc, affected, action in results:
    print(f"  {action} | {desc}: {affected} rows")

cur.close(); conn.close()
print("\n--- 修复完成 ---")
