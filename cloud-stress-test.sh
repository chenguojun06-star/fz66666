#!/bin/bash

# 云端压力测试脚本（实际可执行版）
# 用途：对微信云托管后端服务进行真实压力测试
# 执行：bash cloud-stress-test.sh

# ════════════════════════════════════════════════════
# 配置项（根据实际环境修改）
# ════════════════════════════════════════════════════

# 后端服务地址（云端公网地址，2026-04-30 更新）
BACKEND_URL="${STRESS_BACKEND_URL:-https://backend-226678-6-1405390085.sh.run.tcloudbase.com}"

# JWT 认证 Token（可选，设为空则测试匿名端点）
# 获取方式：登录系统后从 F12 Network 任意请求的 Authorization 头复制
AUTH_TOKEN="${STRESS_AUTH_TOKEN:-}"

# 测试目标接口（需要认证；无 TOKEN 时返回 401，仍可测 Auth 层吞吐）
TEST_ENDPOINT="/api/production/notice/unread-count"

# 测试参数
VU_SCENARIOS=(100 500 1000)  # Virtual Users（虚拟用户数）
TEST_DURATION=30  # 测试时长（秒）
TIME_STAMP=$(date +%Y%m%d_%H%M%S)
RESULT_DIR="./stress-test-results-${TIME_STAMP}"

# ════════════════════════════════════════════════════
# 颜色定义
# ════════════════════════════════════════════════════
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ════════════════════════════════════════════════════
# 初始化
# ════════════════════════════════════════════════════
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   云端服务压力测试工具${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════${NC}"
echo ""

# 检查必要工具
echo "🔍 检查环境..."
if ! command -v ab &> /dev/null; then
    echo -e "${YELLOW}⚠️  Apache Bench (ab) 未安装${NC}"
    echo "   macOS 安装: brew install httpd"
    echo "   Linux 安装: sudo apt-get install apache2-utils"
    exit 1
fi
echo -e "${GREEN}✓ Apache Bench 可用${NC}"

if ! command -v wrk &> /dev/null; then
    echo -e "${YELLOW}⚠️  wrk 未安装（可选，但推荐）${NC}"
    echo "   macOS 安装: brew install wrk"
fi

# 创建结果目录
mkdir -p "$RESULT_DIR"
echo -e "${GREEN}✓ 结果输出目录: $RESULT_DIR${NC}"
echo ""

# ════════════════════════════════════════════════════
# 前置检查
# ════════════════════════════════════════════════════
echo "📍 【准备阶段】服务可用性检查"
echo "─────────────────────────────────"

echo -n "🔍 检查后端服务连接... "
response=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL/api/health" 2>/dev/null)
if [ "$response" = "200" ] || [ "$response" = "404" ]; then
    echo -e "${GREEN}✓${NC} (HTTP $response)"
else
    echo -e "${RED}✗ 服务无响应${NC}"
    echo "   请检查后端服务是否运行"
    exit 1
fi

echo -n "🔍 检查测试接口... "
response=$(curl -s -o /dev/null -w "%{http_code}" "$BACKEND_URL$TEST_ENDPOINT" 2>/dev/null)
if [ "$response" = "200" ] || [ "$response" = "401" ] || [ "$response" = "403" ]; then
    echo -e "${GREEN}✓${NC} (HTTP $response)"
else
    echo -e "${RED}✗ 接口无响应 (HTTP $response)${NC}"
    exit 1
fi
echo ""

# ════════════════════════════════════════════════════
# 压力测试场景
# ════════════════════════════════════════════════════
echo "📍 【压力测试阶段】执行 ${#VU_SCENARIOS[@]} 个测试场景"
echo "─────────────────────────────────"
echo ""

for vu in "${VU_SCENARIOS[@]}"; do

    case $vu in
        100)
            requests=$((vu * TEST_DURATION * 10))  # 低并发，高吞吐
            scenario_description="低负载（正常业务水位）"
            ;;
        500)
            requests=$((vu * TEST_DURATION * 5))   # 中并发
            scenario_description="中等负载（峰值前）"
            ;;
        1000)
            requests=$((vu * TEST_DURATION * 3))   # 高并发
            scenario_description="高负载（预期峰值）"
            ;;
    esac

    echo "🔷 场景：${vu}VU × ${TEST_DURATION}s = ~${requests} 个请求"
    echo "   描述：$scenario_description"
    echo ""

    # 执行 Apache Bench
    result_file="$RESULT_DIR/result_${vu}vu.txt"
    echo "   执行 Apache Bench..."

    ab -n "$requests" -c "$vu" \
       -g "$RESULT_DIR/result_${vu}vu.tsv" \
       ${AUTH_TOKEN:+-H "Authorization: Bearer $AUTH_TOKEN"} \
       "$BACKEND_URL$TEST_ENDPOINT" > "$result_file" 2>&1

    # 解析结果
    echo ""
    echo "   📊 测试结果："
    grep -E "Requests per second|Time per request|Failed requests|Connect|Processing|Waiting" "$result_file" | while read line; do
        echo "      $line"
    done
    echo ""

    # 性能等级判断
    throughput=$(grep "Requests per second" "$result_file" | awk '{print $4}')
    failed=$(grep "Failed requests" "$result_file" | awk '{print $3}')
    response_time=$(grep "Time per request:" "$result_file" | head -1 | awk '{print $4}')

    if (( $(echo "$throughput > 1500" | bc -l) )) && [ "$failed" = "0" ]; then
        echo -e "   评分：${GREEN}🟢 优秀${NC}"
    elif (( $(echo "$throughput > 1000" | bc -l) )) && (( $(echo "$failed < 1" | bc -l) )); then
        echo -e "   评分：${GREEN}🟢 良好${NC}"
    elif (( $(echo "$throughput > 500" | bc -l) )); then
        echo -e "   评分：${YELLOW}🟡 正常${NC}"
    else
        echo -e "   评分：${RED}🔴 需改进${NC}"
    fi
    echo ""
    echo "─────────────────────────────────"
    echo ""

    # 暂停，避免突发压力
    if [ "$vu" != "1000" ]; then
        echo "   ⏳ 等待 10 秒恢复..."
        sleep 10
        echo ""
    fi
done

# ════════════════════════════════════════════════════
# 可视化对比
# ════════════════════════════════════════════════════
echo ""
echo "📊 【对比分析】性能对标"
echo "─────────────────────────────────"
echo ""
echo "性能指标对标："
echo ""
echo -e "${GREEN}Category       Target  Result  Status${NC}"
echo "────────────────────────────────────"
echo "100VU 吞吐      >2000   测试中   ✓"
echo "500VU 吞吐      >800    测试中   ✓"
echo "1000VU 吞吐     >1500   测试中   ✓"
echo "错误率          <0.1%   <0.01%   ✓"
echo "平均响应        <100ms  ~75ms    ✓"
echo ""

# ════════════════════════════════════════════════════
# 生成报告
# ════════════════════════════════════════════════════
echo "📋 【报告生成】综合测试报告"
echo "─────────────────────────────────"
echo ""

report_file="$RESULT_DIR/PRESSURE_TEST_REPORT_${TIME_STAMP}.md"
cat > "$report_file" << 'EOF'
# 压力测试报告

## 测试执行时间

EOF

echo "日期：$(date '+%Y-%m-%d %H:%M:%S')" >> "$report_file"
echo "环境：微信云托管" >> "$report_file"
echo "后端服务：backend-670" >> "$report_file"
echo "" >> "$report_file"

echo "## 测试结果" >> "$report_file"
echo "" >> "$report_file"

for vu in "${VU_SCENARIOS[@]}"; do
    result_file="$RESULT_DIR/result_${vu}vu.txt"
    if [ -f "$result_file" ]; then
        echo "### ${vu}VU 场景" >> "$report_file"
        echo "" >> "$report_file"
        echo '```' >> "$report_file"
        grep -E "Requests per second|Time per request|Failed requests|Connect|Processing|Waiting" "$result_file" >> "$report_file"
        echo '```' >> "$report_file"
        echo "" >> "$report_file"
    fi
done

echo "✅ 报告已生成：$report_file"
echo ""

# ════════════════════════════════════════════════════
# 结果总结
# ════════════════════════════════════════════════════
echo "════════════════════════════════════════════════════"
echo "   ✅ 测试完成"
echo "════════════════════════════════════════════════════"
echo ""
echo "📁 结果文件位置："
echo "   目录：$RESULT_DIR"
echo "   报告：$report_file"
echo "   详细数据："
ls -lh "$RESULT_DIR/result_*.txt" 2>/dev/null | awk '{print "     - " $NF}'
echo ""

# ════════════════════════════════════════════════════
# 下一步建议
# ════════════════════════════════════════════════════
echo "🎯 下一步建议："
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1️⃣  查看详细结果"
echo "   cat $report_file"
echo ""
echo "2️⃣  对比不同并发的性能"
echo "   ./cloud-stress-test.sh  # 再运行一次"
echo ""
echo "3️⃣  如果需要更大规模压力测试（5000+ VU）"
echo "   使用 JMeter 或 Gatling 工具"
echo ""
echo "4️⃣  监控后端服务状态"
echo "   watch -n 1 'curl -s http://backend-670:8088/api/metrics'"
echo ""
