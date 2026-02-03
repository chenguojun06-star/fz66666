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

  35 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/warehouse/pages/MaterialInventory/index.tsx
  32 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/warehouse/pages/FinishedInventory/index.tsx
  31 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/TemplateCenter/index.tsx
  20 /Users/guojunmini4/Documents/服装66666/frontend/src/components/common/HorizontalProgressPriceView.tsx
  13 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/PatternProduction/index.tsx
  11 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/CoverImageUpload.tsx
   9 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfoList/components/StyleStatsCard.tsx
   9 /Users/guojunmini4/Documents/服装66666/frontend/src/components/common/StylePrintModal.tsx
   8 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/MaterialPurchaseDetail/index.tsx
   6 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/List/components/OrderTable.tsx
   6 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/Cutting/index.tsx
   6 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/finance/pages/FinanceDashboard/index.tsx
   5 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/ProgressDetail/components/OrderProgressCard.tsx
   5 /Users/guojunmini4/Documents/服装66666/frontend/src/components/common/DashboardLineChart/index.tsx
   4 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/List/components/OrderDetailModal.tsx
   4 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/dashboard/components/ScanCountChart/index.tsx
   4 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/dashboard/components/OrderCuttingChart/index.tsx
   4 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/StyleBasicInfoForm.tsx
   3 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/ProgressDetail/components/CuttingBundleTable.tsx
   3 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/OrderFlow/components/StylePatternSimpleTab.tsx
   3 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/StyleProductionTab.tsx
   3 /Users/guojunmini4/Documents/服装66666/frontend/src/components/common/NodeDetailModal.tsx
   3 /Users/guojunmini4/Documents/服装66666/frontend/src/components/common/LiquidProgressLottie.tsx
   3 /Users/guojunmini4/Documents/服装66666/frontend/src/components/Layout/index.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/warehouse/pages/Dashboard/index.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/system/pages/System/UserList/index.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/system/pages/System/UserApproval/index.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/system/pages/System/RoleList/index.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/OrderFlow/index.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/MaterialPurchase/components/PurchaseModal/PurchaseCreateForm.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/finance/pages/FinanceCenter/DashboardContent.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/StyleProcessTab.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/StyleBomTab.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/OrderManagement/index.tsx
   2 /Users/guojunmini4/Documents/服装66666/frontend/src/components/StyleAssets.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/system/pages/System/SystemLogs/index.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/system/pages/System/DictManage/index.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/ProgressDetail/index.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/ProgressDetail/index-NEW.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/List/index.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/production/pages/Production/List/hooks/useOrderActions.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/finance/pages/Finance/PaymentApproval/index.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/dashboard/components/DeliveryAlert.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/StyleSizeTab.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/StyleSecondaryProcessTab.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/StyleColorSizeTable.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/DataCenter/index.tsx
   1 /Users/guojunmini4/Documents/服装66666/frontend/src/components/common/ModalContentLayout.tsx

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

