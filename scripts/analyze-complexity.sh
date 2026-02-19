#!/bin/bash

# 业务逻辑复杂度分析脚本
# 分析所有 Orchestrator 和 Service 的复杂度

set -e

echo "🔍 服装供应链系统 - 业务逻辑复杂度分析"
echo "=========================================="
echo ""

BACKEND_DIR="$(dirname "$0")/../backend/src/main/java/com/fashion/supplychain"

# 颜色定义
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# 分析单个文件
analyze_file() {
    local file=$1
    local filename=$(basename "$file")

    # 安全地获取数值，确保是整数
    local lines=$(wc -l < "$file" 2>/dev/null | tr -d ' \n' || echo "0")
    if [ -z "$lines" ] || ! [[ "$lines" =~ ^[0-9]+$ ]]; then
        lines=0
    fi

    local methods=$(grep -c "public.*(" "$file" 2>/dev/null || echo "0")
    if ! [[ "$methods" =~ ^[0-9]+$ ]]; then methods=0; fi

    local private_methods=$(grep -c "private.*(" "$file" 2>/dev/null || echo "0")
    if ! [[ "$private_methods" =~ ^[0-9]+$ ]]; then private_methods=0; fi

    local service_calls=$(grep -c "\w*Service\." "$file" 2>/dev/null || echo "0")
    if ! [[ "$service_calls" =~ ^[0-9]+$ ]]; then service_calls=0; fi

    local total_methods=$((methods + private_methods))

    # 计算平均每个方法的行数
    local avg_lines=0
    if [ $total_methods -gt 0 ] && [ $lines -gt 0 ]; then
        avg_lines=$((lines / total_methods))
    fi

    # 评级
    local rating="✅ "
    local color=$GREEN

    if [ $lines -gt 500 ] || [ $avg_lines -gt 50 ] || [ $service_calls -gt 10 ]; then
        rating="⚠️  "
        color=$YELLOW
    fi

    if [ $lines -gt 800 ] || [ $avg_lines -gt 80 ] || [ $service_calls -gt 15 ]; then
        rating="❌ "
        color=$RED
    fi

    echo -e "${color}${rating}${filename}${NC}"
    echo "   📏 总行数: $lines"
    echo "   🔧 方法数: $total_methods (public: $methods, private: $private_methods)"
    echo "   📊 平均行数/方法: $avg_lines"
    echo "   🔗 服务调用: $service_calls"

    # 建议
    if [ $lines -gt 500 ]; then
        echo -e "   ${YELLOW}💡 建议: 文件过大，考虑拆分${NC}"
    fi
    if [ $avg_lines -gt 50 ]; then
        echo -e "   ${YELLOW}💡 建议: 方法平均行数过多，考虑提取子方法${NC}"
    fi
    if [ $service_calls -gt 10 ]; then
        echo -e "   ${YELLOW}💡 建议: 服务调用过多，考虑重构或使用领域事件${NC}"
    fi

    echo ""

    # 返回评分（用于统计）
    if [ "$rating" = "❌ " ]; then
        echo "critical"
    elif [ "$rating" = "⚠️  " ]; then
        echo "warning"
    else
        echo "good"
    fi
}

# 统计变量
total_files=0
critical_files=0
warning_files=0
good_files=0

echo "📋 分析 Orchestrator 层（业务编排）"
echo "======================================"
echo ""

if [ -d "$BACKEND_DIR" ]; then
    while IFS= read -r -d '' file; do
        total_files=$((total_files + 1))
        result=$(analyze_file "$file")

        # 提取最后一行的评级
        rating=$(echo "$result" | tail -1)
        case $rating in
            "critical") critical_files=$((critical_files + 1)) ;;
            "warning") warning_files=$((warning_files + 1)) ;;
            "good") good_files=$((good_files + 1)) ;;
        esac
    done < <(find "$BACKEND_DIR" -name "*Orchestrator.java" -print0)
else
    echo "⚠️  后端目录不存在: $BACKEND_DIR"
fi

echo ""
echo "📋 分析 Service 层（领域服务）"
echo "======================================"
echo ""

if [ -d "$BACKEND_DIR" ]; then
    while IFS= read -r -d '' file; do
        total_files=$((total_files + 1))
        result=$(analyze_file "$file")

        rating=$(echo "$result" | tail -1)
        case $rating in
            "critical") critical_files=$((critical_files + 1)) ;;
            "warning") warning_files=$((warning_files + 1)) ;;
            "good") good_files=$((good_files + 1)) ;;
        esac
    done < <(find "$BACKEND_DIR" -name "*ServiceImpl.java" -print0)
fi

echo ""
echo "📊 总体统计"
echo "======================================"
echo -e "   总文件数: $total_files"
echo -e "   ${GREEN}✅ 良好: $good_files${NC}"
echo -e "   ${YELLOW}⚠️  警告: $warning_files${NC}"
echo -e "   ${RED}❌ 严重: $critical_files${NC}"
echo ""

# 计算百分比
if [ $total_files -gt 0 ]; then
    good_pct=$((good_files * 100 / total_files))
    warning_pct=$((warning_files * 100 / total_files))
    critical_pct=$((critical_files * 100 / total_files))

    echo "   健康度: ${good_pct}% 良好, ${warning_pct}% 警告, ${critical_pct}% 严重"
fi

echo ""
echo "💡 复杂度评判标准"
echo "======================================"
echo "   ✅ 良好: 行数<500, 平均方法<50行, 服务调用<10"
echo "   ⚠️  警告: 行数500-800, 平均方法50-80行, 服务调用10-15"
echo "   ❌ 严重: 行数>800, 平均方法>80行, 服务调用>15"
echo ""

# 生成报告文件
REPORT_FILE="logs/complexity-report-$(date +%Y%m%d-%H%M%S).txt"
mkdir -p logs

{
    echo "业务逻辑复杂度分析报告"
    echo "生成时间: $(date)"
    echo ""
    echo "总文件数: $total_files"
    echo "良好: $good_files"
    echo "警告: $warning_files"
    echo "严重: $critical_files"
} > "$REPORT_FILE"

echo "📄 报告已保存: $REPORT_FILE"
echo ""
