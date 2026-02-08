#!/bin/bash

# 批量删除RowActions中的icon属性行
# 使用sed删除包含 icon: <.*Outlined /> 的行

echo "🔧 开始删除操作列图标..."

# 查找所有.tsx文件
find frontend/src/modules -name "*.tsx" -type f | while read file; do
  # 检查文件是否包含 icon: <
  if grep -q "icon: <.*Outlined />" "$file"; then
    echo "处理: $file"
    # 删除包含 icon: 的行（保留前后缩进对齐）
    sed -i '' '/icon: <.*Outlined \/>,\?$/d' "$file"
  fi
done

# 处理components目录
find frontend/src/components -name "*.tsx" -type f | while read file; do
  if grep -q "icon: <.*Outlined />" "$file"; then
    echo "处理: $file"
    sed -i '' '/icon: <.*Outlined \/>,\?$/d' "$file"
  fi
done

echo "✅ 完成！已删除所有操作列图标"
echo "📝 建议运行 'npm run lint:fix' 清理可能的import语句"
