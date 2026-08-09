#!/bin/bash
# install-hooks.sh — 安装 git hooks
#
# 用法: ./scripts/install-hooks.sh
#
# 作用: 配置 git core.hooksPath 指向 scripts/hooks，使 pre-push 等 hook 生效
# 绕过: git push --no-verify（紧急情况）
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "━━━ 安装 git hooks ━━━"

# 确认 hooks 目录存在且有执行权限
if [[ ! -d scripts/hooks ]]; then
  echo "❌ scripts/hooks 目录不存在"
  exit 1
fi

chmod +x scripts/hooks/*

# 配置 git hooksPath
git config core.hooksPath scripts/hooks
echo "✅ git core.hooksPath = scripts/hooks"

# 验证
HOOKS_PATH=$(git config core.hooksPath)
echo "   当前配置: core.hooksPath = $HOOKS_PATH"

# 列出已安装的 hook
echo ""
echo "已安装的 hook:"
for h in scripts/hooks/*; do
  [[ -f "$h" ]] && [[ -x "$h" ]] && echo "  ✅ $(basename "$h")"
done

echo ""
echo "━━━ 验证 ━━━"
echo "下次 git push 时会自动触发 scripts/hooks/pre-push"
echo "手动测试: ./scripts/safe-push.sh"
echo "紧急绕过: git push --no-verify"
