#!/bin/bash

# 小程序代码质量快速检查脚本
# 用法: ./miniprogram-check.sh

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📱 微信小程序 - 代码质量检查"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cd miniprogram

# 1. ESLint 检查
echo "1️⃣ ESLint 代码质量检查..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npm run 检查 2>&1 | tee /tmp/miniprogram-lint.log

# 统计问题数量
ERRORS=$(grep "✖" /tmp/miniprogram-lint.log | grep -o "[0-9]* error" | cut -d' ' -f1 || echo "0")
WARNINGS=$(grep "✖" /tmp/miniprogram-lint.log | grep -o "[0-9]* warning" | cut -d' ' -f1 || echo "0")

echo ""
echo "📊 ESLint 统计:"
echo "   Errors: $ERRORS"
echo "   Warnings: $WARNINGS"
echo ""

# 2. TypeScript 检查
echo "2️⃣ TypeScript 类型检查..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
npm run 类型检查 2>&1 | tee /tmp/miniprogram-typecheck.log || true

# 统计类型错误
TS_ERRORS=$(grep "error TS" /tmp/miniprogram-typecheck.log | wc -l | xargs)

echo ""
echo "📊 TypeScript 统计:"
echo "   Type Errors: $TS_ERRORS"
echo ""

# 3. 硬编码检查
echo "3️⃣ Design Token 硬编码检查..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查硬编码圆角
HARD_RADIUS=$(grep -rn "border-radius: \(8\|12\|16\|18\|999\)px" pages/ --include="*.wxss" 2>/dev/null | grep -v "var(--" | wc -l | xargs)

# 检查硬编码颜色（#开头的6位或3位16进制）
HARD_COLORS=$(grep -rn "#[0-9a-fA-F]\{3,6\}" pages/ --include="*.wxss" 2>/dev/null | grep -v "var(--" | wc -l | xargs)

echo "📊 硬编码统计:"
echo "   硬编码圆角: $HARD_RADIUS"
echo "   硬编码颜色: $HARD_COLORS"
echo ""

# 4. 代码体积检查（需要微信开发者工具）
echo "4️⃣ 代码包体积分析..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  请在微信开发者工具中查看："
echo "   详情 → 基本信息 → 代码包信息"
echo "   目标: 主包 < 2MB, 总包 < 20MB"
echo ""

# 5. 依赖检查
echo "5️⃣ 依赖检查..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v depcheck &> /dev/null; then
    depcheck 2>&1 | head -20
    echo ""
else
    echo "⚠️  depcheck 未安装，跳过检查"
    echo "   安装: npm install -g depcheck"
    echo ""
fi

# 6. 总结
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 检查总结"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "ESLint:"
echo "  ✓ Errors: $ERRORS (目标: 0)"
echo "  ✓ Warnings: $WARNINGS (目标: < 10)"
echo ""
echo "TypeScript:"
echo "  ✓ Type Errors: $TS_ERRORS (目标: 0)"
echo ""
echo "Design Token:"
echo "  ✓ 硬编码圆角: $HARD_RADIUS (目标: 0)"
echo "  ✓ 硬编码颜色: $HARD_COLORS (目标: 0)"
echo ""

# 7. 质量评分
TOTAL_ISSUES=$((ERRORS + WARNINGS + TS_ERRORS + HARD_RADIUS + HARD_COLORS))

if [ $ERRORS -eq 0 ] && [ $WARNINGS -lt 10 ] && [ $TS_ERRORS -eq 0 ] && [ $HARD_RADIUS -eq 0 ]; then
    echo "✅ 代码质量: 优秀 (总问题数: $TOTAL_ISSUES)"
elif [ $ERRORS -eq 0 ] && [ $WARNINGS -lt 50 ]; then
    echo "⚠️  代码质量: 良好 (总问题数: $TOTAL_ISSUES)"
else
    echo "❌ 代码质量: 需改进 (总问题数: $TOTAL_ISSUES)"
fi
echo ""

# 8. 快速修复建议
if [ $WARNINGS -gt 0 ] || [ $HARD_RADIUS -gt 0 ]; then
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔧 快速修复建议"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    if [ $WARNINGS -gt 0 ]; then
        echo "修复 ESLint 警告:"
        echo "  cd miniprogram && npm run 修复"
        echo ""
    fi

    if [ $HARD_RADIUS -gt 0 ] || [ $HARD_COLORS -gt 0 ]; then
        echo "修复硬编码 Design Token:"
        echo "  查看: docs/小程序开发工具指南.md"
        echo "  使用: var(--radius-*) 和 var(--color-*)"
        echo ""
    fi
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "完整报告已保存到:"
echo "  - /tmp/miniprogram-lint.log"
echo "  - /tmp/miniprogram-typecheck.log"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
