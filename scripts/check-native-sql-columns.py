#!/usr/bin/env python3
"""
原生 SQL 列名核对（CI 门禁）
============================
把「SQL 里写了、数据库里没有的列」在构建期挡住。

背景（2026-10-14 全项目核实）：这件事在线上已经一次又一次地发生，
而且每次都**静默失效**——SQL 抛 Unknown column，被 catch 成 debug/warn 吞掉，
功能空转数月没人发现。实测命中的有：

  * `AuditLogCleanupJob` 用 `create_time`，真列 `created_at`
    → 每天 04:50 清理必失败，外层 catch 还把后面两段清理一起中断，
      导致 t_ai_job_run_log 攒了 191 万行超期数据没人删
  * `PayrollSettlementMapper` 用 `settlement_time`，表里根本没这列
    → 工资打款一点就 500 回滚（生产库实测 ERROR 1054）
  * `AiSelfEvolutionService` 两个查询共 7 个不存在的列 → AI 自进化取不到样本
  * `SelfDrillOrchestrator` 用 `t_tenant.delete_flag`（不存在），
    且状态值 `NOT IN ('DISABLED','SUSPENDED')` 与真实的 `active/inactive` 也对不上
    → 自演练一个租户都不跑就"正常结束"
  * `PatrolEvidenceEnricher` 用 `t.order_no`（真列 production_order_no）和
    `progress_stage`（不存在）→ AI 巡检订单工单永远没有证据

覆盖三类原生 SQL 来源（缺一类就会漏，本次第一版就漏了 jdbcTemplate 那两处）：
  1. @Select/@Update/@Insert/@Delete 注解（含 Java 15 文本块）
  2. jdbcTemplate.update/query/queryForObject/batchUpdate 的字符串拼接
  3. backend/src/main/resources/mapper/*.xml

列名基准：
  scripts/data/prod-schema-columns.tsv —— 生产库真实列快照（5740 个）。
  **快照是离线数据，会随线上迁移过期**，用 --refresh 重新生成：
      python3 scripts/check-native-sql-columns.py --refresh
  （需要能连生产库；日常 CI 不连库、只比对快照。）

已知的误报形态（已在脚本里排除，新增 SQL 若命中请补充规则而不是放宽阈值）：
  * WITH RECURSIVE xxx AS (...) 的 CTE 名
  * AS 起的别名
  * 排序规则/字符集等标识（utf8mb4_bin 之类，含下划线但不是列）
"""
import os
import re
import subprocess
import sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SNAPSHOT = os.path.join(HERE, "data", "prod-schema-columns.tsv")
# 本提交的迁移里新增、但还没部署到生产库的列。列一旦真的存在于库里，
# 刷新快照时会自动从这里剔除（见 --refresh）。这是为了解开
# 「代码先引用新列 → 迁移还没上线 → 门禁先红」的死结，不是放行水的后门。
PENDING = os.path.join(HERE, "data", "pending-new-columns.txt")
SRC = os.path.join(ROOT, "backend/src/main/java")
XML = os.path.join(ROOT, "backend/src/main/resources/mapper")

KEYWORDS = set("""select from where group by order having limit insert into values update set
delete join left right inner outer on as and or not null is in like between exists distinct
asc desc count sum avg max min if for use using offset now interval date_sub date_add
concat coalesce case when then else end ifnull cast char group_concat substring
round floor ceil abs greatest least date_format str_to_date unix_timestamp from_unixtime
rand md5 uuid current_timestamp sql_no_cache primary key index unique default engine
charset collate auto_increment unsigned bigint int tinyint varchar datetime decimal
text blob timestamp comment table create drop alter add column constraint foreign
references cascade nulls true false recursive union all""".split())

# 含下划线但绝不是列的标识（字符集、引擎、其他保留词）
NOT_COLUMNS = {"utf8mb4_bin", "utf8mb4_general_ci", "utf8mb4_unicode_ci", "innodb", "myisam"}
# FROM/JOIN 后面可能出现的非表标识，取别名时要跳过
NOT_TABLE_WORDS = {"dual", "information_schema", "performance_schema", "mysql", "sys"}

TBL_RE = re.compile(r'\b(?:from|join|into|update)\s+`?([a-z][a-z0-9_]{2,})`?', re.I)
SQL_KW_RE = re.compile(r'\b(select|insert|update|delete)\b', re.I)


def unquote_java(chunk):
    """Java 字符串拼接（含文本块 \"\"\"...\"\"\"）拼回一条 SQL"""
    if '"""' in chunk:
        blocks = re.findall(r'"""(.*?)"""', chunk, re.S)
        if blocks:
            return " ".join(blocks)
    return " ".join(re.findall(r'"((?:[^"\\]|\\.)*)"', chunk))


def read_snapshot():
    cols = set()
    if not os.path.exists(SNAPSHOT):
        return cols
    with open(SNAPSHOT, encoding="utf-8") as f:
        for line in f:
            line = line.strip().lower()
            if line:
                cols.add(line)
    return cols


def read_pending():
    out = set()
    if not os.path.exists(PENDING):
        return out
    with open(PENDING, encoding="utf-8") as f:
        for line in f:
            line = line.strip().lower()
            if line and not line.startswith("#"):
                out.add(line)
    return out


def refresh():
    cmd = ["ssh", "-o", "ConnectTimeout=15", "-o", "StrictHostKeyChecking=no",
           "ubuntu@106.55.12.216",
           "docker exec lighthouse-mysql-1 mysql -uroot -pFz666MySQL@2026 "
           "fashion_supplychain -N -e \"SELECT CONCAT(table_name, '.', column_name) "
           "FROM information_schema.columns WHERE table_schema='fashion_supplychain' "
           "ORDER BY table_name, ordinal_position;\""]
    out = subprocess.run(cmd, capture_output=True, text=True)
    if out.returncode != 0:
        print("✗ 连不上生产库，快照未更新：", out.stderr.strip()[:200])
        return 1
    lines = [l.strip().lower() for l in out.stdout.splitlines() if l.strip()]
    with open(SNAPSHOT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"✅ 快照已更新：{len(lines)} 个列 → {os.path.relpath(SNAPSHOT, ROOT)}")

    # 已上线的列从待生效清单里剔除，保持清单自清洁
    pending = read_pending()
    if pending:
        live = set(lines)
        still = [c for c in sorted(pending) if c not in live]
        done = [c for c in sorted(pending) if c in live]
        for c in done:
            print(f"  ✓ {c} 已上线，从待生效清单移除")
        with open(PENDING, "w", encoding="utf-8") as f:
            f.write("# 本提交的迁移新增、但尚未部署到生产库的列（部署后跑 --refresh 会自动剔除）\n")
            for c in still:
                f.write(c + "\n")
        if not still:
            print(f"  （{os.path.relpath(PENDING, ROOT)} 已清空）")
    return 0


def balanced_chunk(src, open_paren_idx):
    """从 '(' 出发取到配对的 ')' 之间的内容"""
    depth, i = 0, open_paren_idx
    while i < len(src):
        if src[i] == "(":
            depth += 1
        elif src[i] == ")":
            depth -= 1
            if depth == 0:
                return src[open_paren_idx + 1:i]
        i += 1
    return src[open_paren_idx + 1:]


def collect_statements():
    stmts = []  # (path, line, sql)

    def scan_java(path):
        src = open(path, encoding="utf-8", errors="ignore").read()
        # 1) 注解 SQL
        for m in re.finditer(r'@(Select|Update|Insert|Delete)\s*\(', src):
            chunk = balanced_chunk(src, m.end() - 1)
            sql = unquote_java(chunk)
            if SQL_KW_RE.search(sql):
                stmts.append((path, src[:m.start()].count("\n") + 1, sql))
        # 2) jdbcTemplate 拼串 SQL
        for m in re.finditer(r'jdbcTemplate\.(update|query|queryForObject|queryForList|batchUpdate)\s*\(', src):
            chunk = balanced_chunk(src, m.end() - 1)
            sql = unquote_java(chunk)
            if SQL_KW_RE.search(sql):
                stmts.append((path, src[:m.start()].count("\n") + 1, sql))

    for dirpath, _dirs, files in os.walk(SRC):
        for fn in files:
            if fn.endswith(".java"):
                scan_java(os.path.join(dirpath, fn))

    # 3) XML Mapper
    if os.path.isdir(XML):
        for dirpath, _dirs, files in os.walk(XML):
            for fn in files:
                if not fn.endswith(".xml"):
                    continue
                p = os.path.join(dirpath, fn)
                src = open(p, encoding="utf-8", errors="ignore").read()
                for tag in ("select", "update", "insert", "delete"):
                    for m in re.finditer(r"<%s\b[^>]*>([\s\S]*?)</%s>" % (tag, tag), src, re.I):
                        stmts.append((p, src[:m.start()].count("\n") + 1, m.group(1)))
    return stmts


def tables_of(sql, all_tables):
    """FROM/JOIN/INTO/UPDATE 后面的真表名"""
    out = set()
    for m in TBL_RE.finditer(sql):
        t = m.group(1).lower()
        if t in all_tables:
            out.add(t)
    return out


def table_aliases(sql):
    """表别名：{@code FROM t_xxx a} / {@code JOIN t_xxx a ON} 里紧跟表名之后的标识。

    KgEntityMapper 的递归 CTE 就是 {@code JOIN t_kg_relation child_r ON child_r.xxx}，
    不排除的话 child_r 会被当成"不存在的列"误报。"""
    out = set()
    for m in re.finditer(r'\b(?:from|join|into|update)\s+`?([a-z][a-z0-9_]{2,})`?\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?', sql, re.I):
        if m.group(1).lower() in NOT_TABLE_WORDS:
            continue
        out.add(m.group(2).lower())
    return out


def insert_columns(sql, all_tables):
    """INSERT INTO <table> (c1, c2, ...) 的列清单 —— 这里列的语义无歧义，必须全对。"""
    out = []
    for m in re.finditer(r'\binsert\s+into\s+`?([a-z][a-z0-9_]{2,})`?\s*\(([^)]*)\)', sql, re.I | re.S):
        table = m.group(1).lower()
        if table not in all_tables:
            continue
        for c in m.group(2).split(","):
            c = c.strip().strip('`"').lower()
            if c:
                out.append((table, c))
    return out


def skip_tokens(sql):
    skip = set(KEYWORDS) | NOT_COLUMNS
    for m in re.finditer(r'\bas\s+`?([a-zA-Z_][a-zA-Z0-9_]*)`?', sql, re.I):
        skip.add(m.group(1).lower())
    # WITH [RECURSIVE] name AS (...) —— CTE 名，不是列
    for m in re.finditer(r'\b(?:with|,)\s*(?:recursive\s+)?([a-z_][a-z0-9_]*)\s+as\s*\(', sql, re.I):
        skip.add(m.group(1).lower())
    return skip


def snake_ids(sql):
    return {m.group(1).lower() for m in re.finditer(r'\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b', sql)}


def main():
    if "--refresh" in sys.argv:
        return refresh()

    real = read_snapshot()
    if not real:
        print(f"✗ 找不到列快照 {os.path.relpath(SNAPSHOT, ROOT)}，请先运行：")
        print("    python3 scripts/check-native-sql-columns.py --refresh")
        return 1
    pending = read_pending()
    all_tables = {c.split(".", 1)[0] for c in real}

    problems = defaultdict(list)
    stmts = collect_statements()
    for path, line, sql in stmts:
        body = re.sub(r"'[^']*'", " ", sql)
        body = re.sub(r'#\{[^}]*\}|\$\{[^}]*\}|\?', " ", body)
        tbls = tables_of(body, all_tables)
        if not tbls:
            continue
        skip = skip_tokens(body) | tbls | table_aliases(body)

        # A. 裸 snake_case 标识符（真实列几乎都是 snake_case，本项目别名一律 camelCase）
        for w in snake_ids(body):
            if w in skip:
                continue
            if not any((t + "." + w) in real or (t + "." + w) in pending for t in tbls):
                problems[w].append((path, line, sorted(tbls)))

        # B. INSERT 显式列清单 —— 语义无歧义，逐个核对。
        #    这一条是补漏：AiSelfEvolutionService 的 INSERT 把 insights / status /
        #    create_time 三列全写错，而其中两列没有下划线，
        #    靠上面的裸标识符规则查不出来（别名匹配策略无法区分）。
        for table, col in insert_columns(body, all_tables):
            if ((table + "." + col) not in real
                    and (table + "." + col) not in pending):
                problems[col].append((path, line, [table]))

    rel = lambda p: os.path.relpath(p, ROOT)
    print(f"扫描原生 SQL：{len(stmts)} 条（列快照 {len(real)} 个 / 表 {len(all_tables)} 张）")
    if pending:
        print(f"待生效新列 {len(pending)} 个（迁移已写、尚未部署）：{', '.join(sorted(pending))}")
    if not problems:
        print("✅ 原生 SQL 里的列名全部存在于数据库")
        return 0

    print(f"\n❌ 发现 {len(problems)} 个「SQL 里写了、数据库里没有」的列：\n")
    for w, places in sorted(problems.items()):
        print(f"  {w}   （{len(places)} 处，涉及表 {', '.join(places[0][2])}）")
        for p, line, _ in places[:3]:
            print(f"      {rel(p)}:{line}")
    print("\n以上都曾在线上真实发生，且全部被 catch 成 debug/warn 后静默失效。")
    print("修 SQL 或补迁移；若确属新增列，请先 --refresh 快照。")
    return 1


if __name__ == "__main__":
    sys.exit(main())
