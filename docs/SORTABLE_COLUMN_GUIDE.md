# SortableColumnTitle 通用排序列组件使用指南

## 组件简介

`SortableColumnTitle` 是一个可复用的 React 组件，用于在 Ant Design 表格中快速实现列的点击排序功能。

**组件位置**：`frontend/src/components/common/SortableColumnTitle.tsx`

## 核心特性

### 1. 三态排序图标
- **激活状态**：当前列正在排序时显示蓝色三角形（▼降序 / ▲升序）
- **非激活状态**：显示灰色双三角形（同时显示上下箭头），提示可点击排序

### 2. 多字段排序支持
- 支持数值类型排序（金额、数量等）
- 支持时间类型排序（开始时间、审核时间等）
- 支持字符串类型排序（中文本地化比较）

### 3. 灵活对齐方式
- `align="left"` - 左对齐（适合时间、文本列）
- `align="center"` - 居中对齐
- `align="right"` - 右对齐（默认，适合数值列）

---

## 快速开始

### 第一步：导入组件

```typescript
import SortableColumnTitle from '../../components/common/SortableColumnTitle';
```

### 第二步：添加排序状态

```typescript
const [sortField, setSortField] = useState<string>('totalAmount'); // 当前排序字段
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // 排序方向
```

### 第三步：实现排序回调

```typescript
const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
};
```

### 第四步：在列定义中使用

```typescript
const columns = [
    {
        title: <SortableColumnTitle
            title="总金额(元)"
            sortField={sortField}
            fieldName="totalAmount"
            sortOrder={sortOrder}
            onSort={handleSort}
        />,
        dataIndex: 'totalAmount',
        key: 'totalAmount',
        align: 'right',
        render: (v) => v.toFixed(2),
    },
    {
        title: <SortableColumnTitle
            title="开始时间"
            sortField={sortField}
            fieldName="startTime"
            sortOrder={sortOrder}
            onSort={handleSort}
            align="left"
        />,
        dataIndex: 'startTime',
        key: 'startTime',
        render: (v) => v ? dayjs(v).format('YYYY-MM-DD HH:mm:ss') : '-',
    },
];
```

### 第五步：实现数据排序逻辑

```typescript
const sortedData = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        
        // 处理时间字段
        if (sortField === 'startTime' || sortField === 'endTime') {
            const aTime = aVal ? new Date(aVal).getTime() : 0;
            const bTime = bVal ? new Date(bVal).getTime() : 0;
            return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
        }
        
        // 处理数值字段
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
        }
        
        // 处理字符串字段
        const aStr = String(aVal || '');
        const bStr = String(bVal || '');
        return sortOrder === 'desc' 
            ? bStr.localeCompare(aStr, 'zh-CN') 
            : aStr.localeCompare(bStr, 'zh-CN');
    });
    return sorted;
}, [data, sortField, sortOrder]);
```

---

## 完整示例

### 单表排序示例

```typescript
import React, { useState, useMemo } from 'react';
import { Table } from 'antd';
import SortableColumnTitle from '@/components/common/SortableColumnTitle';

const MyTable: React.FC = () => {
    // 原始数据
    const [data, setData] = useState([
        { id: 1, name: '张三', amount: 1500, createTime: '2026-01-20 10:00:00' },
        { id: 2, name: '李四', amount: 2300, createTime: '2026-01-21 14:30:00' },
        { id: 3, name: '王五', amount: 1800, createTime: '2026-01-22 09:15:00' },
    ]);

    // 排序状态
    const [sortField, setSortField] = useState<string>('amount');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

    // 排序回调
    const handleSort = (field: string, order: 'asc' | 'desc') => {
        setSortField(field);
        setSortOrder(order);
    };

    // 排序后的数据
    const sortedData = useMemo(() => {
        const sorted = [...data];
        sorted.sort((a: any, b: any) => {
            const aVal = a[sortField];
            const bVal = b[sortField];
            
            if (sortField === 'createTime') {
                const aTime = new Date(aVal).getTime();
                const bTime = new Date(bVal).getTime();
                return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
            }
            
            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
            }
            
            return sortOrder === 'desc' 
                ? String(bVal).localeCompare(String(aVal), 'zh-CN')
                : String(aVal).localeCompare(String(bVal), 'zh-CN');
        });
        return sorted;
    }, [data, sortField, sortOrder]);

    // 列定义
    const columns = [
        {
            title: '姓名',
            dataIndex: 'name',
            key: 'name',
        },
        {
            title: <SortableColumnTitle
                title="金额"
                sortField={sortField}
                fieldName="amount"
                sortOrder={sortOrder}
                onSort={handleSort}
            />,
            dataIndex: 'amount',
            key: 'amount',
            align: 'right',
        },
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
            key: 'createTime',
        },
    ];

    return <Table columns={columns} dataSource={sortedData} rowKey="id" />;
};
```

---

## 多表排序示例

当页面有多个表格时，每个表格需要独立的排序状态：

```typescript
const MyMultiTablePage: React.FC = () => {
    // 表格1的排序状态
    const [sort1Field, setSort1Field] = useState<string>('amount');
    const [sort1Order, setSort1Order] = useState<'asc' | 'desc'>('desc');

    // 表格2的排序状态
    const [sort2Field, setSort2Field] = useState<string>('startTime');
    const [sort2Order, setSort2Order] = useState<'asc' | 'desc'>('desc');

    // 表格1排序回调
    const handleSort1 = (field: string, order: 'asc' | 'desc') => {
        setSort1Field(field);
        setSort1Order(order);
    };

    // 表格2排序回调
    const handleSort2 = (field: string, order: 'asc' | 'desc') => {
        setSort2Field(field);
        setSort2Order(order);
    };

    // 表格1列定义
    const columns1 = [
        {
            title: <SortableColumnTitle
                title="金额"
                sortField={sort1Field}
                fieldName="amount"
                sortOrder={sort1Order}
                onSort={handleSort1}
            />,
            dataIndex: 'amount',
        },
    ];

    // 表格2列定义
    const columns2 = [
        {
            title: <SortableColumnTitle
                title="开始时间"
                sortField={sort2Field}
                fieldName="startTime"
                sortOrder={sort2Order}
                onSort={handleSort2}
                align="left"
            />,
            dataIndex: 'startTime',
        },
    ];

    return (
        <>
            <Table columns={columns1} dataSource={sortedData1} />
            <Table columns={columns2} dataSource={sortedData2} />
        </>
    );
};
```

---

## 组件属性说明

### Props 接口

```typescript
interface SortableColumnTitleProps {
    /** 列标题文字 */
    title: string;
    
    /** 当前排序字段（全局状态） */
    sortField: string;
    
    /** 此列对应的字段名 */
    fieldName: string;
    
    /** 当前排序方向（全局状态） */
    sortOrder: 'asc' | 'desc';
    
    /** 点击排序回调 */
    onSort: (field: string, order: 'asc' | 'desc') => void;
    
    /** 对齐方式，默认 'right' */
    align?: 'left' | 'center' | 'right';
}
```

### 属性详解

| 属性 | 类型 | 必填 | 默认值 | 说明 |
|-----|------|-----|--------|------|
| `title` | `string` | ✅ | - | 列标题显示的文字 |
| `sortField` | `string` | ✅ | - | 当前正在排序的字段名（全局状态） |
| `fieldName` | `string` | ✅ | - | 此列对应的数据字段名 |
| `sortOrder` | `'asc' \| 'desc'` | ✅ | - | 当前排序方向（全局状态） |
| `onSort` | `(field, order) => void` | ✅ | - | 点击排序时的回调函数 |
| `align` | `'left' \| 'center' \| 'right'` | ❌ | `'right'` | 标题对齐方式 |

---

## 实际应用案例

### 1. 员工工资汇总表

**文件**：`frontend/src/pages/Finance/PayrollOperatorSummary.tsx`

```typescript
// 工资汇总Tab - 支持6个字段排序
const summaryColumns = [
    { title: '人员', dataIndex: 'operatorName' },
    {
        title: <SortableColumnTitle
            title="总数量"
            sortField={sortField}
            fieldName="totalQuantity"
            sortOrder={sortOrder}
            onSort={handleSort}
        />,
        dataIndex: 'totalQuantity',
    },
    {
        title: <SortableColumnTitle
            title="总金额(元)"
            sortField={sortField}
            fieldName="totalAmount"
            sortOrder={sortOrder}
            onSort={handleSort}
        />,
        dataIndex: 'totalAmount',
    },
    {
        title: <SortableColumnTitle
            title="扫码次数"
            sortField={sortField}
            fieldName="recordCount"
            sortOrder={sortOrder}
            onSort={handleSort}
        />,
        dataIndex: 'recordCount',
    },
    {
        title: <SortableColumnTitle
            title="订单数"
            sortField={sortField}
            fieldName="orderCount"
            sortOrder={sortOrder}
            onSort={handleSort}
        />,
        dataIndex: 'orderCount',
    },
    {
        title: <SortableColumnTitle
            title="审核时间"
            sortField={sortField}
            fieldName="approvalTime"
            sortOrder={sortOrder}
            onSort={handleSort}
            align="left"
        />,
        dataIndex: 'approvalTime',
    },
    {
        title: <SortableColumnTitle
            title="付款时间"
            sortField={sortField}
            fieldName="paymentTime"
            sortOrder={sortOrder}
            onSort={handleSort}
            align="left"
        />,
        dataIndex: 'paymentTime',
    },
];
```

### 2. 员工工序明细表

**文件**：同上，使用独立的排序状态

```typescript
// 员工工序Tab - 支持开始时间、完成时间排序
const columns = [
    { title: '订单号', dataIndex: 'orderNo' },
    { title: '款号', dataIndex: 'styleNo' },
    {
        title: <SortableColumnTitle
            title="开始时间"
            sortField={detailSortField}
            fieldName="startTime"
            sortOrder={detailSortOrder}
            onSort={handleDetailSort}
            align="left"
        />,
        dataIndex: 'startTime',
    },
    {
        title: <SortableColumnTitle
            title="完成时间"
            sortField={detailSortField}
            fieldName="endTime"
            sortOrder={detailSortOrder}
            onSort={handleDetailSort}
            align="left"
        />,
        dataIndex: 'endTime',
    },
];
```

---

## 设计原则

### 1. 视觉反馈清晰
- 激活列使用蓝色图标（`#1890ff`）
- 非激活列使用半透明灰色图标（`opacity: 0.3`）
- 鼠标悬停显示 `pointer` 光标

### 2. 交互符合直觉
- 首次点击：按该列降序排列
- 再次点击：切换为升序排列
- 点击其他列：该列变为激活状态，切换到降序

### 3. 性能优化
- 使用 `useMemo` 缓存排序结果
- 只在 `sortField` 或 `sortOrder` 变化时重新计算

---

## 常见问题

### Q1: 如何支持自定义排序逻辑？

A: 在 `sortedData` 的 `useMemo` 中自定义比较函数：

```typescript
const sortedData = useMemo(() => {
    const sorted = [...data];
    sorted.sort((a, b) => {
        if (sortField === 'customField') {
            // 自定义比较逻辑
            const customCompare = (valA, valB) => {
                // 你的逻辑
            };
            return sortOrder === 'desc' 
                ? customCompare(b.customField, a.customField)
                : customCompare(a.customField, b.customField);
        }
        // ... 其他字段的处理
    });
    return sorted;
}, [data, sortField, sortOrder]);
```

### Q2: 如何在服务端排序？

A: 修改 `onSort` 回调，调用 API 请求：

```typescript
const handleSort = async (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
    
    // 调用后端接口
    const response = await api.post('/your-api', {
        sortField: field,
        sortOrder: order,
    });
    setData(response.data);
};
```

### Q3: 如何设置默认排序？

A: 在初始状态中设置：

```typescript
const [sortField, setSortField] = useState<string>('createTime'); // 默认按创建时间
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc'); // 默认降序
```

### Q4: 多表格排序状态冲突怎么办？

A: 每个表格使用独立的状态变量：

```typescript
// 表格1
const [sort1Field, setSort1Field] = useState('field1');
const [sort1Order, setSort1Order] = useState<'asc' | 'desc'>('desc');

// 表格2
const [sort2Field, setSort2Field] = useState('field2');
const [sort2Order, setSort2Order] = useState<'asc' | 'desc'>('desc');
```

---

## 扩展建议

### 1. 添加持久化

将排序状态保存到 `localStorage`：

```typescript
const [sortField, setSortField] = useState<string>(() => {
    return localStorage.getItem('tableSortField') || 'amount';
});

const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
    localStorage.setItem('tableSortField', field);
    localStorage.setItem('tableSortOrder', order);
};
```

### 2. 添加多列排序

支持按多个字段依次排序：

```typescript
const [sortFields, setSortFields] = useState([
    { field: 'amount', order: 'desc' },
    { field: 'createTime', order: 'desc' },
]);
```

---

*最后更新：2026-01-24*  
*维护者：系统*
