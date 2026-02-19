#!/bin/bash
#
# 压力测试快速启动脚本
# 用途：自动准备数据、获取Token、执行k6压力测试
#
# 使用方法：
#   ./run-pressure-test.sh           # 执行完整测试流程
#   ./run-pressure-test.sh --data    # 仅准备测试数据
#   ./run-pressure-test.sh --scan    # 仅执行扫码测试
#   ./run-pressure-test.sh --list    # 仅执行订单列表测试
#

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置参数
BACKEND_URL="http://localhost:8088"
DB_CONTAINER="fashion-mysql-simple"
DB_PASSWORD="changeme"
DB_NAME="fashion_supplychain"

# 测试账号
TEST_USERNAME="admin"
TEST_PASSWORD="admin123"
TEST_TENANT_ID=99

# k6 安装检查
function check_k6() {
  echo -e "${BLUE}🔍 检查 k6 工具...${NC}"
  if ! command -v k6 &> /dev/null; then
    echo -e "${YELLOW}⚠️  k6 未安装，正在安装...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
      brew install k6
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
      sudo apt-get install k6
    else
      echo -e "${RED}❌ 不支持的操作系统，请手动安装 k6: https://k6.io/docs/get-started/installation/${NC}"
      exit 1
    fi
  fi
  echo -e "${GREEN}✅ k6 已安装: $(k6 version | head -n 1)${NC}"
}

# 数据库连接检查
function check_database() {
  echo -e "${BLUE}🔍 检查数据库连接...${NC}"
  if ! docker ps | grep -q "$DB_CONTAINER"; then
    echo -e "${RED}❌ 数据库容器未运行: $DB_CONTAINER${NC}"
    echo -e "${YELLOW}提示：运行 ./deployment/db-manager.sh start${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ 数据库容器运行正常${NC}"
}

# 后端服务检查
function check_backend() {
  echo -e "${BLUE}🔍 检查后端服务...${NC}"
  if ! curl -s "$BACKEND_URL/actuator/health" > /dev/null; then
    echo -e "${RED}❌ 后端服务未运行或无法访问: $BACKEND_URL${NC}"
    echo -e "${YELLOW}提示：运行 ./dev-public.sh 启动服务${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ 后端服务运行正常${NC}"
}

# 准备测试数据
function prepare_test_data() {
  echo -e "\n${BLUE}📦 准备测试数据...${NC}"
  echo -e "${YELLOW}警告：将生成 1000 订单 + 10000 扫码记录 + 500 库存数据${NC}"
  read -p "确认继续？(y/N): " confirm
  if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⏭️  跳过数据准备${NC}"
    return
  fi

  echo -e "${BLUE}🚀 执行 SQL 脚本（预计需要 1-2 分钟）...${NC}"
  docker exec -i "$DB_CONTAINER" mysql -uroot -p"$DB_PASSWORD" "$DB_NAME" \
    < sql/prepare-pressure-test-data.sql

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 测试数据准备完成${NC}"
  else
    echo -e "${RED}❌ 测试数据准备失败${NC}"
    exit 1
  fi
}

# 获取 JWT Token
function get_jwt_token() {
  echo -e "\n${BLUE}🔑 获取 JWT Token...${NC}"

  local response=$(curl -s -X POST "$BACKEND_URL/api/system/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"username\":\"$TEST_USERNAME\",\"password\":\"$TEST_PASSWORD\",\"tenantId\":$TEST_TENANT_ID}")

  # 提取 token（使用 grep + sed，兼容 macOS 和 Linux）
  local token=$(echo "$response" | grep -o '"token":"[^"]*"' | sed 's/"token":"\([^"]*\)"/\1/')

  if [ -z "$token" ]; then
    echo -e "${RED}❌ Token 获取失败${NC}"
    echo -e "${YELLOW}响应内容: $response${NC}"
    exit 1
  fi

  export JWT_TOKEN="$token"
  echo -e "${GREEN}✅ Token 获取成功（前20字符）: ${token:0:20}...${NC}"
}

# 执行扫码压力测试
function run_scan_test() {
  echo -e "\n${BLUE}🔥 执行扫码录入压力测试...${NC}"
  echo -e "${YELLOW}测试场景: 10VU(1min) → 50VU(3min) → 100VU(5min) → 200VU(2min)${NC}"

  k6 run scripts/k6-scan-test.js

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 扫码测试完成${NC}"
  else
    echo -e "${RED}❌ 扫码测试失败（性能阈值未达标）${NC}"
  fi
}

# 执行订单列表压力测试
function run_list_test() {
  echo -e "\n${BLUE}🔥 执行订单列表查询压力测试...${NC}"
  echo -e "${YELLOW}测试场景: 20VU(1min) → 50VU(5min) → 100VU(10min) → 200VU(2min)${NC}"

  k6 run scripts/k6-order-list-test.js

  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 订单列表测试完成${NC}"
  else
    echo -e "${RED}❌ 订单列表测试失败（性能阈值未达标）${NC}"
  fi
}

# 生成测试报告
function generate_report() {
  echo -e "\n${BLUE}📊 生成测试报告...${NC}"

  local report_file="docs/压力测试报告-$(date +%Y-%m-%d).md"

  cat > "$report_file" << EOF
# 压力测试报告

**测试时间**: $(date '+%Y-%m-%d %H:%M:%S')
**测试环境**: 本地开发环境
**后端URL**: $BACKEND_URL
**数据库**: MySQL 8.0 (Docker)

---

## 测试概要

本次测试覆盖以下场景：
- ✅ 扫码录入压力测试
- ✅ 订单列表查询压力测试

详细性能指标请查看 k6 输出日志。

---

## 下一步分析

1. 查看 MySQL 慢查询日志
   \`\`\`bash
   docker exec $DB_CONTAINER mysql -uroot -p$DB_PASSWORD -e "SELECT * FROM mysql.slow_log ORDER BY start_time DESC LIMIT 10;"
   \`\`\`

2. 查看后端日志错误
   \`\`\`bash
   tail -n 100 backend/logs/fashion-supplychain.log | grep ERROR
   \`\`\`

3. 检查数据库连接池状态
   \`\`\`bash
   grep "HikariPool" backend/logs/fashion-supplychain.log
   \`\`\`

---

## 优化建议

- [ ] 添加数据库索引（参考 sql/prepare-pressure-test-data.sql）
- [ ] 优化慢 SQL 查询
- [ ] 调整 HikariCP 连接池配置
- [ ] 考虑使用 Redis 缓存热点数据

EOF

  echo -e "${GREEN}✅ 测试报告已生成: $report_file${NC}"
}

# 主流程
function main() {
  echo -e "${GREEN}"
  echo "╔══════════════════════════════════════════════╗"
  echo "║   服装供应链系统 - 压力测试快速启动脚本   ║"
  echo "╚══════════════════════════════════════════════╝"
  echo -e "${NC}"

  # 解析命令行参数
  case "$1" in
    --data)
      check_database
      prepare_test_data
      exit 0
      ;;
    --scan)
      check_k6
      check_backend
      get_jwt_token
      run_scan_test
      exit 0
      ;;
    --list)
      check_k6
      check_backend
      get_jwt_token
      run_list_test
      exit 0
      ;;
    --help)
      echo "用法: $0 [选项]"
      echo ""
      echo "选项:"
      echo "  (无参数)   执行完整测试流程"
      echo "  --data     仅准备测试数据"
      echo "  --scan     仅执行扫码测试"
      echo "  --list     仅执行订单列表测试"
      echo "  --help     显示此帮助信息"
      exit 0
      ;;
  esac

  # 完整测试流程
  check_k6
  check_database
  check_backend
  prepare_test_data
  get_jwt_token
  run_scan_test
  run_list_test
  generate_report

  echo -e "\n${GREEN}🎉 所有测试完成！${NC}"
  echo -e "${BLUE}📊 查看测试报告: docs/压力测试报告-$(date +%Y-%m-%d).md${NC}"
}

# 执行主流程
main "$@"
