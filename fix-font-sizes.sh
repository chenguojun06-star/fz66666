#!/bin/bash
# 修复前端字体大小不一致问题
# 创建时间: 2026-02-03

echo "=========================================="
echo "修复字体大小不一致问题"
echo "=========================================="

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend/src"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "\n${BLUE}步骤1: 检查硬编码字体大小${NC}"
echo "----------------------------------------"

# 查找所有硬编码的 fontSize
echo "正在扫描 TSX 文件中的硬编码字体大小..."
HARDCODED_COUNT=$(grep -rn "fontSize:\s*[0-9]" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" | wc -l | tr -d ' ')
echo -e "${YELLOW}发现 $HARDCODED_COUNT 处硬编码字体大小${NC}"

echo -e "\n${BLUE}详细列表（前20个）：${NC}"
grep -rn "fontSize:\s*[0-9]" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" | head -20

echo -e "\n${BLUE}步骤2: 统计字体大小分布${NC}"
echo "----------------------------------------"
echo "统计各个字体大小的使用频率："

for size in 11 12 13 14 15 16 18 20 22 24; do
  count=$(grep -r "fontSize:\s*${size}" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" -gt 0 ]; then
    echo -e "  ${size}px: ${YELLOW}$count${NC} 处"
  fi
done

echo -e "\n${BLUE}步骤3: 显示标准字体系统${NC}"
echo "----------------------------------------"
echo "系统定义的标准字体大小（来自 global.css）："
echo ""
echo "  --font-size-xs:   12px  (极小文字，辅助说明)"
echo "  --font-size-sm:   13px  (小文字，次要信息)"
echo "  --font-size-base: 14px  (基准字号，正文)"
echo "  --font-size-md:   15px  (中等文字)"
echo "  --font-size-lg:   16px  (大文字，重要信息)"
echo "  --font-size-xl:   18px  (超大文字，标题)"
echo "  --font-size-xxl:  20px  (页面主标题)"

echo -e "\n${BLUE}步骤4: 建议的修复方案${NC}"
echo "----------------------------------------"
cat << 'EOF'

修复原则：
1. ✅ 使用 CSS 变量：fontSize: 'var(--font-size-base)'
2. ❌ 禁止硬编码：fontSize: 14 或 fontSize: '14px'

修复映射表：
  11px → var(--font-size-xs)   (12px，向上取整)
  12px → var(--font-size-xs)
  13px → var(--font-size-sm)
  14px → var(--font-size-base)
  15px → var(--font-size-md)
  16px → var(--font-size-lg)
  18px → var(--font-size-xl)
  20px → var(--font-size-xxl)

示例修复：
❌ 错误：
  <div style={{ fontSize: 13, color: 'red' }}>文本</div>

✅ 正确：
  <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--error-color)' }}>文本</div>

EOF

echo -e "\n${BLUE}步骤5: 生成修复建议文件${NC}"
echo "----------------------------------------"

REPORT_FILE="$ROOT_DIR/font-size-fix-report-$(date +%Y%m%d-%H%M%S).md"

cat > "$REPORT_FILE" << 'REPORT_HEADER'
# 字体大小统一修复报告

## 问题概述
前端代码中存在大量硬编码字体大小（fontSize: 数字），导致：
- ❌ 字体大小不统一，用户体验差
- ❌ 难以维护和修改全局字体
- ❌ 与设计系统规范不一致

## 标准字体系统（CSS变量）
```css
--font-size-xs:   12px  /* 极小文字，辅助说明 */
--font-size-sm:   13px  /* 小文字，次要信息 */
--font-size-base: 14px  /* 基准字号，正文 */
--font-size-md:   15px  /* 中等文字 */
--font-size-lg:   16px  /* 大文字，重要信息 */
--font-size-xl:   18px  /* 超大文字，标题 */
--font-size-xxl:  20px  /* 页面主标题 */
```

## 需要修复的文件清单

REPORT_HEADER

# 查找所有需要修复的文件
echo "正在生成详细修复清单..."
grep -rn "fontSize:\s*[0-9]" "$FRONTEND_DIR" --include="*.tsx" --include="*.ts" | \
  awk -F: '{print $1}' | sort | uniq -c | sort -rn >> "$REPORT_FILE"

cat >> "$REPORT_FILE" << 'REPORT_FOOTER'

## 修复步骤

### 自动修复（使用 sed 批量替换）
```bash
# 注意：执行前请先备份代码！

cd frontend/src

# 12px → var(--font-size-xs)
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/fontSize: 12/fontSize: "var(--font-size-xs)"/g'

# 13px → var(--font-size-sm)
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/fontSize: 13/fontSize: "var(--font-size-sm)"/g'

# 14px → var(--font-size-base)
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/fontSize: 14/fontSize: "var(--font-size-base)"/g'

# 16px → var(--font-size-lg)
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/fontSize: 16/fontSize: "var(--font-size-lg)"/g'

# 18px → var(--font-size-xl)
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/fontSize: 18/fontSize: "var(--font-size-xl)"/g'

# 20px → var(--font-size-xxl)
find . -name "*.tsx" -o -name "*.ts" | xargs sed -i '' 's/fontSize: 20/fontSize: "var(--font-size-xxl)"/g'
```

### 手动修复（推荐，更精确）
1. 在 VS Code 中打开上述文件
2. 搜索正则表达式：`fontSize:\s*\d+`
3. 根据上下文选择合适的 CSS 变量替换

## 预防措施

### ESLint 规则（添加到 .eslintrc）
```json
{
  "rules": {
    "no-restricted-syntax": [
      "warn",
      {
        "selector": "Property[key.name='fontSize'] > Literal[raw=/^[0-9]+$/]",
        "message": "禁止硬编码 fontSize，请使用 CSS 变量如 var(--font-size-base)"
      }
    ]
  }
}
```

### Code Review 检查项
- [ ] 所有字体大小使用 CSS 变量
- [ ] 所有颜色使用 CSS 变量
- [ ] 所有间距使用 CSS 变量

REPORT_FOOTER

echo -e "${GREEN}✓ 修复建议已生成：${REPORT_FILE}${NC}"

echo -e "\n${BLUE}步骤6: 提供快速修复选项${NC}"
echo "----------------------------------------"
read -p "是否现在执行自动修复？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}⚠️  即将修改代码文件，建议先提交当前改动到 Git${NC}"
    read -p "确认已备份代码？继续执行自动修复？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${GREEN}开始自动修复...${NC}"

        cd "$FRONTEND_DIR"

        # 12px → var(--font-size-xs)
        echo "修复 fontSize: 12..."
        find . -name "*.tsx" -type f -exec sed -i '' 's/fontSize: 12\([^0-9]\)/fontSize: "var(--font-size-xs)"\1/g' {} +

        # 13px → var(--font-size-sm)
        echo "修复 fontSize: 13..."
        find . -name "*.tsx" -type f -exec sed -i '' 's/fontSize: 13\([^0-9]\)/fontSize: "var(--font-size-sm)"\1/g' {} +

        # 14px → var(--font-size-base)
        echo "修复 fontSize: 14..."
        find . -name "*.tsx" -type f -exec sed -i '' 's/fontSize: 14\([^0-9]\)/fontSize: "var(--font-size-base)"\1/g' {} +

        # 16px → var(--font-size-lg)
        echo "修复 fontSize: 16..."
        find . -name "*.tsx" -type f -exec sed -i '' 's/fontSize: 16\([^0-9]\)/fontSize: "var(--font-size-lg)"\1/g' {} +

        # 18px → var(--font-size-xl)
        echo "修复 fontSize: 18..."
        find . -name "*.tsx" -type f -exec sed -i '' 's/fontSize: 18\([^0-9]\)/fontSize: "var(--font-size-xl)"\1/g' {} +

        # 20px → var(--font-size-xxl)
        echo "修复 fontSize: 20..."
        find . -name "*.tsx" -type f -exec sed -i '' 's/fontSize: 20\([^0-9]\)/fontSize: "var(--font-size-xxl)"\1/g' {} +

        echo -e "${GREEN}✓ 自动修复完成！${NC}"
        echo -e "${YELLOW}建议：${NC}"
        echo "  1. 检查修改的文件：git diff"
        echo "  2. 运行前端：npm run dev"
        echo "  3. 测试功能是否正常"
        echo "  4. 如有问题：git checkout . 恢复"
    else
        echo -e "${BLUE}已取消自动修复${NC}"
    fi
else
    echo -e "${BLUE}已跳过自动修复${NC}"
    echo "你可以查看生成的报告文件，手动进行修复"
fi

echo -e "\n${GREEN}=========================================="
echo "检查完成！"
echo "==========================================${NC}"
echo ""
echo "📄 详细报告：$REPORT_FILE"
echo "📊 硬编码字体数量：$HARDCODED_COUNT 处"
echo ""
echo "💡 提示：统一使用 CSS 变量可以："
echo "   • 一键修改全局字体大小"
echo "   • 保持设计一致性"
echo "   • 提升代码可维护性"
