#!/usr/bin/env python3
"""
数据库变更前置检查 — 提交/部署前必跑
用法: python3 scripts/pre-db-change-check.py
任何一项不通过，禁止提交/部署
"""
import os
import sys
import subprocess
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
MIGRATION_DIR = PROJECT_ROOT / "backend" / "src" / "main" / "resources" / "db" / "migration"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"

RED = "\033[91m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RESET = "\033[0m"

passed = 0
failed = 0
warnings = 0


def get_changed_migrations():
    """获取本次变更涉及的迁移文件（git diff）"""
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", "HEAD"],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
        )
        changed = set()
        for line in result.stdout.strip().split("\n"):
            if line and "db/migration" in line and line.endswith(".sql"):
                fname = os.path.basename(line)
                changed.add(fname)
        return changed
    except Exception:
        return set()


def run_check(name, script_path, critical=True):
    global passed, failed, warnings
    print(f"\n{'='*60}")
    print(f" 检查: {name}")
    print(f"{'='*60}")

    if not script_path.exists():
        print(f"{YELLOW}⚠️  检查脚本不存在，跳过: {script_path}{RESET}")
        warnings += 1
        return True

    changed = get_changed_migrations()
    if not changed:
        print(f"{GREEN}✅ 无新增迁移文件，跳过{RESET}")
        passed += 1
        return True

    print(f"   检测到 {len(changed)} 个变更的迁移文件")

    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
    )

    if result.returncode == 0:
        print(f"{GREEN}✅ 通过{RESET}")
        if result.stdout.strip():
            for line in result.stdout.strip().split("\n")[-5:]:
                if line.strip():
                    print(f"   {line}")
        passed += 1
        return True
    else:
        print(f"{RED}❌ 失败{RESET}")
        output_lines = (result.stdout + result.stderr).strip().split("\n")
        for line in output_lines[:20]:
            if line.strip():
                print(f"   {line}")
        if critical:
            failed += 1
            return False
        else:
            warnings += 1
            return True


def check_duplicate_migrations():
    """检查新增迁移是否重复创建已有表"""
    global passed, failed, warnings
    print(f"\n{'='*60}")
    print(f" 检查: 新增迁移重复建表检测")
    print(f"{'='*60}")

    if not MIGRATION_DIR.exists():
        print(f"{YELLOW}⚠️  迁移目录不存在{RESET}")
        return

    changed = get_changed_migrations()
    if not changed:
        print(f"{GREEN}✅ 无新增迁移文件，跳过{RESET}")
        passed += 1
        return

    print(f"   检测到 {len(changed)} 个变更的迁移文件")

    # 先收集所有已存在的表（从老迁移中）
    import re
    existing_tables = {}
    for f in sorted(MIGRATION_DIR.glob("V*.sql")):
        if f.name in changed:
            continue
        content = f.read_text(errors="ignore")
        creates = re.findall(
            r"CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?",
            content,
            re.IGNORECASE,
        )
        for table in creates:
            if table.lower() in ("if", "table"):
                continue
            existing_tables[table.lower()] = f.name

    # 检查新增迁移
    has_dup = False
    for fname in changed:
        fpath = MIGRATION_DIR / fname
        if not fpath.exists():
            continue
        content = fpath.read_text(errors="ignore")
        creates = re.findall(
            r"CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?",
            content,
            re.IGNORECASE,
        )
        for table in creates:
            if table.lower() in ("if", "table"):
                continue
            if table.lower() in existing_tables:
                print(f"{RED}❌ 重复建表: {table}{RESET}")
                print(f"   已存在于: {existing_tables[table.lower()]}")
                print(f"   新增文件: {fname}")
                has_dup = True

    if has_dup:
        failed += 1
    else:
        print(f"{GREEN}✅ 无重复建表{RESET}")
        passed += 1


def check_version_format():
    """检查新增迁移的版本号格式（只查新增的，老文件不碰）"""
    global passed, failed
    print(f"\n{'='*60}")
    print(f" 检查: 新增迁移版本号格式")
    print(f"{'='*60}")

    if not MIGRATION_DIR.exists():
        print(f"{YELLOW}⚠️  迁移目录不存在{RESET}")
        return

    changed = get_changed_migrations()
    if not changed:
        print(f"{GREEN}✅ 无新增迁移文件，跳过{RESET}")
        passed += 1
        return

    print(f"   检测到 {len(changed)} 个变更的迁移文件")

    import re
    pattern = re.compile(r"^V\d{12}__[\w-]+\.sql$")
    bad = []
    for fname in changed:
        if not pattern.match(fname):
            bad.append(fname)

    if bad:
        print(f"{RED}❌ 版本号格式错误（应为V12位数字__描述.sql）:{RESET}")
        for b in bad:
            print(f"   {b}")
        failed += 1
    else:
        print(f"{GREEN}✅ 版本号格式正确{RESET}")
        passed += 1


def main():
    print("🔍 数据库变更前置检查")
    print(f"   项目路径: {PROJECT_ROOT}")
    print(f"   迁移目录: {MIGRATION_DIR}")

    check_version_format()
    check_duplicate_migrations()
    run_check("迁移版本号检查", SCRIPTS_DIR / "check-flyway-versions.py")
    run_check("SQL幂等性检查", SCRIPTS_DIR / "check-flyway-sql.py")
    run_check("Entity-Flyway一致性", SCRIPTS_DIR / "check-entity-flyway.py")
    run_check("列依赖检查", SCRIPTS_DIR / "check-flyway-column-deps.py")

    print(f"\n{'='*60}")
    print(f" 检查结果汇总")
    print(f"{'='*60}")
    print(f"  ✅ 通过: {passed}")
    print(f"  ⚠️  警告: {warnings}")
    print(f"  ❌ 失败: {failed}")
    print()

    if failed > 0:
        print(f"{RED}❌ 存在失败项，禁止提交/部署！{RESET}")
        sys.exit(1)
    else:
        print(f"{GREEN}✅ 全部通过，可以提交/部署{RESET}")
        sys.exit(0)


if __name__ == "__main__":
    main()
