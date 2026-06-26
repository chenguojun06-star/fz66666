#!/usr/bin/env python3
"""
慢查询分析脚本 - 分析数据库性能瓶颈
- 检查表大小和索引使用情况
- 识别缺失索引的高频查询
- 分析重复/冗余索引
- 估算查询性能
"""

import pymysql
import sys
import os
from datetime import datetime

DB_CONFIG = {
    'host': os.environ.get('DB_HOST', '127.0.0.1'),
    'port': int(os.environ.get('DB_PORT', 3308)),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', 'root'),
    'database': os.environ.get('DB_NAME', 'fashion_supplychain'),
    'charset': 'utf8mb4',
    'cursorclass': pymysql.cursors.DictCursor,
}

def get_connection():
    return pymysql.connect(**DB_CONFIG)

def analyze_table_sizes(cursor):
    """分析表大小，找出大表"""
    print("\n" + "="*80)
    print("【1/6】表大小分析（前20大表）")
    print("="*80)
    cursor.execute("""
        SELECT 
            TABLE_NAME as table_name,
            TABLE_ROWS as row_count,
            ROUND(DATA_LENGTH / 1024 / 1024, 2) as data_size_mb,
            ROUND(INDEX_LENGTH / 1024 / 1024, 2) as index_size_mb,
            ROUND((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024, 2) as total_size_mb,
            ROUND(INDEX_LENGTH / CASE WHEN DATA_LENGTH = 0 THEN 1 ELSE DATA_LENGTH END * 100, 1) as index_data_ratio_pct
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
        ORDER BY (DATA_LENGTH + INDEX_LENGTH) DESC
        LIMIT 20
    """)
    tables = cursor.fetchall()
    
    total_data = 0
    total_index = 0
    for t in tables:
        total_data += t['data_size_mb'] or 0
        total_index += t['index_size_mb'] or 0
        print(f"  {t['table_name']:40s} 行数: {t['row_count']:>10,}  "
              f"数据: {t['data_size_mb']:>8.2f}MB  索引: {t['index_size_mb']:>8.2f}MB  "
              f"总计: {t['total_size_mb']:>8.2f}MB  索引/数据: {t['index_data_ratio_pct']:>5.1f}%")
    
    print(f"\n  前20表总计: 数据 {total_data:.2f}MB, 索引 {total_index:.2f}MB, "
          f"总计 {total_data + total_index:.2f}MB")
    return tables

def analyze_index_usage(cursor):
    """分析索引使用情况"""
    print("\n" + "="*80)
    print("【2/6】索引使用情况分析")
    print("="*80)
    try:
        cursor.execute("""
            SELECT 
                OBJECT_NAME as table_name,
                INDEX_NAME as index_name,
                COUNT_FETCH as rows_read,
                COUNT_INSERT as rows_inserted,
                COUNT_UPDATE as rows_updated,
                COUNT_DELETE as rows_deleted
            FROM performance_schema.table_io_waits_summary_by_index_usage
            WHERE OBJECT_SCHEMA = DATABASE()
            AND INDEX_NAME IS NOT NULL
            AND COUNT_FETCH = 0
            ORDER BY OBJECT_NAME, INDEX_NAME
            LIMIT 30
        """)
        unused = cursor.fetchall()
        if unused:
            print(f"\n  未使用的索引（可能是冗余索引，共{len(unused)}个）:")
            for idx in unused:
                print(f"    {idx['table_name']}.{idx['index_name']}")
        else:
            print("\n  ✅ 所有索引都在使用中")
    except Exception as e:
        print(f"  ⚠️  无法查询performance_schema（需要相应权限）: {e}")

def analyze_slow_queries(cursor):
    """分析慢查询配置和状态"""
    print("\n" + "="*80)
    print("【3/6】慢查询配置与状态")
    print("="*80)
    
    try:
        cursor.execute("SHOW VARIABLES LIKE 'slow_query%'")
        vars_result = cursor.fetchall()
        print("\n  慢查询配置:")
        for row in vars_result:
            print(f"    {row['Variable_name']}: {row['Value']}")
        
        cursor.execute("SHOW VARIABLES LIKE 'long_query_time'")
        lqt = cursor.fetchone()
        if lqt:
            print(f"    long_query_time: {lqt['Value']}s")
        
        cursor.execute("SHOW STATUS LIKE 'Slow_queries'")
        sq = cursor.fetchone()
        if sq:
            print(f"\n  累计慢查询数: {sq['Value']}")
            
    except Exception as e:
        print(f"  ⚠️  无法查询慢查询状态: {e}")

def analyze_duplicate_indexes(cursor):
    """检测重复和冗余索引"""
    print("\n" + "="*80)
    print("【4/6】重复/冗余索引检测")
    print("="*80)
    
    cursor.execute("""
        SELECT 
            TABLE_NAME,
            INDEX_NAME,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as columns
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND INDEX_NAME != 'PRIMARY'
        GROUP BY TABLE_NAME, INDEX_NAME
        ORDER BY TABLE_NAME, INDEX_NAME
    """)
    indexes = cursor.fetchall()
    
    table_indexes = {}
    for idx in indexes:
        table = idx['TABLE_NAME']
        if table not in table_indexes:
            table_indexes[table] = []
        table_indexes[table].append({
            'name': idx['INDEX_NAME'],
            'columns': idx['columns']
        })
    
    duplicates = []
    for table, idx_list in table_indexes.items():
        for i in range(len(idx_list)):
            for j in range(i + 1, len(idx_list)):
                cols_i = idx_list[i]['columns'].split(',')
                cols_j = idx_list[j]['columns'].split(',')
                
                if len(cols_i) <= len(cols_j) and \
                   all(cols_i[k] == cols_j[k] for k in range(len(cols_i))):
                    duplicates.append({
                        'table': table,
                        'redundant': idx_list[j]['name'],
                        'covered_by': idx_list[i]['name'],
                        'redundant_cols': idx_list[j]['columns'],
                        'covered_cols': idx_list[i]['columns']
                    })
    
    if duplicates:
        print(f"\n  发现 {len(duplicates)} 个潜在冗余索引（前缀被其他索引覆盖）:")
        for d in duplicates[:15]:
            print(f"    {d['table']}.{d['redundant']} ({d['redundant_cols']})")
            print(f"      ↳ 被 {d['covered_by']} ({d['covered_cols']}) 覆盖")
        if len(duplicates) > 15:
            print(f"    ... 还有 {len(duplicates) - 15} 个")
    else:
        print("\n  ✅ 未发现明显的冗余索引")

def analyze_full_table_scans(cursor):
    """检测可能的全表扫描查询"""
    print("\n" + "="*80)
    print("【5/6】高频查询表索引覆盖分析")
    print("="*80)
    
    high_freq_tables = [
        't_production_order',
        't_scan_record',
        't_cutting_bundle',
        't_style_info',
        't_material_purchase',
        't_product_warehousing',
        't_wage_payment',
        't_intelligence_audit_log',
        't_ai_job_run_log',
    ]
    
    print("\n  核心业务表索引检查:")
    for table in high_freq_tables:
        cursor.execute(f"""
            SELECT 
                COUNT(*) as index_count
            FROM information_schema.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = '{table}'
        """)
        idx_count = cursor.fetchone()
        
        cursor.execute(f"SHOW INDEX FROM `{table}`")
        indexes = cursor.fetchall()
        
        has_tenant = any(idx['Column_name'] == 'tenant_id' for idx in indexes)
        has_delete_flag = any(idx['Column_name'] == 'delete_flag' for idx in indexes)
        
        status = "✅" if has_tenant else "❌"
        print(f"    {status} {table:35s} 索引数: {idx_count['index_count']:>3d}  "
              f"tenant_id索引: {'有' if has_tenant else '无'}  "
              f"delete_flag索引: {'有' if has_delete_flag else '无'}")

def analyze_innoDB_status(cursor):
    """分析InnoDB状态"""
    print("\n" + "="*80)
    print("【6/6】InnoDB性能状态")
    print("="*80)
    
    try:
        cursor.execute("SHOW ENGINE INNODB STATUS")
        result = cursor.fetchone()
        status = result.get('Status', '') if result else ''
        
        deadlock_pos = status.find('LATEST DETECTED DEADLOCK')
        if deadlock_pos > 0:
            print("\n  ⚠️  最近有死锁发生")
        else:
            print("\n  ✅ 近期无死锁")
        
        bp_wait_pos = status.find('Buffer pool hit rate')
        if bp_wait_pos > 0:
            line_end = status.find('\n', bp_wait_pos)
            hit_rate_line = status[bp_wait_pos:line_end]
            print(f"  {hit_rate_line.strip()}")
            
    except Exception as e:
        print(f"  ⚠️  无法查询InnoDB状态: {e}")

def main():
    print("="*80)
    print("  慢查询分析与性能诊断工具")
    print(f"  数据库: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
    print(f"  时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*80)
    
    try:
        conn = get_connection()
        with conn.cursor() as cursor:
            tables = analyze_table_sizes(cursor)
            analyze_index_usage(cursor)
            analyze_slow_queries(cursor)
            analyze_duplicate_indexes(cursor)
            analyze_full_table_scans(cursor)
            analyze_innoDB_status(cursor)
        
        conn.close()
        
        print("\n" + "="*80)
        print("  分析完成")
        print("="*80)
        
    except Exception as e:
        print(f"\n❌ 分析失败: {e}")
        print(f"   请确保数据库连接配置正确:")
        print(f"   DB_HOST={DB_CONFIG['host']}")
        print(f"   DB_PORT={DB_CONFIG['port']}")
        print(f"   DB_USER={DB_CONFIG['user']}")
        print(f"   DB_NAME={DB_CONFIG['database']}")
        sys.exit(1)

if __name__ == '__main__':
    main()
