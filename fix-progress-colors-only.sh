#!/bin/bash
# 仅修复进度条相关的硬编码颜色
# 创建时间: 2026-02-03
# 目标: 统一进度条颜色表达，不改变视觉效果

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend/src"

echo "=========================================="
echo "进度条颜色统一修复（仅表现层）"
echo "=========================================="

# 1. 创建备份
BACKUP_FILE="$ROOT_DIR/backups/progress-colors-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
mkdir -p "$ROOT_DIR/backups"
echo "创建备份: $BACKUP_FILE"
tar -czf "$BACKUP_FILE" "$FRONTEND_DIR" 2>/dev/null

# 2. 确保 CSS 变量已定义
CSS_FILE="$FRONTEND_DIR/styles/global.css"

if ! grep -q "color-success" "$CSS_FILE"; then
    echo "添加颜色变量到 global.css..."
    cat >> "$CSS_FILE" << 'EOF'

/* === 进度条语义化颜色变量（2026-02-03） === */
:root {
  --color-success: #52c41a;      /* 成功/已完成 */
  --color-info: #1890ff;         /* 进行中 */
  --color-warning: #faad14;      /* 警告/剩余 */
  --text-primary: #1f2937;       /* 主要文本 */
  --text-secondary: #666;        /* 次要文本 */
}
EOF
    echo "✅ CSS 变量已添加"
fi

# 3. 仅替换进度条相关文件的颜色
echo ""
echo "步骤 2: 替换进度条组件硬编码颜色..."

# 3.1 HorizontalProgressPriceView.tsx - 进度百分比和统计
PROGRESS_FILE="$FRONTEND_DIR/components/common/HorizontalProgressPriceView.tsx"

if [ -f "$PROGRESS_FILE" ]; then
    echo "修复: HorizontalProgressPriceView.tsx"

    # 成功状态绿色
    sed -i '' "s/color: '#52c41a'/color: 'var(--color-success)'/g" "$PROGRESS_FILE"

    # 进行中蓝色
    sed -i '' "s/color: '#1890ff'/color: 'var(--color-info)'/g" "$PROGRESS_FILE"

    # 警告黄色
    sed -i '' "s/color: '#faad14'/color: 'var(--color-warning)'/g" "$PROGRESS_FILE"

    echo "  ✅ 已完成/进行中/剩余 颜色统一"
fi

# 3.2 LiquidProgressBar.tsx - 水波进度条
LIQUID_FILE="$FRONTEND_DIR/components/common/LiquidProgressBar.tsx"

if [ -f "$LIQUID_FILE" ]; then
    echo "修复: LiquidProgressBar.tsx"
    sed -i '' "s/'#52c41a'/'var(--color-success)'/g" "$LIQUID_FILE"
    sed -i '' "s/'#1890ff'/'var(--color-info)'/g" "$LIQUID_FILE"
    sed -i '' "s/'#faad14'/'var(--color-warning)'/g" "$LIQUID_FILE"
    echo "  ✅ 进度条背景颜色统一"
fi

# 4. 统计修改
echo ""
echo "=========================================="
echo "修复完成统计"
echo "=========================================="

MODIFIED_COUNT=0
[ -f "$PROGRESS_FILE" ] && MODIFIED_COUNT=$((MODIFIED_COUNT + 1))
[ -f "$LIQUID_FILE" ] && MODIFIED_COUNT=$((MODIFIED_COUNT + 1))

echo "修改文件数: $MODIFIED_COUNT"
echo "备份位置: $BACKUP_FILE"
echo ""
echo "✅ 修复完成！"
echo ""
echo "验证步骤:"
echo "1. 重启前端服务: cd frontend && npm run dev"
echo "2. 检查生产订单 -> 进度详情页的工序卡片"
echo "3. 确认进度条颜色显示正常（绿色=完成，蓝色=进行中，黄色=剩余）"
echo ""
echo "如有问题，回滚命令:"
echo "  tar -xzf $BACKUP_FILE -C $ROOT_DIR"
