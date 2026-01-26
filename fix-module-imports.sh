#!/bin/bash

# 前端模块化导入路径修复脚本
# 将相对导入路径改为 @ 别名

TARGET_DIR="/Users/guojunmini4/Documents/服装66666/frontend/src/modules"

echo "🔧 开始修复导入路径..."

# 修复函数
fix_imports() {
  local file="$1"

  # 跳过已经使用 @ 的文件
  if ! grep -q "from ['\"]\.\./" "$file" 2>/dev/null; then
    return
  fi

  echo "  修复: $file"

  # 创建临时文件
  local temp_file="${file}.tmp"

  # 替换导入路径
  sed -E \
    -e "s|from ['\"]\.\./(\.\./)?(\.\./)?(components/[^'\"]+)['\"]|from '@/\3'|g" \
    -e "s|from ['\"]\.\./(\.\./)?(\.\./)?(utils/[^'\"]+)['\"]|from '@/\3'|g" \
    -e "s|from ['\"]\.\./(\.\./)?(\.\./)?(services/[^'\"]+)['\"]|from '@/\3'|g" \
    -e "s|from ['\"]\.\./(\.\./)?(\.\./)?(types/[^'\"]+)['\"]|from '@/\3'|g" \
    -e "s|from ['\"]\.\./(\.\./)?(\.\./)?(stores/[^'\"]+)['\"]|from '@/\3'|g" \
    -e "s|from ['\"]\.\./(\.\./)?(\.\./)?(constants/[^'\"]+)['\"]|from '@/\3'|g" \
    "$file" > "$temp_file"

  # 替换原文件
  mv "$temp_file" "$file"
}

# 查找所有tsx和ts文件
find "$TARGET_DIR" -type f \( -name "*.tsx" -o -name "*.ts" \) | while read -r file; do
  fix_imports "$file"
done

echo "✅ 导入路径修复完成！"
echo ""
echo "📋 修复后需要验证："
echo "  1. cd frontend && npm run build"
echo "  2. 检查是否有编译错误"
