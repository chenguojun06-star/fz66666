# ModalContentLayout 使用指南

**版本**: 1.0  
**文件位置**: `frontend/src/components/common/ModalContentLayout.tsx`  
**最后更新**: 2026-02-04

---

## 📖 概述

### 什么是 ModalContentLayout？

`ModalContentLayout` 是一套统一的弹窗内容布局组件库，用于标准化所有 Modal 内容的视觉呈现。它包含 9 个子组件，涵盖了弹窗内容布局的所有常见场景。

### 为什么需要 ModalContentLayout？

**问题背景**：
- 😱 35+ 个 Modal 使用各自的样式（字体、间距、颜色不统一）
- 😱 重复的内联样式代码（fontSize、fontWeight、color 等）
- 😱 维护困难（修改一个样式需要改 35 个文件）
- 😱 响应式不统一（移动端适配各异）

**使用 ModalContentLayout 的优势**：
- ✅ **视觉统一**：所有弹窗字体、间距、颜色 100% 一致
- ✅ **代码减少**：消除重复的内联样式（减少 50-70% 代码）
- ✅ **响应式自动化**：自动适配移动端（字号、间距调整）
- ✅ **维护性强**：修改样式只需改一处
- ✅ **类型安全**：完整的 TypeScript 类型定义

### 当前使用情况

**已应用页面**（2 个）：
- ✅ Cutting（裁剪单）：9 次使用（HeaderCard + SideLayout + VerticalStack + Field 等）
- ✅ MaterialPurchaseDetail（采购详情）：3 次使用（HeaderCard + FieldRow + Field）

**采用率**：~5.7%（2/35 Modal 使用页面）  
**目标采用率**：50%+（推广到 15+ 页面）

---

## 🧩 组件清单（9 个）

| 组件 | 用途 | 常用场景 |
|------|------|---------|
| **ModalHeaderCard** | 灰色背景头部卡片 | 显示订单核心信息 |
| **ModalField** | 标签 + 值（标准字段） | 款号、颜色、尺码等 |
| **ModalPrimaryField** | 大号字段（强调显示） | 订单号、总金额等 |
| **ModalFieldRow** | 横向字段组 | 多字段同行显示 |
| **ModalFieldGrid** | 网格布局 | 批量字段展示 |
| **ModalInfoCard** | 白色信息卡片 | 详细信息区域 |
| **ModalSideLayout** | 左右布局 | 图片/二维码 + 信息 |
| **ModalVerticalStack** | 垂直堆叠 | 图片 + 二维码组合 |
| **ModalSectionTitle** | 段落标题 | 区块标题 |

---

## 📦 导入方式

### 方式 1：按需导入（推荐）

```tsx
import {
  ModalHeaderCard,
  ModalField,
  ModalPrimaryField,
  ModalFieldRow,
  ModalFieldGrid,
} from '@/components/common/ModalContentLayout';
```

### 方式 2：命名空间导入

```tsx
import ModalContentLayout from '@/components/common/ModalContentLayout';

// 使用
<ModalContentLayout.HeaderCard>
  <ModalContentLayout.FieldRow gap={24}>
    <ModalContentLayout.Field label="订单号" value="PO001" />
  </ModalContentLayout.FieldRow>
</ModalContentLayout.HeaderCard>
```

---

## 🎨 组件详解

### 1. ModalHeaderCard - 头部卡片

**用途**：Modal 顶部的灰色信息卡片，显示核心关键信息。

**视觉规范**：
- **背景色**：`#f8f9fa`（纯浅灰，禁止渐变）
- **内边距**：12px（PC）/ 10px（移动）
- **圆角**：12px
- **间距**：内部元素间距 12px

#### API

```tsx
interface ModalHeaderCardProps {
  children: React.ReactNode;
  isMobile?: boolean;  // 是否移动端，影响间距
  style?: CSSProperties;
}
```

#### 基础用法

```tsx
<ModalHeaderCard isMobile={isMobile}>
  <div>订单号：PO20260122001</div>
  <div>款号：ST001</div>
</ModalHeaderCard>
```

#### 完整示例（配合其他组件）

```tsx
<ModalHeaderCard isMobile={isMobile}>
  <ModalSideLayout
    left={
      <ModalVerticalStack gap={12}>
        <StyleCoverThumb src={coverUrl} size={80} />
        <QRCodeBox value={{ type: 'order', orderNo: 'PO001' }} size={80} />
      </ModalVerticalStack>
    }
    right={
      <>
        <ModalPrimaryField label="订单号" value="PO20260122001" />
        <ModalFieldRow gap={24}>
          <ModalField label="款号" value="ST001" />
          <ModalField label="颜色" value="黑色" />
        </ModalFieldRow>
      </>
    }
  />
</ModalHeaderCard>
```

---

### 2. ModalField - 标准字段

**用途**：显示一般性信息（款号、颜色、尺码、数量等）。

**视觉规范**：
- **标签**：13px / 600字重 / #6b7280
- **值**：14px / 600字重 / #111827
- **间距**：标签与值间距 8px

#### API

```tsx
interface ModalFieldProps {
  label: string;              // 标签文字
  value: React.ReactNode;     // 字段值（可以是组件）
  labelSize?: number;         // 标签字号，默认 13px
  valueSize?: number;         // 值字号，默认 14px
  valueWeight?: number;       // 值字重，默认 600
  valueColor?: string;        // 值颜色，默认 --neutral-text
  style?: CSSProperties;
}
```

#### 基础用法

```tsx
<ModalField label="款号" value="ST001" />
<ModalField label="颜色" value="黑色" />
<ModalField label="尺码" value="M" />
```

#### 自定义样式

```tsx
{/* 自定义值颜色（绿色） */}
<ModalField 
  label="进度" 
  value="85%" 
  valueColor="#059669" 
/>

{/* 自定义字号 */}
<ModalField 
  label="数量" 
  value="500" 
  valueSize={16}
  valueWeight={700}
/>

{/* 值为组件 */}
<ModalField 
  label="状态" 
  value={<Tag color="success">已完成</Tag>} 
/>
```

---

### 3. ModalPrimaryField - 重点字段

**用途**：强调显示关键信息（订单号、总金额等）。

**视觉规范**：
- **标签**：14px / 600字重 / #6b7280
- **值**：**18px（比标准大）** / 700字重 / #1f2937
- **字母间距**：0.5px（提升可读性）

#### API

```tsx
interface ModalPrimaryFieldProps {
  label: string;
  value: React.ReactNode;
  valueSize?: number;  // 默认 18px
  style?: CSSProperties;
}
```

#### 基础用法

```tsx
<ModalPrimaryField label="订单号" value="PO20260122001" />
<ModalPrimaryField label="总金额" value="¥12,345.67" />
```

#### 自定义字号

```tsx
<ModalPrimaryField 
  label="订单号" 
  value="PO20260122001" 
  valueSize={20}  // 更大字号
/>
```

---

### 4. ModalFieldRow - 横向字段组

**用途**：将多个字段水平排列（款号 + 颜色 + 尺码）。

**视觉规范**：
- **默认间距**：24px
- **自动换行**：移动端自动换行
- **响应式**：移动端减少间距

#### API

```tsx
interface ModalFieldRowProps {
  children: React.ReactNode;
  isMobile?: boolean;  // 是否移动端
  gap?: number;        // 间距，默认 24px
  style?: CSSProperties;
}
```

#### 基础用法

```tsx
<ModalFieldRow gap={24}>
  <ModalField label="款号" value="ST001" />
  <ModalField label="颜色" value="黑色" />
  <ModalField label="尺码" value="M" />
</ModalFieldRow>
```

#### 响应式用法

```tsx
// 移动端自动调整间距和换行
<ModalFieldRow isMobile={isMobile} gap={24}>
  <ModalField label="订单数量" value="500" />
  <ModalField label="完成数量" value="450" />
  <ModalField label="进度" value="90%" />
</ModalFieldRow>
```

---

### 5. ModalFieldGrid - 网格布局

**用途**：批量展示多个字段（3 列或更多）。

**视觉规范**：
- **PC 端**：默认 3 列
- **移动端**：自动 1 列
- **背景**：白色卡片
- **边框**：1px solid #f0f0f0
- **圆角**：8px
- **内边距**：6px

#### API

```tsx
interface ModalFieldGridProps {
  children: React.ReactNode;
  isMobile?: boolean;  // 是否移动端
  columns?: number;    // PC 端列数，默认 3
  style?: CSSProperties;
}
```

#### 基础用法（3 列）

```tsx
<ModalFieldGrid columns={3}>
  <ModalField label="订单数量" value="500" />
  <ModalField label="完成数量" value="450" />
  <ModalField label="剩余数量" value="50" />
  <ModalField label="裁剪进度" value="90%" />
  <ModalField label="车缝进度" value="80%" />
  <ModalField label="质检进度" value="70%" />
</ModalFieldGrid>
```

#### 响应式用法

```tsx
// 移动端自动变为 1 列
<ModalFieldGrid isMobile={isMobile} columns={3}>
  {/* 内容 */}
</ModalFieldGrid>
```

---

### 6. ModalInfoCard - 信息卡片

**用途**：白色背景信息卡片，用于展示详细信息区域。

**视觉规范**：
- **背景**：白色
- **边框**：2px solid #f0f0f0
- **圆角**：12px
- **阴影**：轻量阴影
- **内边距**：6px

#### API

```tsx
interface ModalInfoCardProps {
  children: React.ReactNode;
  padding?: number;  // 内边距，默认 6px
  style?: CSSProperties;
}
```

#### 基础用法

```tsx
<ModalInfoCard>
  <ModalField label="供应商" value="华美纺织" />
  <ModalField label="联系人" value="张三" />
  <ModalField label="电话" value="13800138000" />
</ModalInfoCard>
```

#### 自定义内边距

```tsx
<ModalInfoCard padding={12}>
  {/* 更大内边距 */}
</ModalInfoCard>
```

---

### 7. ModalSideLayout - 左右布局

**用途**：左侧图片/二维码 + 右侧信息的经典布局。

**视觉规范**：
- **布局**：flex 布局
- **间距**：左右间距 16px
- **右侧自适应**：flex: 1

#### API

```tsx
interface ModalSideLayoutProps {
  left: React.ReactNode;   // 左侧内容（图片、二维码等）
  right: React.ReactNode;  // 右侧内容（字段信息）
  style?: CSSProperties;
}
```

#### 基础用法

```tsx
<ModalSideLayout
  left={<StyleCoverThumb src={coverUrl} size={100} />}
  right={
    <>
      <ModalPrimaryField label="订单号" value="PO001" />
      <ModalFieldRow gap={24}>
        <ModalField label="款号" value="ST001" />
        <ModalField label="颜色" value="黑色" />
      </ModalFieldRow>
    </>
  }
/>
```

#### 左侧多个元素（使用 ModalVerticalStack）

```tsx
<ModalSideLayout
  left={
    <ModalVerticalStack gap={12}>
      <StyleCoverThumb src={coverUrl} size={80} />
      <QRCodeBox value={{ type: 'order', orderNo: 'PO001' }} size={80} />
    </ModalVerticalStack>
  }
  right={
    {/* 字段信息 */}
  }
/>
```

---

### 8. ModalVerticalStack - 垂直堆叠

**用途**：将多个元素垂直排列（图片 + 二维码）。

**视觉规范**：
- **布局**：flex 垂直布局
- **默认对齐**：居中
- **默认间距**：8px

#### API

```tsx
interface ModalVerticalStackProps {
  children: React.ReactNode;
  gap?: number;  // 间距，默认 8px
  align?: 'flex-start' | 'center' | 'flex-end';  // 对齐方式
  style?: CSSProperties;
}
```

#### 基础用法

```tsx
<ModalVerticalStack gap={12}>
  <StyleCoverThumb src={coverUrl} size={80} />
  <QRCodeBox value={{ type: 'order', orderNo: 'PO001' }} size={80} />
</ModalVerticalStack>
```

#### 左对齐

```tsx
<ModalVerticalStack gap={8} align="flex-start">
  <div>元素 1</div>
  <div>元素 2</div>
</ModalVerticalStack>
```

---

### 9. ModalSectionTitle - 段落标题

**用途**：Modal 内的区块标题（工序信息、物料清单等）。

**视觉规范**：
- **字号**：15px
- **字重**：700
- **颜色**：--neutral-text
- **上边距**：10px
- **下边距**：6px

#### API

```tsx
interface ModalSectionTitleProps {
  children: React.ReactNode;
  size?: number;  // 字号，默认 15px
  style?: CSSProperties;
}
```

#### 基础用法

```tsx
<ModalSectionTitle>物料清单</ModalSectionTitle>
<div>
  {/* 物料内容 */}
</div>

<ModalSectionTitle>工序配置</ModalSectionTitle>
<div>
  {/* 工序内容 */}
</div>
```

---

## 💡 完整示例

### 示例 1：订单详情 Modal（推荐模式）

```tsx
import ResizableModal from '@/components/common/ResizableModal';
import {
  ModalHeaderCard,
  ModalSideLayout,
  ModalVerticalStack,
  ModalPrimaryField,
  ModalFieldRow,
  ModalField,
  ModalFieldGrid,
  ModalSectionTitle,
} from '@/components/common/ModalContentLayout';
import StyleCoverThumb from '@/components/common/StyleCoverThumb';
import QRCodeBox from '@/components/common/QRCodeBox';
import { useViewport } from '@/hooks';

const OrderDetailModal: React.FC = () => {
  const { isMobile } = useViewport();
  
  return (
    <ResizableModal
      title="订单详情"
      visible={visible}
      onCancel={onClose}
      defaultWidth="60vw"
      defaultHeight="60vh"
    >
      {/* 头部卡片：核心信息 */}
      <ModalHeaderCard isMobile={isMobile}>
        <ModalSideLayout
          left={
            <ModalVerticalStack gap={12}>
              <StyleCoverThumb 
                src={order.styleCover} 
                size={80} 
                borderRadius={6}
              />
              <QRCodeBox 
                value={{ type: 'order', orderNo: order.orderNo }} 
                size={80}
                variant="primary"
              />
            </ModalVerticalStack>
          }
          right={
            <>
              <ModalPrimaryField 
                label="订单号" 
                value={order.orderNo} 
              />
              <ModalFieldRow gap={24} style={{ marginTop: 8 }}>
                <ModalField label="款号" value={order.styleNo} />
                <ModalField label="款名" value={order.styleName} />
              </ModalFieldRow>
              <ModalFieldRow gap={24} style={{ marginTop: 8 }}>
                <ModalField label="颜色" value={order.color} />
                <ModalField label="尺码" value={order.size} />
              </ModalFieldRow>
            </>
          }
        />
      </ModalHeaderCard>

      {/* 工序进度区域 */}
      <ModalSectionTitle>工序进度</ModalSectionTitle>
      <ModalFieldGrid columns={3} isMobile={isMobile}>
        <ModalField label="裁剪" value="100%" valueColor="#059669" />
        <ModalField label="车缝" value="80%" valueColor="#f59e0b" />
        <ModalField label="质检" value="0%" valueColor="#6b7280" />
      </ModalFieldGrid>

      {/* 统计信息区域 */}
      <ModalSectionTitle>统计信息</ModalSectionTitle>
      <ModalFieldGrid columns={2}>
        <ModalField label="订单数量" value="500 件" />
        <ModalField label="完成数量" value="450 件" />
        <ModalField label="剩余数量" value="50 件" />
        <ModalField label="总进度" value="90%" valueColor="#059669" />
      </ModalFieldGrid>
    </ResizableModal>
  );
};
```

**视觉效果**：
```
┌──────────────────────────────────────────────────────┐
│ 订单详情                                       [ × ] │
├──────────────────────────────────────────────────────┤
│ ┌────────────────────────────────────────────────┐ │
│ │ 🖼️  📊      订单号 PO20260122001               │ │ ← HeaderCard（灰色）
│ │            款号 ST001  款名 黑色连衣裙          │ │
│ │            颜色 黑色   尺码 M                   │ │
│ └────────────────────────────────────────────────┘ │
│                                                      │
│ 工序进度                                             │ ← SectionTitle
│ ┌────────────────────────────────────────────────┐ │
│ │ 裁剪 100%  │  车缝 80%  │  质检 0%           │ │ ← FieldGrid
│ └────────────────────────────────────────────────┘ │
│                                                      │
│ 统计信息                                             │
│ ┌────────────────────────────────────────────────┐ │
│ │ 订单数量 500件  │  完成数量 450件            │ │
│ │ 剩余数量 50件   │  总进度 90%               │ │
│ └────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────┤
│                             [取消]  [确定]           │
└──────────────────────────────────────────────────────┘
```

---

### 示例 2：物料采购 Modal（简化版）

```tsx
<ResizableModal
  title="面料采购"
  visible={visible}
  onCancel={onClose}
  defaultWidth="40vw"
  defaultHeight="50vh"
>
  {/* 简单头部 */}
  <ModalHeaderCard>
    <ModalFieldRow gap={24}>
      <ModalPrimaryField label="采购单号" value="MP20260122001" />
      <ModalField label="状态" value="待到货" />
    </ModalFieldRow>
  </ModalHeaderCard>

  {/* 物料清单 */}
  <ModalSectionTitle>物料清单</ModalSectionTitle>
  <ModalFieldGrid columns={2}>
    <ModalField label="物料名称" value="纯棉面料" />
    <ModalField label="需求数量" value="100 米" />
    <ModalField label="已到货" value="80 米" />
    <ModalField label="待到货" value="20 米" />
  </ModalFieldGrid>
</ResizableModal>
```

---

### 示例 3：样衣资料 Modal（完整模式）

```tsx
<ResizableModal
  title="样衣详情"
  visible={visible}
  onCancel={onClose}
  defaultWidth="60vw"
  defaultHeight="60vh"
>
  {/* 头部：样衣核心信息 */}
  <ModalHeaderCard isMobile={isMobile}>
    <ModalSideLayout
      left={<StyleCoverThumb src={sample.cover} size={100} />}
      right={
        <>
          <ModalPrimaryField label="样衣编号" value={sample.sampleNo} />
          <ModalFieldRow gap={24}>
            <ModalField label="款号" value={sample.styleNo} />
            <ModalField label="季节" value={sample.season} />
          </ModalFieldRow>
        </>
      }
    />
  </ModalHeaderCard>

  {/* 开发信息 */}
  <ModalSectionTitle>开发信息</ModalSectionTitle>
  <ModalFieldGrid columns={3}>
    <ModalField label="设计师" value="李四" />
    <ModalField label="打版师" value="王五" />
    <ModalField label="车版师" value="赵六" />
  </ModalFieldGrid>

  {/* 成本信息 */}
  <ModalSectionTitle>成本信息</ModalSectionTitle>
  <ModalFieldRow gap={24}>
    <ModalField label="面料成本" value="¥250.00" valueColor="#f59e0b" />
    <ModalField label="工序成本" value="¥150.00" valueColor="#f59e0b" />
    <ModalField label="其他成本" value="¥50.00" valueColor="#f59e0b" />
    <ModalField label="总成本" value="¥450.00" valueColor="#ef4444" valueWeight={700} />
  </ModalFieldRow>
</ResizableModal>
```

---

## 🎨 设计规范映射

### 字体规范（自动应用）

| 组件 | 标签字号 | 值字号 | 标签字重 | 值字重 | 来源 |
|------|---------|--------|---------|--------|------|
| ModalField | 13px | 14px | 600 | 600 | 设计系统规范 |
| ModalPrimaryField | 14px | **18px** | 600 | 700 | 设计系统规范 |
| ModalSectionTitle | - | 15px | - | 700 | 设计系统规范 |

### 颜色规范（CSS 变量）

```css
/* 组件内部使用的 CSS 变量 */
--neutral-text: #1a1a1a;           /* 主文字 */
--neutral-text-light: #4a4a4a;     /* 标签文字 */
--color-bg-gray: #f8f9fa;          /* 灰色背景 */
--neutral-white: #FFFFFF;          /* 白色 */
--table-border-color: #f0f0f0;     /* 边框色 */
```

### 间距规范（8 的倍数）

- **HeaderCard 内边距**：12px（PC）/ 10px（移动）
- **FieldRow 间距**：24px（默认）
- **FieldGrid 间距**：4px-8px
- **SideLayout 间距**：16px
- **VerticalStack 间距**：8px（默认）

---

## 🔄 迁移指南

### 迁移前后对比

#### 场景：订单详情头部

**迁移前（50+ 行代码）**：
```tsx
<div style={{
  display: 'flex',
  gap: 12,
  padding: 10,
  background: '#f8f9fa',
  borderRadius: 12,
  marginBottom: 10
}}>
  <div style={{ display: 'flex', gap: 16 }}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <StyleCoverThumb src={coverUrl} size={80} />
      <QRCodeBox value={qrData} size={80} />
    </div>
    <div style={{ flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14, color: '#6b7280', fontWeight: 600 }}>
          订单号
        </span>
        <span style={{ fontSize: 18, fontWeight: 700, color: '#1f2937' }}>
          {order.orderNo}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, color: '#6b7280', fontWeight: 600 }}>
            款号
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
            {order.styleNo}
          </span>
        </div>
        {/* 更多字段... */}
      </div>
    </div>
  </div>
</div>
```

**迁移后（14 行代码）**：
```tsx
<ModalHeaderCard isMobile={isMobile}>
  <ModalSideLayout
    left={
      <ModalVerticalStack gap={12}>
        <StyleCoverThumb src={coverUrl} size={80} />
        <QRCodeBox value={qrData} size={80} />
      </ModalVerticalStack>
    }
    right={
      <>
        <ModalPrimaryField label="订单号" value={order.orderNo} />
        <ModalFieldRow gap={24}>
          <ModalField label="款号" value={order.styleNo} />
          <ModalField label="颜色" value={order.color} />
        </ModalFieldRow>
      </>
    }
  />
</ModalHeaderCard>
```

**效果**：
- 代码量：50+ 行 → 14 行（**减少 72%**）
- 可读性：显著提升（语义化组件名）
- 维护性：样式集中管理

---

### 迁移步骤（5 步完成）

**Step 1**：导入组件
```tsx
import {
  ModalHeaderCard,
  ModalField,
  ModalFieldRow,
} from '@/components/common/ModalContentLayout';
```

**Step 2**：识别布局模式

| 旧布局模式 | 新组件 |
|-----------|--------|
| 灰色背景容器 | `ModalHeaderCard` |
| flex 横向布局 | `ModalFieldRow` |
| grid 布局 | `ModalFieldGrid` |
| 标签 + 值 | `ModalField` |
| 大号字段 | `ModalPrimaryField` |
| 左图右字 | `ModalSideLayout` |

**Step 3**：替换外层容器
```tsx
// Before
<div style={{ background: '#f8f9fa', padding: 12, borderRadius: 12 }}>

// After
<ModalHeaderCard isMobile={isMobile}>
```

**Step 4**：替换字段
```tsx
// Before
<div style={{ display: 'flex', gap: 8 }}>
  <span style={{ fontSize: 13, color: '#6b7280' }}>款号</span>
  <span style={{ fontSize: 14, fontWeight: 600 }}>ST001</span>
</div>

// After
<ModalField label="款号" value="ST001" />
```

**Step 5**：替换布局
```tsx
// Before
<div style={{ display: 'flex', gap: 24 }}>
  {/* 多个字段 */}
</div>

// After
<ModalFieldRow gap={24}>
  {/* 多个 ModalField */}
</ModalFieldRow>
```

---

## ⚡ 最佳实践

### 1. 始终使用 isMobile 属性

```tsx
import { useViewport } from '@/hooks';

const MyModal: React.FC = () => {
  const { isMobile } = useViewport();
  
  return (
    <ModalHeaderCard isMobile={isMobile}>
      {/* 自动适配移动端 */}
    </ModalHeaderCard>
  );
};
```

---

### 2. 合理选择字段组件

```tsx
// ✅ 核心信息：使用 ModalPrimaryField（18px大号）
<ModalPrimaryField label="订单号" value="PO001" />
<ModalPrimaryField label="总金额" value="¥12,345.67" />

// ✅ 普通信息：使用 ModalField（14px标准）
<ModalField label="款号" value="ST001" />
<ModalField label="颜色" value="黑色" />
```

---

### 3. 使用语义化颜色

```tsx
// ✅ 推荐：使用语义化颜色
<ModalField label="进度" value="100%" valueColor="var(--success-color)" />
<ModalField label="延期天数" value="5天" valueColor="var(--error-color)" />
<ModalField label="待办" value="3项" valueColor="var(--warning-color)" />

// ❌ 避免：硬编码颜色
<ModalField label="进度" value="100%" valueColor="#52C41A" />
```

---

### 4. 合理使用 gap 间距

```tsx
// ✅ 推荐：使用标准间距
<ModalFieldRow gap={24}>  {/* 标准间距 */}
<ModalFieldRow gap={16}>  {/* 紧凑间距 */}
<ModalVerticalStack gap={12}>  {/* 默认间距 */}

// ❌ 避免：非标准间距
<ModalFieldRow gap={20}>  {/* 20 不是 8 的倍数 */}
<ModalFieldRow gap={15}>  {/* 15 不是 8 的倍数 */}
```

---

### 5. 优先使用组合而非 style

```tsx
// ✅ 推荐：使用组件组合
<ModalVerticalStack gap={12} align="flex-start">
  <div>元素 1</div>
  <div>元素 2</div>
</ModalVerticalStack>

// ❌ 避免：直接修改 style（破坏统一性）
<ModalVerticalStack style={{ gap: 15, alignItems: 'flex-start' }}>
  {/* ... */}
</ModalVerticalStack>
```

---

### 6. 段落标题统一使用 ModalSectionTitle

```tsx
// ✅ 推荐
<ModalSectionTitle>工序配置</ModalSectionTitle>
<div>{/* 内容 */}</div>

// ❌ 避免
<div style={{ fontSize: 15, fontWeight: 700, marginTop: 10 }}>
  工序配置
</div>
```

---

### 7. 响应式布局自动化

```tsx
// ✅ 推荐：使用 isMobile 自动适配
<ModalFieldGrid columns={3} isMobile={isMobile}>
  {/* PC端3列，移动端自动1列 */}
</ModalFieldGrid>

// ❌ 避免：手动媒体查询
<div style={{ 
  display: 'grid', 
  gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)' 
}}>
  {/* 手动管理 */}
</div>
```

---

## 🎯 设计决策

### 为什么标签是 13px，值是 14px？

**设计原理**：
- **视觉层次**：标签次要（13px），值主要（14px）
- **可读性**：1px 差异足够区分，不会过于夸张
- **对齐**：字号差异小，视觉对齐更自然

### 为什么 PrimaryField 是 18px？

**设计原理**：
- **强调核心信息**：订单号、总金额是最重要的
- **视觉焦点**：18px 比 14px 大 28%，足够吸引注意力
- **黄金比例**：14:18 ≈ 1:1.28，接近黄金比例

### 为什么使用 CSS 变量？

**优势**：
- 🎨 **主题切换**：统一修改颜色
- 🔧 **易维护**：修改一处，全局生效
- 📱 **响应式**：可根据设备类型调整
- ♿ **无障碍**：支持高对比度主题

---

## 📊 性能影响

### 组件大小

- **ModalContentLayout.tsx**: 约 8KB（已压缩）
- **运行时开销**: 可忽略（纯展示组件，无状态逻辑）

### 渲染性能

- ✅ **无副作用**：不使用 useEffect/useState
- ✅ **无重渲染**：仅依赖 props 变化
- ✅ **内联样式优化**：使用对象展开，避免创建新对象

---

## ❓ 常见问题

### Q1: 为什么值默认 `whiteSpace: 'nowrap'`？

**A**: 防止字段值换行，保持视觉整洁。如需换行，可覆盖 style：

```tsx
<ModalField 
  label="备注" 
  value={longText}
  style={{ whiteSpace: 'normal' }}  // 允许换行
/>
```

---

### Q2: 如何自定义标签和值的字号？

**A**: 使用 `labelSize` 和 `valueSize` 属性。

```tsx
<ModalField 
  label="特殊字段" 
  value="特殊值"
  labelSize={12}   // 自定义标签字号
  valueSize={16}   // 自定义值字号
/>
```

---

### Q3: 能否在 ModalField 中使用组件作为 value？

**A**: 可以！`value` 类型是 `React.ReactNode`。

```tsx
<ModalField 
  label="状态" 
  value={<Tag color="success">已完成</Tag>} 
/>

<ModalField 
  label="进度" 
  value={<Progress percent={85} size="small" />} 
/>
```

---

### Q4: ModalFieldGrid 能否自定义列数？

**A**: 可以，通过 `columns` 属性。

```tsx
<ModalFieldGrid columns={4}>  {/* 4列 */}
  {/* ... */}
</ModalFieldGrid>

<ModalFieldGrid columns={2}>  {/* 2列 */}
  {/* ... */}
</ModalFieldGrid>
```

---

### Q5: 如何处理超长文本溢出？

**A**: 组件默认使用 `text-overflow: ellipsis`，超长文本会显示省略号。如需完整显示，可以：

```tsx
// 方案1：允许换行
<ModalField 
  value={longText}
  style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}
/>

// 方案2：使用 Tooltip
<ModalField 
  label="备注"
  value={
    <Tooltip title={longText}>
      <span>{longText}</span>
    </Tooltip>
  }
/>
```

---

## 🚀 推广计划

### 目标

- **短期目标**（1 个月）：采用率从 5.7% 提升到 30%（10 个页面）
- **中期目标**（3 个月）：采用率达到 50%（15 个页面）
- **长期目标**（6 个月）：采用率达到 80%（25+ 个页面）

### 优先推广页面（高收益）

**P0 优先**（复杂 Modal，收益大）：
1. ✅ Cutting（裁剪单）- 已完成
2. ✅ MaterialPurchaseDetail（采购详情）- 已完成
3. ⏳ OrderFlow（订单流程）
4. ⏳ QualityInspection（质检入库）
5. ⏳ Warehousing（成品入库）

**P1 推广**（标准 Modal，收益中）：
6. ⏳ StyleInfo（款式详情）
7. ⏳ UserApproval（用户审批）
8. ⏳ FinishedSettlement（成品结算）
9. ⏳ OrderReconciliation（订单对账）
10. ⏳ PaymentApproval（付款审批）

**P2 推广**（简单 Modal，收益低）：
- 其他 25+ 个简单 Modal（逐步迁移）

---

## 📚 相关资源

### 组件源码
- **组件源码**: `frontend/src/components/common/ModalContentLayout.tsx`
- **示例文档**: `frontend/src/components/common/ModalContentLayout.examples.md`

### 相关文档
- [useModal 使用指南](./useModal使用指南.md) - Modal 状态管理 Hook
- [开发指南 - Modal 最佳实践](../开发指南.md#modal最佳实践) - 完整开发规范
- [设计系统完整规范](../设计系统完整规范-2026.md) - 字体、颜色、间距规范

### 已应用文件
- `frontend/src/modules/production/pages/Production/Cutting/index.tsx`（9 次使用）
- `frontend/src/modules/production/pages/Production/MaterialPurchaseDetail/index.tsx`（3 次使用）

### 设计规范映射
- **字体规范**：设计系统完整规范 § 字体系统
- **颜色规范**：设计系统完整规范 § 颜色系统
- **间距规范**：设计系统完整规范 § 间距系统（8 的倍数）

---

**维护者**: 前端开发团队  
**最后更新**: 2026-02-04  
**版本**: v1.0

