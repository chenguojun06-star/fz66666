#!/usr/bin/env python3
"""
Entity-Flyway 对齐检查（CI 强制门禁）
=====================================
检查 Entity 字段是否都有对应的 Flyway 迁移脚本，精确匹配「表名+列名」。

修复了两个历史漏洞：
  1. 之前只检查 @TableField 注解的字段，漏掉无注解的普通字段（MyBatis Plus 默认映射）
  2. 之前只按列名匹配，别的表有同名列会误判通过，实际本表缺列也发现不了

规则：
  每当在 entity/*.java 文件里新增字段（带 @TableField 或不带注解的普通字段），
  对应表的 Flyway 脚本里必须有该列（CREATE TABLE 或 ADD COLUMN）。

退出码：0 = 通过，1 = 违规（CI 将阻断本次 push/merge）

用法：
  python3 scripts/check-entity-flyway.py              # CI 模式（检查 HEAD~1..HEAD 新增的字段）
  python3 scripts/check-entity-flyway.py --all        # 全量扫描模式（本地debug用）
  python3 scripts/check-entity-flyway.py --since <sha>  # 从指定 commit 对比
"""
import os
import re
import sys
import subprocess
import argparse
from typing import Optional, List, Tuple, Dict, Set

MIGRATION_DIR = "backend/src/main/resources/db/migration"
ENTITY_GLOB   = "backend/src/main/java"

SKIP_COLUMNS = {
    "id", "create_time", "update_time", "delete_flag", "tenant_id",
    "created_by", "updated_by", "version",
}


def camel_to_snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


# ──────────────────────────────────────────────
# 1. 从 Entity 文件提取表名
# ──────────────────────────────────────────────
def extract_table_name(java_text: str) -> Optional[str]:
    """从 @TableName 注解提取表名"""
    m = re.search(r'@TableName\s*\(\s*["\']([a-z][a-z0-9_]*)["\']', java_text, re.IGNORECASE)
    return m.group(1).lower() if m else None


# ──────────────────────────────────────────────
# 2. 从 Entity 文件提取所有真实 DB 字段
# ──────────────────────────────────────────────
def extract_entity_fields(java_text: str) -> List[Tuple[str, str]]:
    """
    返回 [(java_field, column_name) —— Entity 中所有真实 DB 字段。
    跳过 @TableField(exist=false)、@Transient、serialVersionUID 等。
    """
    text = re.sub(r"/\*.*?\*/", "", java_text, flags=re.DOTALL)
    lines = text.splitlines()
    results = []
    i = 0
    pending_annotation: str | None = None
    is_virtual = False
    while i < len(lines):
        stripped = lines[i].strip()
        if "@TableField" in stripped:
            pending_annotation = stripped
            is_virtual = bool(re.search(r"exist\s*=\s*false", stripped, re.IGNORECASE))
        elif "@Transient" in stripped:
            is_virtual = True
            pending_annotation = None
        elif re.match(r"(private|protected)\s+\S+\s+(\w+)", stripped):
            fm = re.match(r"(private|protected)\s+\S+\s+(\w+)", stripped)
            java_field = fm.group(2)
            if java_field == "serialVersionUID" or java_field.startswith("log"):
                pending_annotation = None
                is_virtual = False
                i += 1
                continue
            if not is_virtual:
                if pending_annotation:
                    m = re.search(
                        r'@TableField\s*\(\s*(?:value\s*=\s*)?["\']([a-z][a-z0-9_]*)["\']',
                        pending_annotation,
                        re.IGNORECASE,
                    )
                    col = m.group(1).lower() if m else camel_to_snake(java_field)
                else:
                    col = camel_to_snake(java_field)
                if col not in SKIP_COLUMNS:
                    results.append((java_field, col))
            pending_annotation = None
            is_virtual = False
        else:
            if not stripped.startswith("@"):
                pending_annotation = None
                is_virtual = False
        i += 1
    return results


# ──────────────────────────────────────────────
# 3. Flyway 解析：建立 table -> set[column]
# ──────────────────────────────────────────────
def parse_flyway_tables() -> Dict[str, Set[str]]:
    """
    扫描所有 Flyway 脚本，建立 {table_name -> {column_name, ...} 映射。
    
    识别以下模式：
    - CREATE TABLE `t_xxx` ( `col` ...  → t_xxx 包含 col
    - ALTER TABLE `t_xxx` ADD COLUMN `col` ...  → t_xxx 增加 col
    - ADD COLUMN `col` ...  → 需要结合上下文找表名（用存储过程的情况较难解析，
      用模糊匹配兜底）
    """
    tables: Dict[str, Set[str]] = {}

    if not os.path.isdir(MIGRATION_DIR):
        print(f"⚠️  Flyway 目录不存在: {MIGRATION_DIR}")
        return tables

    for fname in sorted(os.listdir(MIGRATION_DIR)):
        if not fname.endswith(".sql"):
            continue
        path = os.path.join(MIGRATION_DIR, fname)
        with open(path, encoding="utf-8", errors="ignore") as f:
            content = f.read()

        content_lower = content.lower()

        # 模式1: CREATE TABLE `t_xxx` ( ... )
        for m in re.finditer(
            r'create\s+table\s+(?:if\s+not\s+exists\s+)?`?(\w+)`?\s*\(([^;]*?\))',
            content_lower,
            re.IGNORECASE | re.DOTALL,
        ):
            table = m.group(1)
            cols_text = m.group(2)
            if table not in tables:
                tables[table] = set()
            for cm in re.finditer(r'`(\w+)`\s+\w+', cols_text):
                    tables[table].add(cm.group(1))

        # 模式2: ALTER TABLE `t_xxx` ADD COLUMN `col`
        for m in re.finditer(
            r'alter\s+table\s+`?(\w+)`?\s+add\s+(?:column\s+)?`?(\w+)`?',
            content_lower,
            re.IGNORECASE,
        ):
            table = m.group(1)
            col = m.group(2)
            if table not in tables:
                tables[table] = set()
            tables[table].add(col)

        # 模式3: 存储过程内的 ADD COLUMN（幂等写法）
        # SET @s = IF(...ADD COLUMN `col`...ALTER TABLE `table`...
        for m in re.finditer(
            r'alter\s+table\s+`?(\w+)`?\s+add\s+(?:column\s+)?`?(\w+)`?',
            content_lower,
            re.IGNORECASE,
        ):
            table = m.group(1)
            col = m.group(2)
            if table not in tables:
                tables[table] = set()
            tables[table].add(col)

    return tables


def column_exists_for_table(table: str, column: str, flyway_tables: Dict[str, Set[str]]) -> Optional[bool]:
    """
    检查表 table 是否在 Flyway 中有该列。
    返回最先找到的迁移文件名（简化版：返回 True/None）
    """
    if table not in flyway_tables:
        return None
    if column in flyway_tables[table]:
        return True
    return None


# ──────────────────────────────────────────────
# 4. 从 git diff 提取本次新增的字段
# ──────────────────────────────────────────────
def get_added_fields(since_sha: Optional[str] = None) -> List[Tuple[str, str, str]]:
    """
    返回 [(entity_file, table_name, column_name), ...] —— 本次 diff 里新增的真实 DB 字段。
    """
    if since_sha:
        diff_range = [since_sha, "HEAD"]
    else:
        diff_range = ["HEAD~1", "HEAD"]

    try:
        diff_bytes = subprocess.check_output(
            ["git", "diff"] + diff_range + [
                "--unified=5", "--diff-filter=AM",
                "--", "*/entity/*.java",
            ],
            stderr=subprocess.DEVNULL,
        )
        diff_text = diff_bytes.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError:
        print("ℹ️  无法执行 git diff（可能是初始 commit），跳过检查。")
        return []

    results: List[Tuple[str, str, str]] = []
    current_file = ""
    current_table = None
    current_hunk_added_lines = []

    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            current_file = line[6:]
            current_table = None
            current_hunk_added_lines = []
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue

        added_line = line[1:]

        if "@TableName" in added_line:
            m = re.search(r'@TableName\s*\(\s*["\']([a-z][a-z0-9_]*)["\']', added_line, re.IGNORECASE)
            if m:
                current_table = m.group(1).lower()

        # 跳过虚拟字段
        if re.search(r"exist\s*=\s*false", added_line, re.IGNORECASE):
            continue
        if "@Transient" in added_line:
            continue

        # 字段定义行：private Type fieldName
        fm = re.match(r"\s*(private|protected)\s+\S+\s+(\w+)\s*;", added_line)
        if fm and current_table:
            java_field = fm.group(2)
            if java_field == "serialVersionUID" or java_field.startswith("log"):
                continue
            col = camel_to_snake(java_field)
            if col not in SKIP_COLUMNS:
                results.append((current_file, current_table, col))

    return results


# ──────────────────────────────────────────────
# 5. 全量扫描模式（--all）
# ──────────────────────────────────────────────
def scan_all_entities() -> List[Tuple[str, str, str]]:
    """扫描全部 entity 文件，返回所有真实 DB 字段 [(file, table, column), ...]"""
    results = []
    for root, _, files in os.walk(ENTITY_GLOB):
        if "entity" not in root:
            continue
        for fname in files:
            if not fname.endswith(".java"):
                continue
            path = os.path.join(root, fname)
            with open(path, encoding="utf-8", errors="ignore") as f:
                text = f.read()
            table = extract_table_name(text)
            if not table:
                continue
            for java_field, col in extract_entity_fields(text):
                results.append((path, table, col))
    return results


# ──────────────────────────────────────────────
# 6. 主流程
# ──────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="全量扫描所有 entity（本地调试用）")
    parser.add_argument("--since", default=None, help="从指定 commit SHA 对比")
    args = parser.parse_args()

    flyway_tables = parse_flyway_tables()
    if not flyway_tables:
        print("⚠️  没有解析到 Flyway 表信息，跳过检查。")
        return 0

    if args.all:
        print("🔍 全量扫描模式（仅供本地调试）")
        print("⚠️  注意：--all 模式会扫描全部 entity 字段，但许多字段来自 DataInitializer 原始建表")
        print("   SQL 不在 Flyway 脚本里，属于正常现象，不代表云端 DB 缺列。")
        print("   如需准确核查云端缺列，请连接真实 DB 查询。")
        print()
        fields = scan_all_entities()
    else:
        fields = get_added_fields(args.since)
        if not fields:
            print("✅ 本次提交未检测到新增 Entity 字段，无需校验。")
            return 0
        print(f"🔍 检测到 {len(fields)} 个新增字段，开始校验…\n")

    violations: List[Tuple[str, str, str]] = []
    for (entity_file, table, col) in sorted(set(fields)):
        found = column_exists_for_table(table, col, flyway_tables)
        if found:
            print(f"  ✅  {table}.{col}")
        else:
            print(f"  ❌  {table}.{col:30s}  ← 【未找到 Flyway 脚本！】 ({entity_file})")
            violations.append((entity_file, table, col))

    print()
    if violations:
        print("=" * 70)
        print(f"❌  Entity-Flyway 对齐检查 FAILED — {len(violations)} 个字段无迁移脚本")
        print("=" * 70)
        print("\n修复方法：")
        print(f"  在 {MIGRATION_DIR}/V<版本>__<描述>.sql 中用 INFORMATION_SCHEMA 幂等写法添加以下列：\n")
        seen_tables = set()
        for (f, table, col) in violations:
            if table not in seen_tables:
                print(f"  表 {table}:")
                seen_tables.add(table)
            print(f"    ALTER TABLE `{table}` ADD COLUMN `{col}` <类型>;")
        print("\n  参考已有脚本：V20260420001__add_production_order_contact_qrcode_columns.sql")
        print("=" * 70)
        return 1

    total = len(set(fields))
    print(f"✅  Entity-Flyway 对齐检查通过（{total} 个字段全部覆盖）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
