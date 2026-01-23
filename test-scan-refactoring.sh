#!/bin/bash

# 扫码页面重构 - 快速测试脚本
# 用途：自动检查所有必要文件和依赖

echo "🧪 扫码页面重构测试 - 环境检查"
echo "================================"
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 检查函数
check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $1"
        return 0
    else
        echo -e "${RED}✗${NC} $1 ${RED}(缺失)${NC}"
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $1/"
        return 0
    else
        echo -e "${RED}✗${NC} $1/ ${RED}(缺失)${NC}"
        return 1
    fi
}

# 计数器
total=0
passed=0

echo "📦 1. 检查服务层文件"
echo "-------------------"
((total++))
check_file "miniprogram/pages/scan/services/QRCodeParser.js" && ((passed++))
((total++))
check_file "miniprogram/pages/scan/services/StageDetector.js" && ((passed++))
echo ""

echo "🎯 2. 检查编排层文件"
echo "-------------------"
((total++))
check_file "miniprogram/pages/scan/handlers/ScanHandler.js" && ((passed++))
echo ""

echo "📄 3. 检查Page层文件"
echo "-------------------"
((total++))
check_file "miniprogram/pages/scan/index-refactored.js" && ((passed++))
((total++))
check_file "miniprogram/pages/scan/index.js.backup" && ((passed++))
echo ""

echo "🧪 4. 检查测试页面"
echo "-------------------"
((total++))
check_file "miniprogram/pages/scan-test/index.js" && ((passed++))
((total++))
check_file "miniprogram/pages/scan-test/index.wxml" && ((passed++))
((total++))
check_file "miniprogram/pages/scan-test/index.wxss" && ((passed++))
((total++))
check_file "miniprogram/pages/scan-test/index.json" && ((passed++))
((total++))
check_file "miniprogram/pages/scan-test/TEST_GUIDE.md" && ((passed++))
echo ""

echo "📚 5. 检查文档文件"
echo "-------------------"
((total++))
check_file "miniprogram/pages/scan/REFACTORING_GUIDE.md" && ((passed++))
((total++))
check_file "miniprogram/pages/scan/REFACTORING_COMPLETION.md" && ((passed++))
echo ""

echo "⚙️  6. 检查配置文件"
echo "-------------------"
((total++))
check_file "miniprogram/app.json" && ((passed++))

# 检查 app.json 是否包含测试页面
if grep -q "pages/scan-test/index" miniprogram/app.json; then
    echo -e "${GREEN}✓${NC} app.json 已注册测试页面"
    ((passed++))
else
    echo -e "${YELLOW}⚠${NC} app.json 未注册测试页面"
fi
((total++))

echo ""

# 统计结果
echo "================================"
echo "测试结果: ${passed}/${total} 通过"
echo ""

if [ $passed -eq $total ]; then
    echo -e "${GREEN}✅ 所有检查通过！环境就绪！${NC}"
    echo ""
    echo "🚀 下一步操作："
    echo "1. 打开微信开发者工具"
    echo "2. 导入 miniprogram 目录"
    echo "3. 首页点击 '🧪测试' 按钮"
    echo "4. 按照 TEST_GUIDE.md 执行测试"
    echo ""
    echo "📖 测试文档："
    echo "   miniprogram/pages/scan-test/TEST_GUIDE.md"
    exit 0
else
    echo -e "${RED}❌ 有 $((total - passed)) 项检查失败${NC}"
    echo ""
    echo "请确保所有必要文件都已创建"
    exit 1
fi
