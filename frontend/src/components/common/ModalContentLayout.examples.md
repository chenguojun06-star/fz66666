# ModalContentLayout 使用指南

## 📋 组件概述

`ModalContentLayout` 是一套通用的弹窗内容布局组件库，统一全站弹窗的字体、间距、布局等视觉规范。

**核心设计原则**：
- ✅ 只统一样式（字体、颜色、间距、布局），不影响业务内容
- ✅ 组件化拆分，灵活组合
- ✅ 响应式支持（`isMobile` 参数）
- ✅ 可扩展样式（`style` prop）

---

## 🎨 组件列表

### 1. ModalHeaderCard - 头部卡片容器
灰色背景的信息卡片，通常放在弹窗顶部。

```tsx
import { ModalHeaderCard } from '@/components/common/ModalContentLayout';

<ModalHeaderCard isMobile={false}>
  {/* 放置左侧图片、右侧信息等内容 */}
</ModalHeaderCard>
```

**Props**:
- `children`: 内容
- `isMobile?`: 是否移动端（影响间距）
- `style?`: 自定义样式

---

### 2. ModalField - 普通字段显示
标签 + 值的组合，标准字段显示格式。

```tsx
import { ModalField } from '@/components/common/ModalContentLayout';

<ModalField label="订单数量" value={orderQuantity || '-'} />
<ModalField 
  label="生产进度" 
  value="85%" 
  valueColor="#059669" 
/>
```

**Props**:
- `label`: 字段标签
- `value`: 字段值
- `labelSize?`: 标签字号（默认 13px）
- `valueSize?`: 值字号（默认 14px）
- `valueWeight?`: 值字重（默认 600）
- `valueColor?`: 值颜色（默认 #111827）
- `style?`: 自定义样式

**默认样式**:
- 标签：13px, #6b7280, 600 字重
- 值：14px, #111827, 600 字重

---

### 3. ModalPrimaryField - 重点字段
更大字号的重要字段（如订单号、款号）。

```tsx
import { ModalPrimaryField } from '@/components/common/ModalContentLayout';

<ModalPrimaryField label="订单号" value="PO20260122001" />
<ModalPrimaryField label="加工厂" value="XX服装厂" valueSize={16} />
```

**Props**:
- `label`: 字段标签
- `value`: 字段值
- `valueSize?`: 值字号（默认 18px）
- `style?`: 自定义样式

**默认样式**:
- 标签：14px, #6b7280, 600 字重
- 值：18px, #1f2937, 700 字重, 0.5px 字间距

---

### 4. ModalFieldRow - 字段横向排列
将多个字段横向排列，自动换行。

```tsx
import { ModalFieldRow, ModalField } from '@/components/common/ModalContentLayout';

<ModalFieldRow gap={24} isMobile={false}>
  <ModalField label="款号" value="ST001" />
  <ModalField label="款名" value="春季新款" />
  <ModalField label="颜色" value="黑色 / 白色" />
</ModalFieldRow>
```

**Props**:
- `children`: 子元素（通常是 ModalField）
- `isMobile?`: 是否移动端
- `gap?`: 字段间距（默认 24px）
- `style?`: 自定义样式

---

### 5. ModalFieldGrid - 网格字段布局
适合大量字段的网格布局（自动分列）。

```tsx
import { ModalFieldGrid, ModalField } from '@/components/common/ModalContentLayout';

<ModalFieldGrid columns={3} isMobile={false}>
  <ModalField label="订单数量" value="500" />
  <ModalField label="完成数量" value="450" />
  <ModalField label="入库数量" value="420" />
  <ModalField label="生产进度" value="85%" valueColor="#059669" />
  <ModalField label="状态" value="生产中" />
  <ModalField label="采购员" value="张三" />
</ModalFieldGrid>
```

**Props**:
- `children`: 子元素（通常是 ModalField）
- `isMobile?`: 是否移动端（会变成单列）
- `columns?`: PC 端列数（默认 3）
- `style?`: 自定义样式

**外观**:
- 白色背景，浅灰边框
- 内边距 6px
- 字段间距：移动端 4px/6px，PC 端 4px/8px

---

### 6. ModalInfoCard - 信息卡片容器
白色背景带边框的信息卡片。

```tsx
import { ModalInfoCard } from '@/components/common/ModalContentLayout';

<ModalInfoCard>
  {/* 放置码数表格、自定义内容等 */}
  <table>...</table>
</ModalInfoCard>
```

**Props**:
- `children`: 内容
- `padding?`: 内边距（默认 6px）
- `style?`: 自定义样式

**默认样式**:
- 背景：白色
- 边框：2px solid #d1d5db
- 圆角：6px
- 阴影：0 1px 2px rgba(0,0,0,0.05)

---

### 7. ModalSideLayout - 左右布局
左侧图片/二维码，右侧信息的常见布局。

```tsx
import { ModalSideLayout, ModalVerticalStack } from '@/components/common/ModalContentLayout';

<ModalSideLayout
  left={
    <ModalVerticalStack>
      <StyleCoverThumb styleNo="ST001" size={200} />
      <QRCodeBox value="PO20260122001" size={140} />
    </ModalVerticalStack>
  }
  right={
    <div>
      {/* 右侧字段信息 */}
    </div>
  }
/>
```

**Props**:
- `left`: 左侧内容
- `right`: 右侧内容
- `style?`: 自定义样式

---

### 8. ModalVerticalStack - 垂直堆叠
用于左侧图片和二维码的垂直排列。

```tsx
import { ModalVerticalStack } from '@/components/common/ModalContentLayout';

<ModalVerticalStack gap={8} align="center">
  <img src="..." />
  <QRCodeBox value="..." />
</ModalVerticalStack>
```

**Props**:
- `children`: 子元素
- `gap?`: 间距（默认 8px）
- `align?`: 对齐方式（默认 `center`）
- `style?`: 自定义样式

---

### 9. ModalSectionTitle - 段落标题
弹窗内的小标题。

```tsx
import { ModalSectionTitle } from '@/components/common/ModalContentLayout';

<ModalSectionTitle>订单明细</ModalSectionTitle>
<ModalSectionTitle size={14}>附加信息</ModalSectionTitle>
```

**Props**:
- `children`: 标题文本
- `size?`: 字号（默认 15px）
- `style?`: 自定义样式

**默认样式**:
- 字号：15px
- 字重：700
- 颜色：#111827
- 上边距：12px，下边距：8px

---

## 📘 完整示例：订单详情弹窗

```tsx
import React from 'react';
import ResizableModal from '@/components/common/ResizableModal';
import {
  ModalHeaderCard,
  ModalSideLayout,
  ModalVerticalStack,
  ModalPrimaryField,
  ModalFieldRow,
  ModalField,
  ModalFieldGrid,
  ModalInfoCard,
} from '@/components/common/ModalContentLayout';
import StyleCoverThumb from '@/components/StyleCoverThumb';
import QRCodeBox from '@/components/common/QRCodeBox';

const OrderDetailModal = ({ visible, order, onClose, isMobile }) => {
  return (
    <ResizableModal
      title="生产订单详情"
      open={visible}
      onCancel={onClose}
      footer={null}
      width="80vw"
      initialHeight="85vh"
    >
      {/* 头部卡片 */}
      <ModalHeaderCard isMobile={isMobile}>
        <ModalSideLayout
          left={
            <ModalVerticalStack>
              <StyleCoverThumb styleNo={order.styleNo} size={isMobile ? 160 : 200} />
              {order.qrCode && (
                <QRCodeBox
                  value={order.qrCode}
                  label="订单扫码"
                  variant="primary"
                  size={isMobile ? 120 : 140}
                />
              )}
            </ModalVerticalStack>
          }
          right={
            <div>
              {/* 第一行：重要字段 */}
              <ModalFieldRow gap={24} isMobile={isMobile}>
                <ModalPrimaryField label="订单号" value={order.orderNo} />
                <ModalPrimaryField label="加工厂" value={order.factoryName} valueSize={15} />
                <ModalInfoCard>
                  {/* 自定义码数表格 */}
                  <table>...</table>
                </ModalInfoCard>
              </ModalFieldRow>

              {/* 第二行：普通字段 */}
              <ModalFieldRow gap={24} isMobile={isMobile}>
                <ModalField label="款号" value={order.styleNo} />
                <ModalField label="款名" value={order.styleName} />
                <ModalField label="颜色" value={order.color} />
              </ModalFieldRow>

              {/* 第三行：网格字段 */}
              <ModalFieldGrid columns={3} isMobile={isMobile}>
                <ModalField label="订单数量" value={order.orderQuantity} />
                <ModalField label="完成数量" value={order.completedQuantity} />
                <ModalField label="入库数量" value={order.warehousedQuantity} />
                <ModalField label="生产进度" value={`${order.progress}%`} valueColor="#059669" />
                <ModalField label="状态" value={order.status} />
                <ModalField label="采购员" value={order.procurementOperator} />
              </ModalFieldGrid>
            </div>
          }
        />
      </ModalHeaderCard>

      {/* 其他内容（表格等） */}
      <Table dataSource={order.details} columns={columns} />
    </ResizableModal>
  );
};

export default OrderDetailModal;
```

---

## 🎯 迁移指南

### 旧代码（手动样式）
```tsx
<div style={{
  display: 'flex',
  gap: 12,
  padding: 10,
  background: '#f8f9fa',
  borderRadius: 8,
  marginBottom: 12
}}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>订单号</span>
    <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>{orderNo}</span>
  </div>
</div>
```

### 新代码（组件化）
```tsx
<ModalHeaderCard isMobile={false}>
  <ModalField label="订单号" value={orderNo} />
</ModalHeaderCard>
```

**优势**：
- ✅ 代码减少 70%
- ✅ 样式统一，易维护
- ✅ 响应式自动处理
- ✅ 可读性更高

---

## 📦 导入方式

```tsx
// 方式 1：具名导入
import {
  ModalHeaderCard,
  ModalField,
  ModalFieldRow,
  ModalFieldGrid,
} from '@/components/common/ModalContentLayout';

// 方式 2：默认导入（带命名空间）
import ModalContentLayout from '@/components/common/ModalContentLayout';

<ModalContentLayout.HeaderCard>
  <ModalContentLayout.Field label="订单号" value="PO001" />
</ModalContentLayout.HeaderCard>
```

---

## 🔥 设计规范速查

| 元素 | 字号 | 字重 | 颜色 |
|------|------|------|------|
| 标签（Label） | 13-14px | 600 | #6b7280 |
| 普通值 | 14px | 600 | #111827 |
| 重点值 | 18px | 700 | #1f2937 |
| 段落标题 | 15px | 700 | #111827 |

| 间距类型 | 数值 |
|---------|------|
| 字段间距（gap） | 24px |
| 卡片内边距（PC） | 12px |
| 卡片内边距（Mobile） | 10px |
| 边框圆角 | 6-8px |

---

最后更新：2026-01-24
