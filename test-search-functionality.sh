#!/bin/bash

# 测试全局搜索功能
# 用途：验证小程序中所有页面的搜索功能是否正常

echo "======================================"
echo "  全局搜索功能验证测试"
echo "======================================"
echo ""

# 检查搜索组件是否存在
echo "1. 检查搜索组件..."
if [ -f "miniprogram/components/common/global-search/index.js" ]; then
  echo "   ✅ 搜索组件存在"
else
  echo "   ❌ 搜索组件不存在"
  exit 1
fi

# 检查使用搜索组件的页面
echo ""
echo "2. 检查使用搜索组件的页面..."
search_pages=$(grep -r "global-search" miniprogram/pages/*/index.json 2>/dev/null | cut -d: -f1 | sed 's/\.json$//' | sed 's|miniprogram/pages/||' | sed 's|/index$||')

if [ -z "$search_pages" ]; then
  echo "   ⚠️  未找到使用搜索组件的页面"
else
  echo "   找到以下页面使用搜索组件:"
  for page in $search_pages; do
    echo "   - $page"
  done
fi

# 检查每个页面的搜索处理函数
echo ""
echo "3. 检查搜索处理函数实现..."

for page in $search_pages; do
  page_js="miniprogram/pages/$page/index.js"

  if [ ! -f "$page_js" ]; then
    echo "   ❌ $page: JS文件不存在"
    continue
  fi

  echo ""
  echo "   页面: $page"

  # 检查必需的处理函数
  handlers=("onGlobalSearchInput" "doGlobalSearch" "clearGlobalSearch" "closeGlobalSearch")
  all_found=true

  for handler in "${handlers[@]}"; do
    if grep -q "$handler" "$page_js"; then
      echo "      ✅ $handler"
    else
      echo "      ❌ $handler (缺失)"
      all_found=false
    fi
  done

  # 检查数据结构
  if grep -q "globalSearch:" "$page_js" || grep -q "globalSearch :" "$page_js"; then
    echo "      ✅ globalSearch 数据结构"
  else
    echo "      ⚠️  globalSearch 数据结构 (未找到，可能使用其他写法)"
  fi

  if [ "$all_found" = true ]; then
    echo "      ✅ 所有处理函数完整"
  else
    echo "      ❌ 存在缺失的处理函数"
  fi
done

# 检查 WXML 中的事件绑定
echo ""
echo "4. 检查 WXML 事件绑定..."

for page in $search_pages; do
  page_wxml="miniprogram/pages/$page/index.wxml"

  if [ ! -f "$page_wxml" ]; then
    echo "   ❌ $page: WXML文件不存在"
    continue
  fi

  echo ""
  echo "   页面: $page"

  # 检查必需的事件绑定
  bindings=("bind:input" "bind:search" "bind:clear" "bind:close")
  all_bound=true

  for binding in "${bindings[@]}"; do
    if grep -q "$binding=" "$page_wxml"; then
      bound_to=$(grep "$binding=" "$page_wxml" | sed "s/.*$binding=\"\([^\"]*\)\".*/\1/" | head -1)
      echo "      ✅ $binding=\"$bound_to\""
    else
      echo "      ❌ $binding (未绑定)"
      all_bound=false
    fi
  done

  if [ "$all_bound" = true ]; then
    echo "      ✅ 所有事件绑定完整"
  else
    echo "      ❌ 存在缺失的事件绑定"
  fi
done

# 总结
echo ""
echo "======================================"
echo "  测试总结"
echo "======================================"
echo ""
echo "✅ 已完成搜索功能验证"
echo ""
echo "📝 手动测试建议："
echo "   1. 在微信开发者工具中打开小程序"
echo "   2. 进入工作页面 (work)"
echo "   3. 点击搜索框输入订单号或款号"
echo "   4. 验证搜索结果是否正确显示"
echo "   5. 测试清空和关闭功能"
echo ""
echo "📋 测试用例："
echo "   - 搜索已存在的订单号"
echo "   - 搜索已存在的款号"
echo "   - 搜索工厂名称"
echo "   - 搜索不存在的内容（应显示'未找到匹配的订单'）"
echo "   - 点击搜索结果项（应高亮显示该订单）"
echo "   - 测试清空按钮"
echo "   - 测试关闭按钮"
echo ""
