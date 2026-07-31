#!/usr/bin/env python3
"""查询scan_record_ids为空的工资明细分布，判断是否可修复"""
import os
import pymysql

DB_CONFIG = {
    'host': '127.0.0.1', 'port': 3308, 'user': 'root',
    'password': os.environ.get('DB_PASSWORD', 'changeme'),
    'database': 'fashion_supplychain', 'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

def main():
    conn = pymysql.connect(**DB_CONFIG)
    cur = conn.cursor()

    # 1. 按scan_type分布
    cur.execute("""SELECT scan_type, COUNT(*) AS c
        FROM t_payroll_settlement_item
        WHERE (scan_record_ids IS NULL OR scan_record_ids='')
        GROUP BY scan_type""")
    print("=== 按scan_type分布 ===")
    for r in cur.fetchall():
        print(f"  {r['scan_type']}: {r['c']}条")

    # 2. 按结算单状态分布
    cur.execute("""SELECT ps.status, COUNT(*) AS c
        FROM t_payroll_settlement_item psi
        JOIN t_payroll_settlement ps ON psi.settlement_id=ps.id
        WHERE (psi.scan_record_ids IS NULL OR psi.scan_record_ids='')
        GROUP BY ps.status""")
    print("\n=== 按结算单状态分布 ===")
    for r in cur.fetchall():
        print(f"  status={r['status']}: {r['c']}条")

    # 3. 试图匹配扫码记录（看是否能修复）
    cur.execute("""SELECT psi.id, psi.settlement_id, psi.operator_id, psi.process_code,
        psi.order_no, psi.scan_type, ps.status, ps.tenant_id
        FROM t_payroll_settlement_item psi
        JOIN t_payroll_settlement ps ON psi.settlement_id=ps.id
        WHERE (psi.scan_record_ids IS NULL OR psi.scan_record_ids='')
        LIMIT 10""")
    samples = cur.fetchall()
    print(f"\n=== 样本（前10条）===")
    for s in samples:
        print(f"  item_id={s['id']} settle_id={s['settlement_id']} type={s['scan_type']} "
              f"order={s['order_no']} op={s['operator_id']} proc={s['process_code']} "
              f"settle_status={s['status']}")

    # 4. 尝试匹配扫码记录
    matched = 0
    total = 0
    for s in samples:
        total += 1
        if not s['process_code']:
            print(f"  ✗ item_id={s['id']} process_code为空，跳过匹配")
            continue
        cur.execute("""SELECT sr.id AS scan_id FROM t_scan_record sr
            WHERE sr.order_no COLLATE utf8mb4_unicode_ci=%s COLLATE utf8mb4_unicode_ci
              AND sr.operator_id COLLATE utf8mb4_unicode_ci=%s COLLATE utf8mb4_unicode_ci
              AND sr.process_code COLLATE utf8mb4_unicode_ci=%s COLLATE utf8mb4_unicode_ci
              AND sr.scan_result='success' AND sr.tenant_id=%s""",
            (s['order_no'], s['operator_id'], s['process_code'], s['tenant_id']))
        scans = cur.fetchall()
        if scans:
            matched += 1
            print(f"  ✓ item_id={s['id']} 可匹配 {len(scans)} 条扫码")
        else:
            print(f"  ✗ item_id={s['id']} 无匹配扫码（order={s['order_no']}, op={s['operator_id']}, proc={s['process_code']}）")

    # 5. 整体可修复数估算（排除process_code为空的）
    cur.execute("""SELECT COUNT(*) AS c FROM t_payroll_settlement_item psi
        WHERE (psi.scan_record_ids IS NULL OR psi.scan_record_ids='')""")
    total_empty = cur.fetchone()['c']

    cur.execute("""SELECT COUNT(DISTINCT psi.id) AS c
        FROM t_payroll_settlement_item psi
        JOIN t_payroll_settlement ps ON psi.settlement_id=ps.id
        WHERE (psi.scan_record_ids IS NULL OR psi.scan_record_ids='')
          AND psi.process_code IS NOT NULL AND psi.process_code!=''
          AND EXISTS (
            SELECT 1 FROM t_scan_record sr
            WHERE sr.order_no COLLATE utf8mb4_unicode_ci=psi.order_no COLLATE utf8mb4_unicode_ci
              AND sr.operator_id COLLATE utf8mb4_unicode_ci=psi.operator_id COLLATE utf8mb4_unicode_ci
              AND sr.process_code COLLATE utf8mb4_unicode_ci=psi.process_code COLLATE utf8mb4_unicode_ci
              AND sr.scan_result='success' AND sr.tenant_id=ps.tenant_id
          )""")
    repairable = cur.fetchone()['c']

    cur.execute("""SELECT COUNT(*) AS c FROM t_payroll_settlement_item psi
        WHERE (psi.scan_record_ids IS NULL OR psi.scan_record_ids='')
          AND (psi.process_code IS NULL OR psi.process_code='')""")
    empty_proc = cur.fetchone()['c']

    print(f"\n=== 总结 ===")
    print(f"  总空值: {total_empty}条")
    print(f"  process_code为空(无法匹配): {empty_proc}条")
    print(f"  可修复(有匹配扫码): {repairable}条")
    print(f"  无法修复(无匹配扫码): {total_empty - empty_proc - repairable}条")

    conn.close()

if __name__ == '__main__':
    main()
