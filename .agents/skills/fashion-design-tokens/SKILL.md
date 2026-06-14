---
name: fashion-design-tokens
description: 服装供应链系统前端 UI/UX 强制规范（Design Token 驱动）。当编写或修改 React/TypeScript 前端页面、Ant Design 组件、Modal 弹窗、颜色/字体/间距样式、小程序 wxss 样式时必须遵循。违反会导致 Code Review 失败。
version: 1.0.0
---

# 前端设计系统规范（强制执行）

> 本 skill 浓缩自 `设计系统完整规范-2026.md` + `开发指南.md` 设计章节。

## 1. 颜色系统（P0：纯色，拒绝渐变）

```css
/* ✅ 强制使用 CSS 变量（Design Token）*/
--primary-color: #2D7FF9;
--primary-hover: #1E6FE8;
--success-color: #52C41A;
--warning-color: #FAAD14;
--error-color: #F5222D;
--neutral-text: #1a1a1a;
--neutral-border: #E0E0E0;
```

### ❌ 绝对禁止
- ❌ 硬编码颜色值（如 `color: #2D7FF9`）→ 用 `var(--primary-color)`
- ❌ 渐变 `linear-gradient()` / `radial-gradient()`
- ❌ 阴影渐变
- ✅ 侧边栏纯深蓝 `#0b2d5c`（无渐变）
- ✅ 按钮纯色背景（无渐变）

## 2. 字体系统

```css
/* ✅ 全局默认字体（强制，禁止自定义 font-family，打印页除外）*/
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
             'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei',
             'Roboto', 'Helvetica Neue', 'Arial', sans-serif;
```

| 用途 | 字号 | 字重 |
|------|------|------|
| 正文基准 | 14px | normal |
| 字段标签 | 13px | 600 |
| 重要字段值 | 18px | 700 |
| 页面标题 | 20px+ | 700 |

**打印页特殊规则**：`font-family` 必须以 `serif` 结尾（**不能** `sans-serif`）—— macOS Safari bug。

## 3. 间距系统（P0：8 的倍数）

```css
--spacing-xs: 8px;
--spacing-sm: 12px;
--spacing-md: 16px;
--spacing-lg: 24px;
--spacing-xl: 32px;
```

- ✅ 用 8/16/24/32/48
- ❌ 禁止 10/15/20 等非标准值
- ✅ Modal 字段间距：24px（ModalFieldRow 默认）

## 4. Modal 弹窗（三级尺寸体系）

```tsx
/* ✅ 大窗口（60vw × 60vh）— 主要弹窗 */
<ResizableModal title="编辑生产订单" defaultWidth="60vw" defaultHeight="60vh">

/* ✅ 中窗口（40vw × 50vh）— 普通弹窗 */
<ResizableModal title="添加款式" defaultWidth="40vw" defaultHeight="50vh">

/* ✅ 小窗口（30vw × 40vh）— 简单弹窗 */
<ResizableModal title="确认操作" defaultWidth="30vw" defaultHeight="40vh">
```

| 尺寸 | 场景 |
|------|------|
| 60vw | 生产订单、裁剪单、对账单审核 |
| 40vw | 款式编辑、工厂管理、用户管理 |
| 30vw | 删除确认、备注输入、状态修改 |

### ❌ 绝对禁止
- ❌ 固定像素宽度（如 `600px`）
- ❌ 旧尺寸 `80vw × 85vh`

## 5. 🚨 带原因输入的确认弹窗 — 必须用 RejectReasonModal

> 背景：`modal.confirm()` + `Input.TextArea` 会导致按钮被遮挡、不可点击（autoSize TextArea 增高后覆盖 Footer）。

```tsx
// ❌ 禁止：modal.confirm + Input.TextArea
modal.confirm({
  content: <Input.TextArea autoSize onChange={(e) => { remark = e.target.value; }} />,
  onOk: async () => { await api.call(remark); },
});

// ✅ 正确：RejectReasonModal 组件
import RejectReasonModal from '@/components/common/RejectReasonModal';
const [pending, setPending] = useState<Item | null>(null);
const handleConfirm = async (reason: string) => {
  await api.delete(pending!.id, reason);
  setPending(null);
};
<RejectReasonModal
  open={pending !== null}
  title={`确认删除「${pending?.name}」？`}
  fieldLabel="删除原因"
  required={true}        // 默认 true
  okDanger={true}        // 默认 true（红色按钮）
  loading={loading}
  onOk={handleConfirm}
  onCancel={() => setPending(null)}
/>
```

## 6. 按钮规范

- 统一默认 `middle` 尺寸，**❌ 禁止混用 small/middle**
- 主按钮纯色背景（Token 色）
- 危险按钮：`okDanger={true}`（红色）

## 7. 表格规范

- 使用 `SortableColumn`（通用排序列组件）做列排序
- 列宽用百分比或 `ResizableTable`（可拖拽列宽）
- 工序单价展示用 `HorizontalProgressPriceView`

## 8. 小程序 wxss 特殊规则

```css
/* ✅ 进度条样式仅在 app.wxss 全局定义一次 */
/* ❌ 禁止：页面 wxss 重复定义进度条样式 */
/* ❌ 禁止：使用紫色渐变 #667eea → #764ba2 */
/* ✅ 当前节点用 app.wxss 统一样式，不单独定义 */
```

## 9. WebSocket 规范（P0）

- ❌ **禁止全局/根级 WebSocket 通知组件**（已下线，禁止恢复）
- ✅ WebSocket 仅用于"当前页面明确需要的实时刷新"或"操作人本人定向提醒"
- ✅ 页面级用 `useWebSocket()` hook，**不放应用根节点常驻**
- 后端默认 `sendToUser(operatorId, ...)`：谁操作谁收到

## 10. 改前端代码前自检

- [ ] 颜色用了 `var(--xxx)` 吗？（不是硬编码 #xxx）
- [ ] 有渐变吗？（必须删掉）
- [ ] 间距是 8 的倍数吗？（不是就改）
- [ ] Modal 尺寸是 60/40/30vw 吗？（不是就改）
- [ ] 确认弹窗带输入框？→ 用 RejectReasonModal，不是 modal.confirm
- [ ] 打印页 font-family 以 serif 结尾吗？
- [ ] 新增 WebSocket 监听？→ 页面级，不是根级
