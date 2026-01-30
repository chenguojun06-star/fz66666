# HorizontalProgressPriceView 组件使用指南

## 概述

`HorizontalProgressPriceView` 是一个横向滚动的进度与工序单价展示组件，专为生产订单进度管理设计。它将进度条、工序单价、数量统计、成本核算整合在一个统一的横向视图中。

## 核心特性

### 1. 横向滚动布局
- 每个工序占用 280-320px 宽度的独立卡片
- 支持横向滚动查看所有工序
- 自适应容器宽度

### 2. 液体波浪进度条
- 集成 `LiquidProgressBar` 组件
- 自动根据状态显示不同颜色
- 进度完成后停止动画

### 3. 工序单价管理
- 内置 InputNumber 输入框
- 支持权限控制编辑
- 实时计算预估总价

### 4. 数量统计
- 已完成 / 总数量 / 剩余 三栏展示
- 颜色区分（绿色/灰色/黄色）
- 竖线分隔，清晰易读

### 5. 总计卡片
- 总工序数统计
- 已完成工序数
- 工序总单价
- 预估总成本（单价 × 总数量）

## 使用方法

### 基础示例

```typescript
import HorizontalProgressPriceView from '@/components/common/HorizontalProgressPriceView';

function ProductionDetail() {
  const [nodes, setNodes] = useState<ProgressNode[]>([
    { id: '1', name: '裁剪', unitPrice: 1.5 },
    { id: '2', name: '车缝', unitPrice: 3.0 },
    { id: '3', name: '质检', unitPrice: 0.5 },
  ]);

  const nodeStats = {
    '裁剪': { done: 450, total: 500, remaining: 50, percent: 90 },
    '车缝': { done: 200, total: 500, remaining: 300, percent: 40 },
    '质检': { done: 0, total: 500, remaining: 500, percent: 0 },
  };

  const handlePriceChange = (nodeId: string, newPrice: number) => {
    setNodes(prev =>
      prev.map(node =>
        node.id === nodeId ? { ...node, unitPrice: newPrice } : node
      )
    );
  };

  return (
    <HorizontalProgressPriceView
      nodes={nodes}
      nodeStats={nodeStats}
      totalQty={500}
      canEdit={true}
      onPriceChange={handlePriceChange}
      frozen={false}
    />
  );
}
```

### 完整示例（ProgressDetail 集成）

```typescript
// 在 ProgressDetail 页面中使用
import HorizontalProgressPriceView from '@/components/common/HorizontalProgressPriceView';

const ProgressDetailPage = () => {
  // ... 其他代码

  // 工序单价区域替换为横向展示
  return (
    <div>
      {/* 其他内容 */}
      
      {/* 进度与工序单价 - 横向展示 */}
      <div>
        <div style={{ marginBottom: 8 }}>
          <Text strong style={{ fontSize: 14 }}>进度与工序单价</Text>
        </div>
        <HorizontalProgressPriceView
          nodes={nodes}
          nodeStats={nodeStats.statsByName}
          totalQty={nodeStats.totalQty}
          canEdit={canEditWorkflow}
          onPriceChange={updateNodeUnitPrice}
          frozen={frozen}
        />
      </div>
    </div>
  );
};
```

## 属性说明

### Props

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `nodes` | `ProgressNode[]` | ✅ | - | 进度节点列表 |
| `nodeStats` | `Record<string, NodeStat>` | ✅ | - | 节点统计数据 |
| `totalQty` | `number` | ✅ | - | 订单总数量 |
| `canEdit` | `boolean` | ❌ | `false` | 是否可编辑单价 |
| `onPriceChange` | `(nodeId: string, newPrice: number) => void` | ❌ | - | 单价变更回调 |
| `frozen` | `boolean` | ❌ | `false` | 是否冻结（已完成订单） |

### 数据类型

```typescript
// 进度节点
type ProgressNode = {
  id: string;          // 节点唯一ID
  name: string;        // 工序名称（如"裁剪"、"车缝"）
  unitPrice?: number;  // 工序单价（元）
};

// 节点统计
type NodeStat = {
  done: number;       // 已完成数量
  total: number;      // 总数量
  remaining: number;  // 剩余数量
  percent: number;    // 完成百分比 (0-100)
};
```

## 视觉规范

### 卡片样式

```css
/* 工序卡片 */
width: 280-320px;
flex: 0 0 auto;
background: linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(248, 249, 250, 0.8));
border: 1px solid rgba(15, 23, 42, 0.08);
border-radius: 12px;
box-shadow: 0 2px 8px rgba(15, 23, 42, 0.06);
padding: 16px;
gap: 12px;

/* 已完成卡片 */
border: 1px solid rgba(34, 197, 94, 0.3);

/* 冻结卡片 */
background: linear-gradient(135deg, rgba(248, 250, 252, 0.85), rgba(241, 245, 249, 0.7));
```

### 进度条状态

```typescript
// 自动根据状态变色
status = frozen || percent >= 100 ? undefined : 'normal';

// 未来可扩展为根据交期计算
const getStatus = (percent: number, deliveryDate: string) => {
  if (percent >= 100) return undefined;
  const daysLeft = calculateDaysUntilDelivery(deliveryDate);
  if (daysLeft < 0) return 'danger';   // 已延期
  if (daysLeft <= 3) return 'warning';  // 快延期
  return 'normal';                      // 正常
};
```

### 颜色系统

```css
/* 已完成数量 */
color: #52c41a;

/* 总数量 */
color: rgba(15, 23, 42, 0.65);

/* 剩余数量 */
color: #faad14;  /* 有剩余时 */
color: rgba(15, 23, 42, 0.45);  /* 无剩余时 */

/* 单价 */
color: #1890ff;

/* 预估总价 */
color: #f5222d;
```

## 特殊场景

### 场景 1：订单已完成

```typescript
<HorizontalProgressPriceView
  nodes={nodes}
  nodeStats={nodeStats}
  totalQty={500}
  frozen={true}  // 🔒 冻结状态，不显示动画
/>
```

**效果**：
- 所有卡片灰色背景
- 进度条静止（无动画、无脉冲线）
- 单价输入框禁用

### 场景 2：无工序单价

```typescript
const nodesWithoutPrice = [
  { id: '1', name: '裁剪' },  // 没有 unitPrice
  { id: '2', name: '车缝' },
];

<HorizontalProgressPriceView
  nodes={nodesWithoutPrice}
  nodeStats={nodeStats}
  totalQty={500}
/>
```

**效果**：
- 卡片不显示单价输入框
- 卡片不显示预估总价
- 总计卡片不显示工序总单价和预估总成本

### 场景 3：权限控制

```typescript
const canEdit = user.role === 'admin' || user.role === 'supervisor';

<HorizontalProgressPriceView
  nodes={nodes}
  nodeStats={nodeStats}
  totalQty={500}
  canEdit={canEdit}  // 🔑 普通员工不可编辑
  onPriceChange={handlePriceChange}
/>
```

**效果**：
- `canEdit=false` 时，单价输入框禁用
- `canEdit=true` 时，可以修改单价

## 性能优化

### 1. 虚拟滚动（可选）

对于超过 20 个工序的情况，建议使用虚拟滚动：

```typescript
import { FixedSizeList } from 'react-window';

// 暂未实现，未来可扩展
```

### 2. 防抖优化

单价修改时使用防抖：

```typescript
import { debounce } from 'lodash';

const debouncedUpdate = useCallback(
  debounce((nodeId: string, price: number) => {
    updateNodeUnitPrice(nodeId, price);
  }, 500),
  []
);

<HorizontalProgressPriceView
  onPriceChange={debouncedUpdate}
/>
```

### 3. 懒加载统计数据

对于大量工序，建议按需加载统计数据：

```typescript
const [visibleRange, setVisibleRange] = useState([0, 10]);

// 只计算可见范围的统计数据
const visibleNodeStats = useMemo(() => {
  const stats: Record<string, NodeStat> = {};
  nodes.slice(visibleRange[0], visibleRange[1]).forEach(node => {
    stats[node.name] = calculateNodeStat(node);
  });
  return stats;
}, [nodes, visibleRange]);
```

## 响应式设计

### 移动端适配

```typescript
// 自动调整卡片尺寸
const cardMinWidth = isMobile ? 240 : 280;
const cardMaxWidth = isMobile ? 280 : 320;

// 单列展示
const containerStyle = isMobile
  ? { flexDirection: 'column', gap: 12 }
  : { flexDirection: 'row', gap: 12 };
```

### 平板适配

```typescript
// 平板横屏：一次显示 2-3 个卡片
// 平板竖屏：一次显示 1-2 个卡片
```

## 常见问题

### Q1: 为什么看不到工序单价输入框？

**A**: 只有 `node.unitPrice > 0` 的工序才显示单价输入框。请确保：
```typescript
const nodes = [
  { id: '1', name: '裁剪', unitPrice: 1.5 },  // ✅ 有单价
  { id: '2', name: '车缝', unitPrice: 0 },    // ❌ 单价为0，不显示
  { id: '3', name: '质检' },                   // ❌ 无单价，不显示
];
```

### Q2: 如何隐藏总计卡片？

**A**: 总计卡片会在至少一个工序有单价时显示。如需隐藏，可以：
```typescript
// 方法1：过滤掉无单价的节点
const nodesWithPrice = nodes.filter(n => (n.unitPrice || 0) > 0);

// 方法2：自定义样式隐藏
<div style={{ marginTop: 16, display: 'none' }}>
  {/* 总计卡片 */}
</div>
```

### Q3: 如何自定义进度条状态？

**A**: 修改组件内的 `getProgressStatus` 函数：
```typescript
// 当前：固定返回 'normal'
const getProgressStatus = (percent: number, frozen: boolean) => {
  if (frozen || percent >= 100) return undefined;
  return 'normal';
};

// 自定义：根据交期计算
const getProgressStatus = (percent: number, frozen: boolean, deliveryDate: string) => {
  if (frozen || percent >= 100) return undefined;
  const daysLeft = dayjs(deliveryDate).diff(dayjs(), 'day');
  if (daysLeft < 0) return 'danger';
  if (daysLeft <= 3) return 'warning';
  return 'normal';
};
```

## 最佳实践

### 1. 数据预处理

在传入组件前，确保数据格式正确：

```typescript
// ✅ 正确
const nodes = order.progressNodeUnitPrices.map((n, idx) => ({
  id: String(n.id || idx),
  name: n.name || '未命名工序',
  unitPrice: Number(n.unitPrice) || 0,
}));

// ❌ 错误：直接传原始数据
<HorizontalProgressPriceView nodes={order.progressNodeUnitPrices} />
```

### 2. 统计数据计算

使用 `useMemo` 优化计算：

```typescript
const nodeStats = useMemo(() => {
  const stats: Record<string, NodeStat> = {};
  nodes.forEach(node => {
    const done = calculateDone(node, scanRecords);
    const total = order.quantity;
    stats[node.name] = {
      done,
      total,
      remaining: total - done,
      percent: Math.round((done / total) * 100),
    };
  });
  return stats;
}, [nodes, scanRecords, order.quantity]);
```

### 3. 权限控制

根据用户角色和订单状态控制编辑权限：

```typescript
const canEdit = useMemo(() => {
  if (order.status === 'completed') return false;  // 已完成订单不可编辑
  if (user.role === 'viewer') return false;        // 查看者不可编辑
  return user.role === 'admin' || user.role === 'supervisor';
}, [order.status, user.role]);
```

## 更新日志

### v1.0.0 (2026-01-29)

- ✅ 首次发布
- ✅ 集成 LiquidProgressBar
- ✅ 支持工序单价编辑
- ✅ 数量统计 3 栏展示
- ✅ 总计卡片
- ✅ 冻结状态支持
- ✅ 权限控制

## 相关文档

- [LiquidProgressBar 使用指南](./LiquidProgressBar使用指南.md)
- [ProgressDetail 页面文档](../modules/production/ProgressDetail/README.md)
- [工序单价管理规范](./工序单价管理规范.md)

---

**维护者**: 前端开发团队  
**最后更新**: 2026-01-29
