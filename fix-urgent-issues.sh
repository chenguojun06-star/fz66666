#!/bin/bash
# 紧急问题修复脚本 - 2026-02-02
# 修复Vite模块加载失败和类型错误

set -e

echo "🔧 开始紧急修复..."

# 1. 清理Vite缓存
echo "📦 清理Vite缓存..."
if [ -d "frontend/node_modules/.vite" ]; then
    rm -rf frontend/node_modules/.vite
    echo "✅ Vite缓存已清理"
else
    echo "ℹ️  Vite缓存目录不存在"
fi

if [ -d "frontend/.vite" ]; then
    rm -rf frontend/.vite
    echo "✅ .vite目录已清理"
fi

# 2. 清理dist目录
echo "📦 清理构建产物..."
if [ -d "frontend/dist" ]; then
    rm -rf frontend/dist
    echo "✅ dist目录已清理"
fi

# 3. 检查问题文件
echo "🔍 检查问题文件..."

PROGRESS_DETAIL="frontend/src/modules/production/pages/Production/ProgressDetail/index.tsx"
if [ -f "$PROGRESS_DETAIL" ]; then
    echo "✅ ProgressDetail/index.tsx 存在"

    # 检查缺失的函数引用
    if grep -q "ensureNodesFromTemplateIfNeeded" "$PROGRESS_DETAIL"; then
        echo "⚠️  发现 ensureNodesFromTemplateIfNeeded 引用"
        if ! grep -q "const ensureNodesFromTemplateIfNeeded" "$PROGRESS_DETAIL"; then
            echo "❌ ensureNodesFromTemplateIfNeeded 未定义！"
        fi
    fi

    if grep -q "lockNodeWorkflow" "$PROGRESS_DETAIL"; then
        echo "⚠️  发现 lockNodeWorkflow 引用"
        if ! grep -q "const lockNodeWorkflow" "$PROGRESS_DETAIL"; then
            echo "❌ lockNodeWorkflow 未定义！"
        fi
    fi
else
    echo "❌ ProgressDetail/index.tsx 不存在"
fi

# 4. 检查hooks目录
HOOKS_DIR="frontend/src/modules/production/pages/Production/ProgressDetail/hooks"
if [ -d "$HOOKS_DIR" ]; then
    echo "✅ hooks目录存在"
    echo "📁 hooks文件列表:"
    ls -lh "$HOOKS_DIR"/*.ts 2>/dev/null || echo "⚠️  没有.ts文件"
else
    echo "❌ hooks目录不存在"
fi

# 5. 检查后端API
echo ""
echo "🔍 检查后端缺失的API..."
if grep -r "stock/alerts" backend/src/ 2>/dev/null; then
    echo "✅ stock/alerts API已实现"
else
    echo "❌ stock/alerts API缺失 - 需要添加到MaterialStockController"
fi

# 6. 统计TypeScript错误
echo ""
echo "📊 TypeScript类型检查..."
cd frontend
if command -v tsc &> /dev/null; then
    echo "运行 tsc --noEmit..."
    tsc --noEmit --skipLibCheck 2>&1 | head -n 20
else
    echo "⚠️  tsc未安装，跳过类型检查"
fi
cd ..

echo ""
echo "✅ 诊断完成"
echo ""
echo "📋 修复建议:"
echo "1. 运行: cd frontend && npm run dev"
echo "2. 如果仍有错误，检查ProgressDetail/index.tsx中的缺失函数"
echo "3. 添加后端API: MaterialStockController.alerts()"
echo "4. 解决TypeScript类型错误"
echo ""
echo "完整报告见: 系统全面核对报告-2026-02-02.md"
