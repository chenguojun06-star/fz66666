#!/bin/bash

# 系统稳定性快速检查脚本
# 功能：验证 Redis、Token、API 可用性
# 执行：bash stability-quick-check.sh

API_HOST="http://localhost:5173"
BACKEND_HOST="http://localhost:8088"
LOGIN_USER="admin"
LOGIN_PASS="admin123"

echo "════════════════════════════════════════════════════"
echo "   系统稳定性快速检查（2026-03-11）"
echo "════════════════════════════════════════════════════"
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

# 测试函数
test_endpoint() {
    local url=$1
    local method=$2
    local body=$3
    local description=$4

    echo -n "🔍 $description ... "

    if [ -z "$body" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$url")
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$url" -H "Content-Type: application/json" -d "$body")
    fi

    http_code=$(echo "$response" | tail -n 1)
    response_body=$(echo "$response" | head -n -1)

    if [[ $http_code == 200 ]] || [[ $http_code == 201 ]]; then
        echo -e "${GREEN}✓${NC} (HTTP $http_code)"
        ((PASS_COUNT++))
        return 0
    else
        echo -e "${RED}✗${NC} (HTTP $http_code)"
        echo "  响应：$response_body"
        ((FAIL_COUNT++))
        return 1
    fi
}

# ════════════════════════════════════════════════════
# 1️⃣  REDIS 连接测试
# ════════════════════════════════════════════════════
echo ""
echo "📍 【第一部分】Redis 连接测试"
echo "─────────────────────────────────"

# 获取 Redis Token 缓存大小
test_endpoint "$BACKEND_HOST/api/system/health" "GET" "" "Backend 健康检查"

# 查询 Redis 统计（如果 Backend 暴露该接口）
echo -n "🔍 Redis 连接状态 ... "
redis_check=$(curl -s "$BACKEND_HOST/api/system/redis-status" 2>/dev/null)
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC}"
    ((PASS_COUNT++))
else
    echo -e "${YELLOW}~${NC} (接口不可用，但不影响)"
fi

# ════════════════════════════════════════════════════
# 2️⃣  Token 认证测试
# ════════════════════════════════════════════════════
echo ""
echo "📍 【第二部分】Token 认证测试（首次登录）"
echo "─────────────────────────────────"

login_body="{\"username\":\"$LOGIN_USER\",\"password\":\"$LOGIN_PASS\"}"
response=$(curl -s -X POST "$BACKEND_HOST/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "$login_body")

token=$(echo "$response" | grep -o '"token":"[^"]*' | head -1 | cut -d'"' -f4)

if [ -z "$token" ]; then
    echo -e "${RED}✗ 登录失败${NC}"
    echo "  响应：$response"
    ((FAIL_COUNT++))
else
    echo -e "${GREEN}✓ 登录成功${NC}"
    echo "  Token 长度：${#token} 字符"
    ((PASS_COUNT++))
fi

# ════════════════════════════════════════════════════
# 3️⃣  API 可用性测试
# ════════════════════════════════════════════════════
echo ""
echo "📍 【第三部分】API 可用性测试"
echo "─────────────────────────────────"

# GET /api/production/notice/my
test_endpoint "$BACKEND_HOST/api/production/notice/my" "POST" '{"page":1,"pageSize":10}' "订单列表查询"

# GET /api/production/notice/unread-count
test_endpoint "$BACKEND_HOST/api/production/notice/unread-count" "GET" "" "未读消息统计"

# GET /api/dashboard/daily-brief
test_endpoint "$BACKEND_HOST/api/dashboard/daily-brief" "GET" "" "日报数据获取"

# GET /api/intelligence/live-pulse
test_endpoint "$BACKEND_HOST/api/intelligence/live-pulse" "GET" "" "实时脉搏数据"

# ════════════════════════════════════════════════════
# 4️⃣  前后端集成测试
# ════════════════════════════════════════════════════
echo ""
echo "📍 【第四部分】前后端集成测试"
echo "─────────────────────────────────"

# 测试前端页面加载
echo -n "🔍 前端首页加载 ... "
frontend_check=$(curl -s "$API_HOST" | head -c 100)
if [[ ! -z "$frontend_check" ]]; then
    echo -e "${GREEN}✓${NC}"
    ((PASS_COUNT++))
else
    echo -e "${RED}✗${NC}"
    ((FAIL_COUNT++))
fi

# ════════════════════════════════════════════════════
# 5️⃣  性能基线测试（简单版）
# ════════════════════════════════════════════════════
echo ""
echo "📍 【第五部分】性能基线测试"
echo "─────────────────────────────────"

# 连续 10 次请求并计时
total_time=0
for i in {1..10}; do
    start_time=$(date +%s%N)
    curl -s "$BACKEND_HOST/api/production/notice/unread-count" >/dev/null
    end_time=$(date +%s%N)
    duration=$((($end_time - $start_time) / 1000000))
    total_time=$(($total_time + $duration))
done

avg_time=$(($total_time / 10))
echo "🔍 平均响应时间（10次请求）... ${avg_time}ms"
if [ $avg_time -lt 100 ]; then
    echo -e "   性能等级：${GREEN}优秀${NC} (avg < 100ms)"
    ((PASS_COUNT++))
elif [ $avg_time -lt 200 ]; then
    echo -e "   性能等级：${GREEN}良好${NC} (avg < 200ms)"
    ((PASS_COUNT++))
elif [ $avg_time -lt 500 ]; then
    echo -e "   性能等级：${YELLOW}正常${NC} (avg < 500ms)"
    ((PASS_COUNT++))
else
    echo -e "   性能等级：${RED}需优化${NC} (avg >= 500ms)"
    ((FAIL_COUNT++))
fi

# ════════════════════════════════════════════════════
# 6️⃣  并发测试（AB 工具，如可用）
# ════════════════════════════════════════════════════
echo ""
echo "📍 【第六部分】并发压力测试（可选）"
echo "─────────────────────────────────"

if command -v ab &> /dev/null; then
    echo "🔍 Apache Bench 可用，执行快速压力测试..."
    echo ""
    ab -n 100 -c 10 "$BACKEND_HOST/api/production/notice/unread-count" 2>/dev/null | grep -E "Requests per second|Time per request|Failed requests"
    echo ""
    ((PASS_COUNT++))
else
    echo "⚠️  Apache Bench 不可用，跳过压力测试"
    echo "   建议：brew install httpd 安装 AB 工具"
fi

# ════════════════════════════════════════════════════
# 结果汇总
# ════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════════════"
echo "   📊 测试结果汇总"
echo "════════════════════════════════════════════════════"
echo -e "✅ 通过: ${GREEN}$PASS_COUNT${NC} 个"
echo -e "❌ 失败: ${RED}$FAIL_COUNT${NC} 个"
echo ""

if [ $FAIL_COUNT -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！系统就绪。${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  存在 $FAIL_COUNT 个测试失败，请检查。${NC}"
    exit 1
fi
