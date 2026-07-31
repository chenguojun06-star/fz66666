#!/usr/bin/env python3
"""系统上线就绪度全面检查"""
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

    print("=" * 70)
    print("【1】租户与用户情况")
    print("=" * 70)

    # 检查t_tenant表结构
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant'""")
    cols = [r['COLUMN_NAME'] for r in cur.fetchall()]
    has_delete_flag = 'delete_flag' in cols
    where_clause = "delete_flag=0" if has_delete_flag else "1=1"

    cur.execute(f"SELECT COUNT(*) AS c FROM t_tenant WHERE {where_clause}")
    tenant_count = cur.fetchone()['c']
    print(f"  活跃租户数: {tenant_count}")

    # 查看t_tenant实际列名
    cur.execute("""SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_tenant'
        ORDER BY ORDINAL_POSITION""")
    cols_list = [r['COLUMN_NAME'] for r in cur.fetchall()]
    name_col = 'name' if 'name' in cols_list else ('tenant_name' if 'tenant_name' in cols_list else cols_list[1] if len(cols_list) > 1 else 'id')

    # 检查t_user是否有delete_flag
    cur.execute("""SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_user' AND COLUMN_NAME='delete_flag'""")
    user_has_delete = cur.fetchone()['c'] > 0
    user_where = "u.delete_flag=0" if user_has_delete else "1=1"

    # 检查t_production_order是否有delete_flag
    cur.execute("""SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_production_order' AND COLUMN_NAME='delete_flag'""")
    order_has_delete = cur.fetchone()['c'] > 0
    order_where = "o.delete_flag=0" if order_has_delete else "1=1"

    cur.execute(f"""SELECT t.id, t.{name_col} AS name, t.tenant_type, t.status,
        (SELECT COUNT(*) FROM t_user u WHERE u.tenant_id=t.id AND {user_where}) AS user_cnt,
        (SELECT COUNT(*) FROM t_production_order o WHERE o.tenant_id=t.id AND {order_where}) AS order_cnt
        FROM t_tenant t WHERE {where_clause}
        ORDER BY order_cnt DESC LIMIT 10""")
    print(f"\n  Top 10 租户:")
    print(f"  {'租户名':<20} {'类型':<10} {'状态':<10} {'用户数':<8} {'订单数':<8}")
    for r in cur.fetchall():
        print(f"  {r['name'][:18]:<20} {str(r['tenant_type']):<10} {str(r['status']):<10} {r['user_cnt']:<8} {r['order_cnt']:<8}")

    cur.execute(f"""SELECT COUNT(*) AS c FROM t_user WHERE {user_where}""")
    user_count = cur.fetchone()['c']
    print(f"\n  总用户数: {user_count}")

    print("\n" + "=" * 70)
    print("【2】核心业务数据量")
    print("=" * 70)

    tables = [
        ('t_production_order', '生产订单', 'delete_flag=0'),
        ('t_style_info', '款式', 'delete_flag=0'),
        ('t_scan_record', '扫码记录', '1=1'),
        ('t_cutting_bundle', '裁剪菲号', '1=1'),
        ('t_production_process_tracking', '工序跟踪', 'delete_flag=0'),
        ('t_material_purchase', '采购单', 'delete_flag=0'),
        ('t_product_warehousing', '成品入库', 'delete_flag=0'),
        ('t_product_outstock', '成品出库', 'delete_flag=0'),
        ('t_payroll_settlement', '工资结算单', 'delete_flag=0'),
        ('t_style_bom', 'BOM物料', 'delete_flag=0'),
        ('t_bill_aggregation', '账单聚合', 'delete_flag=0'),
        ('t_pattern_production', '制版', 'delete_flag=0'),
    ]
    for table, label, where in tables:
        try:
            cur.execute(f"SELECT COUNT(*) AS c FROM {table} WHERE {where}")
            print(f"  {label:<15} ({table:<35}): {cur.fetchone()['c']}")
        except Exception as e:
            print(f"  {label:<15} ({table:<35}): ERROR {e}")

    print("\n" + "=" * 70)
    print("【3】订单状态分布")
    print("=" * 70)
    cur.execute("""SELECT status, COUNT(*) AS c FROM t_production_order
        WHERE delete_flag=0 GROUP BY status ORDER BY c DESC""")
    for r in cur.fetchall():
        print(f"  {r['status']:<25}: {r['c']}")

    print("\n" + "=" * 70)
    print("【4】Flyway 迁移状态")
    print("=" * 70)
    try:
        cur.execute("""SELECT COUNT(*) AS total,
            SUM(CASE WHEN success=1 THEN 1 ELSE 0 END) AS success,
            SUM(CASE WHEN success=0 THEN 1 ELSE 0 END) AS failed
            FROM flyway_schema_history""")
        r = cur.fetchone()
        print(f"  总迁移数: {r['total']}, 成功: {r['success']}, 失败: {r['failed']}")
        if r['failed'] > 0:
            cur.execute("""SELECT version, description, execution_time
                FROM flyway_schema_history WHERE success=0""")
            print("  失败迁移:")
            for f in cur.fetchall():
                print(f"    V{f['version']} {f['description']}")
    except Exception as e:
        print(f"  ERROR: {e}")

    print("\n" + "=" * 70)
    print("【5】AI系统关键表数据")
    print("=" * 70)
    ai_tables = [
        ('t_ai_conversation_memory', 'AI会话记忆'),
        ('t_ai_long_memory', 'AI长期记忆'),
        ('t_skill_template', '技能模板'),
        ('t_procedural_memory', '程序性记忆SOP'),
        ('t_shared_agent_memory', '多Agent共享记忆'),
        ('t_intelligence_memory', '智能记忆'),
        ('t_memory_bank_entry', '记忆库条目'),
    ]
    for table, label in ai_tables:
        try:
            cur.execute(f"SELECT COUNT(*) AS c FROM {table}")
            print(f"  {label:<20} ({table:<30}): {cur.fetchone()['c']}")
        except Exception as e:
            print(f"  {label:<20} ({table:<30}): 表不存在")

    print("\n" + "=" * 70)
    print("【6】多租户隔离完整性")
    print("=" * 70)
    critical_tables = [
        't_production_order', 't_scan_record', 't_material_purchase',
        't_style_info', 't_payroll_settlement', 't_production_process_tracking',
        't_style_bom', 't_cutting_task', 't_bill_aggregation'
    ]
    for t in critical_tables:
        try:
            cur.execute(f"SELECT COUNT(*) AS c FROM {t} WHERE tenant_id IS NULL")
            c = cur.fetchone()['c']
            status = "✅" if c == 0 else "❌"
            print(f"  {status} {t}: {c}条无tenant_id")
        except Exception as e:
            print(f"  ⚠️  {t}: {e}")

    print("\n" + "=" * 70)
    print("【7】工资结算数据一致性")
    print("=" * 70)
    # 检查t_payroll_settlement是否有delete_flag
    cur.execute("""SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='t_payroll_settlement' AND COLUMN_NAME='delete_flag'""")
    ps_has_delete = cur.fetchone()['c'] > 0
    ps_where = "delete_flag=0" if ps_has_delete else "1=1"

    cur.execute(f"""SELECT
        (SELECT COUNT(*) FROM t_payroll_settlement WHERE {ps_where}) AS total_settlements,
        (SELECT COUNT(*) FROM t_payroll_settlement WHERE {ps_where} AND status='approved') AS approved,
        (SELECT COUNT(*) FROM t_payroll_settlement WHERE {ps_where} AND status='pending') AS pending,
        (SELECT COUNT(*) FROM t_payroll_settlement_item) AS total_items,
        (SELECT COUNT(*) FROM t_payroll_settlement_item WHERE scan_record_ids IS NULL OR scan_record_ids='') AS empty_scan_ids""")
    r = cur.fetchone()
    print(f"  结算单总数: {r['total_settlements']} (已审核: {r['approved']}, 待审核: {r['pending']})")
    print(f"  结算明细总数: {r['total_items']}")
    print(f"  明细无scan_record_ids: {r['empty_scan_ids']}条 (历史数据, 非阻断)")

    print("\n" + "=" * 70)
    print("【8】财务账单聚合完整性")
    print("=" * 70)
    try:
        cur.execute("""SELECT source_type, COUNT(*) AS c FROM t_bill_aggregation
            WHERE delete_flag=0 GROUP BY source_type ORDER BY c DESC""")
        for r in cur.fetchall():
            print(f"  {r['source_type']:<30}: {r['c']}")
    except Exception as e:
        print(f"  ERROR: {e}")

    print("\n" + "=" * 70)
    print("【9】系统操作日志")
    print("=" * 70)
    try:
        cur.execute("""SELECT COUNT(*) AS c FROM t_operation_log WHERE create_time > DATE_SUB(NOW(), INTERVAL 7 DAY)""")
        print(f"  最近7天操作日志: {cur.fetchone()['c']}条")
    except Exception as e:
        print(f"  ERROR: {e}")

    conn.close()

if __name__ == '__main__':
    main()
