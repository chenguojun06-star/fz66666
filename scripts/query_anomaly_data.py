#!/usr/bin/env python3
"""
查询数据一致性校验发现的异常数据
"""

import pymysql
import os

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")

conn = pymysql.connect(
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
    cursorclass=pymysql.cursors.DictCursor
)

cursor = conn.cursor()

# 1. 查询 t_cutting_bundle 的 orphan 数据
print("\n=== t_cutting_bundle orphan 数据 ===")
cursor.execute("""
    SELECT cb.id, cb.production_order_id, cb.style_no, cb.color, cb.size, cb.quantity, cb.tenant_id
    FROM t_cutting_bundle cb
    LEFT JOIN t_production_order po ON cb.production_order_id = po.id
    WHERE cb.production_order_id IS NOT NULL AND po.id IS NULL
    LIMIT 10
""")
for row in cursor.fetchall():
    print(f"ID: {row['id']}, OrderID: {row['production_order_id']}, Style: {row['style_no']}, Color: {row['color']}, Size: {row['size']}, Qty: {row['quantity']}, Tenant: {row['tenant_id']}")

# 2. 查询 t_production_order 的 delete_flag 异常数据
print("\n=== t_production_order delete_flag 异常 ===")
cursor.execute("""
    SELECT id, order_no, status, delete_flag, tenant_id
    FROM t_production_order
    WHERE delete_flag = 1 AND status IN ('PENDING', 'IN_PROGRESS', 'CONFIRMED')
    LIMIT 10
""")
for row in cursor.fetchall():
    print(f"ID: {row['id']}, OrderNo: {row['order_no']}, Status: {row['status']}, DeleteFlag: {row['delete_flag']}, Tenant: {row['tenant_id']}")

cursor.close()
conn.close()