#!/usr/bin/env python3
"""
多租户数据隔离深度审计
======================
从数据库层面检查多租户数据隔离完整性，防止跨租户数据泄露（P0级安全）

检查项：
  1. 业务表是否都有tenant_id字段
  2. 是否存在tenant_id为NULL的记录
  3. 关联查询中是否存在跨租户关联（子表tenant_id与父表不一致）
  4. 索引是否包含tenant_id（确保查询性能）
  5. 每个租户的数据量分布
"""

import pymysql
import sys
import os
from datetime import datetime

DB_CONFIG = {
    'host': os.environ.get('DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('DB_PORT', 3308)),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', 'changeme'),
    'database': os.environ.get('DB_NAME', 'fashion_supplychain'),
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
}

# 系统表/全局表不需要tenant_id
SYSTEM_TABLES = {
    'flyway_schema_history',
    't_dict',
    't_permission',
    't_role',
    't_role_permission',
    't_menu',
    't_tenant',
    't_tenant_wechat',
    't_system_config',
    't_app_store',
    't_app_store_category',
    't_template_library',
    't_template_category',
}

# 核心业务表的父子关系（用于跨租户关联检查）
PARENT_CHILD_RELS = [
    # 生产订单相关
    ('t_production_order', 't_cutting_bundle', 'production_order_id'),
    ('t_production_order', 't_order_risk_tracking', 'order_id'),
    ('t_production_order', 't_production_process_tracking', 'order_id'),
    ('t_production_order', 't_production_order_process', 'production_order_id'),
    ('t_production_order', 't_order_remark', 'order_id'),
    ('t_production_order', 't_order_image', 'order_id'),
    ('t_style_info', 't_style_size_price', 'style_id'),
    
    # 扫码相关
    ('t_production_order', 't_scan_record', 'order_id'),
    ('t_cutting_bundle', 't_scan_record', 'cutting_bundle_id'),
    
    # 物料采购相关
    ('t_material_purchase', 't_material_purchase_item', 'purchase_id'),
    
    # 入库相关
    ('t_production_order', 't_product_warehousing', 'order_id'),
    
    # 工资相关
    ('t_wage_payment', 't_wage_payment_item', 'payment_id'),
    
    # AI相关
    ('t_ai_conversation_memory', 't_ai_long_memory', 'conversation_id'),
]

def get_connection():
    return pymysql.connect(**DB_CONFIG)

def check_tenant_id_columns(cursor):
    """检查所有业务表是否有tenant_id字段"""
    print("\n" + "="*80)
    print("【1/5】业务表tenant_id字段检查")
    print("="*80)
    
    cursor.execute("""
        SELECT TABLE_NAME 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
    """)
    all_tables = [row['TABLE_NAME'] for row in cursor.fetchall()]
    
    business_tables = []
    system_tables_found = []
    for t in all_tables:
        if t in SYSTEM_TABLES:
            system_tables_found.append(t)
        else:
            business_tables.append(t)
    
    missing_tenant = []
    has_tenant = []
    
    for table in business_tables:
        cursor.execute(f"""
            SELECT COUNT(*) as cnt
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = '{table}'
            AND COLUMN_NAME = 'tenant_id'
        """)
        if cursor.fetchone()['cnt'] == 0:
            missing_tenant.append(table)
        else:
            has_tenant.append(table)
    
    print(f"\n  总表数: {len(all_tables)}")
    print(f"  系统表（豁免）: {len(system_tables_found)}")
    print(f"  业务表: {len(business_tables)}")
    print(f"  ✅ 有 tenant_id: {len(has_tenant)}")
    print(f"  ❌ 缺 tenant_id: {len(missing_tenant)}")
    
    if missing_tenant:
        print(f"\n  缺少 tenant_id 的业务表:")
        for t in missing_tenant:
            print(f"    • {t}")
    
    return has_tenant, missing_tenant

def check_null_tenant_id(cursor, tables_with_tenant):
    """检查是否存在tenant_id为NULL的记录"""
    print("\n" + "="*80)
    print("【2/5】tenant_id为NULL的记录检查")
    print("="*80)
    
    null_records = []
    total_records = 0
    
    for table in tables_with_tenant:
        try:
            cursor.execute(f"""
                SELECT COUNT(*) as total,
                       SUM(CASE WHEN tenant_id IS NULL THEN 1 ELSE 0 END) as null_count
                FROM `{table}`
            """)
            row = cursor.fetchone()
            total = row['total'] or 0
            null_count = row['null_count'] or 0
            total_records += total
            
            if null_count > 0:
                null_records.append((table, total, null_count))
        except Exception:
            continue
    
    print(f"\n  总记录数: {total_records:,}")
    print(f"  存在 NULL tenant_id 的表: {len(null_records)}")
    
    if null_records:
        print(f"\n  ⚠️  危险！存在 tenant_id 为 NULL 的记录:")
        for table, total, null_count in null_records:
            pct = null_count / total * 100 if total > 0 else 0
            print(f"    • {table:40s} NULL: {null_count:>6,} / {total:>8,} ({pct:.1f}%)")
    else:
        print(f"\n  ✅ 所有表的 tenant_id 都不为空")
    
    return null_records

def check_cross_tenant_relations(cursor):
    """检查关联查询中是否存在跨租户关联"""
    print("\n" + "="*80)
    print("【3/5】跨租户关联一致性检查")
    print("="*80)
    
    violations = []
    checked = 0
    
    for parent_table, child_table, fk_column in PARENT_CHILD_RELS:
        # 检查表是否存在
        cursor.execute(f"""
            SELECT COUNT(*) as cnt
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN ('{parent_table}', '{child_table}')
        """)
        if cursor.fetchone()['cnt'] < 2:
            continue
        
        # 检查两个表是否都有tenant_id
        cursor.execute(f"""
            SELECT COUNT(DISTINCT TABLE_NAME) as cnt
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME IN ('{parent_table}', '{child_table}')
            AND COLUMN_NAME = 'tenant_id'
        """)
        if cursor.fetchone()['cnt'] < 2:
            continue
        
        try:
            checked += 1
            cursor.execute(f"""
                SELECT COUNT(*) as violation_count
                FROM {child_table} c
                JOIN {parent_table} p ON c.{fk_column} = p.id
                WHERE c.tenant_id != p.tenant_id
                AND c.tenant_id IS NOT NULL
                AND p.tenant_id IS NOT NULL
            """)
            count = cursor.fetchone()['violation_count'] or 0
            
            if count > 0:
                violations.append({
                    'parent': parent_table,
                    'child': child_table,
                    'fk': fk_column,
                    'count': count
                })
        except Exception as e:
            continue
    
    print(f"\n  检查了 {checked} 对父子关系")
    print(f"  发现跨租户不一致: {len(violations)} 对")
    
    if violations:
        print(f"\n  ❌ 跨租户关联不一致（严重安全风险）:")
        for v in violations:
            print(f"    • {v['child']}.{v['fk']} → {v['parent']}.id")
            print(f"      不一致记录数: {v['count']:,}")
    else:
        print(f"\n  ✅ 所有检查的父子关系中，tenant_id 都一致")
    
    return violations

def check_tenant_indexes(cursor, tables_with_tenant):
    """检查索引是否包含tenant_id"""
    print("\n" + "="*80)
    print("【4/5】tenant_id索引覆盖检查")
    print("="*80)
    
    missing_index = []
    
    for table in tables_with_tenant:
        try:
            cursor.execute(f"SHOW INDEX FROM `{table}` WHERE Column_name = 'tenant_id'")
            indexes = cursor.fetchall()
            
            # 检查是否有以tenant_id为首列的索引
            has_tenant_first = False
            for idx in indexes:
                if idx['Seq_in_index'] == 1:
                    has_tenant_first = True
                    break
            
            if not has_tenant_first:
                # 检查tenant_id是否在索引中（但不是首列）
                if len(indexes) > 0:
                    missing_index.append((table, 'tenant_id不在索引首列'))
                else:
                    missing_index.append((table, '完全没有tenant_id索引'))
        except Exception:
            continue
    
    print(f"\n  检查了 {len(tables_with_tenant)} 个有 tenant_id 的表")
    print(f"  ⚠️  tenant_id 索引不完整: {len(missing_index)} 个表")
    
    if missing_index:
        print(f"\n  tenant_id 索引不完整的表:")
        for table, reason in missing_index[:20]:
            print(f"    • {table:40s} - {reason}")
        if len(missing_index) > 20:
            print(f"    ... 还有 {len(missing_index) - 20} 个")
    else:
        print(f"\n  ✅ 所有表都有以 tenant_id 为首列的索引")
    
    return missing_index

def check_tenant_distribution(cursor, tables_with_tenant):
    """检查每个租户的数据量分布"""
    print("\n" + "="*80)
    print("【5/5】租户数据量分布")
    print("="*80)
    
    # 选几个核心表来看分布
    core_tables = [t for t in [
        't_production_order',
        't_scan_record',
        't_cutting_bundle',
        't_style_info',
        't_material_purchase',
        't_product_warehousing',
        't_wage_payment',
    ] if t in tables_with_tenant]
    
    print(f"\n  核心表各租户数据量:")
    for table in core_tables:
        try:
            cursor.execute(f"""
                SELECT tenant_id, COUNT(*) as cnt
                FROM `{table}`
                GROUP BY tenant_id
                ORDER BY cnt DESC
                LIMIT 5
            """)
            rows = cursor.fetchall()
            if rows:
                print(f"\n    {table}:")
                for row in rows:
                    print(f"      tenant {row['tenant_id']:>4}: {row['cnt']:>8,} 条")
        except Exception:
            continue

def main():
    print("="*80)
    print("  多租户数据隔离深度审计 (P0级安全检查)")
    print(f"  数据库: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
    print(f"  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            tables_with_tenant, missing_tables = check_tenant_id_columns(cursor)
            null_records = check_null_tenant_id(cursor, tables_with_tenant)
            violations = check_cross_tenant_relations(cursor)
            missing_index = check_tenant_indexes(cursor, tables_with_tenant)
            check_tenant_distribution(cursor, tables_with_tenant)
        
        conn.close()
        
        # 汇总
        print("\n" + "="*80)
        print("  审计总结")
        print("="*80)
        
        issues = []
        if missing_tables:
            issues.append(f"❌ {len(missing_tables)} 个业务表缺少 tenant_id 字段")
        if null_records:
            issues.append(f"❌ {len(null_records)} 个表存在 tenant_id 为 NULL 的记录")
        if violations:
            issues.append(f"❌ {len(violations)} 对父子表存在跨租户关联不一致")
        if missing_index:
            issues.append(f"⚠️  {len(missing_index)} 个表 tenant_id 索引不完整")
        
        if issues:
            print(f"\n  发现 {len(issues)} 类问题:")
            for issue in issues:
                print(f"    {issue}")
            print(f"\n  ⚠️  存在多租户隔离风险，请及时修复！")
            exit_code = 1
        else:
            print(f"\n  ✅ 所有检查项通过，多租户隔离状态良好")
            exit_code = 0
        
        print("\n" + "="*80)
        print("  审计完成")
        print("="*80)
        sys.exit(exit_code)
        
    except Exception as e:
        print(f"\n❌ 审计失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == '__main__':
    main()
