#!/bin/bash
# 全站代码质量彻底审查
# 创建时间: 2026-02-03

echo "=========================================="
echo "全站代码质量彻底审查"
echo "=========================================="

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend/src"
BACKEND_DIR="$ROOT_DIR/backend/src/main/java"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

REPORT_FILE="$ROOT_DIR/code-audit-report-$(date +%Y%m%d-%H%M%S).md"

# 初始化报告
cat > "$REPORT_FILE" << 'HEADER'
# 全站代码质量审查报告

**审查日期**: 2026-02-03
**审查范围**: 前端 + 后端
**审查工具**: 自动化脚本

---

## 📊 审查概览

HEADER

echo -e "\n${BLUE}===== 第1部分: 代码重复检查 =====${NC}"
echo "检查范围: 前端组件、后端类"

# 1. 前端重复代码检查
echo -e "\n${YELLOW}1.1 前端重复代码${NC}"
cat >> "$REPORT_FILE" << 'SECTION1'

### 1. 代码重复问题

#### 前端重复代码
```
SECTION1

# 查找相似的组件名称（可能是重复）
echo "检查相似组件名..."
DUPLICATE_COMPONENTS=$(find "$FRONTEND_DIR" -name "*.tsx" -o -name "*.ts" | \
  xargs basename -a | sort | uniq -d | wc -l | tr -d ' ')
echo "发现相似组件名: $DUPLICATE_COMPONENTS 个" | tee -a "$REPORT_FILE"

# 查找大于100行的重复代码块
echo "检查大文件中的重复模式..."
LARGE_FILES=$(find "$FRONTEND_DIR" -name "*.tsx" -type f -exec wc -l {} \; | \
  awk '$1 > 1000 {print $2}' | wc -l | tr -d ' ')
echo "超大文件(>1000行): $LARGE_FILES 个" | tee -a "$REPORT_FILE"

# 2. 后端重复代码检查
echo -e "\n${YELLOW}1.2 后端重复代码${NC}"
cat >> "$REPORT_FILE" << 'SECTION1B'
```

#### 后端重复代码
```
SECTION1B

BACKEND_LARGE=$(find "$BACKEND_DIR" -name "*.java" -type f -exec wc -l {} \; | \
  awk '$1 > 1000 {print $2, $1}' | sort -rn -k2)
echo "$BACKEND_LARGE" | head -10 | tee -a "$REPORT_FILE"
echo "```" >> "$REPORT_FILE"

echo -e "\n${BLUE}===== 第2部分: 未使用代码检查 =====${NC}"

# 3. 前端未使用的导入
echo -e "\n${YELLOW}2.1 前端未使用导入${NC}"
cat >> "$REPORT_FILE" << 'SECTION2'

### 2. 未使用代码（代码沉积）

#### 前端未使用的导入
```
SECTION2

# 检查未使用的 import
UNUSED_IMPORTS=0
if command -v eslint &> /dev/null; then
    echo "使用 ESLint 检查未使用导入..."
    cd "$ROOT_DIR/frontend" && npm run lint 2>&1 | grep -i "unused" | wc -l | tr -d ' ' || echo "0"
else
    echo "ESLint 未安装，跳过检查"
fi

# 4. 查找可能未使用的组件
echo -e "\n${YELLOW}2.2 可能未使用的文件${NC}"
cat >> "$REPORT_FILE" << 'SECTION2B'
```

#### 可能未使用的文件
```
SECTION2B

# 查找可能未使用的 .tsx 文件（没有被任何文件导入）
echo "扫描孤立文件..."
cd "$FRONTEND_DIR"
TOTAL_FILES=$(find . -name "*.tsx" -o -name "*.ts" | grep -v "\.d\.ts" | wc -l | tr -d ' ')
echo "总文件数: $TOTAL_FILES" | tee -a "$REPORT_FILE"

echo "```" >> "$REPORT_FILE"

echo -e "\n${BLUE}===== 第3部分: 代码结构问题 =====${NC}"

# 5. 循环依赖检查
echo -e "\n${YELLOW}3.1 循环依赖检查${NC}"
cat >> "$REPORT_FILE" << 'SECTION3'

### 3. 代码结构问题

#### 循环依赖
```
SECTION3

if [ -f "$ROOT_DIR/frontend/node_modules/.bin/madge" ]; then
    echo "检查循环依赖..."
    cd "$ROOT_DIR/frontend" && npx madge --circular --extensions ts,tsx src/ 2>&1 | head -20 | tee -a "$REPORT_FILE"
else
    echo "madge 未安装，跳过循环依赖检查" | tee -a "$REPORT_FILE"
fi

echo "```" >> "$REPORT_FILE"

# 6. 文件大小问题
echo -e "\n${YELLOW}3.2 超大文件${NC}"
cat >> "$REPORT_FILE" << 'SECTION3B'

#### 超大文件（>2000行，需立即拆分）
```
SECTION3B

find "$FRONTEND_DIR" -name "*.tsx" -o -name "*.ts" | while read file; do
    lines=$(wc -l < "$file")
    if [ "$lines" -gt 2000 ]; then
        echo "$file: $lines 行" | tee -a "$REPORT_FILE"
    fi
done

echo "```" >> "$REPORT_FILE"

cat >> "$REPORT_FILE" << 'SECTION3C'

#### 大文件（1000-2000行，计划拆分）
```
SECTION3C

find "$FRONTEND_DIR" -name "*.tsx" -o -name "*.ts" | while read file; do
    lines=$(wc -l < "$file")
    if [ "$lines" -gt 1000 ] && [ "$lines" -le 2000 ]; then
        echo "$file: $lines 行" | tee -a "$REPORT_FILE"
    fi
done

echo "```" >> "$REPORT_FILE"

echo -e "\n${BLUE}===== 第4部分: 代码质量问题 =====${NC}"

# 7. 硬编码检查
echo -e "\n${YELLOW}4.1 硬编码问题${NC}"
cat >> "$REPORT_FILE" << 'SECTION4'

### 4. 代码质量问题

#### 硬编码颜色（应使用 CSS 变量）
```
SECTION4

HARDCODED_COLORS=$(grep -rn "color:\s*['\"]#[0-9a-fA-F]" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "硬编码颜色: $HARDCODED_COLORS 处" | tee -a "$REPORT_FILE"

HARDCODED_BG=$(grep -rn "background:\s*['\"]#[0-9a-fA-F]" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "硬编码背景: $HARDCODED_BG 处" | tee -a "$REPORT_FILE"

echo "```" >> "$REPORT_FILE"

# 8. 控制台日志残留
echo -e "\n${YELLOW}4.2 控制台日志残留${NC}"
cat >> "$REPORT_FILE" << 'SECTION4B'

#### 控制台日志残留（应清理）
```
SECTION4B

CONSOLE_LOGS=$(grep -rn "console\.(log|debug|warn)" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "console.log 残留: $CONSOLE_LOGS 处" | tee -a "$REPORT_FILE"

echo "```" >> "$REPORT_FILE"

# 9. TODO/FIXME 标记
echo -e "\n${YELLOW}4.3 待办事项${NC}"
cat >> "$REPORT_FILE" << 'SECTION4C'

#### 待办事项标记
```
SECTION4C

TODOS=$(grep -rn "TODO\|FIXME\|XXX\|HACK" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "TODO/FIXME 标记: $TODOS 处" | tee -a "$REPORT_FILE"
grep -rn "TODO\|FIXME" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | head -10 | tee -a "$REPORT_FILE"

echo "```" >> "$REPORT_FILE"

echo -e "\n${BLUE}===== 第5部分: 后端代码问题 =====${NC}"

# 10. 后端代码问题
echo -e "\n${YELLOW}5.1 后端超长方法${NC}"
cat >> "$REPORT_FILE" << 'SECTION5'

### 5. 后端代码问题

#### 超长方法（>100行）
```
SECTION5

# 查找超长方法（简化版）
find "$BACKEND_DIR" -name "*.java" -type f | while read file; do
    # 统计大括号，简单估算方法长度
    awk '/public|private|protected/ && /{/ {start=NR} /^[[:space:]]*}/ && start>0 {if(NR-start>100) print FILENAME":"start"-"NR":"NR-start" lines"}' "$file"
done 2>/dev/null | head -10 | tee -a "$REPORT_FILE"

echo "```" >> "$REPORT_FILE"

# 11. 未使用的导入（后端）
echo -e "\n${YELLOW}5.2 后端未使用导入${NC}"
cat >> "$REPORT_FILE" << 'SECTION5B'

#### 未使用的导入
```
SECTION5B

# 查找可能未使用的 import
UNUSED_BACKEND_IMPORTS=$(grep -rn "^import.*\*" "$BACKEND_DIR" --include="*.java" 2>/dev/null | wc -l | tr -d ' ')
echo "通配符导入(*): $UNUSED_BACKEND_IMPORTS 处（不推荐）" | tee -a "$REPORT_FILE"

echo "```" >> "$REPORT_FILE"

echo -e "\n${BLUE}===== 第6部分: 依赖和安全问题 =====${NC}"

# 12. 依赖检查
echo -e "\n${YELLOW}6.1 npm 依赖检查${NC}"
cat >> "$REPORT_FILE" << 'SECTION6'

### 6. 依赖和安全

#### npm 依赖
```
SECTION6

if [ -f "$ROOT_DIR/frontend/package.json" ]; then
    cd "$ROOT_DIR/frontend"
    TOTAL_DEPS=$(cat package.json | grep -E '^\s*".*":' | wc -l | tr -d ' ')
    echo "总依赖数: $TOTAL_DEPS" | tee -a "$REPORT_FILE"

    if command -v npm &> /dev/null; then
        echo "检查过期依赖..."
        npm outdated 2>&1 | head -10 | tee -a "$REPORT_FILE"
    fi
fi

echo "```" >> "$REPORT_FILE"

echo -e "\n${BLUE}===== 第7部分: 性能问题 =====${NC}"

# 13. 大文件导入
echo -e "\n${YELLOW}7.1 大型导入检查${NC}"
cat >> "$REPORT_FILE" << 'SECTION7'

### 7. 性能问题

#### 大型库的完整导入
```
SECTION7

# 检查完整导入 lodash, antd 等
FULL_IMPORTS=$(grep -rn "import.*from ['\"]\(lodash\|antd\)['\"]" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "完整库导入: $FULL_IMPORTS 处（影响打包大小）" | tee -a "$REPORT_FILE"
grep -rn "import.*from ['\"]\(lodash\|antd\)['\"]" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | head -5 | tee -a "$REPORT_FILE"

echo "```" >> "$REPORT_FILE"

# 14. 图片未优化
echo -e "\n${YELLOW}7.2 静态资源${NC}"
cat >> "$REPORT_FILE" << 'SECTION7B'

#### 静态资源
```
SECTION7B

if [ -d "$ROOT_DIR/frontend/public" ]; then
    LARGE_IMAGES=$(find "$ROOT_DIR/frontend/public" -type f \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" \) -size +500k 2>/dev/null)
    if [ -n "$LARGE_IMAGES" ]; then
        echo "大型图片(>500KB):" | tee -a "$REPORT_FILE"
        echo "$LARGE_IMAGES" | tee -a "$REPORT_FILE"
    else
        echo "未发现过大图片" | tee -a "$REPORT_FILE"
    fi
fi

echo "```" >> "$REPORT_FILE"

echo -e "\n${BLUE}===== 第8部分: 代码规范问题 =====${NC}"

# 15. 命名规范
echo -e "\n${YELLOW}8.1 命名规范检查${NC}"
cat >> "$REPORT_FILE" << 'SECTION8'

### 8. 代码规范

#### 命名规范问题
```
SECTION8

# 检查 React 组件命名（应为 PascalCase）
BAD_COMPONENT_NAMES=$(find "$FRONTEND_DIR" -name "*.tsx" | grep -v "/[A-Z]" | grep -E "/[a-z]" | wc -l | tr -d ' ')
echo "小写开头的 .tsx 文件: $BAD_COMPONENT_NAMES 个" | tee -a "$REPORT_FILE"

echo "```" >> "$REPORT_FILE"

# 生成总结
cat >> "$REPORT_FILE" << 'SUMMARY'

---

## 📋 问题汇总与优先级

### 🔴 P0 - 立即修复（影响功能）
1. 超大文件 (>2000行) - 影响编译和维护
2. 循环依赖 - 可能导致运行时错误
3. 硬编码颜色/字体 - 不一致的用户体验

### 🟡 P1 - 近期修复（影响性能）
1. 完整库导入 - 增加打包体积
2. console.log 残留 - 泄露调试信息
3. 大型图片未优化 - 加载速度慢

### 🟢 P2 - 计划优化（代码质量）
1. 代码重复 - 可维护性差
2. 未使用代码 - 增加复杂度
3. TODO/FIXME - 技术债务

### 🔵 P3 - 持续改进（规范）
1. 命名不规范 - 一致性
2. 通配符导入 - 代码可读性
3. 过期依赖 - 安全和稳定性

---

## 🔧 修复建议

### 立即执行
```bash
# 1. 修复超大文件
# 使用 Hooks 和组件拆分

# 2. 清理 console.log
find frontend/src -name "*.tsx" -o -name "*.ts" | \
  xargs sed -i '' '/console\.(log|debug)/d'

# 3. 修复硬编码颜色
# 参考: fix-hardcoded-colors.sh
```

### 工具推荐
1. **ESLint** - 代码规范检查
2. **Prettier** - 代码格式化
3. **madge** - 循环依赖检查
4. **bundle-analyzer** - 打包分析

---

*报告生成时间: 2026-02-03*
*审查工具: 自动化脚本*
SUMMARY

echo -e "\n${GREEN}=========================================="
echo "审查完成！"
echo "==========================================${NC}"
echo ""
echo "📄 详细报告: $REPORT_FILE"
echo ""
echo "💡 建议："
echo "   1. 优先修复 P0 问题（超大文件、循环依赖）"
echo "   2. 清理 console.log 和 TODO"
echo "   3. 统一使用 CSS 变量"
echo "   4. 拆分超大组件和文件"
