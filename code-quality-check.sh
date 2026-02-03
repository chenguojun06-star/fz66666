#!/bin/bash
# 全站代码质量审查 - 简化版
# 创建时间: 2026-02-03

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend/src"
BACKEND_DIR="$ROOT_DIR/backend/src/main/java"
REPORT_FILE="$ROOT_DIR/code-quality-report-$(date +%Y%m%d-%H%M%S).md"

echo "=========================================="
echo "全站代码质量审查"
echo "=========================================="

# 初始化报告
{
cat << 'EOF'
# 全站代码质量审查报告

**审查日期**: 2026-02-03
**审查范围**: 前端 + 后端

---

## 📊 关键指标

EOF
} > "$REPORT_FILE"

echo ""
echo "===== 1. 超大文件检查 ====="

{
echo ""
echo "### 1. 超大文件（代码重叠/沉积）"
echo ""
echo "#### 🔴 P0 - 立即拆分 (>2000行)"
echo '```'
} >> "$REPORT_FILE"

# 前端超大文件
echo "前端超大文件:"
find "$FRONTEND_DIR" -name "*.tsx" -o -name "*.ts" | while read file; do
    lines=$(wc -l < "$file" 2>/dev/null)
    if [ "$lines" -gt 2000 ]; then
        rel_path=${file#$ROOT_DIR/}
        echo "  ❌ $rel_path: $lines 行" | tee -a "$REPORT_FILE"
    fi
done

# 后端超大文件
echo "后端超大文件:"
find "$BACKEND_DIR" -name "*.java" -type f | while read file; do
    lines=$(wc -l < "$file" 2>/dev/null)
    if [ "$lines" -gt 2000 ]; then
        rel_path=${file#$ROOT_DIR/}
        echo "  ❌ $rel_path: $lines 行" | tee -a "$REPORT_FILE"
    fi
done

{
echo '```'
echo ""
echo "#### 🟡 P1 - 计划拆分 (1000-2000行)"
echo '```'
} >> "$REPORT_FILE"

# 前端大文件
echo "前端大文件:"
find "$FRONTEND_DIR" -name "*.tsx" -o -name "*.ts" | while read file; do
    lines=$(wc -l < "$file" 2>/dev/null)
    if [ "$lines" -gt 1000 ] && [ "$lines" -le 2000 ]; then
        rel_path=${file#$ROOT_DIR/}
        echo "  ⚠️  $rel_path: $lines 行" | tee -a "$REPORT_FILE"
    fi
done

# 后端大文件
echo "后端大文件:"
find "$BACKEND_DIR" -name "*.java" -type f | while read file; do
    lines=$(wc -l < "$file" 2>/dev/null)
    if [ "$lines" -gt 1000 ] && [ "$lines" -le 2000 ]; then
        rel_path=${file#$ROOT_DIR/}
        echo "  ⚠️  $rel_path: $lines 行" | tee -a "$REPORT_FILE"
    fi
done

echo '```' >> "$REPORT_FILE"

echo ""
echo "===== 2. 硬编码问题 ====="

{
echo ""
echo "### 2. 硬编码问题（设计不一致）"
echo ""
echo "#### 硬编码颜色"
echo '```'
} >> "$REPORT_FILE"

# 硬编码颜色
HARDCODED_COLORS=$(grep -rn "color:\s*['\"]#" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "硬编码颜色: $HARDCODED_COLORS 处" | tee -a "$REPORT_FILE"

HARDCODED_BG=$(grep -rn "background:\s*['\"]#" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "硬编码背景: $HARDCODED_BG 处" | tee -a "$REPORT_FILE"

HARDCODED_BORDER=$(grep -rn "borderColor:\s*['\"]#" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "硬编码边框: $HARDCODED_BORDER 处" | tee -a "$REPORT_FILE"

echo ""
echo "示例（前10处）:"
grep -rn "color:\s*['\"]#" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | head -10 | while read line; do
    echo "  $line"
done | tee -a "$REPORT_FILE"

{
echo '```'
echo ""
echo "#### 硬编码字体大小"
echo '```'
} >> "$REPORT_FILE"

HARDCODED_FONTSIZE=$(grep -rn "fontSize:\s*[0-9]" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "硬编码字体: $HARDCODED_FONTSIZE 处" | tee -a "$REPORT_FILE"

echo '```' >> "$REPORT_FILE"

echo ""
echo "===== 3. 循环依赖检查 ====="

{
echo ""
echo "### 3. 循环依赖（结构问题）"
echo '```'
} >> "$REPORT_FILE"

if [ -f "$ROOT_DIR/frontend/node_modules/.bin/madge" ]; then
    echo "检查循环依赖..." | tee -a "$REPORT_FILE"
    cd "$ROOT_DIR/frontend" && npx madge --circular --extensions ts,tsx src/ 2>&1 | tee -a "$REPORT_FILE"
else
    echo "madge 未安装，跳过检查" | tee -a "$REPORT_FILE"
fi

echo '```' >> "$REPORT_FILE"

echo ""
echo "===== 4. 代码质量问题 ====="

{
echo ""
echo "### 4. 代码质量"
echo ""
echo "#### Console 日志残留"
echo '```'
} >> "$REPORT_FILE"

CONSOLE_LOGS=$(grep -rn "console\.\(log\|debug\|warn\)" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "// console" | wc -l | tr -d ' ')
echo "console.log 残留: $CONSOLE_LOGS 处" | tee -a "$REPORT_FILE"

if [ "$CONSOLE_LOGS" -gt 0 ]; then
    echo ""
    echo "示例（前5处）:"
    grep -rn "console\.\(log\|debug\|warn\)" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "// console" | head -5 | while read line; do
        echo "  $line"
    done | tee -a "$REPORT_FILE"
fi

{
echo '```'
echo ""
echo "#### TODO/FIXME 技术债"
echo '```'
} >> "$REPORT_FILE"

TODOS=$(grep -rn "TODO\|FIXME\|XXX\|HACK" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "TODO/FIXME: $TODOS 处" | tee -a "$REPORT_FILE"

if [ "$TODOS" -gt 0 ]; then
    echo ""
    echo "示例（前10处）:"
    grep -rn "TODO\|FIXME" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | head -10 | while read line; do
        echo "  $line"
    done | tee -a "$REPORT_FILE"
fi

echo '```' >> "$REPORT_FILE"

echo ""
echo "===== 5. 性能问题 ====="

{
echo ""
echo "### 5. 性能问题"
echo ""
echo "#### 完整库导入（影响打包大小）"
echo '```'
} >> "$REPORT_FILE"

FULL_LODASH=$(grep -rn "import.*from ['\"]\(lodash\)['\"]$" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "完整导入 lodash: $FULL_LODASH 处" | tee -a "$REPORT_FILE"

FULL_ANTD=$(grep -rn "import.*from ['\"]\(antd\)['\"]$" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "完整导入 antd: $FULL_ANTD 处" | tee -a "$REPORT_FILE"

if [ "$FULL_LODASH" -gt 0 ] || [ "$FULL_ANTD" -gt 0 ]; then
    echo ""
    echo "示例:"
    grep -rn "import.*from ['\"]\(lodash\|antd\)['\"]$" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | head -5 | while read line; do
        echo "  $line"
    done | tee -a "$REPORT_FILE"
fi

echo '```' >> "$REPORT_FILE"

echo ""
echo "===== 6. 后端代码问题 ====="

{
echo ""
echo "### 6. 后端代码问题"
echo ""
echo "#### 通配符导入"
echo '```'
} >> "$REPORT_FILE"

WILDCARD_IMPORTS=$(grep -rn "^import.*\.\*;" "$BACKEND_DIR" --include="*.java" 2>/dev/null | wc -l | tr -d ' ')
echo "通配符导入(.*): $WILDCARD_IMPORTS 处" | tee -a "$REPORT_FILE"

if [ "$WILDCARD_IMPORTS" -gt 0 ]; then
    echo ""
    echo "示例（前10处）:"
    grep -rn "^import.*\.\*;" "$BACKEND_DIR" --include="*.java" 2>/dev/null | head -10 | while read line; do
        echo "  $line"
    done | tee -a "$REPORT_FILE"
fi

echo '```' >> "$REPORT_FILE"

echo ""
echo "===== 7. 统计总结 ====="

{
cat << 'EOF'

---

## 📊 统计总结

### 前端代码
EOF
} >> "$REPORT_FILE"

# 前端统计
TOTAL_TSX=$(find "$FRONTEND_DIR" -name "*.tsx" | wc -l | tr -d ' ')
TOTAL_TS=$(find "$FRONTEND_DIR" -name "*.ts" | wc -l | tr -d ' ')
TOTAL_LINES_FRONTEND=$(find "$FRONTEND_DIR" -name "*.tsx" -o -name "*.ts" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')

{
echo '```'
echo "总文件数: $TOTAL_TSX tsx + $TOTAL_TS ts = $((TOTAL_TSX + TOTAL_TS))"
echo "总代码行: $TOTAL_LINES_FRONTEND"
echo '```'
echo ""
echo "### 后端代码"
echo '```'
} >> "$REPORT_FILE"

# 后端统计
TOTAL_JAVA=$(find "$BACKEND_DIR" -name "*.java" | wc -l | tr -d ' ')
TOTAL_LINES_BACKEND=$(find "$BACKEND_DIR" -name "*.java" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')

{
echo "总文件数: $TOTAL_JAVA java"
echo "总代码行: $TOTAL_LINES_BACKEND"
echo '```'
} >> "$REPORT_FILE"

{
cat << 'EOF'

---

## 🎯 优先级修复计划

### 🔴 P0 - 立即修复（本周）
1. **拆分超大文件** (>2000行)
   - Production/List/index.tsx (2513行)
   - Cutting/index.tsx (2190行)
   - DataInitializer.java (2624行)
   - 使用 Hooks 和组件拆分

2. **清理硬编码颜色**
   ```bash
   ./fix-hardcoded-colors.sh
   ```

### 🟡 P1 - 近期修复（本月）
1. **拆分大文件** (1000-2000行)
   - 使用组件化拆分
   - 提取自定义 Hooks

2. **清理 console.log**
   ```bash
   find frontend/src -name "*.tsx" -o -name "*.ts" | \
     xargs sed -i '' '/console\.log/d'
   ```

3. **优化库导入**
   ```typescript
   // ❌ 错误
   import lodash from 'lodash';
   import { Button } from 'antd';

   // ✅ 正确
   import debounce from 'lodash/debounce';
   import Button from 'antd/es/button';
   ```

### 🟢 P2 - 计划优化（下月）
1. 清理 TODO/FIXME
2. 修复循环依赖
3. 统一命名规范

### 🔵 P3 - 持续改进
1. 代码重复检查
2. 依赖版本更新
3. ESLint 规则增强

---

## 🔧 工具推荐

### 前端
- **ESLint** - 代码规范检查
- **Prettier** - 代码格式化
- **madge** - 循环依赖检查
- **webpack-bundle-analyzer** - 打包分析

### 后端
- **SonarQube** - 代码质量分析
- **Checkstyle** - 代码规范检查
- **PMD** - 代码问题检查

---

*报告生成时间: 2026-02-03*
*工具版本: v1.0*
EOF
} >> "$REPORT_FILE"

echo ""
echo "=========================================="
echo "✅ 审查完成！"
echo "=========================================="
echo ""
echo "📄 详细报告: $REPORT_FILE"
echo ""
echo "🔍 主要发现:"
echo "   - 超大文件(>2000行): $(find "$FRONTEND_DIR" "$BACKEND_DIR" -name "*.tsx" -o -name "*.ts" -o -name "*.java" | while read f; do wc -l < "$f" 2>/dev/null; done | awk '$1>2000' | wc -l | tr -d ' ') 个"
echo "   - 硬编码颜色: $HARDCODED_COLORS 处"
echo "   - 硬编码字体: $HARDCODED_FONTSIZE 处"
echo "   - console.log: $CONSOLE_LOGS 处"
echo "   - TODO/FIXME: $TODOS 处"
echo ""
echo "💡 建议优先级:"
echo "   🔴 P0: 拆分超大文件、清理硬编码"
echo "   🟡 P1: 清理日志、优化导入"
echo "   🟢 P2: 清理技术债、修复循环依赖"
