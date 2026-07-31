#!/usr/bin/env python3
"""快速检查相关表的关键列名"""
import pymysql, os

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")

conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                       password=DB_PASSWORD, database=DB_NAME,
                       cursorclass=pymysql.cursors.DictCursor)
cur = conn.cursor()

tables = ['t_pattern_production', 't_pattern_revision', 't_process_assignment',
          't_order_remark', 't_operation_log', 't_material_pick_record',
          't_stock_record', 't_sales_outstock', 't_material_inventory',
          't_product_warehousing', 't_product_outstock', 't_bill_aggregation',
          't_ai_conversation_memory', 't_ai_long_memory', 't_skill_template',
          't_cutting_task', 't_deduction_item']

for t in tables:
    try:
        cur.execute(f"SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='{DB_NAME}' AND TABLE_NAME='{t}' ORDER BY ORDINAL_POSITION")
        cols = [r['COLUMN_NAME'] for r in cur.fetchall()]
        print(f"\n{t}: {', '.join(cols)}")
    except Exception as e:
        print(f"\n{t}: ERROR - {str(e)[:80]}")

cur.close(); conn.close()
