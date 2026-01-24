# 排序功能快速参考

## 一分钟快速上手

### 1. 导入组件
```typescript
import SortableColumnTitle from '@/components/common/SortableColumnTitle';
```

### 2. 添加3个状态和1个回调
```typescript
const [sortField, setSortField] = useState<string>('createTime');
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
};
```

### 3. 修改列定义（只改title）
```typescript
{
    title: <SortableColumnTitle
        title="创建时间"
        sortField={sortField}
        fieldName="createTime"
        sortOrder={sortOrder}
        onSort={handleSort}
        align="left"
    />,
    dataIndex: 'createTime',
    // ... 其他不变
}
```

### 4. 添加排序逻辑
```typescript
const sortedData = useMemo(() => {
    const sorted = [...dataSource];
    sorted.sort((a: any, b: any) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        
        // 时间字段
        if (sortField.includes('Time') || sortField.includes('time')) {
            const aTime = aVal ? new Date(aVal).getTime() : 0;
            const bTime = bVal ? new Date(bVal).getTime() : 0;
            return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
        }
        
        // 数值字段
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        }
        
        return 0;
    });
    return sorted;
}, [dataSource, sortField, sortOrder]);

// Table中使用
<Table dataSource={sortedData} ... />
```

---

## 常用场景

### 场景1：时间列排序
```typescript
{
    title: <SortableColumnTitle
        title="创建时间"
        sortField={sortField}
        fieldName="createTime"
        sortOrder={sortOrder}
        onSort={handleSort}
        align="left"  // 时间列左对齐
    />,
    dataIndex: 'createTime',
}
```

### 场景2：金额列排序
```typescript
{
    title: <SortableColumnTitle
        title="总金额(元)"
        sortField={sortField}
        fieldName="totalAmount"
        sortOrder={sortOrder}
        onSort={handleSort}
        align="right"  // 金额列右对齐（默认）
    />,
    dataIndex: 'totalAmount',
}
```

### 场景3：数量列排序
```typescript
{
    title: <SortableColumnTitle
        title="数量"
        sortField={sortField}
        fieldName="quantity"
        sortOrder={sortOrder}
        onSort={handleSort}
    />,
    dataIndex: 'quantity',
}
```

---

## 多表格排序（同一页面）

每个表格使用独立状态：

```typescript
// 表格1
const [sort1Field, setSort1Field] = useState('createTime');
const [sort1Order, setSort1Order] = useState<'asc' | 'desc'>('desc');
const handleSort1 = (field: string, order: 'asc' | 'desc') => {
    setSort1Field(field);
    setSort1Order(order);
};

// 表格2
const [sort2Field, setSort2Field] = useState('startTime');
const [sort2Order, setSort2Order] = useState<'asc' | 'desc'>('desc');
const handleSort2 = (field: string, order: 'asc' | 'desc') => {
    setSort2Field(field);
    setSort2Order(order);
};
```

---

## 已支持排序的页面

### ✅ 财务管理
- **员工工资汇总**：总金额、审核时间、付款时间、总数量、扫码次数、订单数
- **员工工序明细**：开始时间、完成时间

### 🔄 待实施（高优先级）
- 订单管理：下单时间、完成时间
- 裁剪单管理：领取时间、完成时间
- 订单流程：开始时间、完成时间、到货时间

### 🔄 待实施（中优先级）
- 物料采购：创建时间、更新时间
- 进度详情：扫码时间、完成时间
- 发货对账：创建时间

### 🔄 待实施（低优先级）
- 工厂列表：创建时间
- 角色列表：创建时间
- 款式管理：创建时间
- 订单转移：创建时间、处理时间

---

## 详细文档

- **完整指南**：`docs/SORTABLE_COLUMN_GUIDE.md`
- **实施计划**：`docs/TIME_COLUMN_SORT_IMPLEMENTATION.md`
- **开发指南**：`开发指南.md` - 第4.2节

---

*最后更新：2026-01-25*
