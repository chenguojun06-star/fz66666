#!/bin/bash

# 服装供应链管理系统 - 内存监控脚本
# 适用于 4GB 内存服务器

echo "=========================================="
echo "📊 系统资源监控（4GB服务器）"
echo "=========================================="
echo ""

# 系统内存
echo "💾 系统内存使用情况："
free -h
echo ""

# Docker容器资源
echo "🐳 Docker容器资源使用："
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
echo ""

# 磁盘使用
echo "💿 磁盘使用情况："
df -h | grep -E "Filesystem|/dev/"
echo ""

# Docker卷使用
echo "📦 Docker卷使用："
docker system df
echo ""

# 内存使用警告
TOTAL_MEM=$(free -m | awk 'NR==2{print $2}')
USED_MEM=$(free -m | awk 'NR==2{print $3}')
MEM_PERCENT=$((USED_MEM * 100 / TOTAL_MEM))

echo "=========================================="
if [ $MEM_PERCENT -gt 85 ]; then
    echo "⚠️  警告: 内存使用率 ${MEM_PERCENT}% (${USED_MEM}MB/${TOTAL_MEM}MB)"
    echo "建议操作："
    echo "  1. 检查日志大小: docker-compose logs --tail=100"
    echo "  2. 清理Docker缓存: docker system prune -a"
    echo "  3. 考虑升级到 8GB 内存"
elif [ $MEM_PERCENT -gt 70 ]; then
    echo "⚠️  注意: 内存使用率 ${MEM_PERCENT}% (${USED_MEM}MB/${TOTAL_MEM}MB)"
    echo "状态: 接近阈值，建议关注"
else
    echo "✅ 内存使用正常: ${MEM_PERCENT}% (${USED_MEM}MB/${TOTAL_MEM}MB)"
fi
echo "=========================================="
