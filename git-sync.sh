#!/bin/bash
# Git 快速同步脚本

cd "$(dirname "$0")"

# 检查是否有修改
if [ -z "$(git status --porcelain)" ]; then
  echo "✅ 没有需要同步的修改"
  exit 0
fi

# 显示修改的文件
echo "📝 修改的文件："
git status --short

# 添加所有修改
git add .

# 提交（可以传入提交信息，否则使用默认）
COMMIT_MSG="${1:-更新代码 $(date '+%Y-%m-%d %H:%M:%S')}"
git commit -m "$COMMIT_MSG"

# 推送到远程
echo "🚀 推送到 GitHub..."
git push

echo "✅ 同步完成！"
