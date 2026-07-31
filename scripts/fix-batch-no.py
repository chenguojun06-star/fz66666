#!/usr/bin/env python3
"""修复729条tracking的settled_batch_no（用真实payroll_settlement_id替换虚拟批次号）"""
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

print("=" * 60)
print("【修复】729条tracking的settled_batch_no用真实payroll_settlement_id替换")
print("=" * 60)

# 查询修复前数量
cur.execute(f"""SELECT COUNT(*) AS c FROM t_production_process_tracking pt
WHERE pt.is_settled=1
  AND pt.settled_batch_no LIKE 'auto_fix_%'
  AND pt.delete_flag=0""")
before = cur.fetchone()['c']
print(f"  修复前: {before} 条")

# 通过scan_record_id关联到t_scan_record.payroll_settlement_id，用真实的结算单ID作为batch_no
cur.execute(f"""UPDATE t_production_process_tracking pt
INNER JOIN t_scan_record sr
  ON pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
  AND pt.tenant_id=sr.tenant_id
SET pt.settled_batch_no=sr.payroll_settlement_id,
    pt.updated_at=NOW()
WHERE pt.is_settled=1
  AND pt.settled_batch_no LIKE 'auto_fix_%'
  AND pt.delete_flag=0
  AND sr.payroll_settlement_id IS NOT NULL
  AND sr.payroll_settlement_id!=''""")
affected = cur.rowcount
print(f"  ✅ 已更新: {affected} 条")

# 检查是否还有未更新的（payroll_settlement_id为空的）
cur.execute(f"""SELECT COUNT(*) AS c FROM t_production_process_tracking pt
INNER JOIN t_scan_record sr
  ON pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
  AND pt.tenant_id=sr.tenant_id
WHERE pt.is_settled=1
  AND pt.settled_batch_no LIKE 'auto_fix_%'
  AND pt.delete_flag=0
  AND (sr.payroll_settlement_id IS NULL OR sr.payroll_settlement_id='')""")
remaining = cur.fetchone()['c']
print(f"  剩余payroll_settlement_id为空的: {remaining} 条")

# 对于payroll_settlement_id为空的，用settled_at时间生成批次号
if remaining > 0:
    cur.execute(f"""UPDATE t_production_process_tracking pt
    INNER JOIN t_scan_record sr
      ON pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
      AND pt.tenant_id=sr.tenant_id
    SET pt.settled_batch_no=CONCAT('manual_', DATE_FORMAT(pt.settled_at, '%Y%m%d')),
        pt.updated_at=NOW()
    WHERE pt.is_settled=1
      AND pt.settled_batch_no LIKE 'auto_fix_%'
      AND pt.delete_flag=0
      AND (sr.payroll_settlement_id IS NULL OR sr.payroll_settlement_id='')""")
    affected2 = cur.rowcount
    print(f"  ✅ 用时间批次号兜底: {affected2} 条")

conn.commit()
print("\n✅ 全部修复已提交")

# 验证
print("\n" + "=" * 60)
print("【验证】")
print("=" * 60)
cur.execute(f"""SELECT COUNT(*) AS c FROM t_production_process_tracking pt
WHERE pt.is_settled=1
  AND pt.settled_batch_no LIKE 'auto_fix_%'
  AND pt.delete_flag=0""")
r = cur.fetchone()
print(f"仍使用auto_fix批次号的: {r['c']} 条")

cur.close(); conn.close()
