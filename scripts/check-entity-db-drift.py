#!/usr/bin/env python3
"""
实体 ↔ 真实数据库 结构漂移检查
================================
`check-entity-flyway.py` 比对的是「实体 vs 迁移脚本」——两边自洽就 PASS，
但**真正跑起来的是生产库**。2026-10-13 就是这么翻车的：

  - 生产库的 t_pattern_discovery 只有 6 列，实体要 20 列 → 定时任务每轮报
    `Unknown column 'pattern_type'`；
  - 生产库根本没有 t_express_order / t_material_roll / t_logistics_track /
    t_ai_operation_audit，而 flyway_schema_history 里这些迁移全部 success=1
    （库被还原/重建时丢了表，Flyway 记录还在，已 applied 的迁移永远不重跑）；
  - t_goal_decomposition 缺 16 列、t_agent_memory_core 缺 3 列。

本脚本就是补上这个缺口：拿**实体声明的列**去比**真实库里的列**，任何一张表
少列、或整张表不存在，都直接报出来并以非 0 退出。

两种取数方式（任选其一）：
  1) 直连数据库（需要 pymysql）：
       python3 scripts/check-entity-db-drift.py \
           --host 127.0.0.1 --port 3306 --user root --password *** --database fashion_supplychain
     也支持环境变量：DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME
  2) 离线模式（不需要任何驱动，适合连生产只读导出）：
       # 先在能连库的地方导出
       mysql -N -B -e "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS \
         WHERE TABLE_SCHEMA='fashion_supplychain' ORDER BY TABLE_NAME, ORDINAL_POSITION" > /tmp/cols.tsv
       python3 scripts/check-entity-db-drift.py --columns-file /tmp/cols.tsv

退出码：0 = 无漂移；1 = 有漂移（应阻断发布）；2 = 环境/用法错误
"""
import argparse
import collections
import os
import re
import sys

ENTITY_ROOT = "backend/src/main/java"

# 这些字段不是 DB 列，比对时跳过
SKIP_FIELD_NAMES = {"serialVersionUID"}

FIELD_RE = re.compile(
    r"((?:@[A-Za-z][\w.]*(?:\((?:[^()]|\([^()]*\))*\))?\s*)*)"   # 注解串
    r"private\s+(?!static)([A-Za-z<>\[\], .]+?)\s+(\w+)\s*(?:=[^;]*)?;"  # 类型 + 字段名
)
TABLE_RE = re.compile(r'@TableName\(\s*(?:value\s*=\s*)?"([^"]+)"')
TABLEFIELD_RE = re.compile(r'@TableField\(\s*(?:value\s*=\s*)?"([^"]+)"')


def camel_to_snake(name: str) -> str:
    return re.sub(r"([a-z0-9])([A-Z])", r"\1_\2", name).lower()


def collect_entity_columns():
    """→ {表名: {列名: 实体文件}}"""
    tables = collections.defaultdict(dict)
    for root, _dirs, files in os.walk(ENTITY_ROOT):
        for fn in files:
            if not fn.endswith(".java"):
                continue
            path = os.path.join(root, fn)
            with open(path, encoding="utf-8", errors="replace") as fh:
                src = fh.read()
            m = TABLE_RE.search(src)
            if not m:
                continue
            table = m.group(1)
            rel = path.replace("backend/src/main/java/com/fashion/supplychain/", "")
            for fm in FIELD_RE.finditer(src):
                anns, _typ, name = fm.group(1), fm.group(2), fm.group(3)
                if name in SKIP_FIELD_NAMES:
                    continue
                if re.search(r"exist\s*=\s*false", anns):
                    continue
                tf = TABLEFIELD_RE.search(anns)
                col = (tf.group(1) if tf else camel_to_snake(name)).strip("`")
                tables[table][col] = rel
    return tables


def load_columns_from_db(args):
    try:
        import pymysql  # noqa: WPS433
    except ImportError:
        print("✗ 需要 pymysql 才能直连数据库；或改用 --columns-file 离线模式", file=sys.stderr)
        sys.exit(2)
    host = args.host or os.environ.get("DB_HOST", "127.0.0.1")
    port = int(args.port or os.environ.get("DB_PORT", 3306))
    user = args.user or os.environ.get("DB_USER", "root")
    password = args.password if args.password is not None else os.environ.get("DB_PASSWORD", "")
    database = args.database or os.environ.get("DB_NAME", "fashion_supplychain")
    conn = pymysql.connect(host=host, port=port, user=user, password=password, database=database)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = %s",
                (database,),
            )
            rows = cur.fetchall()
    finally:
        conn.close()
    return build_db_map(rows)


def load_columns_from_file(path):
    rows = []
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line or "\t" not in line:
                continue
            rows.append(tuple(line.split("\t", 1)))
    return build_db_map(rows)


def build_db_map(rows):
    db = collections.defaultdict(set)
    for table, column in rows:
        db[table].add(column.strip().strip("`"))
    return db


def main():
    ap = argparse.ArgumentParser(description="实体 ↔ 真实库 结构漂移检查")
    ap.add_argument("--columns-file", help="离线模式：table<TAB>column 的 TSV 文件")
    ap.add_argument("--host")
    ap.add_argument("--port")
    ap.add_argument("--user")
    ap.add_argument("--password")
    ap.add_argument("--database")
    args = ap.parse_args()

    if args.columns_file:
        db = load_columns_from_file(args.columns_file)
    else:
        db = load_columns_from_db(args)

    entities = collect_entity_columns()
    if not entities:
        print("✗ 一个 @TableName 实体都没扫到，检查路径是否正确", file=sys.stderr)
        return 2

    missing_tables = []
    missing_columns = []
    for table, cols in sorted(entities.items()):
        if table not in db:
            missing_tables.append((table, sorted(cols)[:5], next(iter(cols.values()))))
            continue
        absent = sorted(c for c in cols if c not in db[table])
        if absent:
            missing_columns.append((table, absent, next(iter(cols.values()))))

    print(f"扫描实体表 {len(entities)} 张，库中表 {len(db)} 张\n")
    if not missing_tables and not missing_columns:
        print("✅ 无结构漂移：实体声明的每张表、每个列在库里都存在")
        return 0

    if missing_tables:
        print(f"❌ 整张表不存在（{len(missing_tables)} 张）—— 一调用就 500：")
        for table, sample, src in missing_tables:
            print(f"   • {table:34s} 实体: {src}")
        print()
    if missing_columns:
        print(f"❌ 表在但缺列（{len(missing_columns)} 张）：")
        for table, absent, src in missing_columns:
            shown = ", ".join(absent[:8]) + ("..." if len(absent) > 8 else "")
            print(f"   • {table:34s} 缺 {len(absent):2d} 列: {shown}")
            print(f"     {'':34s} 实体: {src}")
        print()
    print("修法：优先补一条幂等 Flyway 迁移（information_schema 守卫 + 动态 DDL），"
          "不要指望带外手工改库。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
