#!/bin/bash

# 代码优化工具一键安装脚本
# 日期: 2026-01-24

set -e  # 遇到错误立即退出

echo "🚀 开始安装代码优化工具..."
echo ""

# 进入 frontend 目录
cd "$(dirname "$0")/../frontend"

echo "📦 安装 npm 依赖..."
echo ""

# 依赖检查工具
echo "  ⏳ 安装 depcheck (检测未使用依赖)..."
npm install -D depcheck

echo "  ⏳ 安装 madge (检测循环依赖)..."
npm install -D madge

# TypeScript 工具
echo "  ⏳ 安装 ts-prune (检测未使用导出)..."
npm install -D ts-prune

# 性能分析工具
echo "  ⏳ 安装 rollup-plugin-visualizer (打包分析)..."
npm install -D rollup-plugin-visualizer

# 依赖更新工具
echo "  ⏳ 安装 npm-check-updates (依赖更新)..."
npm install -D npm-check-updates

echo ""
echo "✅ npm 依赖安装完成！"
echo ""

# 更新 package.json 脚本
echo "📝 添加快捷脚本到 package.json..."

# 检查是否已经有相关脚本
if ! grep -q "check:unused" package.json; then
  echo "  添加代码检查脚本..."

  # 使用 Node.js 来安全地更新 package.json
  node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

    // 添加新脚本
    pkg.scripts = pkg.scripts || {};
    Object.assign(pkg.scripts, {
      'check:unused': 'ts-prune',
      'check:deps': 'depcheck',
      'check:circular': 'madge --circular src/',
      'check:all': 'npm run lint && npm run type-check && npm run check:unused && npm run check:deps && npm run check:circular',
      'update:deps': 'ncu -u && npm install',
      'analyze': 'vite build && vite-bundle-visualizer'
    });

    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "

  echo "  ✅ 脚本添加成功"
else
  echo "  ℹ️  脚本已存在，跳过添加"
fi

echo ""
echo "🔌 推荐安装 VS Code 扩展..."
echo ""

# VS Code 扩展列表
extensions=(
  "SonarSource.sonarlint-vscode:SonarLint (实时代码质量检查)"
  "rbbit.typescript-hero:TypeScript Hero (自动导入管理)"
  "VisualStudioExptTeam.vscodeintellicode:IntelliCode (AI 代码补全)"
  "cmstead.jsrefactor:JS Refactor (自动重构)"
)

# 检查 VS Code 是否安装
if command -v code &> /dev/null; then
  echo "  检测到 VS Code，开始安装扩展..."
  echo ""

  for ext_info in "${extensions[@]}"; do
    IFS=':' read -r ext_id ext_name <<< "$ext_info"

    # 检查扩展是否已安装
    if code --list-extensions | grep -q "^${ext_id}$"; then
      echo "  ✅ $ext_name (已安装)"
    else
      echo "  ⏳ 安装 $ext_name..."
      code --install-extension "$ext_id" --force
      echo "  ✅ $ext_name (安装成功)"
    fi
  done
else
  echo "  ⚠️  未检测到 VS Code 命令行工具"
  echo "  请手动安装以下扩展："
  echo ""
  for ext_info in "${extensions[@]}"; do
    IFS=':' read -r ext_id ext_name <<< "$ext_info"
    echo "    - $ext_name ($ext_id)"
  done
fi

echo ""
echo "⚙️  配置 VS Code 设置..."

# 创建 .vscode 目录（如果不存在）
mkdir -p .vscode

# 创建或更新 settings.json
if [ ! -f .vscode/settings.json ]; then
  cat > .vscode/settings.json <<'EOF'
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit",
    "source.organizeImports": "explicit"
  },
  "typescript.suggest.autoImports": true,
  "typescript.updateImportsOnFileMove.enabled": "always",
  "typescript.inlayHints.parameterNames.enabled": "all",
  "typescript.inlayHints.variableTypes.enabled": true,
  "eslint.validate": [
    "javascript",
    "javascriptreact",
    "typescript",
    "typescriptreact"
  ],
  "prettier.requireConfig": true,
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  },
  "[typescriptreact]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
EOF
  echo "  ✅ 创建 .vscode/settings.json"
else
  echo "  ℹ️  .vscode/settings.json 已存在，请手动合并配置"
fi

echo ""
echo "🎉 安装完成！"
echo ""
echo "📋 可用的新命令："
echo "  npm run check:unused     - 检测未使用的导出"
echo "  npm run check:deps       - 检测未使用的依赖"
echo "  npm run check:circular   - 检测循环依赖"
echo "  npm run check:all        - 运行所有检查"
echo "  npm run update:deps      - 更新依赖到最新版本"
echo "  npm run analyze          - 分析打包体积"
echo ""
echo "🔍 运行一次完整检查："
echo "  cd frontend && npm run check:all"
echo ""
echo "📖 详细文档："
echo "  docs/CODE_AUTO_OPTIMIZATION_TOOLS.md"
echo ""
