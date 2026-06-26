#!/usr/bin/env python3
"""
数据归档脚本
定期归档旧数据，清理大表，释放存储空间

用法：
  python3 scripts/data-archiver.py --dry-run           # 预览归档内容
  python3 scripts/data-archiver.py --execute            # 执行归档
  python3 scripts/data-archiver.py --status            # 查看归档状态
"""

import os
import sys
import argparse
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import subprocess

# ============================================================
# 配置
# ============================================================

# 归档策略配置
ARCHIVE_STRATEGIES = {
    # 表名: (保留天数, 批量大小, 是否启用)
    "t_operation_log": (90, 5000, True),      # 操作日志保留90天
    "t_ai_conversation_memory": (180, 2000, True),  # AI对话记忆保留180天
    "t_ai_job_run_log": (30, 3000, True),     # AI任务日志保留30天
    "t_scan_record": (365, 10000, False),     # 扫码记录保留365天（默认禁用，数据重要）
}

# 归档表（需要归档到历史表）
ARCHIVE_TO_HISTORY = {
    # source_table: (history_table, date_column, partition_column)
    "t_operation_log": ("t_operation_log_archive", "create_time", "tenant_id"),
}


def get_db_config() -> dict:
    """获取数据库配置"""
    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "3308")),
        "user": os.getenv("DB_USER", "root"),
        "password": os.getenv("DB_PASSWORD") or os.getenv("MCP_DB_PASSWORD", ""),
    }


def mysql_query(sql: str, fetch: bool = True) -> Optional[List[Dict]]:
    """执行MySQL查询"""
    config = get_db_config()
    try:
        result = subprocess.run(
            [
                "mysql", "-h", config["host"], "-P", str(config["port"]),
                "-u", config["user"],
                f"--password={config['password']}",
                "-e", sql,
                "fashion_supplychain",
                "-s", "--batch"
            ],
            capture_output=True,
            text=True,
            timeout=60
        )
        if result.returncode != 0:
            print(f"❌ SQL执行失败: {result.stderr}")
            return None

        if not fetch:
            return []

        # 解析结果
        lines = result.stdout.strip().split("\n")
        if not lines or len(lines) < 2:
            return []

        headers = lines[0].split("\t")
        rows = []
        for line in lines[1:]:
            if not line.strip():
                continue
            values = line.split("\t")
            row = dict(zip(headers, values))
            rows.append(row)
        return rows
    except Exception as e:
        print(f"❌ 查询异常: {e}")
        return None


def mysql_execute(sql: str) -> bool:
    """执行MySQL语句"""
    config = get_db_config()
    try:
        result = subprocess.run(
            [
                "mysql", "-h", config["host"], "-P", str(config["port"]),
                "-u", config["user"],
                f"--password={config['password']}",
                "-e", sql,
                "fashion_supplychain"
            ],
            capture_output=True,
            text=True,
            timeout=300
        )
        if result.returncode != 0:
            print(f"❌ 执行失败: {result.stderr}")
            return False
        return True
    except Exception as e:
        print(f"❌ 执行异常: {e}")
        return False


def get_table_size(table: str) -> Optional[int]:
    """获取表大小（行数）"""
    sql = f"""
        SELECT TABLE_ROWS as cnt
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = 'fashion_supplychain'
        AND TABLE_NAME = '{table}'
    """
    result = mysql_query(sql)
    if result:
        try:
            return int(result[0].get("cnt", 0))
        except:
            return 0
    return None


def get_old_records_count(table: str, days: int, date_column: str = "create_time") -> int:
    """获取需要归档的记录数"""
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    sql = f"""
        SELECT COUNT(*) as cnt
        FROM {table}
        WHERE {date_column} < '{cutoff}'
    """
    result = mysql_query(sql)
    if result:
        try:
            return int(result[0].get("cnt", 0))
        except:
            return 0
    return 0


def preview_archive(table: str, days: int, date_column: str = "create_time") -> Dict:
    """预览归档内容"""
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")

    info = {
        "table": table,
        "retention_days": days,
        "cutoff_date": cutoff,
        "total_rows": get_table_size(table) or 0,
        "old_rows": 0,
        "old_percentage": 0.0,
        "size_estimate_mb": 0,
    }

    # 计算待归档行数
    old_rows = get_old_records_count(table, days, date_column)
    info["old_rows"] = old_rows
    if info["total_rows"] > 0:
        info["old_percentage"] = round(old_rows / info["total_rows"] * 100, 2)

    # 估算大小（假设每行1KB）
    info["size_estimate_mb"] = round(old_rows * 1 / 1024, 2)

    return info


def archive_table(table: str, days: int, batch_size: int, date_column: str = "create_time", dry_run: bool = True) -> bool:
    """归档指定表"""
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    action = "预览" if dry_run else "执行"

    print(f"\n📦 {action}归档表: {table}")
    print(f"   保留天数: {days}")
    print(f"   截止日期: {cutoff}")

    # 检查表是否存在
    sql = f"""
        SELECT COUNT(*) as cnt
        FROM information_schema.tables
        WHERE TABLE_SCHEMA = 'fashion_supplychain'
        AND TABLE_NAME = '{table}'
    """
    result = mysql_query(sql)
    if not result or int(result[0].get("cnt", 0)) == 0:
        print(f"   ⚠️ 表 {table} 不存在，跳过")
        return True

    # 统计待删除行数
    old_rows = get_old_records_count(table, days, date_column)
    if old_rows == 0:
        print(f"   ✅ 无需归档的数据")
        return True

    print(f"   待归档: {old_rows:,} 行")

    if dry_run:
        print(f"   🔍 预览前3行:")
        preview_sql = f"""
            SELECT *
            FROM {table}
            WHERE {date_column} < '{cutoff}'
            LIMIT 3
        """
        preview = mysql_query(preview_sql)
        if preview:
            for i, row in enumerate(preview[:3], 1):
                print(f"      [{i}] {row}")
        return True

    # 实际执行归档（分批删除）
    deleted = 0
    batch = 0
    while deleted < old_rows:
        batch += 1
        delete_sql = f"""
            DELETE FROM {table}
            WHERE {date_column} < '{cutoff}'
            ORDER BY {date_column}
            LIMIT {batch_size}
        """
        print(f"   批次 {batch}: 删除 {batch_size} 行...")
        if not mysql_execute(delete_sql):
            print(f"   ❌ 批次 {batch} 执行失败")
            return False

        deleted += batch_size
        if deleted >= old_rows:
            break

    print(f"   ✅ 归档完成，共删除 {deleted:,} 行")
    return True


def create_archive_table(source_table: str, history_table: str) -> bool:
    """创建归档历史表"""
    print(f"\n🔧 创建归档历史表: {history_table}")

    # 创建表结构
    sql = f"""
        CREATE TABLE IF NOT EXISTS {history_table} (
            id BIGINT NOT NULL,
            tenant_id BIGINT,
            archived_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id, archived_at),
            KEY idx_tenant (tenant_id),
            KEY idx_archived_at (archived_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """
    return mysql_execute(sql)


def status_report():
    """生成归档状态报告"""
    print("\n📊 数据归档状态报告")
    print("=" * 60)
    print(f"⏰ {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    total_size = 0
    total_rows = 0
    total_to_archive = 0

    for table, (days, batch, enabled) in ARCHIVE_STRATEGIES.items():
        if not enabled:
            continue

        info = preview_archive(table, days)
        status = "✅" if info["old_rows"] == 0 else "📦"
        print(f"\n{status} {table}")
        print(f"   总行数: {info['total_rows']:,}")
        print(f"   待归档: {info['old_rows']:,} ({info['old_percentage']}%)")
        print(f"   保留期: {days}天")

        total_rows += info["total_rows"]
        total_to_archive += info["old_rows"]

    print("\n" + "=" * 60)
    print(f"📈 汇总:")
    print(f"   总记录数: {total_rows:,}")
    print(f"   待归档: {total_to_archive:,}")
    print(f"   可释放空间: ~{round(total_to_archive * 1 / 1024, 2)} MB")
    print("=" * 60)


def main():
    parser = argparse.ArgumentParser(description="数据归档脚本")
    parser.add_argument("--dry-run", action="store_true", help="预览模式（不实际执行）")
    parser.add_argument("--execute", action="store_true", help="执行归档")
    parser.add_argument("--status", action="store_true", help="查看归档状态")
    parser.add_argument("--table", type=str, help="指定归档的表")
    parser.add_argument("--days", type=int, help="覆盖默认保留天数")
    args = parser.parse_args()

    if args.status:
        status_report()
        return

    if not args.execute:
        print("⚠️ 默认执行预览模式，使用 --execute 实际执行归档")
        print("   或使用 --dry-run 仅预览")
        dry_run = True
    else:
        dry_run = False

    tables_to_process = []
    if args.table:
        if args.table in ARCHIVE_STRATEGIES:
            tables_to_process = [args.table]
        else:
            print(f"❌ 未知表: {args.table}")
            print(f"   可用表: {', '.join(ARCHIVE_STRATEGIES.keys())}")
            return
    else:
        # 只处理启用且有数据的表
        tables_to_process = [t for t, (_, _, enabled) in ARCHIVE_STRATEGIES.items() if enabled]

    for table in tables_to_process:
        days, batch, _ = ARCHIVE_STRATEGIES[table]
        if args.days:
            days = args.days
        archive_table(table, days, batch, dry_run=dry_run)

    if dry_run:
        print("\n🔍 这是预览模式，使用 --execute 实际执行归档")


if __name__ == "__main__":
    main()
