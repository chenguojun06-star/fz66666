#!/usr/bin/env python3
"""
回填 t_payroll_settlement_item.scan_record_ids 和 tracking_ids
通过 order_no + operator_id + process_code 匹配扫码记录
"""
import pymysql, os
from datetime import datetime

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")
C = "utf8mb4_unicode_ci"

conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                       password=DB_PASSWORD, database=DB_NAME,
                       cursorclass=pymysql.cursors.DictCursor,
                       charset='utf8mb4', autocommit=False)
cur = conn.cursor()

# 查询所有 scan_record_ids 为空的工资明细
cur.execute(f"""SELECT psi.id, psi.settlement_id, psi.order_no, psi.operator_id,
       psi.process_code, psi.process_name, psi.tenant_id
FROM t_payroll_settlement_item psi
WHERE (psi.scan_record_ids IS NULL OR psi.scan_record_ids='')
  AND psi.process_name IS NOT NULL
  AND psi.order_no IS NOT NULL AND psi.order_no!=''
  AND psi.operator_id IS NOT NULL AND psi.operator_id!=''
  AND psi.process_code IS NOT NULL AND psi.process_code!=''""")
items = cur.fetchall()
print(f"待回填工资明细: {len(items)}条")

updated = 0
no_match = 0
for item in items:
    # 匹配同结算单下的扫码记录
    cur.execute(f"""SELECT sr.id AS scan_id, pt.id AS tracking_id
FROM t_scan_record sr
LEFT JOIN t_production_process_tracking pt
  ON pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
  AND pt.tenant_id=sr.tenant_id AND pt.delete_flag=0
WHERE sr.order_no COLLATE {C}=%s COLLATE {C}
  AND sr.operator_id COLLATE {C}=%s COLLATE {C}
  AND sr.process_code COLLATE {C}=%s COLLATE {C}
  AND sr.scan_result='success'
  AND sr.payroll_settlement_id COLLATE {C}=%s COLLATE {C}
  AND sr.tenant_id=%s""",
        (item['order_no'], item['operator_id'], item['process_code'],
         item['settlement_id'], item['tenant_id']))
    scans = cur.fetchall()

    if scans:
        scan_ids = ','.join([s['scan_id'] for s in scans if s['scan_id']])
        tracking_ids = ','.join([s['tracking_id'] for s in scans if s['tracking_id']])
        cur.execute("UPDATE t_payroll_settlement_item SET scan_record_ids=%s, tracking_ids=%s, update_time=NOW() WHERE id=%s",
            (scan_ids if scan_ids else None, tracking_ids if tracking_ids else None, item['id']))
        updated += cur.rowcount
    else:
        no_match += 1

conn.commit()
print(f"✅ 已回填: {updated}条")
print(f"⚠️  无法匹配: {no_match}条（历史数据，扫码记录可能已清理）")

cur.close(); conn.close()
print("\n--- 回填完成 ---")
