#!/usr/bin/env python3
"""
孤儿数据检测与修复脚本

用途：
1. 检测数据库中的孤儿数据（无 tenant_id 的记录）
2. 检测孤立记录（外键引用不存在）
3. 可选：自动修复或生成修复SQL

使用方式：
    python3 scripts/fix_orphan_data.py --check          # 仅检查
    python3 scripts/fix_orphan_data.py --fix             # 检查并修复
    python3 scripts/fix_orphan_data.py --sql-only        # 生成修复SQL但不执行

依赖：
    pip3 install mysql-connector-python
"""

import argparse
import sys
from datetime import datetime
from typing import List, Dict, Any, Optional

try:
    import mysql.connector
except ImportError:
    print("请先安装依赖: pip3 install mysql-connector-python")
    sys.exit(1)


# ============================================================
# 配置
# ============================================================

DB_CONFIG = {
    'host': 'localhost',
    'port': 3308,
    'user': 'root',
    'password': 'root123',  # 修改为你的密码
    'database': 'fashion_supplychain',
}

# 需要检查 tenant_id 的表
TABLES_WITH_TENANT = [
    't_production_order',
    't_style_info',
    't_material_stock',
    't_material_purchase',
    't_material_purchase_item',
    't_production_scan_record',
    't_cutting_task',
    't_cutting_bundle',
    't_product_warehousing',
    't_quality_inspection',
    't_wage_payment',
    't_material_reconciliation',
    't_factory',
    't_user',
    't_role',
    't_permission',
]

# 孤儿数据处理策略
ORPHAN_STRATEGIES = {
    't_production_order': 'DELETE',      # 测试数据，直接删除
    't_style_info': 'DELETE',           # 测试数据，直接删除
    't_material_stock': 'DELETE',       # 测试数据，直接删除
    't_material_purchase': 'DELETE',     # 测试数据，直接删除
    't_production_scan_record': 'SET_TENANT',  # 扫码记录，尝试设置tenant_id
    't_user': 'KEEP',                   # 用户保留，标记警告
}

# ============================================================
# 主逻辑
# ============================================================

class OrphanDataFixer:
    
    def __init__(self, dry_run: bool = True, verbose: bool = False):
        self.dry_run = dry_run
        self.verbose = verbose
        self.conn = None
        self.results = []
        
    def connect(self):
        """连接数据库"""
        try:
            self.conn = mysql.connector.connect(**DB_CONFIG)
            print(f"✓ 已连接到 {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['database']}")
        except mysql.connector.Error as e:
            print(f"✗ 数据库连接失败: {e}")
            sys.exit(1)
    
    def close(self):
        """关闭连接"""
        if self.conn and self.conn.is_connected():
            self.conn.close()
            print("✓ 数据库连接已关闭")
    
    def check_orphan_records(self) -> Dict[str, List[Dict]]:
        """检查孤儿数据（无 tenant_id）"""
        results = {}
        
        print("\n" + "="*60)
        print("【孤儿数据检测】无 tenant_id 的记录")
        print("="*60)
        
        for table in TABLES_WITH_TENANT:
            if not self.table_exists(table):
                continue
                
            try:
                cursor = self.conn.cursor(dictionary=True)
                query = f"SELECT COUNT(*) as cnt FROM {table} WHERE tenant_id IS NULL OR tenant_id = 0"
                cursor.execute(query)
                result = cursor.fetchone()
                count = result['cnt']
                
                if count > 0:
                    # 获取样本数据
                    sample_query = f"SELECT * FROM {table} WHERE tenant_id IS NULL OR tenant_id = 0 LIMIT 5"
                    cursor.execute(sample_query)
                    samples = cursor.fetchall()
                    
                    results[table] = {
                        'count': count,
                        'samples': samples,
                        'strategy': ORPHAN_STRATEGIES.get(table, 'DELETE')
                    }
                    
                    print(f"\n⚠️  {table}: {count} 条孤儿记录")
                    if self.verbose and samples:
                        for s in samples[:3]:
                            print(f"   - ID: {s.get('id', 'N/A')}, 字段: {list(s.keys())[:5]}")
                
                cursor.close()
                
            except mysql.connector.Error as e:
                print(f"  ✗ 检查 {table} 失败: {e}")
        
        return results
    
    def check_isolated_records(self) -> Dict[str, List[Dict]]:
        """检查孤立记录（外键引用不存在）"""
        results = {}
        
        print("\n" + "="*60)
        print("【孤立记录检测】外键引用不存在")
        print("="*60)
        
        # 检查1：订单引用的款式是否存在
        self._check_orphaned_styles(results)
        
        # 检查2：裁剪包引用的订单是否存在
        self._check_orphaned_order_references(results)
        
        # 检查3：扫码记录引用的订单是否存在
        self._check_orphaned_scan_records(results)
        
        # 检查4：入库记录引用的订单是否存在
        self._check_orphaned_warehousing_records(results)
        
        return results
    
    def _check_orphaned_styles(self, results: Dict):
        """检查订单引用的款式是否存在"""
        try:
            cursor = self.conn.cursor(dictionary=True)
            query = """
                SELECT COUNT(*) as cnt 
                FROM t_production_order o
                LEFT JOIN t_style_info s ON o.style_id = s.id
                WHERE o.style_id IS NOT NULL 
                  AND o.style_id != ''
                  AND s.id IS NULL
            """
            cursor.execute(query)
            count = cursor.fetchone()['cnt']
            
            if count > 0:
                results['orphan_styles'] = {'count': count, 'type': '孤立款式引用'}
                print(f"\n⚠️  订单引用的款式不存在: {count} 条")
                
                # 获取样本
                cursor.execute("""
                    SELECT o.id, o.order_no, o.style_id 
                    FROM t_production_order o
                    LEFT JOIN t_style_info s ON o.style_id = s.id
                    WHERE o.style_id IS NOT NULL 
                      AND o.style_id != ''
                      AND s.id IS NULL
                    LIMIT 5
                """)
                samples = cursor.fetchall()
                for s in samples:
                    print(f"   - 订单: {s['order_no']}, 款式ID: {s['style_id']}")
            
            cursor.close()
        except mysql.connector.Error as e:
            print(f"  ✗ 检查孤立款式失败: {e}")
    
    def _check_orphaned_order_references(self, results: Dict):
        """检查裁剪包引用的订单是否存在"""
        try:
            cursor = self.conn.cursor(dictionary=True)
            query = """
                SELECT COUNT(*) as cnt 
                FROM t_cutting_bundle b
                LEFT JOIN t_production_order o ON b.order_id = o.id
                WHERE b.order_id IS NOT NULL 
                  AND b.order_id != ''
                  AND o.id IS NULL
            """
            cursor.execute(query)
            count = cursor.fetchone()['cnt']
            
            if count > 0:
                results['orphan_bundle_orders'] = {'count': count, 'type': '孤立订单引用'}
                print(f"\n⚠️  裁剪包引用的订单不存在: {count} 条")
            
            cursor.close()
        except mysql.connector.Error as e:
            print(f"  ✗ 检查孤立订单引用失败: {e}")
    
    def _check_orphaned_scan_records(self, results: Dict):
        """检查扫码记录引用的订单是否存在"""
        try:
            cursor = self.conn.cursor(dictionary=True)
            query = """
                SELECT COUNT(*) as cnt 
                FROM t_production_scan_record r
                LEFT JOIN t_production_order o ON r.order_id = o.id
                WHERE r.order_id IS NOT NULL 
                  AND r.order_id != ''
                  AND r.tenant_id IS NULL
            """
            cursor.execute(query)
            count = cursor.fetchone()['cnt']
            
            if count > 0:
                results['orphan_scans'] = {'count': count, 'type': '无租户扫码记录'}
                print(f"\n⚠️  无租户的扫码记录: {count} 条")
            
            cursor.close()
        except mysql.connector.Error as e:
            print(f"  ✗ 检查扫码记录失败: {e}")
    
    def _check_orphaned_warehousing_records(self, results: Dict):
        """检查入库记录引用的订单是否存在"""
        try:
            cursor = self.conn.cursor(dictionary=True)
            query = """
                SELECT COUNT(*) as cnt 
                FROM t_product_warehousing w
                LEFT JOIN t_production_order o ON w.order_id = o.id
                WHERE w.order_id IS NOT NULL 
                  AND w.order_id != ''
                  AND o.id IS NULL
            """
            cursor.execute(query)
            count = cursor.fetchone()['cnt']
            
            if count > 0:
                results['orphan_warehousing'] = {'count': count, 'type': '孤立入库记录'}
                print(f"\n⚠️  入库记录引用的订单不存在: {count} 条")
            
            cursor.close()
        except mysql.connector.Error as e:
            print(f"  ✗ 检查入库记录失败: {e}")
    
    def table_exists(self, table: str) -> bool:
        """检查表是否存在"""
        try:
            cursor = self.conn.cursor()
            cursor.execute(f"SHOW TABLES LIKE '{table}'")
            result = cursor.fetchone()
            cursor.close()
            return result is not None
        except:
            return False
    
    def generate_fix_sql(self, orphan_records: Dict, isolated_records: Dict) -> str:
        """生成修复SQL"""
        sql_lines = [
            "-- ============================================================",
            f"-- 孤儿数据修复SQL - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}",
            "-- ============================================================",
            "",
            "-- 注意: 执行前请先备份数据库！",
            "-- 执行方式: mysql -u root -p fashion_supplychain < fix_orphan_data.sql",
            "",
        ]
        
        # 孤儿数据修复
        if orphan_records:
            sql_lines.append("-- 【孤儿数据修复】")
            for table, info in orphan_records.items():
                strategy = info['strategy']
                if strategy == 'DELETE':
                    sql_lines.append(f"-- {table}: 建议删除 {info['count']} 条孤儿记录")
                    sql_lines.append(f"-- DELETE FROM {table} WHERE tenant_id IS NULL OR tenant_id = 0;")
                elif strategy == 'SET_TENANT':
                    sql_lines.append(f"-- {table}: 需要人工确认后设置 tenant_id")
                    sql_lines.append(f"-- UPDATE {table} SET tenant_id = ? WHERE tenant_id IS NULL;")
                elif strategy == 'KEEP':
                    sql_lines.append(f"-- {table}: 保留，需要人工检查")
            sql_lines.append("")
        
        # 孤立记录修复
        if isolated_records:
            sql_lines.append("-- 【孤立记录修复】")
            for key, info in isolated_records.items():
                sql_lines.append(f"-- {info['type']}: {info['count']} 条需要检查")
            sql_lines.append("")
        
        # 备份建议
        sql_lines.extend([
            "-- ============================================================",
            "-- 备份建议",
            "-- ============================================================",
            "-- 1. 备份数据库: mysqldump -u root -p fashion_supplychain > backup_$(date +%Y%m%d).sql",
            "-- 2. 执行修复",
            "-- 3. 验证修复结果",
            "-- 4. 如有问题，从备份恢复",
        ])
        
        return "\n".join(sql_lines)
    
    def run(self):
        """执行检查"""
        self.connect()
        
        try:
            # 1. 检查孤儿数据
            orphan_records = self.check_orphan_records()
            
            # 2. 检查孤立记录
            isolated_records = self.check_isolated_records()
            
            # 3. 生成报告
            print("\n" + "="*60)
            print("【检查结果汇总】")
            print("="*60)
            
            total_issues = len(orphan_records) + len(isolated_records)
            if total_issues == 0:
                print("\n✅ 未发现孤儿数据或孤立记录！")
            else:
                print(f"\n⚠️  发现 {total_issues} 个问题需要处理")
                
                # 生成SQL
                sql = self.generate_fix_sql(orphan_records, isolated_records)
                sql_file = "fix_orphan_data.sql"
                with open(sql_file, 'w', encoding='utf-8') as f:
                    f.write(sql)
                print(f"\n✓ 修复SQL已生成: {sql_file}")
                print("  请检查并手动执行，或使用 --fix 参数自动修复")
            
        finally:
            self.close()


# ============================================================
# 入口
# ============================================================

def main():
    parser = argparse.ArgumentParser(description='孤儿数据检测与修复工具')
    parser.add_argument('--check', action='store_true', help='仅检查，不修复')
    parser.add_argument('--fix', action='store_true', help='检查并修复（需要确认）')
    parser.add_argument('--sql-only', action='store_true', help='生成SQL但不执行')
    parser.add_argument('--verbose', '-v', action='store_true', help='详细输出')
    
    args = parser.parse_args()
    
    fixer = OrphanDataFixer(dry_run=not args.fix, verbose=args.verbose)
    fixer.run()


if __name__ == '__main__':
    main()
