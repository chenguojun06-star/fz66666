#!/usr/bin/env python3
"""
全系统多端数据查询断链修复脚本
1. 手动执行未执行的 Flyway 迁移（V20260731001/V20260731002）
2. 修复 P1 数据断链问题
3. 修复 P2 数据问题
"""
import pymysql, os, sys
from datetime import datetime

DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")
C = "utf8mb4_unicode_ci"

DRY_RUN = os.environ.get("DRY_RUN", "0") == "1"

conn = pymysql.connect(host=DB_HOST, port=DB_PORT, user=DB_USER,
                       password=DB_PASSWORD, database=DB_NAME,
                       cursorclass=pymysql.cursors.DictCursor,
                       charset='utf8mb4', autocommit=False)
cur = conn.cursor()

results = []

def exec_sql(sql, params=None, desc=""):
    cur.execute(sql, params)
    affected = cur.rowcount
    action = "DRY_RUN" if DRY_RUN else "EXECUTED"
    results.append((desc, affected, action))
    print(f"  [{'DRY_RUN' if DRY_RUN else '✅'}] {desc}: {affected} rows")
    return affected

def query(sql, params=None):
    cur.execute(sql, params)
    return cur.fetchall()

# ================================================================
# 步骤0: 手动执行未执行的 Flyway 迁移
# ================================================================
print("=" * 70)
print("【步骤0】手动执行未执行的 Flyway 迁移")
print("=" * 70)

# V20260731001: t_payroll_settlement 加 scan_record_ids
cur.execute("""SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement' AND COLUMN_NAME='scan_record_ids'""")
if cur.fetchone()['c'] == 0:
    print("  执行 V20260731001: t_payroll_settlement 加 scan_record_ids...")
    if not DRY_RUN:
        cur.execute("ALTER TABLE t_payroll_settlement ADD COLUMN scan_record_ids TEXT NULL AFTER remark")
        print("  ✅ 已添加 scan_record_ids")
    else:
        print("  [DRY_RUN] 将添加 scan_record_ids")
else:
    print("  ✅ t_payroll_settlement.scan_record_ids 已存在")

# V20260731002: t_payroll_settlement_item 加 scan_record_ids 和 tracking_ids
cur.execute("""SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement_item' AND COLUMN_NAME='scan_record_ids'""")
if cur.fetchone()['c'] == 0:
    print("  执行 V20260731002: t_payroll_settlement_item 加 scan_record_ids...")
    if not DRY_RUN:
        cur.execute("ALTER TABLE t_payroll_settlement_item ADD COLUMN scan_record_ids VARCHAR(512) NULL AFTER scan_type")
        print("  ✅ 已添加 scan_record_ids")
    else:
        print("  [DRY_RUN] 将添加 scan_record_ids")
else:
    print("  ✅ t_payroll_settlement_item.scan_record_ids 已存在")

cur.execute("""SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement_item' AND COLUMN_NAME='tracking_ids'""")
if cur.fetchone()['c'] == 0:
    if not DRY_RUN:
        cur.execute("ALTER TABLE t_payroll_settlement_item ADD COLUMN tracking_ids VARCHAR(512) NULL AFTER scan_record_ids")
        print("  ✅ 已添加 tracking_ids")
    else:
        print("  [DRY_RUN] 将添加 tracking_ids")
else:
    print("  ✅ t_payroll_settlement_item.tracking_ids 已存在")

# ================================================================
# P1 #1: 订单-样衣断链 (3条) - pending状态订单关联不存在的样衣
# ================================================================
print("\n" + "=" * 70)
print("【P1#1】订单-样衣断链 (3条) - 标记为 cancelled")
print("=" * 70)

orders = query(f"""SELECT po.id, po.order_no, po.style_id, po.status, po.tenant_id
FROM t_production_order po
LEFT JOIN t_style_info si ON po.style_id COLLATE {C}=si.id COLLATE {C} AND si.tenant_id=po.tenant_id
WHERE po.delete_flag=0 AND po.style_id IS NOT NULL AND po.style_id!=''
  AND si.id IS NULL""")

for o in orders:
    print(f"  订单 {o['order_no']} (style_id={o['style_id']}, status={o['status']}) → cancelled")
    if not DRY_RUN:
        exec_sql("UPDATE t_production_order SET status='cancelled', update_time=NOW() WHERE id=%s",
            (o['id'],), desc=f"P1#1 订单 {o['order_no']} 标记 cancelled")

# ================================================================
# P1 #2: BOM-样衣断链 (3条) - style_id=1 的测试数据，软删除
# ================================================================
print("\n" + "=" * 70)
print("【P1#2】BOM-样衣断链 (3条) - 软删除孤儿 BOM")
print("=" * 70)

# t_style_bom 没有 delete_flag，直接删除
boms = query(f"""SELECT sb.id, sb.style_id, sb.material_name, sb.tenant_id
FROM t_style_bom sb
LEFT JOIN t_style_info si ON sb.style_id COLLATE {C}=si.id COLLATE {C}
WHERE sb.style_id IS NOT NULL AND sb.style_id!=''
  AND si.id IS NULL""")

for b in boms:
    print(f"  BOM id={b['id']} style_id={b['style_id']} material={b['material_name'][:30]} → DELETE")
    if not DRY_RUN:
        exec_sql("DELETE FROM t_style_bom WHERE id=%s", (b['id'],),
            desc=f"P1#2 删除孤儿 BOM {b['id']}")

# ================================================================
# P1 #3: 裁剪任务-订单断链 (4条) - 软删除孤儿裁剪任务
# ================================================================
print("\n" + "=" * 70)
print("【P1#3】裁剪任务-订单断链 (4条) - 软删除孤儿裁剪任务")
print("=" * 70)

# t_cutting_task 没有 delete_flag，直接删除
tasks = query(f"""SELECT ct.id, ct.production_order_id, ct.tenant_id
FROM t_cutting_task ct
LEFT JOIN t_production_order po ON ct.production_order_id COLLATE {C}=po.id COLLATE {C}
WHERE ct.production_order_id IS NOT NULL AND ct.production_order_id!=''
  AND po.id IS NULL""")

for t in tasks:
    print(f"  裁剪任务 id={t['id']} order_id={t['production_order_id']} → DELETE")
    if not DRY_RUN:
        exec_sql("DELETE FROM t_cutting_task WHERE id=%s", (t['id'],),
            desc=f"P1#3 删除孤儿裁剪任务 {t['id']}")

# ================================================================
# P1 #4: 制版-样衣断链 (20条) - style_id 指向不存在的样衣
# ================================================================
print("\n" + "=" * 70)
print("【P1#4】制版-样衣断链 (20条) - 软删除孤儿制版记录")
print("=" * 70)

patterns = query(f"""SELECT pp.id, pp.production_order_id, pp.style_id, pp.tenant_id
FROM t_pattern_production pp
LEFT JOIN t_style_info si ON pp.style_id COLLATE {C}=si.id COLLATE {C}
WHERE pp.delete_flag=0 AND pp.style_id IS NOT NULL AND pp.style_id!=''
  AND si.id IS NULL""")

for p in patterns:
    print(f"  制版 id={p['id']} style_id={p['style_id']} order_id={p['production_order_id']} → delete_flag=1")
    if not DRY_RUN:
        exec_sql("UPDATE t_pattern_production SET delete_flag=1, update_time=NOW() WHERE id=%s",
            (p['id'],), desc=f"P1#4 软删除孤儿制版 {p['id']}")

# ================================================================
# P2 #1: AI长期记忆 tenant_id 为空 (3条)
# ================================================================
print("\n" + "=" * 70)
print("【P2#1】AI长期记忆 tenant_id 为空 (3条)")
print("=" * 70)

# 查询有 tenant_id 的 AI 长期记忆，取众数作为默认值
cur.execute("SELECT tenant_id, COUNT(*) AS c FROM t_ai_long_memory WHERE tenant_id IS NOT NULL AND tenant_id>0 GROUP BY tenant_id ORDER BY c DESC LIMIT 1")
tenant_row = cur.fetchone()
default_tenant = tenant_row['tenant_id'] if tenant_row else 1
print(f"  默认 tenant_id: {default_tenant}")

if not DRY_RUN:
    exec_sql("UPDATE t_ai_long_memory SET tenant_id=%s WHERE tenant_id IS NULL OR tenant_id=0",
        (default_tenant,), desc="P2#1 AI长期记忆 tenant_id 补填")

# ================================================================
# P2 #2: AI技能模板 tenant_id 为空 (6条)
# ================================================================
print("\n" + "=" * 70)
print("【P2#2】AI技能模板 tenant_id 为空 (6条)")
print("=" * 70)

if not DRY_RUN:
    exec_sql("UPDATE t_skill_template SET tenant_id=%s WHERE (tenant_id IS NULL OR tenant_id=0) AND delete_flag=0",
        (default_tenant,), desc="P2#2 AI技能模板 tenant_id 补填")

# ================================================================
# P2 #3: 扫码-操作人断链 (8条) - operator_id 指向不存在的用户
# ================================================================
print("\n" + "=" * 70)
print("【P2#3】扫码-操作人断链 (8条) - 清空无效 operator_id")
print("=" * 70)

scans = query(f"""SELECT sr.id, sr.operator_id, sr.operator_name, sr.order_no, sr.tenant_id
FROM t_scan_record sr
LEFT JOIN t_user u ON sr.operator_id COLLATE {C}=u.id COLLATE {C}
WHERE sr.operator_id IS NOT NULL AND sr.operator_id!=''
  AND u.id IS NULL""")

for s in scans:
    print(f"  扫码 id={s['id'][:12]}... operator={s['operator_name']} order={s['order_no']} → 清空 operator_id")
    if not DRY_RUN:
        exec_sql("UPDATE t_scan_record SET operator_id=NULL, remark=CONCAT(IFNULL(remark,''), '[数据修复:操作人不存在]') WHERE id=%s",
            (s['id'],), desc=f"P2#3 清空无效 operator_id")

# ================================================================
# 提交事务
# ================================================================
print("\n" + "=" * 70)
print("【提交】")
print("=" * 70)

if DRY_RUN:
    print("  [DRY_RUN] 回滚所有变更")
    conn.rollback()
else:
    conn.commit()
    print("  ✅ 所有变更已提交")

# 汇总
print("\n" + "=" * 70)
print("【汇总】")
print("=" * 70)
for desc, affected, action in results:
    print(f"  [{action}] {desc}: {affected} rows")

cur.close(); conn.close()
print("\n--- 修复完成 ---")
