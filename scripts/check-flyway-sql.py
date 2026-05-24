#!/usr/bin/env python3
"""
Flyway SQL 迁移脚本校验（P0 强制门禁）
========================================
覆盖项目历史全部 Flyway 事故类型，推送前 + CI 双重拦截。

检查项：
  1. 版本号重复 — 两个文件用同一版本号 → Flyway 报错
  2. 文件名格式 — 必须匹配 V{timestamp}__{desc}.sql（允许 V{数字}__ 格式）
  3. 缺少分号 — 语句末尾无分号（最常见的语法错误）
  4. 末尾逗号 — INSERT/CREATE TABLE 末尾值/列后跟逗号而非右括号/分号
  5. 括号不匹配 — 圆括号 ( ) 未成对
  6. 动态 SQL 字符串字面量 — SET @s 内含 ''xxx'' → Flyway 静默截断
  7. 动态 SQL DEFAULT NULL — PREPARE + DEFAULT NULL → MySQL 8.0 报错
  8. 危险操作 — DROP TABLE 无 IF EXISTS / TRUNCATE / DELETE FROM 无 WHERE
  9. 修改已执行迁移 — 检测 git diff 中对 V*.sql 的修改（而非新增）
 10. INSERT 无列列表 — INSERT INTO t_xxx VALUES(...) 缺少列名

退出码：0 = 通过，1 = 违规（CI 阻断）

用法：
  python3 scripts/check-flyway-sql.py              # 全量扫描
  python3 scripts/check-flyway-sql.py --diff       # 只检查本次 diff 新增/修改的文件
  python3 scripts/check-flyway-sql.py --since SHA  # 从指定 commit 对比
"""
import os
import re
import sys
import subprocess
import argparse
from typing import List, Tuple, Dict, Optional, Set

MIGRATION_DIR = "backend/src/main/resources/db/migration"

VERSION_PATTERN = re.compile(r'^V(\d+[a-z]?)__(.+)\.sql$', re.IGNORECASE)
STRICT_VERSION_PATTERN = re.compile(r'^V(\d+)__(.+)\.sql$')


def _is_old_migration(fname: str) -> bool:
    m = STRICT_VERSION_PATTERN.match(fname)
    if not m:
        ver_str = fname.lstrip('Vv').split('_')[0]
        if ver_str and ver_str[-1].isalpha():
            ver_str = ver_str[:-1]
        try:
            ver = int(ver_str)
        except ValueError:
            return True
        return ver <= 38
    ver = int(m.group(1))
    return ver <= 38


# ──────────────────────────────────────────────
# 1. 文件名校验
# ──────────────────────────────────────────────
def check_filename(fname: str) -> List[str]:
    errors = []
    if not VERSION_PATTERN.match(fname):
        errors.append(f"文件名格式错误: '{fname}' — 必须匹配 V{{timestamp}}__{{desc}}.sql")
    return errors


def check_version_duplicates(filenames: List[str]) -> Dict[str, List[str]]:
    version_map: Dict[str, List[str]] = {}
    for fname in filenames:
        m = STRICT_VERSION_PATTERN.match(fname)
        if m:
            ver = m.group(1)
            version_map.setdefault(ver, []).append(fname)
    return {ver: files for ver, files in version_map.items() if len(files) > 1}


# ──────────────────────────────────────────────
# 2. SQL 内容校验
# ──────────────────────────────────────────────
def strip_sql_comments(sql: str) -> str:
    lines = []
    for line in sql.splitlines():
        stripped = line.strip()
        if stripped.startswith('--'):
            continue
        idx = line.find('--')
        if idx > 0:
            in_string = False
            quote_char = None
            for i, ch in enumerate(line[:idx]):
                if ch in ("'", '"') and (i == 0 or line[i-1] != '\\'):
                    if not in_string:
                        in_string = True
                        quote_char = ch
                    elif ch == quote_char:
                        in_string = False
            if not in_string:
                line = line[:idx]
        lines.append(line)
    return '\n'.join(lines)


def _parse_delimiter_blocks(content: str) -> Set[int]:
    in_block: Set[int] = set()
    current_delim = ';'
    block_start = None
    for i, line in enumerate(content.splitlines(), 1):
        stripped = line.strip().upper()
        if stripped.startswith('DELIMITER'):
            new_delim = line.strip()[len('DELIMITER'):].strip()
            if new_delim and new_delim != ';':
                current_delim = new_delim
                block_start = i
            else:
                if block_start is not None:
                    for ln in range(block_start, i + 1):
                        in_block.add(ln)
                block_start = None
                current_delim = ';'
    if block_start is not None:
        for ln in range(block_start, content.count('\n') + 2):
            in_block.add(ln)
    return in_block


def check_content(fname: str, content: str, existing_file: bool = False) -> List[Tuple[str, bool]]:
    results = []
    is_old = _is_old_migration(fname)
    downgrade = existing_file and not is_old
    raw = content
    cleaned = strip_sql_comments(content)
    cleaned_upper = cleaned.upper()
    delimiter_blocks = _parse_delimiter_blocks(raw)

    # --- 6. 动态 SQL 字符串字面量 ---
    for i, line in enumerate(raw.splitlines(), 1):
        upper = line.upper().strip()
        if 'SET @' not in upper:
            continue
        if re.search(r"''\w+''", line):
            msg = (f"L{i}: 动态SQL内含字符串字面量 ''xxx'' → Flyway会截断SQL，"
                   f"改用 DEFAULT NULL/0 + 独立UPDATE回填")
            results.append((msg, is_old))
        if re.search(r"DEFAULT\s+NULL", upper) and ('PREPARE' in cleaned_upper or 'SET @S' in cleaned_upper):
            msg = (f"L{i}: PREPARE动态SQL内含 DEFAULT NULL → MySQL 8.0报错，"
                   f"去掉DEFAULT（MySQL默认即NULL）")
            results.append((msg, is_old))

    # --- 3. 缺少分号 ---
    lines = cleaned.splitlines()
    i = 0
    while i < len(lines):
        lineno = i + 1
        stripped = lines[i].strip()
        upper = stripped.upper()

        if not stripped or stripped.startswith('--'):
            i += 1
            continue

        if lineno in delimiter_blocks:
            i += 1
            continue

        if upper.startswith('DELIMITER'):
            i += 1
            continue

        if upper.startswith('SET @'):
            i += 1
            continue

        if upper.startswith('PREPARE'):
            i += 1
            continue

        if upper.startswith('DEALLOCATE'):
            i += 1
            continue

        if upper in ('BEGIN', 'END', 'END IF;'):
            i += 1
            continue

        if upper.startswith('IF ') or upper.startswith('END IF') or upper == 'THEN':
            i += 1
            continue

        if re.match(r'^\w+$', stripped):
            i += 1
            continue

        stmt_start_keywords = (
            'ALTER ', 'CREATE ', 'DROP ', 'INSERT ', 'UPDATE ', 'DELETE ',
            'GRANT ', 'REVOKE ', 'TRUNCATE ', 'RENAME ',
            'EXECUTE ',
        )
        needs_semi = any(upper.startswith(kw) for kw in stmt_start_keywords)

        if not needs_semi:
            i += 1
            continue

        full_stmt = stripped
        j = i + 1
        while j < len(lines) and not full_stmt.rstrip().endswith(';'):
            next_stripped = lines[j].strip()
            if not next_stripped or next_stripped.startswith('--'):
                j += 1
                continue
            if any(next_stripped.upper().startswith(kw) for kw in stmt_start_keywords):
                break
            if next_stripped.upper().startswith('SET @'):
                break
            if next_stripped.upper().startswith('PREPARE'):
                break
            if next_stripped.upper().startswith('DELIMITER'):
                break
            full_stmt += ' ' + next_stripped
            j += 1

        if full_stmt.rstrip().endswith(';'):
            i = j
            continue

        if full_stmt.rstrip().endswith(','):
            results.append((f"L{lineno}: 语句末尾为逗号而非分号 — '{stripped[:60]}...'", False))
            i = j
            continue

        if full_stmt.rstrip().endswith(')'):
            i = j
            continue

        if full_stmt.rstrip().endswith('('):
            i = j
            continue

        results.append((f"L{lineno}: 语句缺少分号 — '{stripped[:60]}...'", is_old))
        i = j

    # --- 5. 括号不匹配 ---
    depth = 0
    for ch in cleaned:
        if ch == '(':
            depth += 1
        elif ch == ')':
            depth -= 1
        if depth < 0:
            results.append(("括号不匹配: 出现多余的 ')'", False))
            break
    if depth > 0:
        results.append((f"括号不匹配: 有 {depth} 个 '(' 未闭合", False))

    # --- 8. 危险操作 ---
    for i, line in enumerate(cleaned.splitlines(), 1):
        upper = line.strip().upper()
        if re.match(r'^\s*DROP\s+TABLE', upper) and 'IF EXISTS' not in upper:
            results.append((f"L{i}: DROP TABLE 无 IF EXISTS → 表不存在时迁移失败", False))
        if re.match(r'^\s*TRUNCATE\s+', upper):
            results.append((f"L{i}: TRUNCATE 在迁移脚本中禁止使用 → 数据不可恢复", False))
        if re.match(r'^\s*DELETE\s+FROM\s+', upper) and 'WHERE' not in upper:
            results.append((f"L{i}: DELETE FROM 无 WHERE → 全表删除，极其危险", False))

    # --- 10. INSERT 无列列表 ---
    for i, line in enumerate(cleaned.splitlines(), 1):
        upper = line.strip().upper()
        m = re.match(r'^\s*INSERT\s+(?:INTO\s+)?(\S+)\s+VALUES\s*\(', upper)
        if m:
            table = m.group(1)
            results.append((
                f"L{i}: INSERT INTO {table} VALUES(...) 缺少列列表 → "
                f"列顺序变化时静默写入错误数据，改为 INSERT INTO {table}(col1,col2) VALUES(...)",
                is_old,
            ))

    return results


# ──────────────────────────────────────────────
# 3. Git diff 模式
# ──────────────────────────────────────────────
def get_changed_flyway_files(since_sha: Optional[str] = None) -> List[str]:
    if since_sha:
        diff_range = [since_sha, "HEAD"]
    else:
        diff_range = ["HEAD~1", "HEAD"]

    try:
        diff_bytes = subprocess.check_output(
            ["git", "diff", "--name-only", "--diff-filter=AM"] + diff_range + [
                "--", MIGRATION_DIR
            ],
            stderr=subprocess.DEVNULL,
        )
        return [p.strip() for p in diff_bytes.decode().splitlines() if p.strip()]
    except subprocess.CalledProcessError:
        return []


def get_modified_flyway_files(since_sha: Optional[str] = None) -> List[str]:
    if since_sha:
        diff_range = [since_sha, "HEAD"]
    else:
        diff_range = ["HEAD~1", "HEAD"]

    try:
        diff_bytes = subprocess.check_output(
            ["git", "diff", "--name-only", "--diff-filter=M"] + diff_range + [
                "--", MIGRATION_DIR
            ],
            stderr=subprocess.DEVNULL,
        )
        return [p.strip() for p in diff_bytes.decode().splitlines() if p.strip()]
    except subprocess.CalledProcessError:
        return []


# ──────────────────────────────────────────────
# 4. 主流程
# ──────────────────────────────────────────────
def main() -> int:
    parser = argparse.ArgumentParser(description="Flyway SQL 迁移脚本校验")
    parser.add_argument("--diff", action="store_true", help="只检查本次 diff 新增/修改的文件")
    parser.add_argument("--since", default=None, help="从指定 commit SHA 对比")
    args = parser.parse_args()

    if not os.path.isdir(MIGRATION_DIR):
        print(f"⚠️  Flyway 目录不存在: {MIGRATION_DIR}")
        return 0

    all_files = sorted(f for f in os.listdir(MIGRATION_DIR) if f.endswith('.sql'))

    if args.diff:
        changed_paths = get_changed_flyway_files(args.since)
        changed_names = [os.path.basename(p) for p in changed_paths]
        if not changed_names:
            print("✅ 本次提交无 Flyway 迁移文件变更，跳过检查。")
            return 0
        target_files = [f for f in changed_names if f in all_files]
        print(f"🔍 检查本次 diff 涉及的 {len(target_files)} 个 Flyway 文件\n")
    else:
        target_files = all_files
        print(f"🔍 全量扫描 {len(target_files)} 个 Flyway 迁移文件\n")

    total_errors = 0
    total_warnings = 0

    # --- 版本号重复（全量检查，因为重复可能跨 diff） ---
    dup_map = check_version_duplicates(all_files)
    if dup_map:
        for ver, files in dup_map.items():
            print(f"❌ 版本号重复: V{ver} 被以下文件使用:")
            for f in files:
                print(f"     {f}")
            total_errors += 1
        print()

    # --- 检查修改已执行的迁移 ---
    modified = get_modified_flyway_files(args.since)
    if modified:
        for p in modified:
            print(f"❌ 修改已存在的迁移文件: {p} → Flyway checksum 校验将失败")
            total_errors += 1
        print()

    # --- 逐文件检查 ---
    for fname in target_files:
        path = os.path.join(MIGRATION_DIR, fname)
        with open(path, encoding='utf-8', errors='ignore') as f:
            content = f.read()

        file_results = []
        file_results.extend([(e, False) for e in check_filename(fname)])
        content_results = check_content(fname, content, existing_file=(not args.diff))
        if not args.diff:
            content_results = [(msg, True) for msg, _ in content_results]
        file_results.extend(content_results)

        if file_results:
            print(f"📄 {fname}")
            for msg, is_warning in file_results:
                if is_warning:
                    print(f"  ⚠️  {msg}  [已存在迁移，仅供参考]")
                    total_warnings += 1
                else:
                    print(f"  ❌ {msg}")
                    total_errors += 1
            print()

    # --- 汇总 ---
    print("=" * 65)
    if total_errors > 0:
        print(f"❌ Flyway SQL 校验 FAILED — {total_errors} 个错误, {total_warnings} 个警告")
        print("=" * 65)
        print("\n常见修复方法:")
        print("  版本号重复 → 重命名文件，使用更大的时间戳版本号")
        print("  缺少分号   → 在语句末尾加分号 ;")
        print("  末尾逗号   → INSERT VALUES 最后一行后去掉逗号")
        print("  字符串字面量 → SET @s 内改用 DEFAULT NULL/0，回填用独立 UPDATE")
        print("  DEFAULT NULL → 动态SQL内去掉 DEFAULT NULL，MySQL默认即NULL")
        print("  括号不匹配 → 检查 ( ) 是否成对")
        print("  修改已执行  → 新建迁移文件，不修改已有的 V*.sql")
        print("=" * 65)
        return 1

    if total_warnings > 0:
        print(f"⚠️  Flyway SQL 校验通过（{total_warnings} 个警告需关注）")
    else:
        print(f"✅ Flyway SQL 校验通过（{len(target_files)} 个文件全部合规）")
    print("=" * 65)
    return 0


if __name__ == "__main__":
    sys.exit(main())
