#!/bin/bash
# 系统清理脚本 - 2026-01-28
# 用途：清理备份文件、日志文件等垃圾数据

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "🧹 服装供应链系统 - 垃圾文件清理"
echo "======================================"
echo ""

# 统计清理前状态
echo "📊 清理前状态："
BACKUP_COUNT=$(find miniprogram -name '*.bak*' 2>/dev/null | wc -l | tr -d ' ')
LOG_SIZE=$(du -sh backend/logs 2>/dev/null | cut -f1)
echo "- 备份文件数量: $BACKUP_COUNT 个"
echo "- 日志文件大小: $LOG_SIZE"
echo ""

# 确认清理
read -p "⚠️  确认清理？(y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 取消清理"
    exit 1
fi

echo ""
echo "🚀 开始清理..."
echo ""

# 1. 删除备份文件
echo "📦 [1/3] 删除备份文件..."
DELETED_BACKUPS=0
if [ "$BACKUP_COUNT" -gt 0 ]; then
    find miniprogram -name '*.bak*' -type f -exec rm -f {} \;
    DELETED_BACKUPS=$BACKUP_COUNT
    echo "✅ 已删除 $DELETED_BACKUPS 个备份文件"
else
    echo "✅ 无备份文件需要删除"
fi

# 2. 备份并清空日志文件
echo ""
echo "📋 [2/3] 处理日志文件..."

# 创建备份目录
BACKUP_DIR="backend/logs/archive"
mkdir -p "$BACKUP_DIR"

# 备份大日志文件
BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
if [ -f "backend/logs/fashion-supplychain.log" ] && [ -s "backend/logs/fashion-supplychain.log" ]; then
    cp "backend/logs/fashion-supplychain.log" "$BACKUP_DIR/fashion-supplychain-$BACKUP_DATE.log"
    echo "  📦 已备份: fashion-supplychain.log → archive/"
fi

if [ -f "backend/backend.log" ] && [ -s "backend/backend.log" ]; then
    cp "backend/backend.log" "$BACKUP_DIR/backend-$BACKUP_DATE.log"
    echo "  📦 已备份: backend.log → archive/"
fi

# 清空日志文件
> backend/logs/fashion-supplychain.log 2>/dev/null || true
> backend/backend.log 2>/dev/null || true
> backend/logs/backend.log 2>/dev/null || true
> backend/logs/app.log 2>/dev/null || true

echo "✅ 日志文件已清空（备份保存在 $BACKUP_DIR）"

# 3. 清理旧备份（保留最近3个）
echo ""
echo "🗑️  [3/3] 清理旧日志备份（保留最近3个）..."
if [ -d "$BACKUP_DIR" ]; then
    cd "$BACKUP_DIR"
    LOG_BACKUP_COUNT=$(ls -1 *.log 2>/dev/null | wc -l | tr -d ' ')
    if [ "$LOG_BACKUP_COUNT" -gt 3 ]; then
        ls -1t *.log | tail -n +4 | xargs rm -f
        REMOVED_COUNT=$((LOG_BACKUP_COUNT - 3))
        echo "✅ 已删除 $REMOVED_COUNT 个旧备份"
    else
        echo "✅ 备份数量合理，无需清理"
    fi
    cd "$ROOT_DIR"
else
    echo "✅ 无旧备份需要清理"
fi

# 统计清理后状态
echo ""
echo "======================================"
echo "📊 清理后状态："
BACKUP_COUNT_AFTER=$(find miniprogram -name '*.bak*' 2>/dev/null | wc -l | tr -d ' ')
LOG_SIZE_AFTER=$(du -sh backend/logs 2>/dev/null | cut -f1)
echo "- 备份文件数量: $BACKUP_COUNT_AFTER 个"
echo "- 日志文件大小: $LOG_SIZE_AFTER"
echo ""

# 生成清理报告
echo "✅ 清理完成！"
echo ""
echo "📝 清理摘要："
echo "  - 删除备份文件: $DELETED_BACKUPS 个"
echo "  - 清空日志文件: 4 个"
echo "  - 日志备份位置: $BACKUP_DIR"
echo ""
echo "💡 提示："
echo "  - 日志备份会自动保留最近3个"
echo "  - 可通过 .gitignore 防止新备份文件提交"
echo ""
