#!/bin/bash

# 批量修复硬编码颜色脚本
# 使用方法: ./fix-hardcoded-colors.sh

set -e

FRONTEND_DIR="./frontend/src/modules"
BACKUP_TAG="color-fix-$(date +%Y%m%d-%H%M%S)"

echo "🎨 硬编码颜色批量修复工具"
echo "======================================"
echo ""

# 检查是否有未提交的更改
if ! git diff-index --quiet HEAD --; then
    echo "⚠️  警告: 检测到未提交的更改"
    echo "建议先提交现有更改："
    echo "  git add ."
    echo "  git commit -m 'chore: 保存当前进度'"
    echo ""
    read -p "是否继续？(y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# 创建备份分支
echo "📦 创建备份分支: $BACKUP_TAG"
git branch "$BACKUP_TAG"
echo "   如需回滚: git checkout $BACKUP_TAG"
echo ""

# 颜色映射计数器
declare -A color_counts

# 函数: 替换颜色
replace_color() {
    local old_color="$1"
    local new_var="$2"
    local description="$3"

    echo "🔄 替换 $description..."

    # 查找匹配数量
    local count=$(find "$FRONTEND_DIR" -name "*.tsx" -type f -exec grep -l "color.*['\"]$old_color" {} \; | wc -l | tr -d ' ')

    if [ "$count" -gt 0 ]; then
        # 执行替换（多种格式）
        find "$FRONTEND_DIR" -name "*.tsx" -type f -exec sed -i '' \
            -e "s/color: ['\"]$old_color['\"]]/color: '$new_var'/g" \
            -e "s/color: ['\"]$old_color['\"]/color: '$new_var'/g" \
            -e "s/color:['\"]$old_color['\"]]/color:'$new_var'/g" \
            -e "s/color:['\"]$old_color['\"]/color:'$new_var'/g" \
            {} +

        color_counts["$description"]=$count
        echo "   ✅ 修复 $count 处"
    else
        echo "   ⏭️  未发现该颜色"
    fi
}

# 开始替换
echo "🚀 开始批量替换..."
echo ""

# 主文本颜色
replace_color "#333" "var(--neutral-text)" "主文本 #333"
replace_color "#262626" "var(--neutral-text)" "主文本 #262626"
replace_color "#1a1a1a" "var(--neutral-text)" "主文本 #1a1a1a"

# 次要文本颜色
replace_color "#666" "var(--neutral-text-secondary)" "次要文本 #666"
replace_color "#595959" "var(--neutral-text-secondary)" "次要文本 #595959"

# 禁用文本颜色
replace_color "#999" "var(--neutral-text-disabled)" "禁用文本 #999"
replace_color "#ccc" "var(--neutral-text-disabled)" "禁用文本 #ccc"
replace_color "#ddd" "var(--neutral-text-disabled)" "禁用文本 #ddd"
replace_color "#8c8c8c" "var(--neutral-text-disabled)" "禁用文本 #8c8c8c"

# 主色
replace_color "#1890ff" "var(--primary-color)" "主色 #1890ff"
replace_color "#2d7ff9" "var(--primary-color)" "主色 #2d7ff9"
replace_color "#40a9ff" "var(--primary-color-light)" "主色浅 #40a9ff"
replace_color "#096dd9" "var(--primary-color-dark)" "主色深 #096dd9"

# 成功色
replace_color "#52c41a" "var(--success-color)" "成功色 #52c41a"
replace_color "#73d13d" "var(--success-color-light)" "成功色浅 #73d13d"
replace_color "#3f8600" "var(--success-color-dark)" "成功色深 #3f8600"

# 错误色
replace_color "#f5222d" "var(--error-color)" "错误色 #f5222d"
replace_color "#ff4d4f" "var(--error-color)" "错误色 #ff4d4f"
replace_color "#cf1322" "var(--error-color-dark)" "错误色深 #cf1322"

# 警告色
replace_color "#faad14" "var(--warning-color)" "警告色 #faad14"
replace_color "#fa8c16" "var(--warning-color)" "警告色 #fa8c16"
replace_color "#ffa940" "var(--warning-color-light)" "警告色浅 #ffa940"
replace_color "#d46b08" "var(--warning-color-dark)" "警告色深 #d46b08"

# 白色
replace_color "#fff" "var(--neutral-bg)" "白色 #fff"
replace_color "#ffffff" "var(--neutral-bg)" "白色 #ffffff"

echo ""
echo "======================================"
echo "✅ 批量替换完成！"
echo ""

# 统计总数
total_fixed=0
for count in "${color_counts[@]}"; do
    total_fixed=$((total_fixed + count))
done

echo "📊 修复统计:"
for desc in "${!color_counts[@]}"; do
    echo "   - $desc: ${color_counts[$desc]} 处"
done
echo ""
echo "   总计修复: $total_fixed 处"
echo ""

# 验证结果
echo "🔍 验证修复结果..."
remaining=$(grep -r "color.*#" "$FRONTEND_DIR" --include="*.tsx" \
  | grep -v "border\|background\|var(--\|\/\/" \
  | grep -E "color.*['\"]#[0-9A-Fa-f]{3,6}" \
  | wc -l | tr -d ' ')

echo "   剩余硬编码颜色: $remaining 处"
echo ""

if [ "$remaining" -gt 0 ]; then
    echo "⚠️  仍有部分硬编码颜色需要手动处理："
    echo ""
    grep -rn "color.*#" "$FRONTEND_DIR" --include="*.tsx" \
      | grep -v "border\|background\|var(--\|\/\/" \
      | grep -E "color.*['\"]#[0-9A-Fa-f]{3,6}" \
      | head -10
    echo ""
fi

# Git 状态
echo "📝 Git 状态:"
git status --short | head -20
echo ""

echo "✅ 下一步操作："
echo "   1. 查看更改: git diff"
echo "   2. 测试页面: 启动前端检查样式"
echo "   3. 提交更改: git add . && git commit -m 'fix: 修复硬编码颜色，统一使用CSS变量'"
echo "   4. 如需回滚: git checkout $BACKUP_TAG"
echo ""
