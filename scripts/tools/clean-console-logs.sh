#!/bin/bash
# Console.log 清理脚本
# 创建时间: 2026-02-03

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend/src"

echo "=========================================="
echo "Console.log 清理"
echo "=========================================="

# 保留的文件列表（工具类）
KEEP_FILES=(
  "errorHandling.ts"
  "performanceMonitor.ts"
  "logger.ts"
  "debug.ts"
)

echo ""
echo "步骤 1: 统计当前 console.log..."

BEFORE_COUNT=$(grep -rn "console\.\(log\|debug\|warn\)" "$FRONTEND_DIR" \
  --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "// console" | wc -l | tr -d ' ')

echo "当前 console 调用: $BEFORE_COUNT 处"

# 备份
BACKUP_FILE="$ROOT_DIR/console-cleanup-backup-$(date +%Y%m%d-%H%M%S).tar.gz"
echo ""
echo "步骤 2: 创建备份..."
cd "$ROOT_DIR" && tar -czf "$BACKUP_FILE" frontend/src/
echo "✅ 备份完成: $BACKUP_FILE"

echo ""
echo "步骤 3: 清理 console.log..."

# 遍历所有文件
find "$FRONTEND_DIR" \( -name "*.tsx" -o -name "*.ts" \) -type f | while read file; do
  # 检查是否在保留列表中
  should_keep=false
  for keep in "${KEEP_FILES[@]}"; do
    if [[ "$file" == *"$keep" ]]; then
      should_keep=true
      break
    fi
  done

  if [ "$should_keep" = false ]; then
    # 删除 console.log/debug（不在注释中）
    sed -i '' '/^[[:space:]]*console\.log(/d' "$file"
    sed -i '' '/^[[:space:]]*console\.debug(/d' "$file"
  fi
done

echo ""
echo "步骤 4: 统计清理结果..."

AFTER_COUNT=$(grep -rn "console\.\(log\|debug\|warn\)" "$FRONTEND_DIR" \
  --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "// console" | wc -l | tr -d ' ')

echo ""
echo "=========================================="
echo "清理完成统计"
echo "=========================================="
echo ""
echo "清理前: $BEFORE_COUNT 处"
echo "清理后: $AFTER_COUNT 处"
echo "已清理: $((BEFORE_COUNT - AFTER_COUNT)) 处"
echo ""
echo "📄 备份文件: $BACKUP_FILE"
echo ""

# 显示剩余的 console
if [ "$AFTER_COUNT" -gt 0 ]; then
    echo "剩余 console 调用 (应为工具类):"
    grep -rn "console\.\(log\|debug\|warn\)" "$FRONTEND_DIR" \
      --include="*.tsx" --include="*.ts" 2>/dev/null | \
      grep -v "// console" | head -10
fi

echo ""
echo "✅ Console.log 清理完成！"
echo ""
echo "保留的工具类文件:"
for file in "${KEEP_FILES[@]}"; do
  echo "  - $file"
done
