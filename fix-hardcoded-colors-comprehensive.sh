#!/bin/bash
# 硬编码颜色全面清理脚本
# 创建时间: 2026-02-03

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend/src"

echo "=========================================="
echo "硬编码颜色全面清理"
echo "=========================================="

# 1. 首先确保 CSS 变量已定义
echo ""
echo "步骤 1: 检查 CSS 变量定义..."

CSS_FILE="$ROOT_DIR/frontend/src/styles/global.css"

if ! grep -q "color-success" "$CSS_FILE"; then
    echo "添加颜色变量到 global.css..."

    cat >> "$CSS_FILE" << 'EOF'

/* === 语义化颜色变量（2026-02-03 添加） === */

/* 状态颜色 */
:root {
  --color-success: #52c41a;
  --color-warning: #faad14;
  --color-error: #f5222d;
  --color-info: #1890ff;
  --color-processing: #1890ff;

  /* 文本颜色 */
  --text-primary: #1f2937;
  --text-secondary: #666;
  --text-tertiary: #999;
  --text-disabled: #d9d9d9;

  /* 背景颜色 */
  --bg-secondary: #f8f9fa;
  --bg-tertiary: #f0f2f5;
  --bg-hover: rgba(24, 144, 255, 0.08);

  /* 边框颜色 */
  --border-light: #f0f0f0;

  /* 业务特定 */
  --price-positive: #52c41a;
  --price-negative: #f5222d;
}
EOF
    echo "✅ CSS 变量已添加"
else
    echo "✅ CSS 变量已存在"
fi

# 2. 批量替换硬编码颜色
echo ""
echo "步骤 2: 批量替换硬编码颜色..."

# 备份
BACKUP_FILE="$ROOT_DIR/color-fix-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
echo "创建备份: $BACKUP_FILE"
cd "$ROOT_DIR" && tar -czf "$BACKUP_FILE" frontend/src/

# 定义颜色映射
declare -A COLORS=(
  # 成功色
  ["#52c41a"]="var(--color-success)"
  ["#52C41A"]="var(--color-success)"

  # 信息色
  ["#1890ff"]="var(--color-info)"
  ["#1890FF"]="var(--color-info)"

  # 错误色
  ["#f5222d"]="var(--color-error)"
  ["#F5222D"]="var(--color-error)"

  # 警告色
  ["#faad14"]="var(--color-warning)"
  ["#FAAD14"]="var(--color-warning)"

  # 文本颜色
  ["#1f2937"]="var(--text-primary)"
  ["#1F2937"]="var(--text-primary)"
  ["#666"]="var(--text-secondary)"
  ["#666666"]="var(--text-secondary)"
  ["#999"]="var(--text-tertiary)"
  ["#999999"]="var(--text-tertiary)"
  ["#d9d9d9"]="var(--text-disabled)"
  ["#D9D9D9"]="var(--text-disabled)"

  # 背景色
  ["#f8f9fa"]="var(--bg-secondary)"
  ["#F8F9FA"]="var(--bg-secondary)"
  ["#f0f2f5"]="var(--bg-tertiary)"
  ["#F0F2F5"]="var(--bg-tertiary)"
  ["#f0f0f0"]="var(--border-light)"
  ["#F0F0F0"]="var(--border-light)"
)

TOTAL_REPLACEMENTS=0

for hex in "${!COLORS[@]}"; do
  css_var="${COLORS[$hex]}"

  # 转义特殊字符
  hex_escaped=$(echo "$hex" | sed 's/\//\\\//g')
  css_var_escaped=$(echo "$css_var" | sed 's/\//\\\//g')

  echo "处理: $hex → $css_var"

  # 替换 color: '#xxx' 或 color: "#xxx"
  count1=$(find "$FRONTEND_DIR" \( -name "*.tsx" -o -name "*.ts" \) -type f -exec \
    sed -i '' "s/color: ['\"]${hex_escaped}['\"]/color: '${css_var_escaped}'/g" {} \; -print | wc -l)

  # 替换 background: '#xxx'
  count2=$(find "$FRONTEND_DIR" \( -name "*.tsx" -o -name "*.ts" \) -type f -exec \
    sed -i '' "s/background: ['\"]${hex_escaped}['\"]/background: '${css_var_escaped}'/g" {} \; -print | wc -l)

  # 替换 backgroundColor: '#xxx'
  count3=$(find "$FRONTEND_DIR" \( -name "*.tsx" -o -name "*.ts" \) -type f -exec \
    sed -i '' "s/backgroundColor: ['\"]${hex_escaped}['\"]/backgroundColor: '${css_var_escaped}'/g" {} \; -print | wc -l)

  # 替换 borderColor: '#xxx'
  count4=$(find "$FRONTEND_DIR" \( -name "*.tsx" -o -name "*.ts" \) -type f -exec \
    sed -i '' "s/borderColor: ['\"]${hex_escaped}['\"]/borderColor: '${css_var_escaped}'/g" {} \; -print | wc -l)
done

# 3. 统计修复结果
echo ""
echo "步骤 3: 统计修复结果..."

REMAINING_COLORS=$(grep -rn "color:\s*['\"]#" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
REMAINING_BG=$(grep -rn "background:\s*['\"]#" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
REMAINING_BORDER=$(grep -rn "borderColor:\s*['\"]#" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "=========================================="
echo "修复完成统计"
echo "=========================================="
echo ""
echo "剩余硬编码:"
echo "  - color: $REMAINING_COLORS 处"
echo "  - background: $REMAINING_BG 处"
echo "  - borderColor: $REMAINING_BORDER 处"
echo ""
echo "📄 备份文件: $BACKUP_FILE"
echo ""

# 4. 显示剩余问题
if [ "$REMAINING_COLORS" -gt 0 ] || [ "$REMAINING_BG" -gt 0 ]; then
    echo "剩余硬编码示例 (前10处):"
    grep -rn "color:\s*['\"]#\|background:\s*['\"]#" "$FRONTEND_DIR" \
      --include="*.tsx" --include="*.ts" 2>/dev/null | head -10
    echo ""
    echo "💡 提示: 剩余的可能是特殊场景，需要手动处理"
fi

echo ""
echo "✅ 颜色统一修复完成！"
echo ""
echo "下一步操作:"
echo "  1. 启动前端: cd frontend && npm run dev"
echo "  2. 检查页面显示是否正常"
echo "  3. 如有问题，使用备份恢复: tar -xzf $BACKUP_FILE"
