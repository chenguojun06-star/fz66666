#!/usr/bin/env python3
"""查询全系统数据问题的明细数据，为修复提供依据"""

import pymysql, os, json

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")
C = "utf8mb4_unicode_ci"

conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                       password=DB_PASSWORD, database=DB_NAME,
                       cursorclass=pymysql.cursors.DictCursor, charset='utf8mb4')
cur = conn.cursor()

def Q(sql):
    cur.execute(sql)
    return cur.fetchall()

print("=== P1 #1: 明细为空的结算单 ===")
rows = Q(f"""SELECT ps.id, ps.settlement_no, ps.status, ps.total_amount, ps.total_quantity,
       ps.order_id, ps.order_no, ps.tenant_id, ps.create_time
FROM t_payroll_settlement ps
WHERE ps.status='approved' AND NOT EXISTS
  (SELECT 1 FROM t_payroll_settlement_item psi
    WHERE psi.settlement_id COLLATE {C}=ps.id COLLATE {C})""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

print("\n=== P1 #2: 金额不一致的结算单 ===")
rows = Q(f"""SELECT ps.id, ps.settlement_no, ps.total_amount AS settle_total,
       COALESCE(SUM(psi.total_amount),0) AS items_sum,
       ABS(ps.total_amount - COALESCE(SUM(psi.total_amount),0)) AS diff,
       ps.tenant_id
FROM t_payroll_settlement ps
LEFT JOIN t_payroll_settlement_item psi ON psi.settlement_id COLLATE {C}=ps.id COLLATE {C}
WHERE ps.status='approved' GROUP BY ps.id, ps.total_amount
HAVING diff > 0.01""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

print("\n=== P1 #5: BOM缺失用量的物料 ===")
rows = Q(f"""SELECT sb.id, sb.style_id, si.style_no, sb.material_name,
       sb.usage_amount, sb.loss_rate, sb.unit, sb.tenant_id
FROM t_style_bom sb
INNER JOIN t_style_info si ON sb.style_id COLLATE {C}=si.id COLLATE {C} AND si.tenant_id=sb.tenant_id
WHERE (si.bom_completed_time IS NOT NULL OR si.sample_completed_time IS NOT NULL)
  AND (sb.usage_amount IS NULL OR sb.usage_amount=0
       OR sb.loss_rate IS NULL OR sb.unit IS NULL OR sb.unit='')
  AND si.delete_flag=0""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

print("\n=== P1 #6: 大货采购数量为0/NULL ===")
rows = Q(f"""SELECT mp.id, mp.purchase_no, mp.material_name, mp.purchase_quantity,
       mp.order_id, mp.order_no, mp.status, mp.tenant_id
FROM t_material_purchase mp
INNER JOIN t_production_order po ON mp.order_id COLLATE {C}=po.id COLLATE {C} AND mp.tenant_id=po.tenant_id
WHERE mp.delete_flag=0 AND po.delete_flag=0
  AND (mp.purchase_quantity IS NULL OR mp.purchase_quantity<=0)
  AND po.status NOT IN ('PENDING','CANCELLED','CLOSED')""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

print("\n=== P2 #8: delete_flag=1但状态流转中 ===")
rows = Q("""SELECT id, order_no, status, delete_flag, tenant_id
FROM t_production_order
WHERE delete_flag=1 AND status IN ('PENDING','IN_PROGRESS','CONFIRMED')""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

print("\n=== P2 #9: 已完成订单但pending tracking ===")
rows = Q(f"""SELECT DISTINCT po.id, po.order_no, po.status, po.tenant_id
FROM t_production_order po
INNER JOIN t_production_process_tracking pt
  ON pt.production_order_id COLLATE {C}=po.id COLLATE {C} AND pt.tenant_id=po.tenant_id
WHERE po.delete_flag=0 AND po.status IN ('COMPLETED','WAREHOUSED','CLOSED','QC_PASSED')
  AND pt.scan_status='pending' AND pt.delete_flag=0""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

print("\n=== P2 #10: 扫码success但quantity=0 ===")
rows = Q("""SELECT id, order_no, scan_code, process_name, quantity, scan_result, scan_time, tenant_id
FROM t_scan_record WHERE scan_result='success' AND (quantity IS NULL OR quantity=0)""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

print("\n=== P1 #3: tracking已扫码但scan_record_id为空（前20条）===")
rows = Q("""SELECT id, production_order_id, production_order_no, bundle_no, process_code, process_name,
       scan_status, scan_time, operator_name, tenant_id
FROM t_production_process_tracking
WHERE scan_status='scanned' AND (scan_record_id IS NULL OR scan_record_id='')
  AND delete_flag=0 LIMIT 20""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

print(f"\n=== P1 #3 统计: 按订单分组 ===")
rows = Q("""SELECT production_order_no, COUNT(*) AS cnt
FROM t_production_process_tracking
WHERE scan_status='scanned' AND (scan_record_id IS NULL OR scan_record_id='')
  AND delete_flag=0
GROUP BY production_order_no ORDER BY cnt DESC LIMIT 20""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

print(f"\n=== P1 #4: 扫码成功但未生成tracking（前20条）===")
rows = Q(f"""SELECT sr.id, sr.order_no, sr.process_name, sr.scan_time, sr.operator_name,
       sr.cutting_bundle_no, sr.scan_type, sr.tenant_id
FROM t_scan_record sr
WHERE sr.scan_result='success' AND sr.scan_type!='orchestration'
  AND NOT EXISTS (SELECT 1 FROM t_production_process_tracking pt
    WHERE pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
      AND pt.tenant_id=sr.tenant_id AND pt.delete_flag=0)
LIMIT 20""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

print(f"\n=== P1 #4 统计: 按订单分组 ===")
rows = Q(f"""SELECT sr.order_no, COUNT(*) AS cnt
FROM t_scan_record sr
WHERE sr.scan_result='success' AND sr.scan_type!='orchestration'
  AND NOT EXISTS (SELECT 1 FROM t_production_process_tracking pt
    WHERE pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
      AND pt.tenant_id=sr.tenant_id AND pt.delete_flag=0)
GROUP BY sr.order_no ORDER BY cnt DESC LIMIT 20""")
for r in rows:
    print(json.dumps(r, default=str, ensure_ascii=False))

cur.close(); conn.close()
