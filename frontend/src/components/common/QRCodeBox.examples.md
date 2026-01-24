# QRCodeBox 组件使用示例

## 📦 组件说明

`QRCodeBox` 是一个全站通用的二维码展示组件，提供统一的样式和多种主题变体。

## 🎨 主题变体

### 1. Primary（蓝色主题）- 默认
用于重要的扫码功能，如订单扫码
```tsx
<QRCodeBox
  value={{ type: 'order', orderNo: 'PO20260122001' }}
  label="📱 订单扫码"
  variant="primary"
  size={120}
/>
```

### 2. Default（灰色主题）
用于普通扫码功能，如裁剪单、物料采购单
```tsx
<QRCodeBox
  value={task.qrCode}
  label="裁剪单"
  variant="default"
  size={100}
/>
```

### 3. Success（绿色主题）
用于成功/完成状态的扫码
```tsx
<QRCodeBox
  value={qualityRecord.qrCode}
  label="✓ 质检通过"
  variant="success"
  size={120}
/>
```

### 4. Warning（橙色主题）
用于警告/待处理状态的扫码
```tsx
<QRCodeBox
  value={pendingTask.qrCode}
  label="⚠️ 待处理"
  variant="warning"
  size={120}
/>
```

## 📝 完整属性

```tsx
interface QRCodeBoxProps {
  value: string | Record<string, any>;  // 二维码值，对象会自动JSON.stringify
  size?: number;                         // 尺寸，默认120
  label?: string;                        // 底部标签文字
  variant?: 'primary' | 'default' | 'success' | 'warning'; // 主题，默认primary
  level?: 'L' | 'M' | 'Q' | 'H';        // 纠错级别，默认M
  includeMargin?: boolean;               // 是否包含边距，默认false
  style?: React.CSSProperties;           // 自定义样式
  className?: string;                    // 自定义类名
}
```

## 🔧 实际应用场景

### 场景1：裁剪单预览（双二维码）
```tsx
<div style={{ display: 'flex', gap: 16 }}>
  {/* 订单扫码 */}
  <QRCodeBox
    value={{ type: 'order', orderNo: task.productionOrderNo }}
    label="📱 订单扫码"
    variant="primary"
    size={120}
  />
  
  {/* 裁剪单 */}
  <QRCodeBox
    value={task.qrCode}
    label="裁剪单"
    variant="default"
    size={100}
  />
</div>
```

### 场景2：订单创建成功
```tsx
<QRCodeBox
  value={createdOrder.qrCode}
  label="订单扫码"
  variant="primary"
  size={220}
/>
```

### 场景3：物料采购列表（表格内）
```tsx
{
  title: '二维码',
  width: 100,
  align: 'center',
  render: (_, record) => (
    <QRCodeBox
      value={{
        purchaseNo: record.purchaseNo,
        materialCode: record.materialCode,
        id: record.id
      }}
      size={60}
      variant="default"
    />
  ),
}
```

### 场景4：质检入库
```tsx
<QRCodeBox
  value={qualityRecord.qrCode}
  label="✓ 质检通过"
  variant="success"
  size={100}
/>
```

## 🎯 迁移指南

### 旧代码（手写样式）
```tsx
<div style={{
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '8px',
  background: '#e6f7ff',
  borderRadius: '8px',
  border: '2px solid #1890ff',
  boxShadow: '0 4px 12px rgba(24, 144, 255, 0.15)',
}}>
  <QRCodeCanvas
    value={JSON.stringify({ type: 'order', orderNo: orderNo })}
    size={120}
    level="M"
    includeMargin={false}
  />
  <div style={{
    marginTop: '8px',
    fontSize: '12px',
    color: '#1890ff',
    fontWeight: 600
  }}>
    📱 订单扫码
  </div>
</div>
```

### 新代码（使用组件）
```tsx
<QRCodeBox
  value={{ type: 'order', orderNo: orderNo }}
  label="📱 订单扫码"
  variant="primary"
  size={120}
/>
```

## ✅ 已应用页面

- ✅ 裁剪单管理 (`Cutting.tsx`) - 订单扫码 + 裁剪单二维码
- ✅ 物料采购 (`MaterialPurchase.tsx`) - 采购单二维码
- ✅ 订单管理 (`OrderManagement/index.tsx`) - 订单创建成功
- ✅ 生产订单列表 (`Production/List.tsx`) - 订单详情

## 🎨 样式定制

如需特殊样式，可以通过 `style` 属性覆盖：

```tsx
<QRCodeBox
  value={data}
  label="自定义"
  variant="primary"
  style={{
    padding: '12px',      // 覆盖默认的8px
    borderRadius: '12px', // 覆盖默认的8px
  }}
/>
```

## 📱 响应式设计

根据设备调整尺寸：

```tsx
const { isMobile } = useViewport();

<QRCodeBox
  value={order.qrCode}
  label="订单扫码"
  variant="primary"
  size={isMobile ? 100 : 140}  // 移动端100，PC端140
/>
```

---

*组件位置：`frontend/src/components/common/QRCodeBox.tsx`*
