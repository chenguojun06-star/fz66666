#!/bin/bash
# safe-query.sh — CodeBuddy 环境下的安全只读数据库查询封装
#
# 替代 Trae 体系的 db-query-mcp，复刻其核心安全规则：
#   1. 只读账号 mcp_readonly（数据库层面拒绝写操作，最硬兜底）
#   2. 拒绝写关键字（INSERT/UPDATE/DELETE/DROP/ALTER/TRUNCATE/CREATE/GRANT）
#   3. 强制 LIMIT（无 LIMIT 自动加 100，超过 500 报错）
#   4. 多租户提醒（查询业务表不含 tenant_id 则警告，跨租户字面量则拒绝）
#
# 用法：
#   ./scripts/safe-query.sh "SELECT id,style_no FROM t_style_info WHERE tenant_id=1 LIMIT 10"
#   ./scripts/safe-query.sh --tenant 1 "SELECT * FROM t_style_info LIMIT 10"   # 自动补 tenant_id
#   ./scripts/safe-query.sh --table t_style_info --where "status=1"            # 按表查询
#   ./scripts/safe-query.sh --count --table t_style_info --where "tenant_id=1" # 计数
#
# 环境变量：
#   MCP_DB_PASSWORD  — mcp_readonly 账号密码（必须设置）
#   DB_PASSWORD      — root 密码（fallback，会警告）
#   DB_HOST          — 默认 127.0.0.1
#   DB_PORT          — 默认 3308
#   DB_NAME          — 默认 fashion_supplychain
#   SAFE_QUERY_TENANT — 默认租户ID（默认 1）
#
set -euo pipefail

# Auto-load .env (CodeBuddy friendly, avoid manual source)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
if [[ -f "$PROJECT_ROOT/.env" ]]; then
  set -a
  source "$PROJECT_ROOT/.env" 2>/dev/null || true
  set +a
fi

# ==================== Config ====================
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3308}"
DB_NAME="${DB_NAME:-fashion_supplychain}"
DEFAULT_TENANT="${SAFE_QUERY_TENANT:-1}"
MAX_ROWS=500
DEFAULT_LIMIT=100

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

err()  { echo -e "${RED}[SAFE-QUERY ERROR]${NC} $*" >&2; }
warn() { echo -e "${YELLOW}[SAFE-QUERY WARN]${NC} $*" >&2; }
ok()   { echo -e "${GREEN}[SAFE-QUERY OK]${NC} $*" >&2; }

# ==================== 参数解析 ====================
MODE="raw"       # raw | table | count
RAW_SQL=""
TABLE_NAME=""
WHERE_CLAUSE=""
TENANT_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tenant)    TENANT_ID="$2"; shift 2 ;;
    --table)     MODE="table"; TABLE_NAME="$2"; shift 2 ;;
    --count)     MODE="count"; shift ;;
    --where)     WHERE_CLAUSE="$2"; shift 2 ;;
    --help|-h)
      head -25 "$0" | tail -22
      exit 0 ;;
    --*)         err "未知参数: $1"; exit 2 ;;
    *)           RAW_SQL="$1"; MODE="raw"; shift ;;
  esac
done

# ==================== SQL 构造 ====================
SQL=""

case "$MODE" in
  raw)
    if [[ -z "$RAW_SQL" ]]; then
      err "未提供 SQL 语句"
      err "用法: $0 \"SELECT ... FROM ... WHERE tenant_id=1\""
      exit 2
    fi
    SQL="$RAW_SQL"
    ;;

  table)
    if [[ -z "$TABLE_NAME" ]]; then
      err "--table 模式需要指定表名"
      exit 2
    fi
    TENANT_ID="${TENANT_ID:-$DEFAULT_TENANT}"
    if [[ -n "$WHERE_CLAUSE" ]]; then
      SQL="SELECT * FROM $TABLE_NAME WHERE tenant_id=$TENANT_ID AND ($WHERE_CLAUSE) LIMIT $DEFAULT_LIMIT"
    else
      SQL="SELECT * FROM $TABLE_NAME WHERE tenant_id=$TENANT_ID LIMIT $DEFAULT_LIMIT"
    fi
    ;;

  count)
    if [[ -z "$TABLE_NAME" ]]; then
      err "--count 模式需要 --table 参数"
      exit 2
    fi
    TENANT_ID="${TENANT_ID:-$DEFAULT_TENANT}"
    if [[ -n "$WHERE_CLAUSE" ]]; then
      SQL="SELECT COUNT(*) AS cnt FROM $TABLE_NAME WHERE tenant_id=$TENANT_ID AND ($WHERE_CLAUSE)"
    else
      SQL="SELECT COUNT(*) AS cnt FROM $TABLE_NAME WHERE tenant_id=$TENANT_ID"
    fi
    ;;
esac

# ==================== 安全检测 ====================

# 1. 拒绝写操作（即使 mcp_readonly 账号已兜底，这里双重保险）
SQL_UPPER=$(echo "$SQL" | tr '[:lower:]' '[:upper:]')
FORBIDDEN_PATTERN="\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|RENAME|LOAD|OUTFILE|DUMPFILE)\b"
if echo "$SQL_UPPER" | grep -qE "$FORBIDDEN_PATTERN"; then
  # 排除子查询中的 UPDATE 引用（如 SELECT ... FROM t_update_log）
  # 但为安全起见，只要语句以写关键字开头就拒绝
  FIRST_WORD=$(echo "$SQL_UPPER" | sed -E 's/^\s*([A-Z]+).*/\1/')
  case "$FIRST_WORD" in
    INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|RENAME|LOAD)
      err "拒绝写操作（安全策略：safe-query.sh 只允许 SELECT）"
      err "如需写数据，请通过后端 Orchestrator/Service 代码执行，不要直接操作数据库"
      err "SQL: $SQL"
      exit 3
      ;;
  esac
fi

### -------------------------- LIMIT handling (skip for COUNT) --------------------------
if echo "$SQL_UPPER" | grep -q "^SELECT"; then
  if [[ "$MODE" == "count" ]]; then
    :   # COUNT itself, no LIMIT needed
  elif ! echo "$SQL_UPPER" | grep -qE "\bLIMIT\b"; then
    SQL="$SQL LIMIT $DEFAULT_LIMIT"
    warn "SQL 无 LIMIT，自动补 LIMIT $DEFAULT_LIMIT（最大 $MAX_ROWS）"
  else
    LIMIT_VAL=$(echo "$SQL_UPPER" | sed -E 's/.*LIMIT[[:space:]]+([0-9]+).*/\1/' | head -1)
    if [[ "$LIMIT_VAL" =~ ^[0-9]+$ ]] && [[ "$LIMIT_VAL" -gt "$MAX_ROWS" ]]; then
      err "LIMIT $LIMIT_VAL 超过最大值 $MAX_ROWS，已拒绝"
      err "如需大批量查询，请分页或使用 --count 模式"
      exit 4
    fi
  fi
fi

# 3. 多租户检测（仅对业务表查询，跳过 information_schema/mysql/performance_schema）
TENANT_REMINDER_NEEDED=false
if echo "$SQL_UPPER" | grep -q "^SELECT" && ! echo "$SQL_UPPER" | grep -qE "FROM[[:space:]]+(information_schema|mysql|performance_schema|sys)\."; then
  TENANT_REMINDER_NEEDED=true
fi

if [[ "$TENANT_REMINDER_NEEDED" == "true" ]]; then
  if ! echo "$SQL_UPPER" | grep -q "TENANT_ID"; then
    warn "查询业务表但未包含 tenant_id 条件，可能跨租户读取"
    warn "如果该表确实没有 tenant_id 字段（如系统配置表），可忽略此警告"
    warn "建议添加：AND tenant_id=$DEFAULT_TENANT"
  fi
  # cross-tenant literal detect: SQL contains tenant_id = N where N != default tenant
  # Extract all tenant_id = <number> values
  OTHER_TENANTS=$(echo "$SQL" | grep -oE "tenant_id[[:space:]]*=[[:space:]]*[0-9]+" | grep -oE "[0-9]+$" | sort -u | while read v; do [[ "$v" != "$DEFAULT_TENANT" ]] && echo "$v"; done || true)
  if [[ -n "$OTHER_TENANTS" ]]; then
    err "跨租户检测：SQL 中包含非默认租户 tenant_id=$OTHER_TENANTS（当前默认租户 $DEFAULT_TENANT）"
    err "如确需查询其他租户，请显式设置：SAFE_QUERY_TENANT=<目标租户ID>"
    exit 5
  fi
fi

# ==================== 账号选择（安全检测通过后才选账号） ====================
DB_USER=""
DB_PASS=""

if [[ -n "${MCP_DB_PASSWORD:-}" ]]; then
  DB_USER="mcp_readonly"
  DB_PASS="$MCP_DB_PASSWORD"
else
  # fallback 到 root，但警告（root 有写权限，安全降级）
  if [[ -n "${DB_PASSWORD:-}" ]]; then
    DB_USER="root"
    DB_PASS="$DB_PASSWORD"
    warn "MCP_DB_PASSWORD 未设置，降级使用 root 账号（有写权限，安全降级）"
    warn "建议：export MCP_DB_PASSWORD=<mcp_readonly密码> 以恢复只读保护"
  else
    err "未设置 MCP_DB_PASSWORD 或 DB_PASSWORD 环境变量"
    err "请先配置数据库密码：export MCP_DB_PASSWORD=xxx"
    exit 1
  fi
fi

## ==================== Execute ====================
## We prefer docker exec (no native mysql-client needed).
## Override MYSQL_BIN to use native mysql client if you have one.
MYSQL_CONTAINER="${MYSQL_CONTAINER:-fashion-mysql-simple}"

if [[ -n "${MYSQL_BIN:-}" ]]; then
  # user provided explicit path
  :
elif command -v mysql &>/dev/null; then
  MYSQL_BIN="mysql"
else
  # fallback to docker exec
  if ! command -v docker &>/dev/null; then
    err "Neither mysql client nor docker found. Install: brew install mysql-client"
    exit 6
  fi
  if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^${MYSQL_CONTAINER}$"; then
    err "Container ${MYSQL_CONTAINER} not running. Start it first."
    exit 7
  fi
  MYSQL_BIN="docker exec -i ${MYSQL_CONTAINER} mysql"
fi

# Connectivity check (skip for docker exec mode)
if [[ "$MYSQL_BIN" == "mysql" ]]; then
  if ! nc -z -w1 "$DB_HOST" "$DB_PORT" 2>/dev/null; then
    err "Cannot reach ${DB_HOST}:${DB_PORT}"
    exit 7
  fi
fi

if [[ "$DB_USER" == "mcp_readonly" ]]; then
  ok "Using readonly account mcp_readonly"
else
  warn "Using root account (has write privileges)"
fi

echo -e "${GREEN}[SQL]${NC} $SQL"

# Execute
if [[ "$MYSQL_BIN" == "mysql" ]]; then
  mysql -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
    --table --default-character-set=utf8mb4 \
    -e "$SQL" 2>&1 | grep -v "Warning: Using a password"
  EXIT_CODE=${PIPESTATUS[0]}
else
  # docker exec mode: pass SQL via stdin, suppress password warning
  docker exec -i "$MYSQL_CONTAINER" mysql -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
    --table --default-character-set=utf8mb4 2>&1 <<< "$SQL" | grep -v "Warning: Using a password"
  EXIT_CODE=${PIPESTATUS[0]}
fi

if [[ $EXIT_CODE -ne 0 ]]; then
  err "Query failed (exit $EXIT_CODE)"
  exit $EXIT_CODE
fi
