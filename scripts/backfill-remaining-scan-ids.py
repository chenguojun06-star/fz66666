#!/usr/bin/env python3
"""回填剩余83条工资明细的scan_record_ids和tracking_ids"""
import os
import pymysql

DB_CONFIG = {
    'host': '127.0.0.1', 'port': 3308, 'user': 'root',
    'password': os.environ.get('DB_PASSWORD', 'changeme'),
    'database': 'fashion_supplychain', 'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor
}

C = 'utf8mb4_unicode_ci'

def main():
    conn = pymysql.connect(**DB_CONFIG)
    cur = conn.cursor()

    # 查询所有scan_record_ids为空且process_code不为空的工资明细
    cur.execute(f"""SELECT psi.id, psi.settlement_id, psi.operator_id, psi.process_code,
        psi.order_no, psi.scan_type, ps.tenant_id
        FROM t_payroll_settlement_item psi
        JOIN t_payroll_settlement ps ON psi.settlement_id=ps.id
        WHERE (psi.scan_record_ids IS NULL OR psi.scan_record_ids='')
          AND psi.process_code IS NOT NULL AND psi.process_code!=''""")
    items = cur.fetchall()
    print(f"待处理: {len(items)}条")

    updated = 0
    no_match = 0
    for item in items:
        # 匹配扫码记录
        cur.execute(f"""SELECT sr.id AS scan_id, pt.id AS tracking_id
            FROM t_scan_record sr
            LEFT JOIN t_production_process_tracking pt
              ON pt.scan_record_id COLLATE {C}=sr.id COLLATE {C}
              AND pt.tenant_id=sr.tenant_id AND pt.delete_flag=0
            WHERE sr.order_no COLLATE {C}=%s COLLATE {C}
              AND sr.operator_id COLLATE {C}=%s COLLATE {C}
              AND sr.process_code COLLATE {C}=%s COLLATE {C}
              AND sr.scan_result='success'
              AND sr.tenant_id=%s""",
            (item['order_no'], item['operator_id'], item['process_code'], item['tenant_id']))
        scans = cur.fetchall()

        if scans:
            scan_ids = ','.join([str(s['scan_id']) for s in scans if s['scan_id']])
            tracking_ids = ','.join([str(s['tracking_id']) for s in scans if s['tracking_id']])
            cur.execute("UPDATE t_payroll_settlement_item SET scan_record_ids=%s, tracking_ids=%s, update_time=NOW() WHERE id=%s",
                (scan_ids if scan_ids else None, tracking_ids if tracking_ids else None, item['id']))
            updated += cur.rowcount
        else:
            no_match += 1

    conn.commit()
    print(f"已更新: {updated}条")
    print(f"无匹配扫码: {no_match}条")

    # 验证结果
    cur.execute("""SELECT COUNT(*) AS c FROM t_payroll_settlement_item
        WHERE (scan_record_ids IS NULL OR scan_record_ids='')""")
    remaining = cur.fetchone()['c']
    print(f"剩余空值: {remaining}条")

    conn.close()

if __name__ == '__main__':
    main()
