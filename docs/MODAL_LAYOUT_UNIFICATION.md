# 弹窗布局统一化改进文档

## 📊 改进概述

**日期**: 2026-01-24  
**目标**: 统一所有弹窗头部的布局样式，使用通用组件替代自定义代码  
**影响范围**: 裁剪管理、发货对账单等核心页面

## 🎯 改进目标

### 问题现状
- 不同页面的弹窗头部布局不一致
- 订单号、明细、下单数量等字段排列方式各不相同
- 大量重复的自定义样式代码
- 维护困难，样式调整需要多处修改

### 解决方案
使用统一的 `ModalContentLayout` 组件系统，确保所有弹窗头部遵循相同的设计规范。

## 🔧 使用的组件

### 核心组件清单

```typescript
import {
  ModalHeaderCard,      // 灰色背景头部卡片 (#f8f9fa)
  ModalField,           // 普通字段 (标签 13px + 值 14px)
  ModalPrimaryField,    // 重点字段 (标签 14px + 值 18px)
  ModalFieldRow,        // 横向排列容器 (gap 24px)
  ModalFieldGrid,       // 网格布局容器 (PC端3列，移动端1列)
  ModalSideLayout,      // 左右布局容器
  ModalVerticalStack,   // 垂直堆叠容器
} from '@/components/common/ModalContentLayout';
```

## 📝 改进详情

### 1. 裁剪管理页面 (Cutting.tsx)

#### 改进前
```tsx
<Card
  size="small"
  loading={sheetPreviewLoading}
  style={{
    background: 'linear-gradient(135deg, #f6f8fb 0%, #ffffff 100%)',
    border: '1px solid #e8edf5'
  }}
>
  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
    {/* 订单扫码二维码 - 左侧 */}
    {sheetPreviewTask?.productionOrderNo && (
      <QRCodeBox value={{...}} label="📱 订单扫码" variant="primary" size={120} />
    )}

    {/* 订单信息 - 中间 */}
    <div style={{ flex: 1, minWidth: 300 }}>
      <Space wrap size="small">
        <Tag color="blue">订单号：{...}</Tag>
        <Tag>款号：{...}</Tag>
        <Tag>款名：{...}</Tag>
        <Tag>下单数：{...}</Tag>
        <Tag>裁剪数：{...}</Tag>
        <Tag>扎数：{...}</Tag>
      </Space>
    </div>

    {/* 裁剪单二维码 - 右侧 */}
    {sheetPreviewTask?.qrCode && (
      <QRCodeBox value={...} label="裁剪单" variant="default" size={100} />
    )}
  </div>
</Card>
```

**问题点**:
- 自定义 linear-gradient 背景
- 使用 `<Tag>` 显示字段，颜色和样式不统一
- 手动编写 flex 布局，间距、对齐方式不一致
- 左右布局中间用 Space + Tag，右侧单独放二维码

#### 改进后
```tsx
<ModalHeaderCard isMobile={isMobile}>
  <ModalSideLayout
    left={
      sheetPreviewTask?.productionOrderNo ? (
        <ModalVerticalStack gap={12}>
          <QRCodeBox
            value={{
              type: 'order',
              orderNo: sheetPreviewTask.productionOrderNo
            }}
            label="📱 订单扫码"
            variant="primary"
            size={120}
          />
          {sheetPreviewTask?.qrCode && (
            <QRCodeBox
              value={sheetPreviewTask.qrCode}
              label="裁剪单"
              variant="default"
              size={100}
            />
          )}
        </ModalVerticalStack>
      ) : sheetPreviewTask?.qrCode ? (
        <QRCodeBox value={...} label="裁剪单" variant="default" size={100} />
      ) : null
    }
    right={
      <>
        <ModalPrimaryField 
          label="订单号" 
          value={String(sheetPreviewTask?.productionOrderNo || '').trim() || '-'} 
        />
        <ModalFieldRow gap={24}>
          <ModalField label="款号" value={...} />
          <ModalField label="款名" value={...} />
        </ModalFieldRow>
        <ModalFieldGrid columns={3}>
          <ModalField label="下单数" value={...} valueColor="#059669" />
          <ModalField label="裁剪数" value={...} valueColor="#0891b2" />
          <ModalField label="扎数" value={...} valueColor="#7c3aed" />
        </ModalFieldGrid>
      </>
    }
  />
</ModalHeaderCard>
```

**改进点**:
- ✅ 使用 `ModalHeaderCard` 替代自定义 Card（统一灰色背景 #f8f9fa）
- ✅ 使用 `ModalPrimaryField` 强调订单号（18px 大字体）
- ✅ 使用 `ModalFieldRow` 横向排列款号、款名
- ✅ 使用 `ModalFieldGrid` 网格显示下单数、裁剪数、扎数
- ✅ 使用 `ModalSideLayout` 统一左右布局（左侧二维码，右侧信息）
- ✅ 使用 `ModalVerticalStack` 垂直排列多个二维码
- ✅ 统一字段颜色：绿色(#059669)表示数量、蓝色(#0891b2)表示进度、紫色(#7c3aed)表示统计

---

### 2. 发货对账单页面 (ShipmentReconciliationList.tsx)

#### 改进前
```tsx
<Card size="small" className="mb-sm" loading={materialDetailLoading}>
  <Space wrap>
    <Tag color="blue">订单号：{...}</Tag>
    <Tag>款号：{...}</Tag>
    <Tag>款名：{...}</Tag>
    <Tag>入库数量：{...}</Tag>
    <Tag color="green">面辅料总成本：{...}</Tag>
  </Space>
</Card>
```

**问题点**:
- 使用 `<Tag>` 显示所有字段，样式单一
- 订单号和成本都用彩色 Tag，没有区分重要性
- 手动添加 className="mb-sm" 控制间距
- 数量和金额字段没有颜色强调

#### 改进后
```tsx
<ModalHeaderCard isMobile={isMobile}>
  <ModalPrimaryField 
    label="订单号" 
    value={String((materialDetailProfit as Record<string, unknown>)?.order?.orderNo || '').trim() || '-'} 
  />
  <ModalFieldRow gap={24}>
    <ModalField label="款号" value={...} />
    <ModalField label="款名" value={...} />
  </ModalFieldRow>
  <ModalFieldGrid columns={2}>
    <ModalField label="入库数量" value={...} valueColor="#0891b2" />
    <ModalField label="面辅料总成本" value={toMoney2(getMaterialTotalCost(materialDetailProfit))} valueColor="#059669" />
  </ModalFieldGrid>
</ModalHeaderCard>
```

**改进点**:
- ✅ 订单号使用 `ModalPrimaryField`（大字体 18px，强调重要性）
- ✅ 款号、款名横向排列（`ModalFieldRow`）
- ✅ 入库数量和成本使用 `ModalFieldGrid` 网格布局（PC端2列）
- ✅ 入库数量用蓝色(#0891b2)，成本用绿色(#059669)，语义化配色
- ✅ 移除手动 className，使用标准组件内边距

---

## 🎨 统一设计规范

### 字体规范
| 组件 | 标签字号 | 标签颜色 | 标签字重 | 值字号 | 值颜色 | 值字重 |
|------|---------|---------|---------|--------|--------|--------|
| `ModalField` | 13px | #6b7280 | 600 | 14px | #111827 | 600 |
| `ModalPrimaryField` | 14px | #6b7280 | 600 | **18px** | #1f2937 | **700** |

### 间距规范
- **字段横向间距**: 24px (`ModalFieldRow` 默认 gap)
- **垂直堆叠间距**: 12px (PC端) / 8px (移动端)
- **卡片内边距**: 12px (PC端) / 10px (移动端)

### 颜色语义
| 颜色 | 十六进制 | 用途 |
|------|---------|------|
| 绿色 | #059669 | 数量、金额、成功状态 |
| 蓝色 | #0891b2 | 进度、入库数量 |
| 紫色 | #7c3aed | 统计数据、扎数 |
| 灰色 | #6b7280 | 标签文字 |
| 深灰 | #111827 / #1f2937 | 值文字 |

### 布局规范
- **左右布局**: `ModalSideLayout` (左侧二维码/图片，右侧字段)
- **横向排列**: `ModalFieldRow` (2-4个字段)
- **网格布局**: `ModalFieldGrid` (PC端3列，移动端1列)
- **垂直堆叠**: `ModalVerticalStack` (多个二维码/图片)

---

## 📊 改进效果

### 代码量对比
| 页面 | 改进前行数 | 改进后行数 | 减少 |
|------|-----------|-----------|------|
| Cutting.tsx (裁剪单预览弹窗) | ~60行 | ~45行 | -25% |
| ShipmentReconciliationList.tsx (面辅料明细弹窗) | ~12行 | ~14行 | +17% (增加语义) |

### 维护性提升
- ✅ **样式统一**: 所有弹窗头部使用相同的灰色背景、间距、字体
- ✅ **语义化**: `ModalPrimaryField` / `ModalField` 语义清晰
- ✅ **响应式**: 自动适配移动端（列数、间距、字号）
- ✅ **可扩展**: 新增弹窗直接使用组件，无需重复编写样式
- ✅ **颜色规范**: 数量(绿)、进度(蓝)、统计(紫)，一目了然

### 视觉一致性
- 所有弹窗头部统一灰色背景 (#f8f9fa)
- 订单号统一大字号 (18px)
- 字段间距统一 (24px)
- 网格列数统一 (PC端3列，移动端1列)

---

## 🔄 后续计划

### 待统一页面
根据初步检查，以下页面可能也需要统一（需进一步确认）：
- [ ] 质检入库页面 (ProductWarehousing.tsx) - 已使用 `ProductionOrderHeader`，无需修改
- [ ] 付款审批页面 (PaymentApproval.tsx)
- [ ] 工序进度详情页面 (ProgressDetail.tsx)
- [ ] 其他使用 `<Tag>` 显示订单信息的弹窗

### 迁移指南
参考 `frontend/src/components/common/ModalContentLayout.examples.md` 获取完整迁移示例。

**典型迁移步骤**:
1. 导入组件: `import { ModalHeaderCard, ModalField, ... } from '@/components/common/ModalContentLayout'`
2. 替换 `<Card>` → `<ModalHeaderCard isMobile={isMobile}>`
3. 替换 `<Tag>` → `<ModalField>` 或 `<ModalPrimaryField>`
4. 使用布局容器: `ModalSideLayout` / `ModalFieldRow` / `ModalFieldGrid`
5. 移除自定义样式代码

---

## 📚 参考资源

- `frontend/src/components/common/ModalContentLayout.tsx` - 组件源码
- `frontend/src/components/common/ModalContentLayout.examples.md` - 完整用法示例
- `.github/copilot-instructions.md` - 开发规范文档

---

*最后更新: 2026-01-24*  
*维护者: 开发团队*
