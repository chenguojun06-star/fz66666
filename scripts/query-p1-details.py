#!/usr/bin/env python3
"""查询P1问题明细 + 修正字段名后重查3个跳过项"""
import pymysql, os

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")
C = "utf8mb4_unicode_ci"

conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                       password=DB_PASSWORD, database=DB_NAME,
                       cursorclass=pymysql.cursors.DictCursor, charset='utf8mb4')
cur = conn.cursor()

def show(title, sql):
    print(f"\n=== {title} ===")
    cur.execute(sql)
    rows = cur.fetchall()
    for r in rows:
        print(" ", r)
    return rows

# ============================================================
# P1 #1: 订单关联样衣断链 (3条)
# ============================================================
show("P1#1 订单-样衣断链", f"""SELECT po.id, po.order_no, po.style_id, po.status, po.tenant_id, po.create_time
FROM t_production_order po
LEFT JOIN t_style_info si ON po.style_id COLLATE {C}=si.id COLLATE {C} AND si.tenant_id=po.tenant_id
WHERE po.delete_flag=0 AND po.style_id IS NOT NULL AND po.style_id!=''
  AND si.id IS NULL""")

# ============================================================
# P1 #2: BOM关联样衣断链 (3条)
# ============================================================
show("P1#2 BOM-样衣断链", f"""SELECT sb.id, sb.style_id, sb.material_name, sb.tenant_id, sb.create_time
FROM t_style_bom sb
LEFT JOIN t_style_info si ON sb.style_id COLLATE {C}=si.id COLLATE {C}
WHERE sb.style_id IS NOT NULL AND sb.style_id!=''
  AND si.id IS NULL""")

# ============================================================
# P1 #3: 裁剪任务关联订单断链 (4条)
# ============================================================
show("P1#3 裁剪任务-订单断链", f"""SELECT ct.id, ct.production_order_id, ct.tenant_id, ct.create_time
FROM t_cutting_task ct
LEFT JOIN t_production_order po ON ct.production_order_id COLLATE {C}=po.id COLLATE {C}
WHERE ct.production_order_id IS NOT NULL AND ct.production_order_id!=''
  AND po.id IS NULL""")

# ============================================================
# P1 #4: 制版关联样衣断链 (20条)
# ============================================================
show("P1#4 制版-样衣断链（前20条）", f"""SELECT pp.id, pp.production_order_id, pp.style_id, pp.tenant_id, pp.create_time
FROM t_pattern_production pp
LEFT JOIN t_style_info si ON pp.style_id COLLATE {C}=si.id COLLATE {C}
WHERE pp.delete_flag=0 AND pp.style_id IS NOT NULL AND pp.style_id!=''
  AND si.id IS NULL
LIMIT 20""")

# ============================================================
# 字段名修正后重查3个跳过项
# ============================================================
print("\n=== 字段名检查 ===")
cur.execute("""SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=%s AND TABLE_NAME='t_style_bom' ORDER BY ORDINAL_POSITION""", (DB_NAME,))
print("t_style_bom 字段:", [r['COLUMN_NAME'] for r in cur.fetchall()])

cur.execute("""SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=%s AND TABLE_NAME='t_pattern_revision' ORDER BY ORDINAL_POSITION""", (DB_NAME,))
print("t_pattern_revision 字段:", [r['COLUMN_NAME'] for r in cur.fetchall()])

cur.execute("""SELECT COLUMN_NAME FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=%s AND TABLE_NAME='t_payroll_settlement_item' ORDER BY ORDINAL_POSITION""", (DB_NAME,))
print("t_payroll_settlement_item 字段:", [r['COLUMN_NAME'] for r in cur.fetchall()])

cur.close(); conn.close()
