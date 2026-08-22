#!/bin/bash
# safe-push.sh — 推送前全量安全检查
#
# 确保每一次 git push 前：
#   1. 后端能编译通过（mvn compile）
#   2. 前端类型检查通过（tsc --noEmit）
#   3. Flyway 版本号无冲突
#   4. Flyway SQL 语法合法 + 列依赖正确
#   5. Entity 与 Flyway 迁移一致
#   6. 多租户审计通过（无遗漏 tenant_id）
#   7. 无敏感文件误提交（.env / token / .class / .vsix）
#
# 用法：
#   ./scripts/safe-push.sh              # 全量检查
#   ./scripts/safe-push.sh --quick      # 跳过编译和类型检查（快速模式，仅校验脚本）
#   ./scripts/safe-push.sh --backend    # 仅后端检查
#   ./scripts/safe-push.sh --frontend   # 仅前端检查
#
# 退出码：0=全部通过，非0=有失败项
#
set -uo pipefail

# ==================== 配置 ====================
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
SKIP=0
FAIL_DETAILS=()

MODE="all"
QUICK=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quick)    QUICK=true; shift ;;
    --backend)  MODE="backend"; shift ;;
    --frontend) MODE="frontend"; shift ;;
    --help|-h)  head -18 "$0"; exit 0 ;;
    *)          echo "未知参数: $1"; exit 2 ;;
  esac
done

pass() { PASS=$((PASS+1)); echo -e "  ${GREEN}[PASS]${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_DETAILS+=("$1: $2"); }
skip() { SKIP=$((SKIP+1)); echo -e "  ${YELLOW}[SKIP]${NC} $1"; }

run_check() {
  local name="$1"
  shift
  echo -e "\n${BLUE}━━━ $name ━━━${NC}"
  if "$@"; then
    pass "$name"
  else
    fail "$name" "退出码 $?"
  fi
}

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   safe-push.sh — 推送前安全检查              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "模式: MODE=$MODE QUICK=$QUICK"

# ==================== 1. 敏感文件检查（永远跑） ====================
check_sensitive_files() {
  local bad=0
  # 检查暂存区和已跟踪文件中的敏感文件
  local patterns=(
    '.env$' '.env\.' '*.pem' '*.key' '*.p12' '*.jks'
    '.github_token' 'token_local' 'secret'
    '\.class$' '\.jar$' '\.war$'
    '\.vsix$' '\.dmg$' '\.exe$'
    'node_modules/' '/dist/' '/build/'
    '\.DS_Store' 'nohup\.out' '\.log$'
  )
  for p in "${patterns[@]}"; do
    # 检查暂存区
    local found
    found=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E "$p" || true)
    if [[ -n "$found" ]]; then
      echo -e "  ${RED}[敏感文件]${NC} 暂存区发现: $found"
      bad=1
    fi
    # 检查本次将要推送的 commit 中是否有
    found=$(git log --name-only --pretty=format: origin..HEAD 2>/dev/null | grep -E "$p" || true)
    if [[ -n "$found" ]]; then
      echo -e "  ${RED}[敏感文件]${NC} 待推送 commit 发现: $found"
      bad=1
    fi
  done
  return $bad
}
run_check "敏感文件检查" check_sensitive_files

# ==================== 2. Flyway 版本号冲突 ====================
if [[ "$MODE" == "all" || "$MODE" == "backend" ]]; then
  if [[ -f scripts/check-flyway-versions.py ]]; then
    run_check "Flyway 版本号冲突" python3 scripts/check-flyway-versions.py
  else
    skip "Flyway 版本号检查（脚本不存在）"
  fi
fi

# ==================== 3. Flyway SQL 校验（diff 模式） ====================
if [[ "$MODE" == "all" || "$MODE" == "backend" ]]; then
  if [[ -f scripts/check-flyway-sql.py ]]; then
    run_check "Flyway SQL 校验（diff）" python3 scripts/check-flyway-sql.py --diff
  else
    skip "Flyway SQL 校验（脚本不存在）"
  fi
fi

# ==================== 4. Entity-Flyway 一致性 ====================
if [[ "$MODE" == "all" || "$MODE" == "backend" ]]; then
  if [[ -f scripts/check-entity-flyway.py ]]; then
    run_check "Entity-Flyway 一致性" python3 scripts/check-entity-flyway.py
  else
    skip "Entity-Flyway 一致性（脚本不存在）"
  fi
fi

# ==================== 5. Flyway 列依赖检查 ====================
if [[ "$MODE" == "all" || "$MODE" == "backend" ]]; then
  if [[ -f scripts/check-flyway-column-deps.py ]]; then
    run_check "Flyway 列依赖检查" python3 scripts/check-flyway-column-deps.py
  else
    skip "Flyway 列依赖检查（脚本不存在）"
  fi
fi

# ==================== 6. 多租户审计 ====================
if [[ "$MODE" == "all" || "$MODE" == "backend" ]]; then
  if [[ -f scripts/audit-tenant-id.py ]]; then
    run_check "多租户审计（tenant_id）" python3 scripts/audit-tenant-id.py
  else
    skip "多租户审计（脚本不存在）"
  fi
fi

# ==================== 7. 后端编译 ====================
if [[ "$MODE" == "all" || "$MODE" == "backend" ]]; then
  if [[ "$QUICK" == "false" ]]; then
    if [[ -f backend/pom.xml ]]; then
      run_check "后端编译（mvn compile）" bash -c 'cd backend && mvn compile -DskipTests -q 2>&1 | tail -5'
    else
      skip "后端编译（pom.xml 不存在）"
    fi
  else
    skip "后端编译（--quick 模式）"
  fi
fi

# ==================== 8. 前端类型检查 ====================
if [[ "$MODE" == "all" || "$MODE" == "frontend" ]]; then
  if [[ "$QUICK" == "false" ]]; then
    if [[ -f frontend/tsconfig.json ]]; then
      run_check "前端类型检查（tsc --noEmit）" bash -c 'cd frontend && npx tsc --noEmit 2>&1 | tail -10'
    else
      skip "前端类型检查（tsconfig.json 不存在）"
    fi
    # ESLint 必须与 CI 口径一致（2026-08-22 教训：本地只查tsc导致CI连挂4次无人发现，
    # "Unused eslint-disable directive" 本地不拦、线上拦）
    if [[ -f frontend/package.json ]]; then
      run_check "前端 ESLint（与CI同口径，0 error 才过）" bash -c \
        'cd frontend && npx eslint src --ext .ts,.tsx 2>&1 | grep -E "error" ; EXIT=${PIPESTATUS[0]}; if [ $EXIT -ne 0 ]; then echo "ESLint存在error，CI会挂"; exit 1; fi; echo "ESLint 0 errors"'
    fi
  else
    skip "前端类型检查（--quick 模式）"
  fi
fi

# ==================== 9. 架构守护测试（本地） ====================
if [[ "$MODE" == "all" || "$MODE" == "backend" ]]; then
  if [[ "$QUICK" == "false" ]]; then
    if [[ -d backend/src/test/java/com/fashion/supplychain/architecture ]]; then
      run_check "ArchUnit 架构守护" bash -c \
        'cd backend && mvn test -Dtest="ArchitectureConstraintTest,ArchitectureRulesTest" -DfailIfNoTests=false -q 2>&1 | tail -10'
    else
      skip "ArchUnit 架构守护（测试源码不存在）"
    fi
  else
    skip "ArchUnit 架构守护（--quick 模式）"
  fi
fi

# ==================== 汇总 ====================
echo -e "\n${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║              检查结果汇总                    ║${NC}"
echo -e "${BLUE}╠══════════════════════════════════════════════╣${NC}"
echo -e "  ${GREEN}通过: $PASS${NC}  ${RED}失败: $FAIL${NC}  ${YELLOW}跳过: $SKIP${NC}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "${BLUE}╠══════════════════════════════════════════════╣${NC}"
  echo -e "  ${RED}失败详情:${NC}"
  for d in "${FAIL_DETAILS[@]}"; do
    echo -e "    ${RED}- $d${NC}"
  done
  echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
  echo -e "\n${RED}❌ safe-push 检查未通过，已阻止推送${NC}"
  echo -e "${YELLOW}修复失败项后重新执行: ./scripts/safe-push.sh${NC}"
  exit 1
else
  echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
  echo -e "\n${GREEN}✅ safe-push 全部通过，可以安全推送${NC}"
  echo -e "${YELLOW}提示: 直接 git push 即可，pre-push hook 也会自动触发本脚本${NC}"
  exit 0
fi
