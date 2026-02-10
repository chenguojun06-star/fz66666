#!/bin/bash

###############################################################################
# 小程序垃圾代码自动清理脚本
#
# 功能：
# 1. 删除完全未使用的 utils 文件（dialog.js, logger.js, performance.js）
# 2. 清理调试用的 console.log
# 3. 生成清理报告
#
# 使用：cd miniprogram && ./clean-garbage-code.sh
###############################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🗑️  小程序垃圾代码自动清理"
echo "=============================================="
echo ""

# 创建备份
backup_dir=".backup-clean-$(date +%Y%m%d-%H%M%S)"
echo "📦 创建备份到: $backup_dir"
mkdir -p "$backup_dir/utils"
mkdir -p "$backup_dir/pages/scan/services"
mkdir -p "$backup_dir/pages/scan/handlers"
mkdir -p "$backup_dir/pages/scan/processors"

# 备份将要修改的文件
[ -f utils/dialog.js ] && cp utils/dialog.js "$backup_dir/utils/"
[ -f utils/logger.js ] && cp utils/logger.js "$backup_dir/utils/"
[ -f utils/performance.js ] && cp utils/performance.js "$backup_dir/utils/"
[ -f pages/scan/services/StageDetector.js ] && cp pages/scan/services/StageDetector.js "$backup_dir/pages/scan/services/"
[ -f pages/scan/handlers/ScanHandler.js ] && cp pages/scan/handlers/ScanHandler.js "$backup_dir/pages/scan/handlers/"
[ -f pages/scan/handlers/HistoryHandler.js ] && cp pages/scan/handlers/HistoryHandler.js "$backup_dir/pages/scan/handlers/"
[ -f pages/scan/processors/SKUProcessor.js ] && cp pages/scan/processors/SKUProcessor.js "$backup_dir/pages/scan/processors/"

echo "✅ 备份完成"
echo ""

# Phase 1: 删除未使用文件
echo "🗑️  Phase 1: 删除未使用文件"
echo "----------------------------------------"

deleted_count=0

if [ -f utils/dialog.js ]; then
  rm -f utils/dialog.js
  echo "  ✅ dialog.js (0 次引用)"
  ((deleted_count++))
else
  echo "  ⏭️  dialog.js (已删除)"
fi

if [ -f utils/logger.js ]; then
  rm -f utils/logger.js
  echo "  ✅ logger.js (0 次引用)"
  ((deleted_count++))
else
  echo "  ⏭️  logger.js (已删除)"
fi

if [ -f utils/performance.js ]; then
  rm -f utils/performance.js
  echo "  ✅ performance.js (0 次引用)"
  ((deleted_count++))
else
  echo "  ⏭️  performance.js (已删除)"
fi

echo ""
echo "📊 删除文件数: $deleted_count"
echo ""

# Phase 2: 清理 console.log
echo "🧹 Phase 2: 清理调试日志 (console.log)"
echo "----------------------------------------"

cleaned_logs=0

# StageDetector.js - 删除调试日志
if [ -f pages/scan/services/StageDetector.js ]; then
  before=$(grep -c "console\.log" pages/scan/services/StageDetector.js 2>/dev/null || echo 0)
  sed -i '' '/console\.log.*StageDetector/d' pages/scan/services/StageDetector.js
  after=$(grep -c "console\.log" pages/scan/services/StageDetector.js 2>/dev/null || echo 0)
  removed=$((before - after))
  echo "  StageDetector.js: 删除 $removed 个"
  ((cleaned_logs += removed))
fi

# ScanHandler.js - 删除调试日志（保留错误日志）
if [ -f pages/scan/handlers/ScanHandler.js ]; then
  before=$(grep -c "console\.warn.*ScanHandler" pages/scan/handlers/ScanHandler.js 2>/dev/null || echo 0)
  sed -i '' '/console\.warn.*ScanHandler.*解析失败/d' pages/scan/handlers/ScanHandler.js
  sed -i '' '/console\.warn.*ScanHandler.*预判工序失败/d' pages/scan/handlers/ScanHandler.js
  after=$(grep -c "console\.warn.*ScanHandler" pages/scan/handlers/ScanHandler.js 2>/dev/null || echo 0)
  removed=$((before - after))
  echo "  ScanHandler.js: 删除 $removed 个"
  ((cleaned_logs += removed))
fi

# HistoryHandler.js - 删除调试日志
if [ -f pages/scan/handlers/HistoryHandler.js ]; then
  before=$(grep -c "console\.log.*loadMyHistory" pages/scan/handlers/HistoryHandler.js 2>/dev/null || echo 0)
  sed -i '' '/console\.log.*loadMyHistory/d' pages/scan/handlers/HistoryHandler.js
  after=$(grep -c "console\.log.*loadMyHistory" pages/scan/handlers/HistoryHandler.js 2>/dev/null || echo 0)
  removed=$((before - after))
  echo "  HistoryHandler.js: 删除 $removed 个"
  ((cleaned_logs += removed))
fi

# SKUProcessor.js - 删除警告日志
if [ -f pages/scan/processors/SKUProcessor.js ]; then
  before=$(grep -c "console\.warn.*SKUProcessor" pages/scan/processors/SKUProcessor.js 2>/dev/null || echo 0)
  sed -i '' '/console\.warn.*SKUProcessor/d' pages/scan/processors/SKUProcessor.js
  after=$(grep -c "console\.warn.*SKUProcessor" pages/scan/processors/SKUProcessor.js 2>/dev/null || echo 0)
  removed=$((before - after))
  echo "  SKUProcessor.js: 删除 $removed 个"
  ((cleaned_logs += removed))
fi

echo ""
echo "📊 清理日志数: $cleaned_logs"
echo ""

# Phase 3: 验证
echo "✅ Phase 3: 验证清理结果"
echo "----------------------------------------"

# 检查剩余 console.log
remaining_logs=$(grep -r "console\.log\|console\.warn" --include="*.js" pages/ utils/ components/ 2>/dev/null | grep -v "console\.error" | grep -v "node_modules" | wc -l | tr -d ' ')
echo "  剩余 console.log/warn: $remaining_logs 个"
echo "  (已保留 console.error 错误日志)"
echo ""

# 检查删除的文件不存在
echo "  验证文件删除:"
for file in dialog.js logger.js performance.js; do
  if [ ! -f "utils/$file" ]; then
    echo "    ✅ utils/$file 已删除"
  else
    echo "    ❌ utils/$file 仍存在"
  fi
done
echo ""

# 生成报告
echo "📋 清理报告"
echo "=============================================="
echo "✅ 删除未使用文件: $deleted_count 个"
echo "✅ 清理调试日志: $cleaned_logs 个"
echo "✅ 剩余日志: $remaining_logs 个 (关键日志已保留)"
echo "💾 备份位置: $backup_dir"
echo ""
echo "🎉 清理完成！代码更加干净整洁。"
echo ""
echo "📝 下一步建议:"
echo "  1. 测试小程序主要功能"
echo "  2. 检查是否有 JS 错误"
echo "  3. 确认扫码、首页等功能正常"
echo ""
