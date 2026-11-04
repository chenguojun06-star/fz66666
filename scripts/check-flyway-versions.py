#!/usr/bin/env python3
"""
Flyway 迁移版本号校验（CI 强制门禁）
=========================================
两项检查：

1. 唯一性（全量，MCP 与 CI 都跑）
   扫描 db/migration/ 下所有 V*.sql，版本号不允许重复。
   Flyway 对唯一性是硬性要求，重复会导致启动报错：
   Found more than one migration with version XXX。

2. ordering（--diff 模式，CI 跑）
   本次**新增**的迁移脚本，版本号必须严格大于仓库中已有脚本的最大版本。
   原因：application.yml 配了 out-of-order: true，小编号脚本在老库"还能跑"，
   但新环境按版本号排序执行、老库按提交顺序追加执行 —— 两边顺序会分叉。
   一旦后加的脚本依赖前一个脚本建的表/列，新环境就会炸在老库不会炸的位置，
   而这种差异在开发过程中完全看不出来。
   存量历史乱序（早期 V2..V50 与时间戳版本混排）不阻断，只统计提示。

退出码：0 = 通过，1 = 存在问题（重复版本号 / 新增脚本版本回退）

用法：
  python3 scripts/check-flyway-versions.py                  # 全量唯一性（MCP / 本地）
  python3 scripts/check-flyway-versions.py --diff            # CI：唯一性 + 新增脚本 ordering
  python3 scripts/check-flyway-versions.py --diff --since <sha>
  python3 scripts/check-flyway-versions.py --fix             # 兼容旧参数：仅打印修复指引
"""
import argparse
import os
import re
import subprocess
import sys
from collections import Counter
from typing import List, Optional, Set, Tuple

MIGRATION_DIR = "backend/src/main/resources/db/migration"

VERSION_PATTERN = re.compile(r'^V(\d+(?:\.\d+)*)__')

# (version, filename, fullpath)
Entry = Tuple[str, str, str]


def extract_version(filename: str) -> Optional[str]:
    m = VERSION_PATTERN.match(filename)
    return m.group(1) if m else None


def version_key(version: str) -> Tuple[int, ...]:
    """Flyway 版本比较：按点分段数值比较（V10 > V9，V20260101.1 > V20260101）。"""
    return tuple(int(p) for p in version.split("."))


def scan_versions() -> List[Entry]:
    results: List[Entry] = []
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


def check_duplicates(entries: List[Entry]) -> List[List[Entry]]:
    counter = Counter(v for v, _, _ in entries)
    dup_versions = {v for v, c in counter.items() if c > 1}
    groups = []
    for dv in sorted(dup_versions, key=version_key):
        group = [e for e in entries if e[0] == dv]
        groups.append(group)
    return groups


def count_legacy_inversions(entries: List[Entry]) -> List[Tuple[str, str, str]]:
    """按文件名（≈提交先后）统计历史乱序：后出现的文件版本号反而更小。

    存量乱序属于历史遗留，仅作提示；新增脚本由 ordering 检查单独把关。
    """
    inversions: List[Tuple[str, str, str]] = []
    prev: Optional[Entry] = None
    for entry in entries:
        if prev is not None and version_key(entry[0]) < version_key(prev[0]):
            inversions.append((entry[1], entry[0], prev[0]))
        prev = entry
    return inversions


def git_added_migration_names(since: Optional[str]) -> Set[str]:
    """本次 diff 中新增（A）的迁移文件名；拿不到 git 时返回空集。"""
    diff_range = [since, "HEAD"] if since else ["HEAD~1", "HEAD"]
    try:
        out = subprocess.check_output(
            ["git", "diff", "--name-only", "--diff-filter=A"] + diff_range + ["--", MIGRATION_DIR],
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, FileNotFoundError, OSError):
        return set()
    return {os.path.basename(p.strip()) for p in out.decode(errors="ignore").splitlines() if p.strip()}


def check_ordering(entries: List[Entry], since: Optional[str]) -> int:
    """新增脚本版本必须大于存量最大版本。返回错误数。"""
    added_names = git_added_migration_names(since)
    if not added_names:
        print("✅  本次无新增迁移脚本，ordering 检查跳过。")
        return 0

    added = [e for e in entries if e[1] in added_names]
    existing = [e for e in entries if e[1] not in added_names]
    if not added:
        print("✅  本次新增的迁移脚本不在扫描目录内（可能已删除），ordering 检查跳过。")
        return 0
    if not existing:
        print(f"✅  仓库内无存量迁移，{len(added)} 个新增脚本无需比较。")
        return 0

    max_existing = max(existing, key=lambda e: version_key(e[0]))
    print(f"🔍 ordering：新增 {len(added)} 个脚本，存量最大版本 V{max_existing[0]}")

    errors = 0
    for version, fname, _ in sorted(added, key=lambda e: version_key(e[0])):
        if version_key(version) <= version_key(max_existing[0]):
            print(f"❌  新增迁移 V{version} 不大于存量最大版本 V{max_existing[0]}")
            print(f"     → {fname}")
            print(f"     后果：out-of-order=true 让它在老库继续跑，但新环境按版本号排队 → 执行顺序分叉；")
            print(f"     后加脚本若依赖前面的建表/加列，新环境会在这一步炸。")
            print(f"     修复：重命名为 V{{YYYYMMDDHHMM}}__<描述>.sql，且版本号 > V{max_existing[0]}")
            errors += 1
    if errors == 0:
        print("✅  新增脚本版本号均大于存量最大版本，ordering 检查通过。")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description="Flyway 迁移版本号校验（唯一性 + ordering）")
    parser.add_argument("--diff", action="store_true", help="CI 模式：额外校验本次新增脚本的 ordering")
    parser.add_argument("--since", default=None, help="从指定 commit SHA 对比（默认 HEAD~1）")
    parser.add_argument("--fix", action="store_true", help="兼容旧用法：只打印修复指引，不自动改文件")
    args = parser.parse_args()

    entries = scan_versions()
    if not entries:
        print("⚠️  未找到 Flyway 迁移文件，跳过检查。")
        return 0

    print(f"🔍 扫描到 {len(entries)} 个 Flyway 迁移文件，检查版本号唯一性…")

    errors = 0

    # ── 1. 唯一性 ──
    dup_groups = check_duplicates(entries)
    if not dup_groups:
        print(f"✅  所有 {len(entries)} 个版本号均唯一。")
    else:
        print()
        print("=" * 70)
        print(f"❌  发现 {len(dup_groups)} 组重复版本号！")
        print("=" * 70)
        for group in dup_groups:
            print(f"\n  版本号 V{group[0][0]} 重复 {len(group)} 次：")
            for _, fname, _ in group:
                print(f"    → {fname}")
        print()
        print("修复方法：")
        print("  1. 将后添加的文件重命名为更大的版本号（推荐 V{YYYYMMDDHHMM}__ 时间戳格式）")
        print("  2. 如果已推送到远程，还需在 flyway_schema_history 中手动补记录")
        print("  3. 历史同类问题：V202705020001、V20260505001、V20260507001")
        errors += len(dup_groups)

    # ── 2. ordering（仅 diff 模式阻断）──
    if args.diff:
        print()
        errors += check_ordering(entries, args.since)

    # ── 3. 存量历史乱序：只提示，不阻断 ──
    inversions = count_legacy_inversions(entries)
    if inversions:
        print()
        print(f"ℹ️  存量历史乱序 {len(inversions)} 处（早期 V2..V50 与时间戳版本混排，属历史遗留，不阻断）。")
        for fname, version, prev_version in inversions[:3]:
            print(f"     {fname}: V{version} < 前一个 V{prev_version}")
        if len(inversions) > 3:
            print(f"     … 其余 {len(inversions) - 3} 处省略")

    if errors:
        print()
        print(f"❌  共 {errors} 项未通过。")
        return 1

    print()
    print("✅  Flyway 版本号校验通过。")
    return 0


if __name__ == "__main__":
    sys.exit(main())
