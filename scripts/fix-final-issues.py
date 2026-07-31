#!/usr/bin/env python3
"""修复剩余24条异常tracking + 2条无bundle_id的cutting扫码"""
import pymysql, os

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

# ================================================================
# 修复1: 24条异常tracking标记废弃
# 原因：process_code='06'非有效工序编码，且无对应扫码记录或工序不匹配
# 这些是历史测试数据/旧版工序编码遗留
# ================================================================
print("=" * 60)
print("【修复1】24条异常tracking标记废弃")
print("=" * 60)

cur.execute(f"""SELECT COUNT(*) AS c FROM t_production_process_tracking pt
WHERE pt.scan_status='scanned'
  AND (pt.scan_record_id IS NULL OR pt.scan_record_id='')
  AND pt.delete_flag=0""")
before = cur.fetchone()['c']
print(f"  修复前: {before} 条")

cur.execute("""UPDATE t_production_process_tracking
SET delete_flag=1,
    updated_at=NOW(),
    updater='system_repair'
WHERE scan_status='scanned'
  AND (scan_record_id IS NULL OR scan_record_id='')
  AND delete_flag=0""")
affected = cur.rowcount
print(f"  ✅ 已标记废弃: {affected} 条")

# ================================================================
# 修复2: 2条无cutting_bundle_id的cutting扫码补填bundle_id
# ================================================================
print("\n" + "=" * 60)
print("【修复2】2条无cutting_bundle_id的cutting扫码补填")
print("=" * 60)

# 记录1: PO20260315001 - color=白色 size=S，匹配到 bundle 84dc3ffdec164f58
cur.execute(f"""UPDATE t_scan_record sr
INNER JOIN t_cutting_bundle cb
  ON cb.production_order_id COLLATE {C}=sr.order_id COLLATE {C}
  AND cb.tenant_id=sr.tenant_id
  AND cb.color COLLATE {C}=sr.color COLLATE {C}
  AND cb.size COLLATE {C}=sr.size COLLATE {C}
SET sr.cutting_bundle_id=cb.id,
    sr.cutting_bundle_no=cb.bundle_no,
    sr.update_time=NOW()
WHERE sr.id='fdb03888eb7506ca017a0dfd6d60bead'
  AND (sr.cutting_bundle_id IS NULL OR sr.cutting_bundle_id='')""")
affected1 = cur.rowcount
print(f"  ✅ PO20260315001 补填bundle_id: {affected1} 条")

# 记录2: PO20260219002 - size="S,M,L,XL,XXL"多码合并，无法精确匹配
# 这种情况是旧版多码合并扫码，标记remark说明
cur.execute("""UPDATE t_scan_record
SET remark=CONCAT(IFNULL(remark,''), '[数据修复:多码合并扫码无单一bundle_id]'),
    update_time=NOW()
WHERE id='1a54297e4fe87a7ff2a4665c2aecb15d'""")
affected2 = cur.rowcount
print(f"  ℹ️  PO20260219002 多码合并扫码标记remark: {affected2} 条（无法补填bundle_id）")

# ================================================================
# 提交
# ================================================================
conn.commit()
print("\n✅ 全部修复已提交")

# ================================================================
# 最终验证
# ================================================================
print("\n" + "=" * 60)
print("【最终验证】")
print("=" * 60)

cur.execute(f"""SELECT COUNT(*) AS c FROM t_production_process_tracking pt
WHERE pt.scan_status='scanned'
  AND (pt.scan_record_id IS NULL OR pt.scan_record_id='')
  AND pt.delete_flag=0""")
r = cur.fetchone()
print(f"tracking已扫码但scan_record_id为空: {r['c']} 条")

cur.execute(f"""SELECT COUNT(*) AS c FROM t_scan_record sr
WHERE sr.scan_result='success' AND sr.scan_type!='orchestration' AND sr.scan_type!='pattern'
  AND sr.cutting_bundle_id IS NOT NULL AND sr.cutting_bundle_id!=''
  AND NOT EXISTS (SELECT 1 FROM t_production_process_tracking pt
    WHERE pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
      AND pt.tenant_id=sr.tenant_id AND pt.delete_flag=0)""")
r = cur.fetchone()
print(f"非pattern扫码无tracking（有bundle_id）: {r['c']} 条")

cur.execute(f"""SELECT COUNT(*) AS c
FROM t_scan_record sr
INNER JOIN t_production_process_tracking pt
  ON pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
  AND pt.tenant_id=sr.tenant_id AND pt.delete_flag=0
WHERE sr.scan_result='success'
  AND sr.payroll_settlement_id IS NOT NULL AND sr.payroll_settlement_id!=''
  AND sr.settlement_status='settled'
  AND (pt.is_settled=0 OR pt.is_settled IS NULL)""")
r = cur.fetchone()
print(f"settled未标记tracking.is_settled: {r['c']} 条")

cur.close(); conn.close()
print("\n--- 修复完成 ---")
