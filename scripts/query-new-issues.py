#!/usr/bin/env python3
"""查询5个新问题的明细数据"""
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

    print("=" * 70)
    print("【B5】采购单状态非法 - 3条")
    print("=" * 70)
    cur.execute("""SELECT id, status, order_no, create_time, tenant_id
        FROM t_material_purchase
        WHERE delete_flag=0 AND status NOT IN
          ('pending','purchasing','partial_received','received','completed','cancelled','awaiting_confirm')
        LIMIT 10""")
    for r in cur.fetchall():
        print(f"  id={r['id']} status={r['status']} order={r['order_no']} create={r['create_time']}")

    print("\n" + "=" * 70)
    print("【C1】成功扫码-订单断链 - 42条")
    print("=" * 70)
    # 按scan_type分布
    cur.execute("""SELECT scan_type, COUNT(*) AS c FROM t_scan_record sr
        LEFT JOIN t_production_order po ON sr.order_no COLLATE utf8mb4_unicode_ci=po.order_no COLLATE utf8mb4_unicode_ci
        WHERE sr.scan_result='success' AND po.id IS NULL
        GROUP BY sr.scan_type""")
    print("按scan_type分布:")
    for r in cur.fetchall():
        print(f"  {r['scan_type']}: {r['c']}条")

    # 样本
    cur.execute(f"""SELECT sr.id, sr.scan_type, sr.order_no, sr.bundle_no, sr.process_code,
        sr.operator_id, sr.scan_time, sr.tenant_id
        FROM t_scan_record sr
        LEFT JOIN t_production_order po ON sr.order_no COLLATE {C}=po.order_no COLLATE {C}
        WHERE sr.scan_result='success' AND po.id IS NULL
        LIMIT 10""")
    print("\n样本（前10条）:")
    for r in cur.fetchall():
        print(f"  id={r['id']} type={r['scan_type']} order={r['order_no']} bundle={r['bundle_no']} proc={r['process_code']} time={r['scan_time']}")

    print("\n" + "=" * 70)
    print("【C3】扫码类型非法 - 1种 'orchestration'")
    print("=" * 70)
    cur.execute("""SELECT id, scan_type, order_no, bundle_no, scan_time, scan_result, tenant_id
        FROM t_scan_record WHERE scan_type='orchestration' LIMIT 20""")
    rows = cur.fetchall()
    print(f"orchestration类型扫码总数: {len(rows)}条")
    for r in rows[:5]:
        print(f"  id={r['id']} order={r['order_no']} bundle={r['bundle_no']} result={r['scan_result']} time={r['scan_time']}")

    print("\n" + "=" * 70)
    print("【A11】账单金额为0 - 6条")
    print("=" * 70)
    cur.execute("""SELECT id, source_type, source_id, bill_type, amount, counterparty_type,
        counterparty_id, create_time, tenant_id
        FROM t_bill_aggregation WHERE delete_flag=0 AND amount=0 LIMIT 10""")
    for r in cur.fetchall():
        print(f"  id={r['id']} type={r['source_type']} source={r['source_id']} bill_type={r['bill_type']} cp_type={r['counterparty_type']} create={r['create_time']}")

    print("\n" + "=" * 70)
    print("【F1】订单-款式断链 - 3条")
    print("=" * 70)
    cur.execute(f"""SELECT po.id, po.order_no, po.style_id, po.status, po.create_time, po.tenant_id
        FROM t_production_order po
        LEFT JOIN t_style_info si ON po.style_id COLLATE {C}=si.id COLLATE {C}
        WHERE po.delete_flag=0 AND po.style_id IS NOT NULL AND po.style_id!=''
          AND si.id IS NULL LIMIT 10""")
    for r in cur.fetchall():
        print(f"  id={r['id']} order={r['order_no']} style_id={r['style_id']} status={r['status']} create={r['create_time']}")

    conn.close()

if __name__ == '__main__':
    main()
