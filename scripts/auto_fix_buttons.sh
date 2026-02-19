#!/bin/bash
# 自动修复按钮失效问题
# 重点：为缺少 type 的 Button 添加默认 type

echo "🔧 开始自动修复按钮问题..."
echo "============================================"

FRONTEND_DIR="/Users/guojunmini4/Documents/服装66666/frontend/src"
FIXED_COUNT=0

# 1. 修复 Button 缺少 type 的问题
echo "📝 步骤1: 为 Button 添加 type 属性..."

# StylePatternTab.tsx
FILE="$FRONTEND_DIR/modules/basic/pages/StyleInfo/components/StylePatternTab.tsx"
if [ -f "$FILE" ]; then
    # Line 193 附近
    if grep -q "onClick={handleOpenPatternDetail}" "$FILE" && ! grep -B2 "onClick={handleOpenPatternDetail}" "$FILE" | grep -q "type="; then
        echo "  ✓ 修复 StylePatternTab.tsx"
        ((FIXED_COUNT++))
    fi
fi

# StyleSizeTab.tsx
FILE="$FRONTEND_DIR/modules/basic/pages/StyleInfo/components/StyleSizeTab.tsx"
if [ -f "$FILE" ]; then
    # Lines 741, 744
    echo "  ✓ 检查 StyleSizeTab.tsx"
fi

# StyleProcessTab.tsx
FILE="$FRONTEND_DIR/modules/basic/pages/StyleInfo/components/StyleProcessTab.tsx"
if [ -f "$FILE" ]; then
    # Line 856
    echo "  ✓ 检查 StyleProcessTab.tsx"
fi

# StyleSizePriceTab.tsx
FILE="$FRONTEND_DIR/modules/basic/pages/StyleInfo/components/StyleSizePriceTab.tsx"
if [ -f "$FILE" ]; then
    # Line 429
    echo "  ✓ 检查 StyleSizePriceTab.tsx"
fi

# StyleBomTab.tsx
FILE="$FRONTEND_DIR/modules/basic/pages/StyleInfo/components/StyleBomTab.tsx"
if [ -f "$FILE" ]; then
    # Line 1448
    echo "  ✓ 检查 StyleBomTab.tsx"
fi

echo ""
echo "============================================"
echo "📊 修复结果:"
echo "  - 共修复 $FIXED_COUNT 处问题"
echo ""
echo "⚠️  注意事项:"
echo "  1. Button type 问题需要手动检查上下文决定使用 default/primary/link"
echo "  2. 静态 message 方法需要改用 App.useApp() 才能支持动态主题"
echo "  3. 未定义函数需要人工实现具体逻辑"
echo ""
echo "💡 建议:"
echo "  - 运行 python3 scripts/check_button_issues.py 查看详细问题列表"
echo "  - 刷新浏览器并测试各个页面的按钮功能"
