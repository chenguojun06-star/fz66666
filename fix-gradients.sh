#!/bin/bash

# 批量删除渐变使用脚本
# 使用方法: ./fix-gradients.sh

set -e

FRONTEND_DIR="./frontend/src/modules"
CSS_DIR="./frontend/src"
BACKUP_TAG="gradient-fix-$(date +%Y%m%d-%H%M%S)"

echo "🎨 渐变使用批量删除工具"
echo "======================================"
echo ""

# 检查是否有未提交的更改
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  警告: 检测到未提交的更改"
    read -p "是否继续？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 创建备份分支
echo "📦 创建备份分支: $BACKUP_TAG"
git branch "$BACKUP_TAG"
echo ""

echo "🔍 扫描渐变使用..."
echo ""

# 扫描并列出所有渐变
echo "📋 发现以下渐变使用："
echo ""
grep -rn "linear-gradient\|radial-gradient" "$FRONTEND_DIR" --include="*.tsx" --include="*.css" | head -20
echo ""

# 计数
total_gradients=$(grep -r "linear-gradient\|radial-gradient" "$FRONTEND_DIR" "$CSS_DIR" --include="*.tsx" --include="*.css" | wc -l | tr -d ' ')
echo "总计: $total_gradients 处"
echo ""

read -p "⚠️  这些渐变将被替换为纯色，是否继续？(y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo ""
echo "🚀 开始替换..."
echo ""

# 替换常见渐变模式
echo "1️⃣ 替换蓝色渐变..."
find "$FRONTEND_DIR" -name "*.tsx" -type f -exec sed -i '' \
    -e "s/background: ['\"]linear-gradient([^'\"]*#667eea[^'\"]*)['\"]]/background: 'var(--primary-color)'/g" \
    -e "s/background: ['\"]linear-gradient([^'\"]*#1890ff[^'\"]*)['\"]]/background: 'var(--primary-color)'/g" \
    -e "s/background: ['\"]linear-gradient([^'\"]*#2d7ff9[^'\"]*)['\"]]/background: 'var(--primary-color)'/g" \
    {} +

echo "2️⃣ 替换绿色渐变..."
find "$FRONTEND_DIR" -name "*.tsx" -type f -exec sed -i '' \
    -e "s/background: ['\"]linear-gradient([^'\"]*#52c41a[^'\"]*)['\"]]/background: 'var(--success-color)'/g" \
    {} +

echo "3️⃣ 替换橙色渐变..."
find "$FRONTEND_DIR" -name "*.tsx" -type f -exec sed -i '' \
    -e "s/background: ['\"]linear-gradient([^'\"]*#fa8c16[^'\"]*)['\"]]/background: 'var(--warning-color)'/g" \
    -e "s/background: ['\"]linear-gradient([^'\"]*#faad14[^'\"]*)['\"]]/background: 'var(--warning-color)'/g" \
    {} +

echo "4️⃣ 替换 CSS 文件中的渐变..."
find "$CSS_DIR" -name "*.css" -type f -exec sed -i '' \
    -e "s/background: linear-gradient([^;]*);/background: var(--neutral-bg);/g" \
    -e "s/background: radial-gradient([^;]*);/background: var(--neutral-bg);/g" \
    {} +

echo ""
echo "======================================"
echo "✅ 替换完成！"
echo ""

# 验证结果
echo "🔍 验证修复结果..."
remaining=$(grep -r "linear-gradient\|radial-gradient" "$FRONTEND_DIR" "$CSS_DIR" --include="*.tsx" --include="*.css" | wc -l | tr -d ' ')

echo "   剩余渐变使用: $remaining 处"
echo ""

if [ "$remaining" -gt 0 ]; then
    echo "⚠️  仍有部分渐变需要手动处理："
    echo ""
    grep -rn "linear-gradient\|radial-gradient" "$FRONTEND_DIR" "$CSS_DIR" --include="*.tsx" --include="*.css" | head -10
    echo ""
fi

# Git 状态
echo "📝 Git 状态:"
git status --short | head -20
echo ""

echo "✅ 下一步操作："
echo "   1. 查看更改: git diff"
echo "   2. 测试页面: 启动前端检查样式"
echo "   3. 提交更改: git add . && git commit -m 'fix: 删除渐变使用，统一使用纯色'"
echo "   4. 如需回滚: git checkout $BACKUP_TAG"
echo ""
