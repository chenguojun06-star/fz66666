#!/bin/bash

# 组件规范违规自动检查脚本
# 使用方法: ./check-component-violations.sh

FRONTEND_DIR="./frontend/src/modules"
REPORT_FILE="./frontend/组件规范违规详细清单-$(date +%Y%m%d-%H%M%S).md"

echo "🔍 组件规范违规自动检查"
echo "================================"
echo ""

# 创建报告文件
cat > "$REPORT_FILE" << 'EOF'
# 组件规范违规详细清单

**扫描时间**: $(date '+%Y-%m-%d %H:%M:%S')
**扫描范围**: frontend/src/modules
**参考规范**: [通用组件使用规范.md](./通用组件使用规范.md)

---

## 📊 违规统计

EOF

# 1. 检查硬编码颜色
echo "1️⃣ 检查硬编码颜色..."
HARDCODED_COLORS=$(cd "$FRONTEND_DIR" && grep -r "color.*#" --include="*.tsx" --include="*.ts" \
  | grep -v "border\|background\|index-backup\|var(--\|\/\/" \
  | grep -E "color.*['\"]#[0-9A-Fa-f]{3,6}" \
  | wc -l | tr -d ' ')
echo "   发现 $HARDCODED_COLORS 处硬编码颜色"

# 2. 检查弹窗尺寸
echo "2️⃣ 检查弹窗尺寸规范..."
NON_STANDARD_MODALS=$(cd "$FRONTEND_DIR" && grep -r "defaultWidth\|defaultHeight" --include="*.tsx" \
  | grep -v "60vw\|40vw\|30vw\|60vh\|50vh\|40vh" \
  | wc -l | tr -d ' ')
echo "   发现 $NON_STANDARD_MODALS 处非标准弹窗尺寸"

# 3. 检查操作列
echo "3️⃣ 检查表格操作列..."
CUSTOM_ACTION_COLS=$(cd "$FRONTEND_DIR" && grep -r "title.*操作" --include="*.tsx" -A 3 \
  | grep "render:" \
  | grep -v "RowActions" \
  | wc -l | tr -d ' ')
echo "   发现 $CUSTOM_ACTION_COLS 处未使用 RowActions"

# 4. 检查间距规范
echo "4️⃣ 检查间距规范..."
NON_STANDARD_SPACING=$(cd "$FRONTEND_DIR" && grep -rE "margin|padding" --include="*.tsx" \
  | grep -E ":\s*[0-9]+(px|rem)" \
  | grep -vE ":\s*(0|8|16|24|32|40|48|56|64)(px|rem)" \
  | wc -l | tr -d ' ')
echo "   发现 $NON_STANDARD_SPACING 处非标准间距（不是8的倍数）"

# 5. 检查渐变使用
echo "5️⃣ 检查渐变使用..."
GRADIENTS=$(cd "$FRONTEND_DIR" && grep -r "linear-gradient\|radial-gradient" --include="*.tsx" --include="*.css" \
  | wc -l | tr -d ' ')
echo "   发现 $GRADIENTS 处使用渐变（禁止）"

# 生成报告
cat >> "$REPORT_FILE" << EOF

| 违规类型 | 数量 | 严重程度 | 优先级 |
|---------|------|----------|--------|
| 硬编码颜色 | $HARDCODED_COLORS | 🔴 高 | P0 |
| 非标准弹窗尺寸 | $NON_STANDARD_MODALS | 🟡 中 | P1 |
| 操作列未使用 RowActions | $CUSTOM_ACTION_COLS | 🟡 中 | P1 |
| 非标准间距 | $NON_STANDARD_SPACING | 🟢 低 | P2 |
| 使用渐变 | $GRADIENTS | 🔴 高 | P0 |

---

## 🔴 P0 紧急修复

### 1. 硬编码颜色（$HARDCODED_COLORS 处）

EOF

# 详细列出硬编码颜色
echo "" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
grep -rn "color.*#" "$FRONTEND_DIR" --include="*.tsx" \
  | grep -v "border\|background\|index-backup\|var(--\|\/\/" \
  | grep -E "color.*['\"]#[0-9A-Fa-f]{3,6}" \
  | head -50 >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"

cat >> "$REPORT_FILE" << EOF

**修复规则**:
- \`#999\` / \`#666\` → \`var(--neutral-text-secondary)\`
- \`#ccc\` / \`#ddd\` → \`var(--neutral-text-disabled)\`
- \`#262626\` / \`#1a1a1a\` → \`var(--neutral-text)\`
- \`#f5222d\` → \`var(--error-color)\`
- \`#52c41a\` → \`var(--success-color)\`
- \`#faad14\` → \`var(--warning-color)\`
- \`#2d7ff9\` → \`var(--primary-color)\`

---

### 2. 渐变使用（$GRADIENTS 处）

EOF

# 详细列出渐变使用
echo "" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
grep -rn "linear-gradient\|radial-gradient" "$FRONTEND_DIR" --include="*.tsx" --include="*.css" \
  | head -30 >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"

cat >> "$REPORT_FILE" << EOF

**修复方案**: 全部改为纯色背景，使用 CSS 变量

---

## 🟡 P1 重要修复

### 3. 非标准弹窗尺寸（$NON_STANDARD_MODALS 处）

EOF

# 详细列出非标准弹窗
echo "" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
grep -rn "defaultWidth\|defaultHeight" "$FRONTEND_DIR" --include="*.tsx" \
  | grep -v "60vw\|40vw\|30vw\|60vh\|50vh\|40vh" \
  | head -30 >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"

cat >> "$REPORT_FILE" << EOF

**标准尺寸**:
- 大窗口: \`defaultWidth="60vw" defaultHeight="60vh"\`
- 中窗口: \`defaultWidth="40vw" defaultHeight="50vh"\`
- 小窗口: \`defaultWidth="30vw" defaultHeight="40vh"\`

---

### 4. 表格操作列（$CUSTOM_ACTION_COLS 处）

EOF

# 详细列出操作列
echo "" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
grep -rn "title.*操作" "$FRONTEND_DIR" --include="*.tsx" -B 2 -A 5 \
  | grep -v "RowActions" \
  | head -50 >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"

cat >> "$REPORT_FILE" << EOF

**标准用法**:
\`\`\`tsx
{
  title: '操作',
  key: 'action',
  width: 150,
  fixed: 'right' as const,
  render: (_: any, record: any) => (
    <RowActions
      actions={[
        { key: 'edit', label: '编辑', primary: true, onClick: () => {} },
        { key: 'delete', label: '删除', danger: true, onClick: () => {} },
      ]}
    />
  )
}
\`\`\`

---

## 🟢 P2 优化建议

### 5. 非标准间距（$NON_STANDARD_SPACING 处）

**标准间距**: 只允许 0, 8, 16, 24, 32, 40, 48, 56, 64 (8的倍数)

EOF

# 详细列出非标准间距（前20个）
echo "" >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"
grep -rnE "margin|padding" "$FRONTEND_DIR" --include="*.tsx" \
  | grep -E ":\s*[0-9]+(px|rem)" \
  | grep -vE ":\s*(0|8|16|24|32|40|48|56|64)(px|rem)" \
  | head -20 >> "$REPORT_FILE"
echo "\`\`\`" >> "$REPORT_FILE"

cat >> "$REPORT_FILE" << EOF

---

## 📋 修复优先级

### Phase 1: 紧急修复（今天完成）
- [ ] 修复所有硬编码颜色（$HARDCODED_COLORS 处）
- [ ] 删除所有渐变使用（$GRADIENTS 处）

### Phase 2: 重要修复（本周完成）
- [ ] 统一弹窗尺寸（$NON_STANDARD_MODALS 处）
- [ ] 统一表格操作列（$CUSTOM_ACTION_COLS 处）

### Phase 3: 优化提升（下周完成）
- [ ] 修复非标准间距（$NON_STANDARD_SPACING 处）

---

## 🔧 自动修复脚本

\`\`\`bash
# 批量替换常见硬编码颜色
find frontend/src/modules -name "*.tsx" -type f -exec sed -i '' \\
  -e "s/color: '#999'/color: 'var(--neutral-text-secondary)'/g" \\
  -e "s/color: '#666'/color: 'var(--neutral-text-secondary)'/g" \\
  -e "s/color: '#ccc'/color: 'var(--neutral-text-disabled)'/g" \\
  -e "s/color: '#262626'/color: 'var(--neutral-text)'/g" \\
  -e "s/color: '#f5222d'/color: 'var(--error-color)'/g" \\
  -e "s/color: '#52c41a'/color: 'var(--success-color)'/g" \\
  {} +
\`\`\`

---

**生成时间**: $(date '+%Y-%m-%d %H:%M:%S')  
**工具**: check-component-violations.sh
EOF

echo ""
echo "✅ 检查完成！"
echo ""
echo "📊 违规统计:"
echo "   - 硬编码颜色: $HARDCODED_COLORS 处"
echo "   - 非标准弹窗: $NON_STANDARD_MODALS 处"
echo "   - 自定义操作列: $CUSTOM_ACTION_COLS 处"
echo "   - 非标准间距: $NON_STANDARD_SPACING 处"
echo "   - 使用渐变: $GRADIENTS 处"
echo ""
echo "📝 详细报告已生成: $REPORT_FILE"
echo ""
