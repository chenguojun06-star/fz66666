# P0 - 打印中文不显示问题

## 问题描述
所有打印组件（标签打印、洗水唛打印、裁剪单打印、生产制单打印等）在打印预览和打印输出中，中文字符全部不显示，只显示数字、字母和符号。

## 根因
**`font-family` 最终回退使用 `sans-serif` 导致中文无法渲染。**

在 macOS 系统上（特别是未安装 PingFang SC 和 Microsoft YaHei 字体的环境）：
- `sans-serif` 回退到 **Helvetica** → Helvetica 没有中文字符 → 中文显示为空白
- `serif` 回退到 **Songti SC（宋体）** → 有中文字符 → 中文正常显示

当 `font-family` 列表中所有指定的中文字体（PingFang SC、Microsoft YaHei 等）在系统上都不存在时，浏览器使用最终回退字体。`sans-serif` 在 macOS 上映射到 Helvetica，而 Helvetica 不包含任何中文字符。

## 影响范围
所有使用 `safePrint()` 或内联 `font-family` 的打印组件，共涉及 13+ 个文件。

## 修复方案
1. **`safePrint.ts`** — 注入 `* { font-family: ... serif !important; }` 强制所有元素使用 serif 回退
2. **所有打印组件的 `font-family`** — 末尾从 `sans-serif` 改为 `serif`
3. **暗色主题修复** — 注入 `color-scheme: light` + `color: #000 !important` + `-webkit-text-fill-color: #000 !important`

## 修复的文件列表
- `frontend/src/utils/safePrint.ts`
- `frontend/src/components/common/StylePrintModal/index.tsx`
- `frontend/src/components/common/StylePrintModal/printTemplate.ts`
- `frontend/src/components/common/CuttingSheetPrintModal.tsx`
- `frontend/src/modules/production/pages/Production/List/components/LabelPrintModal.tsx`
- `frontend/src/modules/production/pages/Production/WashLabel/components/WashCareLabelModal.tsx`
- `frontend/src/modules/production/pages/Production/WashLabel/components/WashLabelPrintModal.tsx`
- `frontend/src/modules/production/pages/Production/WashLabel/components/WashLabelBatchPrintModal.tsx`
- `frontend/src/modules/production/pages/Production/Cutting/hooks/useCuttingPrint.ts`
- `frontend/src/modules/warehouse/pages/MaterialInventory/components/MaterialOutboundPrintModal.tsx`
- `frontend/src/modules/warehouse/pages/FinishedInventory/outstockPrintHelper.ts`
- `frontend/src/modules/finance/pages/FinanceCenter/FactoryStatementPrintModal.tsx`
- `frontend/src/modules/finance/pages/Finance/PayrollOperatorSummary/WageSlipPrintModal.tsx`
- `frontend/src/modules/basic/pages/DataCenter/buildProductionSheetHtml.ts`
- `frontend/src/modules/production/pages/Production/MaterialPurchase/utils/index.ts`
- `frontend/src/modules/warehouse/pages/MaterialInventory/hooks/useMaterialInventoryData.ts`

## 规则（以后必须遵守）
**打印相关的 `font-family` 必须以 `serif` 结尾，不能用 `sans-serif`。**

```css
/* ❌ 错误 - sans-serif 在 macOS 上回退到 Helvetica，无中文字符 */
font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif;

/* ✅ 正确 - serif 在 macOS 上回退到 Songti SC，有中文字符 */
font-family: 'Heiti SC', 'Songti SC', 'Hiragino Sans GB', 'STSong', 'Arial Unicode MS', serif;
```

## 注意事项
- 主应用 UI 的 `font-family` 仍然使用 `sans-serif`，因为主应用有 Ant Design 的字体回退机制，不受影响
- 此问题只在**打印场景**出现，因为打印使用独立的 HTML 文档，不继承主应用的字体配置
- 如果将来部署到 Windows 服务器，Windows 上 `sans-serif` 回退到 Arial（无中文），同样会有此问题，所以必须用 `serif`
