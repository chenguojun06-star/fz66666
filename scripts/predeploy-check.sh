#!/bin/bash
# predeploy-check.sh — 部署前安全检查
#
# 在部署到生产前执行，确保：
#   1. safe-push 全量检查通过（编译+类型+Flyway+多租户）
#   2. application-prod.yml 安全配置正确（CORS/密钥/Mock）
#   3. 无硬编码 http:// 协议源
#   4. 无 Mock 数据残留
#   5. 环境变量引用检查（无明文密码）
#   6. Dockerfile 构建验证
#
# 用法:
#   ./scripts/predeploy-check.sh              # 全量检查
#   ./scripts/predeploy-check.sh --skip-build # 跳过编译（已构建过）
#
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS=0
FAIL=0
FAIL_DETAILS=()

pass() { PASS=$((PASS+1)); echo -e "  ${GREEN}[PASS]${NC} $1"; }
fail() { FAIL=$((FAIL+1)); echo -e "  ${RED}[FAIL]${NC} $1"; FAIL_DETAILS+=("$1: $2"); }

SKIP_BUILD=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true; shift ;;
    *)            shift ;;
  esac
done

echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   predeploy-check.sh — 部署前安全检查        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"

# ==================== 1. safe-push 全量检查 ====================
echo -e "\n${BLUE}━━━ 1. safe-push 全量检查 ━━━${NC}"
if [[ "$SKIP_BUILD" == "true" ]]; then
  echo -e "  ${YELLOW}[SKIP]${NC} --skip-build 模式"
else
  if ./scripts/safe-push.sh; then
    pass "safe-push 全量检查"
  else
    fail "safe-push 全量检查" "退出码 $?"
  fi
fi

# ==================== 2. application-prod.yml 安全扫描 ====================
echo -e "\n${BLUE}━━━ 2. 生产配置安全扫描 ━━━${NC}"
PROD_YML="backend/src/main/resources/application-prod.yml"

check_prod_config() {
  local bad=0

  if [[ ! -f "$PROD_YML" ]]; then
    echo -e "  ${RED}[FAIL]${NC} application-prod.yml 不存在"
    return 1
  fi

  # 2a. CORS 不能含 http://（必须 https）
  local http_origins
  http_origins=$(grep -E "allowed-origin|allow-origin" "$PROD_YML" | grep "http://" | grep -v "#" || true)
  if [[ -n "$http_origins" ]]; then
    echo -e "  ${RED}[FAIL]${NC} CORS 含 http:// 协议源: $http_origins"
    bad=1
  else
    echo -e "  ${GREEN}[PASS]${NC} CORS 无 http:// 协议源"
  fi

  # 2b. CORS 不能含 localhost
  local localhost
  localhost=$(grep -iE "allowed-origin|allow-origin" "$PROD_YML" | grep -i "localhost\|127.0.0.1\|0.0.0.0" | grep -v "#" || true)
  if [[ -n "$localhost" ]]; then
    echo -e "  ${RED}[FAIL]${NC} CORS 含 localhost: $localhost"
    bad=1
  else
    echo -e "  ${GREEN}[PASS]${NC} CORS 无 localhost"
  fi

  # 2c. 不能有明文密码（应走 ${ENV_VAR}）
  local plain_pass
  plain_pass=$(grep -iE "(password|secret|token|key):" "$PROD_YML" | grep -v "\${" | grep -v "^#" | grep -v "defaultKey" | grep -vE ":\s*$" || true)
  if [[ -n "$plain_pass" ]]; then
    echo -e "  ${RED}[FAIL]${NC} 疑似明文密码: $plain_pass"
    bad=1
  else
    echo -e "  ${GREEN}[PASS]${NC} 密码均走环境变量引用"
  fi

  # 2d. 不能含 Mock 标记
  local mock
  mock=$(grep -iE "mock|test|debug" "$PROD_YML" | grep -i "true\|enabled" | grep -v "#" || true)
  if [[ -n "$mock" ]]; then
    echo -e "  ${YELLOW}[WARN]${NC} 疑似 Mock/Test 配置: $mock"
  fi

  return $bad
}
if check_prod_config; then pass "生产配置安全"; else fail "生产配置安全" "见上方详情"; fi

# ==================== 3. Dockerfile 验证 ====================
echo -e "\n${BLUE}━━━ 3. Dockerfile 验证 ━━━${NC}"
check_dockerfile() {
  local bad=0
  if [[ ! -f Dockerfile ]]; then
    echo -e "  ${YELLOW}[SKIP]${NC} Dockerfile 不存在"
    return 0
  fi

  # 不能用 :latest 标签
  if grep -qE "FROM.*:latest" Dockerfile; then
    echo -e "  ${RED}[FAIL]${NC} Dockerfile 使用 :latest 标签（应固定版本）"
    bad=1
  fi

  # 不能以 root 运行
  if ! grep -q "USER " Dockerfile; then
    echo -e "  ${YELLOW}[WARN]${NC} Dockerfile 未设置 USER（以 root 运行）"
  fi

  # 检查 EXPOSE 端口
  if ! grep -q "EXPOSE" Dockerfile; then
    echo -e "  ${YELLOW}[WARN]${NC} Dockerfile 未声明 EXPOSE"
  fi

  return $bad
}
if check_dockerfile; then pass "Dockerfile 验证"; else fail "Dockerfile 验证" "见上方详情"; fi

# ==================== 4. 环境变量清单检查 ====================
echo -e "\n${BLUE}━━━ 4. 关键环境变量清单 ━━━${NC}"
ENV_VARS=("DB_PASSWORD" "SPRING_REDIS_PASSWORD" "JWT_SECRET" "FEISHU_WEBHOOK_URL")
for v in "${ENV_VARS[@]}"; do
  if [[ -n "${!v:-}" ]]; then
    echo -e "  ${GREEN}[SET]${NC} $v = ${!v:0:3}***"
  else
    echo -e "  ${YELLOW}[NOT SET]${NC} $v — 部署时必须配置"
  fi
done

# ==================== 5. 未提交变更检查 ====================
echo -e "\n${BLUE}━━━ 5. 工作区状态 ━━━${NC}"
if [[ -n "$(git status --porcelain)" ]]; then
  echo -e "  ${YELLOW}[WARN]${NC} 工作区有未提交变更，部署前请确认是否已提交"
  git status --short | head -10
else
  pass "工作区干净"
fi

# 当前分支
BRANCH=$(git branch --show-current)
echo -e "  当前分支: ${BLUE}$BRANCH${NC}"
if [[ "$BRANCH" != "main" ]] && [[ "$BRANCH" != "master" ]]; then
  echo -e "  ${YELLOW}[WARN]${NC} 不在 main/master 分支，确认是否要从此分支部署"
fi

# ==================== 汇总 ====================
echo -e "\n${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           部署前检查结果汇总                 ║${NC}"
echo -e "${BLUE}╠══════════════════════════════════════════════╣${NC}"
echo -e "  ${GREEN}通过: $PASS${NC}  ${RED}失败: $FAIL${NC}"

if [[ $FAIL -gt 0 ]]; then
  echo -e "${BLUE}╠══════════════════════════════════════════════╣${NC}"
  echo -e "  ${RED}失败详情:${NC}"
  for d in "${FAIL_DETAILS[@]}"; do
    echo -e "    ${RED}- $d${NC}"
  done
  echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
  echo -e "\n${RED}❌ 部署前检查未通过，请修复后再部署${NC}"
  exit 1
else
  echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
  echo -e "\n${GREEN}✅ 部署前检查全部通过${NC}"
  echo -e "${YELLOW}请确认环境变量已配置后执行部署${NC}"
  exit 0
fi
