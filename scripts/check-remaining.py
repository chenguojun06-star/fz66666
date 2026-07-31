#!/usr/bin/env python3
"""检查剩余24条无scan_record_id的tracking + 2条无bundle_id的cutting扫码"""
import pymysql, os, json

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")
C = "utf8mb4_unicode_ci"

conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                       password=DB_PASSWORD, database=DB_NAME,
                       cursorclass=pymysql.cursors.DictCursor)
cur = conn.cursor()

print("=== 24条无scan_record_id的tracking详情 ===")
cur.execute(f"""SELECT pt.id, pt.production_order_no, pt.bundle_no, pt.process_name,
       pt.process_code, pt.scan_time, pt.operator_name, pt.tenant_id,
       pt.cutting_bundle_id, pt.is_settled, pt.scan_status
FROM t_production_process_tracking pt
WHERE pt.scan_status='scanned'
  AND (pt.scan_record_id IS NULL OR pt.scan_record_id='')
  AND pt.delete_flag=0
ORDER BY pt.scan_time DESC""")
tracking_rows = cur.fetchall()
no_scan_for_bundle = 0
has_scan_but_mismatch = 0
for r in tracking_rows:
    cur.execute(f"""SELECT sr.id, sr.scan_time, sr.operator_name, sr.scan_result, sr.process_name
        FROM t_scan_record sr
        WHERE sr.cutting_bundle_id COLLATE {C}=%s COLLATE {C}
          AND sr.tenant_id=%s
        ORDER BY sr.scan_time DESC LIMIT 3""",
        (r['cutting_bundle_id'], r['tenant_id']))
    scans = cur.fetchall()
    if scans:
        has_scan_but_mismatch += 1
        print(f"\n  [有扫码但不匹配] tracking={r['id'][:16]}... order={r['production_order_no']} "
              f"proc={r['process_code']} time={r['scan_time']} op={r['operator_name']}")
        for s in scans:
            print(f"    scan={s['id'][:16]}... time={s['scan_time']} "
                  f"op={s['operator_name']} result={s['scan_result']} proc={s['process_name']}")
    else:
        no_scan_for_bundle += 1
        print(f"  [无扫码记录] tracking={r['id'][:16]}... order={r['production_order_no']} "
              f"proc={r['process_code']} time={r['scan_time']} op={r['operator_name']}")

print(f"\n汇总: 无扫码记录的bundle={no_scan_for_bundle}, 有扫码但不匹配={has_scan_but_mismatch}")

print("\n\n=== 2条无cutting_bundle_id的cutting扫码详情 ===")
cur.execute(f"""SELECT sr.id, sr.order_id, sr.order_no, sr.style_no, sr.color, sr.size,
       sr.quantity, sr.cutting_bundle_no, sr.cutting_bundle_id, sr.bundle_no,
       sr.process_code, sr.process_name, sr.scan_type, sr.scan_time,
       sr.operator_name, sr.tenant_id, sr.scan_result, sr.remark
FROM t_scan_record sr
WHERE sr.scan_result='success' AND sr.scan_type='cutting'
  AND (sr.cutting_bundle_id IS NULL OR sr.cutting_bundle_id='')
  AND NOT EXISTS (SELECT 1 FROM t_production_process_tracking pt
    WHERE pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
      AND pt.tenant_id=sr.tenant_id AND pt.delete_flag=0)""")
for r in cur.fetchall():
    print(json.dumps({k: str(v) for k, v in r.items()}, ensure_ascii=False))
    cur.execute(f"""SELECT cb.id, cb.bundle_no, cb.color, cb.size, cb.quantity
        FROM t_cutting_bundle cb
        WHERE cb.production_order_id COLLATE {C}=%s COLLATE {C}
          AND cb.tenant_id=%s LIMIT 5""",
        (r['order_id'], r['tenant_id']))
    bundles = cur.fetchall()
    print(f"    该订单的裁剪分菲: {len(bundles)} 条")
    for b in bundles:
        print(f"      bundle_id={b['id'][:16]}... no={b['bundle_no']} "
              f"color={b['color']} size={b['size']} qty={b['quantity']}")

cur.close(); conn.close()
