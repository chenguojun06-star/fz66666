#!/bin/bash

# 精确验证操作列是否使用 RowActions
# 检查 title: '操作' 后面 30 行内是否有 RowActions

echo "🔍 精确验证操作列 RowActions 使用情况"
echo "========================================"
echo ""

cd "$(dirname "$0")/frontend/src/modules" || exit 1

found_count=0
not_using_count=0

# 查找所有包含 title: '操作' 的文件
while IFS= read -r file; do
  # 获取所有匹配行的行号
  grep -n "title: ['\"]操作['\"]" "$file" 2>/dev/null | while IFS=: read -r linenum _; do
    # 从该行开始，读取后续30行
    context=$(tail -n +$linenum "$file" | head -30)

    # 检查这30行中是否包含 RowActions
    if echo "$context" | grep -q "RowActions"; then
      echo "✅ $file:$linenum - 已使用 RowActions"
    else
      echo "❌ $file:$linenum - 未使用 RowActions"
      echo "   上下文预览："
      echo "$context" | head -10 | sed 's/^/   /'
      echo ""
      ((not_using_count++))
    fi
    ((found_count++))
  done
done < <(find . -name "*.tsx" -type f)

echo ""
echo "========================================"
echo "📊 统计结果:"
echo "   总共找到: $found_count 个操作列"
echo "   未使用 RowActions: $not_using_count 个"
echo "   已使用 RowActions: $((found_count - not_using_count)) 个"
echo ""
