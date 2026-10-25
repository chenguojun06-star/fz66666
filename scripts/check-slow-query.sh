#!/usr/bin/env bash
# D-864 / D-875：MySQL 慢查询巡检
#
# 背景：生产 slow_query_log 早已开启（long_query_time=1s、log_output=FILE），
# 但没人分析——2026-10-24 首次人工查看就发现一条 9.0 秒 / 扫 71 万行的巡检去重查询，
# 已由 V202610240006 补联合索引修复。慢查询的价值在于「持续有人看」，本脚本把查看成本降到一条命令。
#
# D-875：加时间窗口过滤。此前统计的是 slow.log 全量累积（262 条跨好几天），
# 会把「已经修过的老问题」和「正在发生的新问题」混在一起 —— 看最近的才叫巡检。
#
# 用法：
#   ./scripts/check-slow-query.sh                     # 最近 2 小时（默认）
#   ./scripts/check-slow-query.sh --since 30          # 最近 30 分钟
#   ./scripts/check-slow-query.sh --since 0           # 全量累积（排查历史用）
#   ./scripts/check-slow-query.sh --since 30 --top 20 # 最近 30 分钟、看前 20 条
#   bash scripts/check-slow-query.sh --local          # 在服务器上直接跑
#
# 依赖：本地/服务器可执行 docker exec（生产容器名 lighthouse-mysql-1，可用 MYSQL_CONTAINER 覆盖）

set -euo pipefail

MODE="remote"
SINCE_MINUTES=120
TOP_N=10

while [ $# -gt 0 ]; do
  case "$1" in
    --local) MODE="local"; shift ;;
    --since) SINCE_MINUTES="${2:-120}"; shift 2 ;;
    --top)   TOP_N="${2:-10}"; shift 2 ;;
    *[0-9]*) TOP_N="$1"; shift ;;
    *) shift ;;
  esac
done

MYSQL_CONTAINER="${MYSQL_CONTAINER:-lighthouse-mysql-1}"
SLOW_LOG="${SLOW_LOG:-/var/lib/mysql/slow.log}"

TMP_FILE="$(mktemp /tmp/slow-log.XXXXXX)"
trap 'rm -f "$TMP_FILE"' EXIT

if [ "$MODE" = "local" ]; then
  docker exec "$MYSQL_CONTAINER" cat "$SLOW_LOG" > "$TMP_FILE" 2>/dev/null || {
    echo "❌ 读取容器内 $SLOW_LOG 失败（容器名：$MYSQL_CONTAINER）"; exit 1;
  }
else
  SSH_HOST="${SSH_HOST:-ubuntu@106.55.12.216}"
  SSH_KEY="${SSH_KEY:-$HOME/.ssh/fz66666_backup}"
  ssh -i "$SSH_KEY" -o BatchMode=yes "$SSH_HOST" \
    "docker exec $MYSQL_CONTAINER cat $SLOW_LOG" > "$TMP_FILE" 2>/dev/null || {
    echo "❌ SSH 拉取慢查询日志失败（$SSH_HOST / $MYSQL_CONTAINER）"; exit 1;
  }
fi

TOTAL=$(grep -c '^# Query_time' "$TMP_FILE" || true)
RAW_TOTAL="$TOTAL"

# D-875：按 # Time: 做时间窗口过滤（slow.log 的 log_timestamps=UTC，阈值也按 UTC 算）。
# 不过滤的话，统计的是跨天累积（262 条），会把「早已修好的老问题」和「正在发生的新问题」混在一起。
if [ "$SINCE_MINUTES" != "0" ] && [ "$RAW_TOTAL" != "0" ]; then
  THRESHOLD=$(python3 -c "import datetime;print((datetime.datetime.utcnow()-datetime.timedelta(minutes=int('$SINCE_MINUTES'))).strftime('%Y-%m-%dT%H:%M'))" 2>/dev/null || echo "")
  if [ -n "$THRESHOLD" ]; then
    awk -v thr="$THRESHOLD" '
      /^# Time:/ { keep = (substr($0, 9, 16) >= thr) }
      keep { print }
    ' "$TMP_FILE" > "$TMP_FILE.window" && mv "$TMP_FILE.window" "$TMP_FILE"
    TOTAL=$(grep -c '^# Query_time' "$TMP_FILE" || true)
    echo "ℹ️  时间窗口：最近 ${SINCE_MINUTES} 分钟（UTC 阈值 ${THRESHOLD}）｜累积 ${RAW_TOTAL} 条 → 窗口内 ${TOTAL} 条"
    echo
  fi
fi

if [ "$TOTAL" = "0" ]; then
  echo "✅ 该时间窗口内没有慢查询（long_query_time=1s）。看全量请加 --since 0"
  exit 0
fi

echo "=== MySQL 慢查询巡检（窗口内 ${TOTAL} 条，long_query_time=1s）==="
echo
echo "── 最慢的 $TOP_N 条 ──"
# 逐条取「耗时 + 紧随其后的 SQL 首行」
awk '
  /^# Query_time:/ { q=$3; next }
  # 只统计真正的 SQL 语句；SET timestamp=... 是 MySQL 客户端写入的时间戳，不是业务语句
  /^(SELECT|UPDATE|INSERT|DELETE|REPLACE|CREATE|ALTER|DROP)/ {
    if (q != "") { printf "%8.2fs  %s\n", q, substr($0, 1, 150); q="" }
  }
' "$TMP_FILE" | sort -rn | head -n "$TOP_N"

echo
echo "── 涉及最多的表（可能是缺索引的高频表）──"
# 只取 FROM/JOIN/UPDATE/INTO 后面的表名，避免把 tenant_id / issue_type 误当成表名
grep -E '^(SELECT|UPDATE|INSERT|DELETE|REPLACE)' "$TMP_FILE" \
  | grep -oiE '(from|join|update|into)[[:space:]]+`?(t_[a-z0-9_]+)`?' \
  | grep -oiE 't_[a-z0-9_]+' \
  | sort | uniq -c | sort -rn | head -8

echo
echo "── 耗时分布 ──"
awk '/^# Query_time:/ { t=$3; if (t>=10) a++; else if (t>=5) b++; else if (t>=2) c++; else d++ }
     END { printf "  ≥10s: %d\n 5-10s: %d\n 2-5s: %d\n <2s: %d\n", a, b, c, d }' "$TMP_FILE"

echo
echo "提示：≥5s 的语句建议按 SQL 形态补联合索引；索引变更必须走 Flyway 迁移（禁止直接改库）。"
