#!/usr/bin/env python3
"""
Entity-Flyway 对齐检查（CI 强制门禁）
=====================================
检查本次提交新增的 @TableField 字段是否都有对应的 Flyway 迁移脚本。

规则：
  每当在 entity/*.java 文件里新增 @TableField("column_name")，
  backend/src/main/resources/db/migration/ 目录下必须有至少一个 .sql 文件
  包含该列名 —— 无论是 CREATE TABLE(建表时已包含) 还是 ADD COLUMN。

退出码：0 = 通过，1 = 违规（CI 将阻断本次 push/merge）

用法：
  python3 scripts/check-entity-flyway.py              # CI 模式（检查 HEAD~1..HEAD）
  python3 scripts/check-entity-flyway.py --all        # 全量扫描模式（本地debug用）
  python3 scripts/check-entity-flyway.py --since <sha>  # 从指定 commit 对比
"""
import os
import re
import sys
import subprocess
import argparse
from typing import Optional, List, Tuple, Dict

MIGRATION_DIR = "backend/src/main/resources/db/migration"
ENTITY_GLOB   = "backend/src/main/java"

# 这些基础字段在DataInitializer/初始dump时就存在于几乎所有表，跳过它们避免噪音
SKIP_COLUMNS = {
    "id", "create_time", "update_time", "delete_flag", "tenant_id",
    "created_by", "updated_by", "version",
}


# ──────────────────────────────────────────────
# 1. Flyway 全量内容缓存（只读一次）
# ──────────────────────────────────────────────
def load_flyway_content() -> Dict[str, str]:
    """返回 {filename: content_lower} """
    result = {}
    if not os.path.isdir(MIGRATION_DIR):
        print(f"⚠️  Flyway 目录不存在: {MIGRATION_DIR}")
        return result
    for fname in sorted(os.listdir(MIGRATION_DIR)):
        if fname.endswith(".sql"):
            path = os.path.join(MIGRATION_DIR, fname)
            with open(path, encoding="utf-8", errors="ignore") as f:
                result[fname] = f.read().lower()
    return result


def column_in_flyway(column: str, flyway_content: Dict[str, str]) -> Optional[str]:
    """返回最先找到该列名的 Flyway 脚本文件名，或 None"""
    needle = column.lower()
    for fname, content in flyway_content.items():
        if needle in content:
            return fname
    return None


# ──────────────────────────────────────────────
# 2. 从 git diff 提取新增的 @TableField 列名
# ──────────────────────────────────────────────
def get_added_table_fields(since_sha: Optional[str] = None) -> List[Tuple[str, str]]:
    """
    返回 [(entity_file, column_name), ...] —— 本次 diff 里新增的真实 DB 字段。
    """
    if since_sha:
        diff_range = [since_sha, "HEAD"]
    else:
        diff_range = ["HEAD~1", "HEAD"]

    try:
        diff_bytes = subprocess.check_output(
            ["git", "diff"] + diff_range + [
                "--unified=0", "--diff-filter=AM",
                "--", "*/entity/*.java",
            ],
            stderr=subprocess.DEVNULL,
        )
        diff_text = diff_bytes.decode("utf-8", errors="replace")
    except subprocess.CalledProcessError:
        print("ℹ️  无法执行 git diff（可能是初始 commit），跳过检查。")
        return []

    results: list[tuple[str, str]] = []
    current_file = ""

    for line in diff_text.splitlines():
        if line.startswith("+++"):
            # +++ b/backend/.../entity/Foo.java
            current_file = line[6:] if line.startswith("+++ b/") else line[4:]
            continue

        if not line.startswith("+") or line.startswith("+++"):
            continue

        added_line = line[1:]  # 去掉开头的 +

        # 只关心 @TableField 注解行
        if "@TableField" not in added_line:
            continue

        # 跳过虚拟字段
        if re.search(r"exist\s*=\s*false", added_line, re.IGNORECASE):
            continue

        # ① @TableField("column_name") 或 @TableField(value = "column_name")
        m = re.search(
            r'@TableField\s*\(\s*(?:value\s*=\s*)?["\']([a-z][a-z0-9_]*)["\']',
            added_line,
            re.IGNORECASE,
        )
        if m:
            col = m.group(1).lower()
            if col not in SKIP_COLUMNS:
                results.append((current_file, col))

    return results


# ──────────────────────────────────────────────
# 3. 全量扫描模式（--all）
# ──────────────────────────────────────────────
def camel_to_snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def scan_all_entities() -> List[Tuple[str, str]]:
    """扫描全部 entity 文件，返回所有真实 DB 字段 [(file, column), ...]"""
    results = []
    for root, _, files in os.walk(ENTITY_BASE := ENTITY_GLOB):
        if "entity" not in root:
            continue
        for fname in files:
            if not fname.endswith(".java"):
                continue
            path = os.path.join(root, fname)
            with open(path, encoding="utf-8", errors="ignore") as f:
                text = f.read()
            # 移除 block comments
            text = re.sub(r"/\*.*?\*/", "", text, flags=re.DOTALL)
            lines = text.splitlines()
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
                            results.append((path, col))
                    pending_annotation = None
                    is_virtual = False
                else:
                    if not stripped.startswith("@"):
                        pending_annotation = None
                        is_virtual = False
                i += 1
    return results


# ──────────────────────────────────────────────
# 4. 主流程
# ──────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="全量扫描所有 entity（本地调试用）")
    parser.add_argument("--since", default=None, help="从指定 commit SHA 对比")
    args = parser.parse_args()

    flyway = load_flyway_content()
    if not flyway:
        print("⚠️  没有找到 Flyway 脚本，跳过检查。")
        return 0

    if args.all:
        print("🔍 全量扫描模式（仅供本地调试）")
        print("⚠️  注意：--all 模式会扫描全部 entity 字段，但许多字段来自 DataInitializer 原始建表")
        print("   SQL 不在 Flyway 脚本里，属于正常现象，不代表云端 DB 缺列。")
        print("   如需准确核查云端缺列，请使用上一版 check_entity_db.py 连接真实 DB。")
        print()
        fields = scan_all_entities()
    else:
        fields = get_added_table_fields(args.since)
        if not fields:
            print("✅ 本次提交未检测到新增 @TableField，无需校验。")
            return 0
        print(f"🔍 检测到 {len(fields)} 个新增 @TableField 字段，开始校验…\n")

    violations: List[Tuple[str, str]] = []
    for (entity_file, col) in sorted(set(fields)):
        found = column_in_flyway(col, flyway)
        if found:
            print(f"  ✅  {col:40s}← {found}")
        else:
            print(f"  ❌  {col:40s}← 【未找到 Flyway 脚本！】  ({entity_file})")
            violations.append((entity_file, col))

    print()
    if violations:
        print("=" * 65)
        print(f"❌  Entity-Flyway 对齐检查 FAILED — {len(violations)} 个字段无迁移脚本")
        print("=" * 65)
        print("\n修复方法：")
        print(f"  在 {MIGRATION_DIR}/V<版本>__<描述>.sql 中用 INFORMATION_SCHEMA 幂等写法添加以下列：\n")
        for (f, c) in violations:
            print(f"    ALTER TABLE `<表名>` ADD COLUMN `{c}` <类型>;")
        print("\n  参考已有脚本：V20260420001__add_production_order_contact_qrcode_columns.sql")
        print("=" * 65)
        return 1

    total = len(set(fields))
    print(f"✅  Entity-Flyway 对齐检查通过（{total} 个字段全部覆盖）")
    return 0


if __name__ == "__main__":
    sys.exit(main())
