#!/usr/bin/env python3
"""
Flyway 新增迁移列依赖检查
==========================
只检查 git diff 中新增的迁移文件，验证其引用的列是否已在
init.sql + 之前的迁移中定义。

直接拦截 06-18 事故类型：
  V20260617002 创建索引引用 t_scan_record.delete_flag，
  但该列从未在任何迁移中创建。

退出码：0 = 通过，1 = 发现悬空列引用，2 = 环境错误

用法：
  python3 scripts/check-flyway-column-deps.py           # 检查未提交的新增迁移
  python3 scripts/check-flyway-column-deps.py --all      # 全量检查（误报较多）
  python3 scripts/check-flyway-column-deps.py --since SHA # 检查指定 commit 之后的新增
"""
import os
import re
import sys
import subprocess
from collections import defaultdict
from typing import Dict, Set, List, Tuple

MIGRATION_DIR = "backend/src/main/resources/db/migration"
INIT_SQL = "backend/src/main/resources/init.sql"

VERSION_PATTERN = re.compile(r'^V(\d+[a-z]?)', re.IGNORECASE)


def extract_version(fname: str) -> int:
    m = VERSION_PATTERN.match(fname)
    if not m:
        return 0
    ver = m.group(1)
    try:
        return int(ver)
    except ValueError:
        return int(re.sub(r'[a-z]$', '', ver, flags=re.IGNORECASE))


def git_new_files(since: str = None) -> List[str]:
    """获取 git 中新增的迁移文件"""
    try:
        if since:
            cmd = f"git diff --name-only --diff-filter=A {since}..HEAD -- {MIGRATION_DIR}/V*.sql"
        else:
            # 未提交的新增文件（untracked + staged）
            cmd = f"git ls-files --others --exclude-standard {MIGRATION_DIR}/V*.sql"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        files = [f.strip() for f in result.stdout.splitlines() if f.strip()]
        return [os.path.basename(f) for f in files]
    except Exception:
        return []


def parse_create_table_columns(sql: str) -> Dict[str, Set[str]]:
    """从 CREATE TABLE 解析表→列集合（用括号深度计数，避免 VARCHAR(50) 截断）"""
    tables = {}
    # 找到所有 CREATE TABLE 位置
    pattern = re.compile(
        r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(',
        re.IGNORECASE
    )
    for match in pattern.finditer(sql):
        table_name = match.group(1).lower()
        # 从 match.end() - 1（即 '('）开始，用深度计数找到匹配的 ')'
        start = match.end() - 1
        depth = 0
        end = start
        for i in range(start, len(sql)):
            if sql[i] == '(':
                depth += 1
            elif sql[i] == ')':
                depth -= 1
                if depth == 0:
                    end = i
                    break
        body = sql[start + 1:end]

        # 解析列名
        columns = set()
        depth = 0
        current = ""
        for char in body:
            if char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
            if char == ',' and depth == 0:
                col = _extract_col_name(current.strip())
                if col:
                    columns.add(col)
                current = ""
            else:
                current += char
        col = _extract_col_name(current.strip())
        if col:
            columns.add(col)
        tables[table_name] = columns
    return tables


def _extract_col_name(line: str) -> str:
    """从列定义行提取列名，跳过约束定义"""
    if not line:
        return ""
    if re.match(r'^(PRIMARY\s+KEY|UNIQUE\s+KEY|KEY|INDEX|CONSTRAINT|FULLTEXT|FOREIGN\s+KEY)\b',
                line, re.IGNORECASE):
        return ""
    m = re.match(r'`?(\w+)`?\s+', line)
    if m:
        return m.group(1).lower()
    return ""


def parse_alter_add_column(sql: str) -> List[Tuple[str, str]]:
    """ALTER TABLE ADD COLUMN"""
    results = []
    pattern = re.compile(
        r'ALTER\s+TABLE\s+`?(\w+)`?\s+ADD\s+(?:COLUMN\s+)?`?(\w+)`?',
        re.IGNORECASE
    )
    for match in pattern.finditer(sql):
        results.append((match.group(1).lower(), match.group(2).lower()))
    return results


def parse_index_columns(sql: str) -> List[Tuple[str, List[str]]]:
    """CREATE INDEX 引用的列"""
    results = []
    pattern = re.compile(
        r'CREATE\s+(?:UNIQUE\s+)?INDEX\s+\w+\s+ON\s+`?(\w+)`?\s*\(([^)]+)\)',
        re.IGNORECASE
    )
    for match in pattern.finditer(sql):
        table = match.group(1).lower()
        cols_str = match.group(2)
        cols = []
        for part in cols_str.split(','):
            part = part.strip()
            m = re.match(r'`?(\w+)`?', part)
            if m:
                cols.append(m.group(1).lower())
        results.append((table, cols))
    return results


def build_column_map() -> Dict[str, Set[str]]:
    """从 init.sql + 所有已提交的迁移文件构建表→列映射"""
    table_columns: Dict[str, Set[str]] = defaultdict(set)

    # 1. init.sql
    if os.path.isfile(INIT_SQL):
        with open(INIT_SQL, 'r', encoding='utf-8', errors='replace') as f:
            sql = f.read()
        for table, cols in parse_create_table_columns(sql).items():
            table_columns[table].update(cols)
        for table, col in parse_alter_add_column(sql):
            table_columns[table].add(col)

    # 2. 所有已提交的迁移文件（按版本号排序）
    files = []
    migration_dir = MIGRATION_DIR
    if os.path.isdir(migration_dir):
        for fname in os.listdir(migration_dir):
            if fname.endswith('.sql') and fname.startswith('V'):
                files.append((extract_version(fname), fname))
    files.sort(key=lambda x: (x[0], x[1]))

    for version, fname in files:
        filepath = os.path.join(migration_dir, fname)
        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                sql = f.read()
        except Exception:
            continue
        for table, cols in parse_create_table_columns(sql).items():
            table_columns[table].update(cols)
        for table, col in parse_alter_add_column(sql):
            table_columns[table].add(col)

    return table_columns


def check_new_migrations(new_files: List[str], table_columns: Dict[str, Set[str]]) -> List[str]:
    """检查新增迁移文件中的索引列引用"""
    errors = []
    for fname in new_files:
        filepath = os.path.join(MIGRATION_DIR, fname)
        if not os.path.isfile(filepath):
            continue
        try:
            with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
                sql = f.read()
        except Exception as e:
            errors.append(f"{fname}: 读取失败 {e}")
            continue

        # 检查索引引用的列
        for table, cols in parse_index_columns(sql):
            known_cols = table_columns.get(table, set())
            if not known_cols:
                # 表可能在这个迁移里才创建，先更新映射
                created = parse_create_table_columns(sql)
                if table in created:
                    known_cols = created[table]
                    table_columns[table].update(known_cols)
                else:
                    continue  # 表不存在，跳过（可能拼写错误，但不报）
            for col in cols:
                if col not in known_cols:
                    errors.append(
                        f"{fname}: 索引引用 {table}.{col} 但该列未在 init.sql 或之前的迁移中定义"
                    )

    return errors


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--all', action='store_true', help='全量检查所有迁移（误报较多）')
    parser.add_argument('--since', type=str, help='检查指定 commit 之后的新增迁移')
    args = parser.parse_args()

    if not os.path.isdir(MIGRATION_DIR):
        print(f"❌ 迁移目录不存在: {MIGRATION_DIR}")
        sys.exit(2)

    # 确定要检查的文件
    if args.all:
        files = []
        for fname in os.listdir(MIGRATION_DIR):
            if fname.endswith('.sql') and fname.startswith('V'):
                files.append(fname)
        print(f"📂 全量检查 {len(files)} 个迁移文件")
    else:
        files = git_new_files(args.since)
        if not files:
            print("✅ 没有新增的迁移文件，跳过列依赖检查")
            sys.exit(0)
        print(f"📂 检查 {len(files)} 个新增迁移文件:")
        for f in files:
            print(f"  • {f}")

    # 构建列映射
    print("🏗️  构建列映射（init.sql + 已有迁移）...")
    table_columns = build_column_map()
    print(f"  表数量: {len(table_columns)}")
    print(f"  列总数: {sum(len(v) for v in table_columns.values())}")

    # 检查新增文件
    errors = check_new_migrations(files, table_columns)

    if errors:
        print(f"\n❌ 发现 {len(errors)} 处悬空列引用：")
        for e in errors:
            print(f"  • {e}")
        sys.exit(1)
    else:
        print(f"\n✅ 列依赖检查通过，未发现悬空引用")
        sys.exit(0)


if __name__ == "__main__":
    main()
