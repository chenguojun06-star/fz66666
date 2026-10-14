#!/usr/bin/env python3
"""
自愈器新增条目必须有 Flyway 迁移（CI 门禁，棘轮式）
==================================================
背景：项目里有两条"结构真相源"——
  * `resources/db/migration/*.sql`（Flyway，正规军）
  * `config/DbTableDefinitions.TABLE_FIXES`（74 张表 DDL）+
    `config/DbColumnDefinitions.COLUMN_FIXES`（1138 条补列）

第二条由 `DbColumnRepairRunner` 在每次启动时执行：缺表就建、缺列就补。
它动手时原先只打 log.warn，散落在几百行启动日志里没人看 ——
于是 Flyway 漂移被悄悄盖住，两边对不上也看不出来
（2026-10-14 已把每次动手提到 ERROR 并汇总一行）。

本脚本在构建期堵住"继续往自愈清单里加条目"这个口子：
  **本次提交新增的 TABLE_FIXES / COLUMN_FIXES 条目，必须由本提交的 Flyway 迁移补齐。**

两点说明：
  1) 为什么是棘轮式（只查本次新增）：存量 1138 条大多写于 Flyway 之前的年代，
     逐条要求有迁移会立刻全红。要防的是"以后继续加"。
  2) 必须做**真 diff**：第一版写的是"迁移里提到某张表 → 该表在自愈清单里的所有列
     都得在迁移里出现"，结果一个提到 t_user 的迁移就把清单里 20 多条历史条目
     全判成漂移，误报洪水。所以只比对本次真正新增的 (表, 列)。
  3) 比对前要先剥掉 SQL 注释：注释里提到列名不算覆盖
     （第一版验证时被自己写的注释骗过）。

CI 检出上一次提交做 diff（与 check-entity-flyway.py 同一套前提）。
退出码 0=通过，1=发现新增裸条目。
"""
import os
import re
import subprocess
import sys

COLUMN_FIXES = "backend/src/main/java/com/fashion/supplychain/config/DbColumnDefinitions.java"
TABLE_FIXES = "backend/src/main/java/com/fashion/supplychain/config/DbTableDefinitions.java"
MIGRATION_DIR = "backend/src/main/resources/db/migration"

ADD_RE = re.compile(r'add\(\s*"([a-z][a-z0-9_]*)"\s*,\s*"([a-z][a-z0-9_]*)"')
PUT_RE = re.compile(r'put\(\s*"([a-z][a-z0-9_]*)"')
BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
LINE_COMMENT_RE = re.compile(r"--[^\n]*|#[^\n]*")

FAILURES = []


def sh(*cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def read_at(ref, path):
    """取某个提交里的文件内容；ref 为 None 表示读工作区"""
    if ref is None:
        if os.path.exists(path):
            return open(path, encoding="utf-8", errors="ignore").read()
        return ""
    r = sh("git", "show", f"{ref}:{path}")
    return r.stdout if r.returncode == 0 else ""


def strip_sql_comments(sql):
    """剥掉 /* */ 与 -- 注释：注释里提到的列名不能算"迁移里已经有了\""""
    return LINE_COMMENT_RE.sub(" ", BLOCK_COMMENT_RE.sub(" ", sql))


def entries_at(ref, path, pattern, with_column):
    out = set()
    for line in read_at(ref, path).splitlines():
        m = pattern.search(line)
        if m:
            out.add((m.group(1), m.group(2) if with_column else "", line.strip()))
    return out


def migration_files_touched():
    r = sh("git", "diff", "--name-only", "HEAD^", "HEAD", "--", MIGRATION_DIR)
    return [f for f in r.stdout.splitlines() if f.strip()]


def main():
    prev = "HEAD^"
    if sh("git", "rev-parse", "--verify", prev).returncode != 0:
        print("⚠️  没有上一次提交可比，跳过")
        return 0
    if not os.path.exists(COLUMN_FIXES) or not os.path.exists(TABLE_FIXES):
        print("⚠️  找不到自愈器定义文件，跳过")
        return 0

    added_cols = entries_at(None, COLUMN_FIXES, ADD_RE, True) - entries_at(prev, COLUMN_FIXES, ADD_RE, True)
    added_tables = entries_at(None, TABLE_FIXES, PUT_RE, False) - entries_at(prev, TABLE_FIXES, PUT_RE, False)

    touched = migration_files_touched()
    print(f"本次提交新增：自愈清单补列 {len(added_cols)} 条、建表 {len(added_tables)} 张；"
          f"Flyway 迁移 {len(touched)} 个")

    if not added_cols and not added_tables:
        print("✅ 自愈清单没有新增条目")
        return 0

    if not touched:
        print("\n❌ 自愈清单新增了条目，但本提交没有任何 Flyway 迁移：\n")
        for t, c, src in sorted(added_cols):
            print(f"  {COLUMN_FIXES}  补列 {t}.{c}\n        {src[:110]}")
        for t, _c, src in sorted(added_tables):
            print(f"  {TABLE_FIXES}  建表 {t}\n        {src[:110]}")
        print("\n请把该结构补进同一提交的 Flyway 迁移，并从自愈清单移除。")
        return 1

    mig = strip_sql_comments("\n".join(read_at(None, f) for f in touched)).lower()

    for t, c, src in sorted(added_cols):
        if t not in mig or c not in mig:
            FAILURES.append(
                f"{COLUMN_FIXES}  补列 {t}.{c}\n"
                f"        本提交的迁移里没有 {t}.{c} —— 应把它放进 Flyway 迁移，"
                f"而不是靠启动时补列\n        {src[:110]}"
            )
    for t, _c, src in sorted(added_tables):
        if "create table" not in mig or t not in mig:
            FAILURES.append(
                f"{TABLE_FIXES}  建表 {t}\n"
                f"        本提交的迁移里没有 {t} 的 CREATE TABLE —— "
                f"新表必须来自 Flyway\n        {src[:110]}"
            )

    if FAILURES:
        print("\n❌ 自愈清单新增条目，但同一提交的 Flyway 迁移没有覆盖（结构真相源只能是 Flyway）：\n")
        for i, m in enumerate(FAILURES, 1):
            print(f"  {i}. {m}")
        print("\n自愈器每次启动都会悄悄补上这些结构，导致 Flyway 漂移被盖住、没人发现。")
        return 1
    print("✅ 自愈清单新增条目均已由本提交的 Flyway 迁移覆盖")
    return 0


if __name__ == "__main__":
    sys.exit(main())
