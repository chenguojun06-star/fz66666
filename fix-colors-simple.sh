#!/bin/bash

# 简化版颜色修复脚本
set -e

FRONTEND_DIR="./frontend/src/modules"

echo "🎨 开始修复硬编码颜色..."
echo ""

# 创建备份分支
BACKUP_TAG="color-fix-$(date +%Y%m%d-%H%M%S)"
git branch "$BACKUP_TAG" 2>/dev/null || true
echo "✅ 备份分支: $BACKUP_TAG"
echo ""

# 颜色替换函数
fix_color() {
    local old="$1"
    local new="$2"
    local desc="$3"
    echo "🔄 $desc: $old → $new"
    find "$FRONTEND_DIR" -name "*.tsx" -exec sed -i '' \
        -e "s/color: '$old'/color: '$new'/g" \
        -e "s/color: \"$old\"/color: '$new'/g" \
        -e "s/color:'$old'/color:'$new'/g" \
        -e "s/color:\"$old\"/color:'$new'/g" \
        {} +
}

# 批量替换
echo "开始批量替换..."
echo ""

# 文本颜色
fix_color "#333" "var(--neutral-text)" "主文本"
fix_color "#262626" "var(--neutral-text)" "主文本"
fix_color "#666" "var(--neutral-text-secondary)" "次要文本"
fix_color "#999" "var(--neutral-text-disabled)" "禁用文本"
fix_color "#8c8c8c" "var(--neutral-text-disabled)" "禁用文本"
fix_color "#ccc" "var(--neutral-text-disabled)" "禁用文本"

# 主色
fix_color "#1890ff" "var(--primary-color)" "主色"
fix_color "#2d7ff9" "var(--primary-color)" "主色"
fix_color "#40a9ff" "var(--primary-color-light)" "主色浅"

# 成功色
fix_color "#52c41a" "var(--success-color)" "成功色"
fix_color "#73d13d" "var(--success-color-light)" "成功色浅"
fix_color "#3f8600" "var(--success-color-dark)" "成功色深"

# 错误色
fix_color "#f5222d" "var(--error-color)" "错误色"
fix_color "#ff4d4f" "var(--error-color)" "错误色"

# 警告色
fix_color "#faad14" "var(--warning-color)" "警告色"
fix_color "#fa8c16" "var(--warning-color)" "警告色"
fix_color "#d46b08" "var(--warning-color-dark)" "警告色深"

echo ""
echo "✅ 替换完成！"
echo ""

# 验证
echo "🔍 验证结果..."
remaining=$(grep -r "color.*#" "$FRONTEND_DIR" --include="*.tsx" 2>/dev/null | grep -v "border\|background\|var(--" | grep -E "color.*['\"]#[0-9A-Fa-f]{3,6}" | wc -l | tr -d ' ')
echo "剩余硬编码颜色: $remaining 处"
echo ""

# 显示修改的文件
echo "📝 修改的文件:"
git status --short | head -15
echo ""

echo "✅ 完成！下一步:"
echo "   git diff | head -100    # 查看更改"
echo "   git add . && git commit -m 'fix: 修复硬编码颜色'"
echo "   git checkout $BACKUP_TAG  # 回滚（如需要）"
