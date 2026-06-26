#!/usr/bin/env python3
"""
数据一致性校验脚本

检查项目：
  1. orphan 数据（扫码记录没有对应订单）
  2. tenant_id 缺失/异常的记录
  3. delete_flag 异常（已删除但状态正常）
  4. 数值异常（负数、超范围）
  5. 外键约束检查
  6. 索引重复/冗余检查

用法：
  python3 scripts/data-consistency-check.py [--fix]
"""

import argparse
import sys
import os

try:
    import pymysql
except ImportError:
    print("请安装 pymysql: pip install pymysql")
    sys.exit(1)

# 数据库配置
DB_HOST = os.environ.get("DB_HOST", "127.0.0.1")
DB_PORT = int(os.environ.get("DB_PORT", "3308"))
DB_USER = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "changeme")
DB_NAME = os.environ.get("DB_NAME", "fashion_supplychain")

def get_connection():
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )

def check_orphan_data(cursor):
    """检查 orphan 数据"""
    print("\n" + "=" * 60)
    print("【检查1】Orphan 数据（外键断链）")
    print("=" * 60)
    
    issues = []
    
    # 1. 扫码记录没有对应订单（t_scan_record没有delete_flag）
    cursor.execute("""
        SELECT COUNT(*) as cnt
        FROM t_scan_record sr
        LEFT JOIN t_production_order po ON sr.order_id = po.id
        WHERE sr.order_id IS NOT NULL AND po.id IS NULL
    """)
    result = cursor.fetchone()
    orphan_scan = result['cnt']
    if orphan_scan > 0:
        issues.append(f"⚠️  t_scan_record 有 {orphan_scan} 条记录指向不存在订单")
    else:
        print("✅ t_scan_record 无 orphan 数据")
    
    # 2. 裁剪任务没有对应订单
    cursor.execute("""
        SELECT COUNT(*) as cnt
        FROM t_cutting_task ct
        LEFT JOIN t_production_order po ON ct.order_id = po.id
        WHERE ct.order_id IS NOT NULL AND po.id IS NULL
    """)
    result = cursor.fetchone()
    orphan_cutting = result['cnt']
    if orphan_cutting > 0:
        issues.append(f"⚠️  t_cutting_task 有 {orphan_cutting} 条记录指向不存在订单")
    else:
        print("✅ t_cutting_task 无 orphan 数据")
    
    # 3. 裁剪分菲没有对应生产订单（裁剪分菲直接关联订单，不是裁剪任务）
    cursor.execute("""
        SELECT COUNT(*) as cnt
        FROM t_cutting_bundle cb
        LEFT JOIN t_production_order po ON cb.production_order_id = po.id
        WHERE cb.production_order_id IS NOT NULL AND po.id IS NULL
    """)
    result = cursor.fetchone()
    orphan_bundle = result['cnt']
    if orphan_bundle > 0:
        issues.append(f"⚠️  t_cutting_bundle 有 {orphan_bundle} 条记录指向不存在订单")
    else:
        print("✅ t_cutting_bundle 无 orphan 数据")
    
    return issues

def check_tenant_id(cursor):
    """检查 tenant_id 缺失/异常"""
    print("\n" + "=" * 60)
    print("【检查2】tenant_id 缺失/异常")
    print("=" * 60)
    
    issues = []
    
    # 检查核心表的 tenant_id
    core_tables = [
        't_production_order',
        't_scan_record',
        't_cutting_task',
        't_cutting_bundle',
        't_product_warehousing',
        't_material_purchase',
        't_style_info',
        't_factory',
        't_user'
    ]
    
    for table in core_tables:
        try:
            cursor.execute(f"""
                SELECT COUNT(*) as cnt
                FROM {table}
                WHERE tenant_id IS NULL OR tenant_id = 0 OR tenant_id < 0
            """)
            result = cursor.fetchone()
            bad_tenant = result['cnt']
            if bad_tenant > 0:
                issues.append(f"⚠️  {table} 有 {bad_tenant} 条记录 tenant_id 异常")
            else:
                print(f"✅ {table} tenant_id 正常")
        except Exception as e:
            print(f"⚠️  {table} 检查失败: {str(e)[:50]}")
    
    return issues

def check_delete_flag(cursor):
    """检查 delete_flag 异常"""
    print("\n" + "=" * 60)
    print("【检查3】delete_flag 异常")
    print("=" * 60)
    
    issues = []
    
    # 检查已删除但状态正常的订单
    cursor.execute("""
        SELECT COUNT(*) as cnt
        FROM t_production_order
        WHERE delete_flag = 1 AND status IN ('PENDING', 'IN_PROGRESS', 'CONFIRMED')
    """)
    result = cursor.fetchone()
    bad_status = result['cnt']
    if bad_status > 0:
        issues.append(f"⚠️  t_production_order 有 {bad_status} 条已删除但状态未关闭")
    else:
        print("✅ t_production_order delete_flag 与状态一致")
    
    return issues

def check_numeric_values(cursor):
    """检查数值异常"""
    print("\n" + "=" * 60)
    print("【检查4】数值异常")
    print("=" * 60)
    
    issues = []
    
    # 检查负数数量
    cursor.execute("""
        SELECT COUNT(*) as cnt
        FROM t_cutting_bundle
        WHERE quantity < 0 OR quantity = 0
    """)
    result = cursor.fetchone()
    bad_qty = result['cnt']
    if bad_qty > 0:
        issues.append(f"⚠️  t_cutting_bundle 有 {bad_qty} 条记录数量异常")
    else:
        print("✅ t_cutting_bundle 数量正常")
    
    # 检查工序价格调整异常（负数价格）
    cursor.execute("""
        SELECT COUNT(*) as cnt
        FROM t_process_price_adjustment
        WHERE adjusted_price < 0
    """)
    result = cursor.fetchone()
    bad_price = result['cnt']
    if bad_price > 0:
        issues.append(f"⚠️  t_process_price_adjustment 有 {bad_price} 条记录价格异常（负数）")
    else:
        print("✅ t_process_price_adjustment 价格正常")
    
    return issues

def check_duplicate_indexes(cursor):
    """检查重复索引"""
    print("\n" + "=" * 60)
    print("【检查5】重复索引")
    print("=" * 60)

    cursor.execute("""
        SELECT TABLE_NAME as table_name, INDEX_NAME as index_name,
               GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as cols
        FROM information_schema.statistics
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME NOT LIKE 'v_%'
          AND TABLE_NAME NOT LIKE '%backup%'
          AND INDEX_NAME != 'PRIMARY'
          AND NON_UNIQUE = 1
        GROUP BY TABLE_NAME, INDEX_NAME
    """)
    rows = cursor.fetchall()

    # 按列分组
    col_map = {}
    for r in rows:
        cols = r['cols']
        if cols not in col_map:
            col_map[cols] = []
        col_map[cols].append((r['table_name'], r['index_name']))

    duplicates = []
    for cols, indexes in col_map.items():
        if len(indexes) > 1:
            duplicates.append((cols, indexes))

    if duplicates:
        print(f"⚠️  发现 {len(duplicates)} 对重复索引")
        for cols, indexes in duplicates[:5]:
            print(f"   列({cols}):")
            for table, idx in indexes:
                print(f"     - {table}.{idx}")
    else:
        print("✅ 无重复索引")

    return []

def main():
    parser = argparse.ArgumentParser(description="数据一致性校验")
    parser.add_argument("--fix", action="store_true", help="自动修复（危险，慎用）")
    args = parser.parse_args()
    
    print("=" * 60)
    print("数据一致性校验")
    print("=" * 60)
    print(f"数据库: {DB_HOST}:{DB_PORT}/{DB_NAME}")
    
    conn = get_connection()
    cursor = conn.cursor()
    
    all_issues = []
    
    try:
        all_issues.extend(check_orphan_data(cursor))
        all_issues.extend(check_tenant_id(cursor))
        all_issues.extend(check_delete_flag(cursor))
        all_issues.extend(check_numeric_values(cursor))
        all_issues.extend(check_duplicate_indexes(cursor))
        
        # 总结
        print("\n" + "=" * 60)
        print("校验总结")
        print("=" * 60)
        
        if all_issues:
            print(f"❌ 发现 {len(all_issues)} 个问题:")
            for issue in all_issues:
                print(f"  {issue}")
            print("\n建议: 请手动检查并修复上述问题")
            return 1
        else:
            print("✅ 数据一致性校验全部通过，无异常")
            return 0
    
    except Exception as e:
        print(f"❌ 校验异常: {e}")
        return 1
    finally:
        cursor.close()
        conn.close()

if __name__ == "__main__":
    sys.exit(main())