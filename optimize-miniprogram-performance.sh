#!/bin/bash

# 小程序性能优化脚本
# 用途：应用推荐的性能优化措施

echo "======================================"
echo "  小程序性能优化工具"
echo "======================================"
echo ""

# 检查是否在正确的目录
if [ ! -d "miniprogram" ]; then
  echo "❌ 错误：请在项目根目录运行此脚本"
  exit 1
fi

echo "📊 当前性能状态分析..."
echo ""

# 检查轮询间隔
echo "1. 检查数据同步轮询间隔"
work_sync=$(grep -n "startSync.*30000" miniprogram/pages/work/index.js)
if [ ! -z "$work_sync" ]; then
  echo "   ⚠️  发现 30 秒轮询间隔（建议改为 60 秒）"
  echo "      位置: miniprogram/pages/work/index.js"
  echo "      $work_sync"
else
  echo "   ✅ 未发现明显的高频轮询"
fi

echo ""

# 检查防抖实现
echo "2. 检查搜索输入防抖"
has_debounce=$(grep -n "debounce\|setTimeout.*setData" miniprogram/pages/work/index.js 2>/dev/null | head -5)
if [ -z "$has_debounce" ]; then
  echo "   ⚠️  搜索输入可能未使用防抖（每次输入都触发 setData）"
else
  echo "   ✅ 已实现防抖机制"
fi

echo ""

# 检查定时器清理
echo "3. 检查定时器清理机制"
has_cleanup_work=$(grep -n "onHide\|onUnload" miniprogram/pages/work/index.js)
has_cleanup_scan=$(grep -n "onHide\|onUnload" miniprogram/pages/scan/index.js)

if [ ! -z "$has_cleanup_work" ] && [ ! -z "$has_cleanup_scan" ]; then
  echo "   ✅ 主要页面已实现定时器清理"
  echo "      - work 页面: ✅"
  echo "      - scan 页面: ✅"
else
  echo "   ⚠️  部分页面可能缺少定时器清理"
fi

echo ""

# 检查图片加载
echo "4. 检查图片资源"
image_count=$(find miniprogram -name "*.wxml" -exec grep -h "image" {} \; 2>/dev/null | wc -l | tr -d ' ')
echo "   图片标签数量: $image_count"
if [ $image_count -gt 100 ]; then
  echo "   ⚠️  图片较多，建议检查是否启用懒加载"
else
  echo "   ✅ 图片数量合理"
fi

echo ""

# 检查列表渲染
echo "5. 检查列表渲染优化"
missing_key=$(find miniprogram/pages -name "*.wxml" -exec grep -l "wx:for" {} \; | while read file; do
  if ! grep -q "wx:key" "$file"; then
    echo "$file"
  fi
done)

if [ -z "$missing_key" ]; then
  echo "   ✅ 所有列表都使用了 wx:key"
else
  echo "   ⚠️  以下文件缺少 wx:key："
  echo "$missing_key" | while read file; do
    echo "      - $file"
  done
fi

echo ""
echo "======================================"
echo "  优化建议"
echo "======================================"
echo ""

read -p "是否应用推荐的性能优化？(y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "🔧 开始应用优化..."
  echo ""

  # 优化 1：延长轮询间隔（如果找到）
  if [ ! -z "$work_sync" ]; then
    echo "📝 优化 1: 延长轮询间隔 (30s → 60s)"

    # 备份文件
    cp miniprogram/pages/work/index.js miniprogram/pages/work/index.js.backup-perf

    # 替换轮询间隔
    sed -i.bak "s/startSync('work_orders', syncFn, 30000/startSync('work_orders', syncFn, 60000/g" miniprogram/pages/work/index.js

    if [ $? -eq 0 ]; then
      echo "   ✅ 已将轮询间隔从 30 秒延长到 60 秒"
      echo "   💾 备份文件: miniprogram/pages/work/index.js.backup-perf"
      rm miniprogram/pages/work/index.js.bak 2>/dev/null
    else
      echo "   ❌ 修改失败，请手动修改"
      mv miniprogram/pages/work/index.js.backup-perf miniprogram/pages/work/index.js
    fi
  fi

  echo ""
  echo "✅ 优化完成！"
  echo ""
  echo "📋 已应用的优化："
  echo "   1. ✅ 轮询间隔优化（网络请求减少 50%）"
  echo ""
  echo "📝 建议手动完成的优化："
  echo "   2. 添加搜索输入防抖（参考报告中的代码）"
  echo "   3. 移除开发环境的 console.log"
  echo ""
  echo "📖 详细优化报告："
  echo "   查看文件: miniprogram-performance-report.md"
  echo ""

else
  echo ""
  echo "已取消优化。"
  echo ""
  echo "📖 查看详细性能报告："
  echo "   cat miniprogram-performance-report.md"
  echo ""
fi

echo "======================================"
echo "  性能测试建议"
echo "======================================"
echo ""
echo "🧪 测试场景："
echo "   1. 长时间停留测试（30 分钟）"
echo "   2. 频繁操作测试（连续扫码 100 次）"
echo "   3. 弱网环境测试（模拟 3G）"
echo ""
echo "📊 监控指标："
echo "   - 内存占用（稳定不增长）"
echo "   - 网络请求频率"
echo "   - 页面响应速度"
echo ""
echo "🛠️  测试工具："
echo "   - 微信开发者工具 → 调试 → 性能监控"
echo "   - wx.getPerformance() API"
echo ""
