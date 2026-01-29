#!/bin/bash

# 设计规范违规自动检查脚本 v2.0
# 用途：检查并报告不符合设计规范的代码
# 版本：2.0（更新：2026-01-29）
# 新增：弹窗尺寸检查、渐变检查

set -e

FRONTEND_DIR="frontend/src"
LOG_FILE="logs/design-violations-$(date +%Y%m%d-%H%M%S).txt"
mkdir -p logs

echo "🎨 设计规范违规检查工具 v2.0"
echo "================================================"
echo "📅 检查时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 颜色代码
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 初始化计数器
TOTAL_ISSUES=0
FIXED_ISSUES=0

# 创建报告文件
echo "设计规范违规检查报告" > $LOG_FILE
echo "检查时间: $(date '+%Y-%m-%d %H:%M:%S')" >> $LOG_FILE
echo "===============================================" >> $LOG_FILE
echo "" >> $LOG_FILE

# ============================================
# 1. 检查硬编码颜色（排除CSS文件）
# ============================================
echo "1️⃣  检查硬编码颜色..."
echo "----------------------"

HARDCODED_COLORS=$(grep -rn '#[0-9A-Fa-f]\{6\}' $FRONTEND_DIR \
  --include="*.tsx" --include="*.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  | grep -v 'var(--' \
  | grep -v '// @design-system-exempt' \
  | grep -v 'tsconfig' \
  | wc -l | tr -d ' ')

if [ "$HARDCODED_COLORS" -gt 0 ]; then
  echo -e "${RED}❌ 发现 $HARDCODED_COLORS 处硬编码颜色${NC}"
  echo "❌ 硬编码颜色: $HARDCODED_COLORS 处" >> $LOG_FILE
  grep -rn '#[0-9A-Fa-f]\{6\}' $FRONTEND_DIR \
    --include="*.tsx" --include="*.ts" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    | grep -v 'var(--' \
    | grep -v '// @design-system-exempt' \
    | grep -v 'tsconfig' \
    | head -20 | tee -a $LOG_FILE
  TOTAL_ISSUES=$((TOTAL_ISSUES + HARDCODED_COLORS))
  echo "" >> $LOG_FILE
  echo "💡 建议：将颜色替换为CSS变量" >> $LOG_FILE
  echo "   #2D7FF9 → var(--primary-color)" >> $LOG_FILE
  echo "   #52C41A → var(--success-color)" >> $LOG_FILE
  echo "" >> $LOG_FILE
else
  echo -e "${GREEN}✅ 未发现硬编码颜色${NC}"
  echo "✅ 硬编码颜色: 0 处" >> $LOG_FILE
fi
echo ""

# ============================================
# 2. 检查渐变使用（禁止彩色渐变）
# ============================================
echo "2️⃣  检查渐变使用（禁止）..."
echo "----------------------"

GRADIENTS=$(grep -rn 'linear-gradient\|radial-gradient' $FRONTEND_DIR \
  --include="*.tsx" --include="*.ts" --include="*.css" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  | grep -v '// @design-system-exempt' \
  | wc -l | tr -d ' ')

if [ "$GRADIENTS" -gt 0 ]; then
  echo -e "${RED}❌ 发现 $GRADIENTS 处渐变使用${NC}"
  echo "❌ 渐变使用: $GRADIENTS 处" >> $LOG_FILE
  grep -rn 'linear-gradient\|radial-gradient' $FRONTEND_DIR \
    --include="*.tsx" --include="*.ts" --include="*.css" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    | grep -v '// @design-system-exempt' \
    | head -10 | tee -a $LOG_FILE
  TOTAL_ISSUES=$((TOTAL_ISSUES + GRADIENTS))
  echo "" >> $LOG_FILE
  echo "💡 建议：使用纯色背景" >> $LOG_FILE
  echo "   background: linear-gradient(...) → background: var(--primary-color)" >> $LOG_FILE
  echo "" >> $LOG_FILE
else
  echo -e "${GREEN}✅ 未发现渐变使用${NC}"
  echo "✅ 渐变使用: 0 处" >> $LOG_FILE
fi
echo ""

# ============================================
# 3. 检查Modal尺寸（应为60vw/40vw/30vw）
# ============================================
echo "3️⃣  检查Modal尺寸..."
echo "----------------------"

# 检查非ResizableModal
NON_RESIZABLE_MODALS=$(grep -rn '<Modal' $FRONTEND_DIR \
  --include="*.tsx" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  | grep -v 'ResizableModal' \
  | grep -v '// @design-system-exempt' \
  | wc -l | tr -d ' ')

# 检查80vw/85vh（应改为60vw/60vh）
OLD_MODAL_SIZE=$(grep -rn 'defaultWidth="80vw"\|defaultHeight="85vh"' $FRONTEND_DIR \
  --include="*.tsx" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  | wc -l | tr -d ' ')

TOTAL_MODAL_ISSUES=$((NON_RESIZABLE_MODALS + OLD_MODAL_SIZE))

if [ "$TOTAL_MODAL_ISSUES" -gt 0 ]; then
  echo -e "${RED}❌ 发现 $TOTAL_MODAL_ISSUES 处Modal尺寸问题${NC}"
  echo "❌ Modal尺寸问题: $TOTAL_MODAL_ISSUES 处" >> $LOG_FILE

  if [ "$NON_RESIZABLE_MODALS" -gt 0 ]; then
    echo -e "   ${YELLOW}未使用ResizableModal: $NON_RESIZABLE_MODALS 处${NC}"
    echo "   未使用ResizableModal: $NON_RESIZABLE_MODALS 处" >> $LOG_FILE
    grep -rn '<Modal' $FRONTEND_DIR \
      --include="*.tsx" \
      --exclude-dir=node_modules \
      --exclude-dir=dist \
      | grep -v 'ResizableModal' \
      | grep -v '// @design-system-exempt' \
      | head -10 | tee -a $LOG_FILE
  fi

  if [ "$OLD_MODAL_SIZE" -gt 0 ]; then
    echo -e "   ${YELLOW}旧尺寸80vw/85vh: $OLD_MODAL_SIZE 处（应改为60vw/40vw/30vw）${NC}"
    echo "   旧尺寸80vw/85vh: $OLD_MODAL_SIZE 处" >> $LOG_FILE
  fi

  TOTAL_ISSUES=$((TOTAL_ISSUES + TOTAL_MODAL_ISSUES))
  echo "" >> $LOG_FILE
  echo "💡 建议：使用三级尺寸体系" >> $LOG_FILE
  echo "   大窗口：defaultWidth='60vw' defaultHeight='60vh'" >> $LOG_FILE
  echo "   中窗口：defaultWidth='40vw' defaultHeight='50vh'" >> $LOG_FILE
  echo "   小窗口：defaultWidth='30vw' defaultHeight='40vh'" >> $LOG_FILE
  echo "" >> $LOG_FILE
else
  echo -e "${GREEN}✅ Modal尺寸使用正确${NC}"
  echo "✅ Modal尺寸: 0 处问题" >> $LOG_FILE
fi
echo ""

# ============================================
# 4. 检查自定义font-family（排除打印页面）
# ============================================
echo "4️⃣  检查自定义字体..."
echo "----------------------"

CUSTOM_FONTS=$(grep -rn 'font-family' $FRONTEND_DIR \
  --include="*.tsx" --include="*.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  | grep -v 'global.css' \
  | grep -v '打印' \
  | grep -v 'Print' \
  | grep -v '// @design-system-exempt' \
  | wc -l | tr -d ' ')

if [ "$CUSTOM_FONTS" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  发现 $CUSTOM_FONTS 处自定义字体${NC}"
  echo "⚠️  自定义字体: $CUSTOM_FONTS 处" >> $LOG_FILE
  grep -rn 'font-family' $FRONTEND_DIR \
    --include="*.tsx" --include="*.ts" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    | grep -v 'global.css' \
    | grep -v '打印' \
    | grep -v 'Print' \
    | grep -v '// @design-system-exempt' \
    | head -10 | tee -a $LOG_FILE
  TOTAL_ISSUES=$((TOTAL_ISSUES + CUSTOM_FONTS))
  echo "" >> $LOG_FILE
  echo "💡 建议：移除font-family，使用全局字体" >> $LOG_FILE
  echo "   打印页面可添加豁免注释：// @design-system-exempt: 打印专用" >> $LOG_FILE
  echo "" >> $LOG_FILE
else
  echo -e "${GREEN}✅ 未发现自定义字体${NC}"
  echo "✅ 自定义字体: 0 处" >> $LOG_FILE
fi
echo ""

# ============================================
# 5. 检查非标准间距（10px, 15px, 20px等）
# ============================================
echo "5️⃣  检查非标准间距..."
echo "----------------------"

NON_STANDARD_SPACING=$(grep -rn 'padding:\|margin:\|gap:' $FRONTEND_DIR \
  --include="*.tsx" --include="*.ts" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  | grep -E '(10|15|20|28|40)px' \
  | grep -v '// @design-system-exempt' \
  | wc -l | tr -d ' ')

if [ "$NON_STANDARD_SPACING" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  发现 $NON_STANDARD_SPACING 处非标准间距${NC}"
  echo "⚠️  非标准间距: $NON_STANDARD_SPACING 处" >> $LOG_FILE
  grep -rn 'padding:\|margin:\|gap:' $FRONTEND_DIR \
    --include="*.tsx" --include="*.ts" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    | grep -E '(10|15|20|28|40)px' \
    | grep -v '// @design-system-exempt' \
    | head -10 | tee -a $LOG_FILE
  TOTAL_ISSUES=$((TOTAL_ISSUES + NON_STANDARD_SPACING))
  echo "" >> $LOG_FILE
  echo "💡 建议：使用8的倍数" >> $LOG_FILE
  echo "   10px → 8px/12px" >> $LOG_FILE
  echo "   15px → 12px/16px" >> $LOG_FILE
  echo "   20px → 16px/24px" >> $LOG_FILE
  echo "" >> $LOG_FILE
else
  echo -e "${GREEN}✅ 未发现非标准间距${NC}"
  echo "✅ 非标准间距: 0 处" >> $LOG_FILE
fi
echo ""

# ============================================
# 6. 检查按钮尺寸混用
# ============================================
echo "6️⃣  检查按钮尺寸..."
echo "----------------------"

SMALL_BUTTONS=$(grep -rn 'size="small"' $FRONTEND_DIR \
  --include="*.tsx" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  | grep -v 'Table' \
  | grep -v 'type="link"' \
  | grep -v '// @design-system-exempt' \
  | wc -l | tr -d ' ')

if [ "$SMALL_BUTTONS" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  发现 $SMALL_BUTTONS 处非表格内使用small按钮${NC}"
  echo "⚠️  非表格内small按钮: $SMALL_BUTTONS 处" >> $LOG_FILE
  grep -rn 'size="small"' $FRONTEND_DIR \
    --include="*.tsx" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    | grep -v 'Table' \
    | grep -v 'type="link"' \
    | grep -v '// @design-system-exempt' \
    | head -10 | tee -a $LOG_FILE
  TOTAL_ISSUES=$((TOTAL_ISSUES + SMALL_BUTTONS))
  echo "" >> $LOG_FILE
  echo "💡 建议：默认使用middle（32px）" >> $LOG_FILE
  echo "   small仅用于表格行内操作（type='link' size='small'）" >> $LOG_FILE
  echo "" >> $LOG_FILE
else
  echo -e "${GREEN}✅ 按钮尺寸使用正确${NC}"
  echo "✅ 按钮尺寸: 0 处问题" >> $LOG_FILE
fi
echo ""

# ============================================
# 7. 检查未使用ModalContentLayout的Modal
# ============================================
echo "7️⃣  检查Modal内容布局..."
echo "----------------------"

MODALS_WITHOUT_LAYOUT=$(grep -rl 'ResizableModal' $FRONTEND_DIR \
  --include="*.tsx" \
  --exclude-dir=node_modules \
  --exclude-dir=dist \
  | xargs grep -L 'ModalContentLayout\|ModalHeaderCard' \
  | wc -l | tr -d ' ')

if [ "$MODALS_WITHOUT_LAYOUT" -gt 0 ]; then
  echo -e "${YELLOW}⚠️  发现 $MODALS_WITHOUT_LAYOUT 个Modal未使用标准布局${NC}"
  echo "⚠️  Modal未使用标准布局: $MODALS_WITHOUT_LAYOUT 个" >> $LOG_FILE
  grep -rl 'ResizableModal' $FRONTEND_DIR \
    --include="*.tsx" \
    --exclude-dir=node_modules \
    --exclude-dir=dist \
    | xargs grep -L 'ModalContentLayout\|ModalHeaderCard' \
    | head -10 | tee -a $LOG_FILE
  TOTAL_ISSUES=$((TOTAL_ISSUES + MODALS_WITHOUT_LAYOUT))
  echo "" >> $LOG_FILE
  echo "💡 建议：使用ModalContentLayout组件" >> $LOG_FILE
  echo "   - ModalHeaderCard: 头部灰色卡片" >> $LOG_FILE
  echo "   - ModalField/ModalFieldRow: 字段布局" >> $LOG_FILE
  echo "" >> $LOG_FILE
else
  echo -e "${GREEN}✅ 所有Modal使用标准布局${NC}"
  echo "✅ Modal布局: 0 处问题" >> $LOG_FILE
fi
echo ""

# ============================================
# 8. 生成汇总报告
# ============================================
echo "================================================" | tee -a $LOG_FILE
echo "📊 检查汇总" | tee -a $LOG_FILE
echo "================================================" | tee -a $LOG_FILE
echo "" | tee -a $LOG_FILE
echo "总问题数: $TOTAL_ISSUES" | tee -a $LOG_FILE
echo "已修复数: $FIXED_ISSUES" | tee -a $LOG_FILE
echo "待修复数: $((TOTAL_ISSUES - FIXED_ISSUES))" | tee -a $LOG_FILE
echo "" | tee -a $LOG_FILE

echo "详细分类统计：" | tee -a $LOG_FILE
echo "- 硬编码颜色: $HARDCODED_COLORS 处 (🔴 P0)" | tee -a $LOG_FILE
echo "- 渐变使用: $GRADIENTS 处 (🔴 P0)" | tee -a $LOG_FILE
echo "- Modal尺寸: $TOTAL_MODAL_ISSUES 处 (🔴 P0)" | tee -a $LOG_FILE
echo "- 非表格small按钮: $SMALL_BUTTONS 处 (🟡 P1)" | tee -a $LOG_FILE
echo "- 非标准间距: $NON_STANDARD_SPACING 处 (🟡 P1)" | tee -a $LOG_FILE
echo "- Modal布局: $MODALS_WITHOUT_LAYOUT 处 (🟡 P2)" | tee -a $LOG_FILE
echo "- 自定义字体: $CUSTOM_FONTS 处 (🟢 P3)" | tee -a $LOG_FILE
echo "" | tee -a $LOG_FILE

if [ "$TOTAL_ISSUES" -eq 0 ]; then
  echo -e "${GREEN}🎉 恭喜！所有代码符合设计规范！${NC}" | tee -a $LOG_FILE
  exit 0
else
  echo -e "${YELLOW}⚠️  发现 $TOTAL_ISSUES 处违规，请按照优先级修复${NC}" | tee -a $LOG_FILE
  echo "" | tee -a $LOG_FILE
  echo "修复优先级：" | tee -a $LOG_FILE
  echo "  🔴 P0（立即修复）: 硬编码颜色、渐变、Modal尺寸" | tee -a $LOG_FILE
  echo "  🟡 P1（本周修复）: 按钮尺寸、间距规范" | tee -a $LOG_FILE
  echo "  🟢 P2-P3（下周）: Modal布局、自定义字体" | tee -a $LOG_FILE
  echo "" | tee -a $LOG_FILE
  echo "📄 详细报告: $LOG_FILE" | tee -a $LOG_FILE
  echo "" | tee -a $LOG_FILE
  echo "📚 参考文档:" | tee -a $LOG_FILE
  echo "   - 设计系统完整规范-2026.md" | tee -a $LOG_FILE
  echo "   - 开发指南.md（设计系统规范章节）" | tee -a $LOG_FILE
  echo "" | tee -a $LOG_FILE
  exit 1
fi
