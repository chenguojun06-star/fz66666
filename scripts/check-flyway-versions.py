#!/usr/bin/env python3
"""
Flyway 版本号唯一性检查（CI 强制门禁）
=========================================
扫描 db/migration/ 目录下所有 V*.sql 文件，提取版本号，
检测是否存在重复。Flyway 对版本号唯一性是硬性要求，
重复会导致启动报错：Found more than one migration with version XXX。

退出码：0 = 通过，1 = 存在重复版本号

用法：
  python3 scripts/check-flyway-versions.py           # CI 模式
  python3 scripts/check-flyway-versions.py --fix      # 交互式修复（本地用）
"""
import os
import re
import sys
import argparse
from collections import Counter
from typing import List, Tuple

MIGRATION_DIR = "backend/src/main/resources/db/migration"

VERSION_PATTERN = re.compile(r'^V(\d+(?:\.\d+)*)__')


def extract_version(filename: str) -> str | None:
    m = VERSION_PATTERN.match(filename)
    return m.group(1) if m else None


def scan_versions() -> List[Tuple[str, str, str]]:
    results = []
    if not os.path.isdir(MIGRATION_DIR):
        print(f"⚠️  Flyway 目录不存在: {MIGRATION_DIR}")
        return results
    for fname in sorted(os.listdir(MIGRATION_DIR)):
        if not fname.endswith(".sql"):
            continue
        version = extract_version(fname)
        if version:
            results.append((version, fname, os.path.join(MIGRATION_DIR, fname)))
    return results


def check_duplicates(entries: List[Tuple[str, str, str]]) -> List[List[Tuple[str, str, str]]]:
    counter = Counter(v for v, _, _ in entries)
    dup_versions = {v for v, c in counter.items() if c > 1}
    groups = []
    for dv in sorted(dup_versions):
        group = [(v, f, p) for v, f, p in entries if v == dv]
        groups.append(group)
    return groups


def main() -> int:
    parser = argparse.ArgumentParser(description="Flyway 版本号唯一性检查")
    parser.add_argument("--fix", action="store_true", help="交互式修复重复版本号（本地用）")
    args = parser.parse_args()

    entries = scan_versions()
    if not entries:
        print("⚠️  未找到 Flyway 迁移文件，跳过检查。")
        return 0

    print(f"🔍 扫描到 {len(entries)} 个 Flyway 迁移文件，检查版本号唯一性…")

    dup_groups = check_duplicates(entries)

    if not dup_groups:
        print(f"✅  所有 {len(entries)} 个版本号均唯一，检查通过。")
        return 0

    print()
    print("=" * 70)
    print(f"❌  发现 {len(dup_groups)} 组重复版本号！")
    print("=" * 70)
    for group in dup_groups:
        version = group[0][0]
        print(f"\n  版本号 V{version} 重复 {len(group)} 次：")
        for _, fname, fpath in group:
            print(f"    → {fname}")

    print()
    print("修复方法：")
    print("  1. 将后添加的文件重命名为更大的版本号")
    print("  2. 如果已推送到远程，还需在 flyway_schema_history 中手动补记录")
    print("  3. 历史同类问题：V202705020001、V20260505001、V20260507001")
    print("=" * 70)
    return 1


if __name__ == "__main__":
    sys.exit(main())
