#!/bin/bash

# 清理未使用的Outlined图标导入
echo "🧹 清理未使用的图标导入..."

find frontend/src/modules -name "*.tsx" -type f | while read file; do
  # 检查是否还在使用这些图标（Button的icon属性）
  has_button_icon=$(grep -c "icon={<.*Outlined" "$file" || true)
  
  # 如果没有在Button中使用图标，清理导入
  if [ "$has_button_icon" -eq 0 ]; then
    # 检查是否有Outlined导入
    if grep -q "EditOutlined\|DeleteOutlined\|EyeOutlined\|PlusOutlined" "$file"; then
      echo "清理: $file"
      # 删除单独的图标导入行
      sed -i '' '/^import.*{.*\(EditOutlined\|DeleteOutlined\|EyeOutlined\).* from .*@ant-design\/icons/d' "$file"
      # 从import语句中删除特定图标（保留其他的）
      sed -i '' 's/, *EditOutlined//g; s/, *DeleteOutlined//g; s/, *EyeOutlined//g; s/, *PlusOutlined//g' "$file"
      sed -i '' 's/EditOutlined, *//g; s/DeleteOutlined, *//g; s/EyeOutlined, *//g; s/PlusOutlined, *//g' "$file"
      # 清理空的导入语句
      sed -i '' '/^import { *} from/d' "$file"
    fi
  fi
done

find frontend/src/components -name "*.tsx" -type f | while read file; do
  has_button_icon=$(grep -c "icon={<.*Outlined" "$file" || true)
  
  if [ "$has_button_icon" -eq 0 ]; then
    if grep -q "EditOutlined\|DeleteOutlined\|EyeOutlined\|PlusOutlined" "$file"; then
      echo "清理: $file"
      sed -i '' '/^import.*{.*\(EditOutlined\|DeleteOutlined\|EyeOutlined\).* from .*@ant-design\/icons/d' "$file"
      sed -i '' 's/, *EditOutlined//g; s/, *DeleteOutlined//g; s/, *EyeOutlined//g; s/, *PlusOutlined//g' "$file"
      sed -i '' 's/EditOutlined, *//g; s/DeleteOutlined, *//g; s/EyeOutlined, *//g; s/PlusOutlined, *//g' "$file"
      sed -i '' '/^import { *} from/d' "$file"
    fi
  fi
done

echo "✅ 完成！"
