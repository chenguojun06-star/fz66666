#!/bin/bash

###############################################################################
# 开发日志清理脚本
# 功能：
# 1. 删除前端零散的console.log/debug/info（保留logger.ts）
# 2. 删除小程序中的开发调试日志（保留logger.js工具）
# 3. 统计清理结果
###############################################################################

set -e

echo "🧹 开始清理开发日志..."
echo ""

###############################################################################
# 1. 前端日志清理（删除零散console，保留工具类）
###############################################################################
echo "📱 [1/3] 清理前端开发日志..."

# 前端需要保留的文件（logger工具本身和错误处理）
FRONTEND_KEEP_FILES=(
  "frontend/src/utils/logger.ts"
  "frontend/src/utils/errorHandling.ts"
  "frontend/src/utils/performanceMonitor.ts"
)

# 统计前端console数量（清理前）
FRONTEND_BEFORE=$(grep -r "console\.log\|console\.debug\|console\.info" frontend/src --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l | tr -d ' ')

# 清理规则：注释掉console.log/debug/info（保留error和warn）
find frontend/src -type f \( -name "*.ts" -o -name "*.tsx" \) ! -path "*/node_modules/*" | while read -r file; do
  # 跳过保留文件
  skip=false
  for keep in "${FRONTEND_KEEP_FILES[@]}"; do
    if [[ "$file" == *"$keep"* ]]; then
      skip=true
      break
    fi
  done

  if [ "$skip" = true ]; then
    continue
  fi

  # 注释掉 console.log/debug/info（保留error/warn）
  # 使用 perl 进行多行匹配和替换
  perl -i -pe 's{^(\s*)(console\.(?:log|debug|info)\()}{$1// $2}g' "$file"
done

FRONTEND_AFTER=$(grep -r "console\.log\|console\.debug\|console\.info" frontend/src --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "^\s*//" | wc -l | tr -d ' ')
FRONTEND_CLEANED=$((FRONTEND_BEFORE - FRONTEND_AFTER))

echo "  ✅ 前端：清理 ${FRONTEND_CLEANED}/${FRONTEND_BEFORE} 个日志"

###############################################################################
# 2. 小程序日志清理（删除零散console，保留logger工具）
###############################################################################
echo "📲 [2/3] 清理小程序开发日志..."

# 小程序需要保留的文件
MINI_KEEP_FILES=(
  "miniprogram/utils/logger.js"
  "miniprogram/fix-fonts.js"
  "miniprogram/fix-colors.js"
)

# 统计小程序console数量（清理前）
MINI_BEFORE=$(grep -r "console\.log\|console\.debug" miniprogram --include="*.js" 2>/dev/null | grep -v "node_modules" | wc -l | tr -d ' ')

# 清理规则：注释掉console.log/debug（保留error和warn）
find miniprogram -type f -name "*.js" ! -path "*/node_modules/*" ! -path "*/miniprogram_npm/*" | while read -r file; do
  # 跳过保留文件
  skip=false
  for keep in "${MINI_KEEP_FILES[@]}"; do
    if [[ "$file" == *"$keep"* ]]; then
      skip=true
      break
    fi
  done

  if [ "$skip" = true ]; then
    continue
  fi

  # 注释掉 console.log/debug（保留error/warn）
  perl -i -pe 's{^(\s*)(console\.(?:log|debug)\()}{$1// $2}g' "$file"
done

MINI_AFTER=$(grep -r "console\.log\|console\.debug" miniprogram --include="*.js" 2>/dev/null | grep -v "node_modules" | grep -v "^\s*//" | wc -l | tr -d ' ')
MINI_CLEANED=$((MINI_BEFORE - MINI_AFTER))

echo "  ✅ 小程序：清理 ${MINI_CLEANED}/${MINI_BEFORE} 个日志"

###############################################################################
# 3. 后端日志说明（不需要清理）
###############################################################################
echo "☕ [3/3] 后端日志检查..."

BACKEND_DEBUG=$(grep -r "log\.debug" backend/src/main/java --include="*.java" 2>/dev/null | wc -l | tr -d ' ')

echo "  ℹ️  后端：保留 ${BACKEND_DEBUG} 个 log.debug（生产环境自动禁用）"

###############################################################################
# 总结
###############################################################################
echo ""
echo "✨ 清理完成！"
echo ""
echo "📊 清理统计："
echo "  • 前端：${FRONTEND_CLEANED} 个 → 保留 logger.ts 工具"
echo "  • 小程序：${MINI_CLEANED} 个 → 保留 logger.js 工具"
echo "  • 后端：${BACKEND_DEBUG} 个 → log.debug 自动禁用"
echo ""
echo "✅ 推荐方案："
echo "  1. 前端使用 logger.debug() 替代 console.log"
echo "  2. 小程序使用 logger.debug() 替代 console.log"
echo "  3. 后端使用 log.debug() 已正确配置"
echo ""
echo "💡 提示："
echo "  - logger.debug/info 仅在开发环境输出"
echo "  - logger.warn/error 在所有环境输出"
echo "  - 生产构建时自动优化"
