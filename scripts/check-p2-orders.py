#!/usr/bin/env python3
"""核查P2问题：49条订单无制版/无工序价格配置的业务情况"""
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

    # 1. 无制版记录的订单状态分布
    cur.execute("""SELECT po.status, COUNT(*) AS c
        FROM t_production_order po
        LEFT JOIN t_pattern_production pp ON pp.production_order_id=po.id AND pp.tenant_id=po.tenant_id
        WHERE po.delete_flag=0 AND po.status!='pending_confirmation'
          AND pp.id IS NULL
        GROUP BY po.status""")
    print("=== 无制版记录的订单状态分布 ===")
    for r in cur.fetchall():
        print(f"  status={r['status']}: {r['c']}条")

    # 2. 无工序价格配置的订单状态分布
    cur.execute("""SELECT po.status, COUNT(*) AS c
        FROM t_production_order po
        LEFT JOIN t_process_price_adjustment pa ON pa.order_no=po.order_no AND pa.tenant_id=po.tenant_id
        WHERE po.delete_flag=0 AND po.status!='pending_confirmation'
          AND pa.id IS NULL
        GROUP BY po.status""")
    print("\n=== 无工序价格配置的订单状态分布 ===")
    for r in cur.fetchall():
        print(f"  status={r['status']}: {r['c']}条")

    # 3. 两个问题的交集
    cur.execute("""SELECT COUNT(*) AS c
        FROM t_production_order po
        LEFT JOIN t_pattern_production pp ON pp.production_order_id=po.id AND pp.tenant_id=po.tenant_id
        LEFT JOIN t_process_price_adjustment pa ON pa.order_no=po.order_no AND pa.tenant_id=po.tenant_id
        WHERE po.delete_flag=0 AND po.status!='pending_confirmation'
          AND pp.id IS NULL AND pa.id IS NULL""")
    both = cur.fetchone()['c']
    print(f"\n=== 同时无制版+无工序价格的订单: {both}条 ===")

    # 4. 样本
    cur.execute("""SELECT po.id, po.order_no, po.status, po.style_id, po.create_time
        FROM t_production_order po
        LEFT JOIN t_pattern_production pp ON pp.production_order_id=po.id AND pp.tenant_id=po.tenant_id
        LEFT JOIN t_process_price_adjustment pa ON pa.order_no=po.order_no AND pa.tenant_id=po.tenant_id
        WHERE po.delete_flag=0 AND po.status!='pending_confirmation'
          AND pp.id IS NULL AND pa.id IS NULL
        LIMIT 5""")
    print("\n=== 样本（前5条）===")
    for s in cur.fetchall():
        print(f"  order_no={s['order_no']} status={s['status']} style_id={s['style_id']} create_time={s['create_time']}")

    conn.close()

if __name__ == '__main__':
    main()
