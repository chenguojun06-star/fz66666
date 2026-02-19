# LiquidProgressBar 液体波浪进度条组件

## 📦 组件说明

细长的液体波浪进度条组件，保持 `LiquidProgressLottie` 的波浪动画效果，但做成条形设计，适合在表格、卡片等场景中使用。

## ✨ 特性

- 🌊 **液体波浪动画**：两层波浪叠加，持续流动效果
- 🎨 **自动变色**：进度 < 100% 时显示蓝色，完成后显示绿色
- 📏 **细长条形**：适合表格和卡片场景
- ⚡ **平滑过渡**：宽度变化有平滑动画
- 🎯 **高性能**：使用 CSS 动画，性能优秀

## 📖 API

```typescript
interface LiquidProgressBarProps {
  percent: number;              // 进度百分比 (0-100)
  width?: number | string;      // 宽度，默认 '100%'
  height?: number;              // 高度，默认 12
  color?: string;               // 自定义颜色（覆盖自动变色）
  backgroundColor?: string;     // 背景颜色，默认 '#f0f0f0'
}
```

## 🎯 使用场景

### 1️⃣ 表格中的进度条

**订单表格工序进度**（已应用）：
```tsx
import LiquidProgressBar from '@/components/common/LiquidProgressBar';

// 在表格列定义中
{
  title: '采购',
  dataIndex: 'procurementCompletionRate',
  render: (rate: number) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <LiquidProgressBar
        percent={rate || 0}
        width="100%"
        height={12}
      />
      <span style={{ fontSize: '12px', color: '#666', minWidth: '40px' }}>
        {rate || 0}%
      </span>
    </div>
  ),
}
```

### 2️⃣ 卡片视图中的进度条

**UniversalCardView 集成**（已应用）：
```tsx
import UniversalCardView from '@/components/common/UniversalCardView';

<UniversalCardView
  dataSource={records}
  titleField="orderNo"
  fields={[...]}
  progressConfig={{
    calculate: (record) => record.productionProgress,
    type: 'liquid', // 🌟 使用液体波浪进度条
    show: true,
  }}
/>
```

**CardProgressConfig 类型说明**：
```typescript
interface CardProgressConfig {
  calculate: (record: any) => number;
  getStatus?: (record: any) => 'success' | 'warning' | 'danger';
  show?: boolean;
  type?: 'capsule' | 'liquid';  // 新增：进度条类型
  // - capsule: 胶囊椭圆形（默认，原有样式）
  // - liquid: 液体波浪条（新增）
}
```

### 3️⃣ 自定义场景

**自定义颜色**：
```tsx
<LiquidProgressBar
  percent={85}
  width={200}
  height={15}
  color="#ff4d4f"           // 自定义红色
  backgroundColor="#fff1f0"  // 浅红色背景
/>
```

**不同尺寸**：
```tsx
// 小尺寸（8px）
<LiquidProgressBar percent={60} height={8} />

// 标准尺寸（12px，推荐）
<LiquidProgressBar percent={75} height={12} />

// 大尺寸（16px）
<LiquidProgressBar percent={90} height={16} />
```

## 🎨 颜色自动变化规则

```typescript
// 未完成：蓝色渐变
percent < 100:
  - 主色：#1890ff
  - 副色：#40a9ff

// 已完成：绿色渐变
percent >= 100:
  - 主色：#52c41a
  - 副色：#95de64
```

## 🔄 动画效果

- **第一层波浪**：4-7秒循环（速度随进度变化）
- **第二层波浪**：5-9秒循环，半透明，反向旋转
- **宽度过渡**：0.6秒，带弹性缓动效果

## 📝 已应用位置

1. ✅ **订单列表表格**
   - 5个工序汇总进度条（采购、裁剪、二次工艺、车缝、尾部）
   - 展开明细中的工序进度条
   - 文件：`frontend/src/modules/production/pages/Production/List/index.tsx`

2. ✅ **订单卡片视图**
   - 生产进度显示
   - 文件：同上

3. 🎯 **可扩展场景**（未来可应用）：
   - 样板生产进度
   - 裁剪单进度
   - 质检入库进度
   - 任何需要展示进度的卡片或表格

## 🆚 对比：Capsule vs Liquid

| 特性 | Capsule（胶囊） | Liquid（液体波浪） |
|------|----------------|-------------------|
| 样式 | 纯色椭圆形条 | 波浪流动效果 |
| 动画 | 无 | 持续波浪动画 |
| 视觉效果 | 简洁 | 生动、动感 |
| 适用场景 | 简单展示 | 强调进度动态 |
| 性能 | 极佳 | 优秀 |

## 💡 最佳实践

1. **表格场景**：
   - 建议高度：10-12px
   - 配合百分比文字显示
   - 使用 `flex` 布局对齐

2. **卡片场景**：
   - 建议高度：8-10px
   - 可以不显示百分比数字（避免冗余）
   - 给足够的 margin

3. **性能优化**：
   - 组件已优化，无需额外处理
   - 支持大量实例同时渲染

4. **可访问性**：
   - 建议配合 `aria-label` 或百分比文字
   - 颜色对比度符合 WCAG 标准

## 🔧 维护说明

**组件文件**：
- `frontend/src/components/common/LiquidProgressBar.tsx`

**样式动画**：
- 使用内联 `<style>` 标签定义 CSS 动画
- `@keyframes` 定义波浪运动轨迹

**依赖**：
- 无外部依赖，纯 React + CSS

---

**创建日期**：2026-01-29  
**最后更新**：2026-01-29  
**维护者**：服装供应链管理系统开发团队
