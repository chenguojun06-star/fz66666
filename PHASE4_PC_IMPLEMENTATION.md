# 📋 Phase 4: PC端SKU进度显示实现指南

## 目标
在PC端的订单详情页面（OrderFlow.tsx）中显示SKU级别的扫码进度，使用后端新的SKU API。

## 实现步骤

### 1. 更新 api.ts - 添加SKU相关API调用

```typescript
// frontend/src/utils/api.ts

// 在 production 对象中添加
export const production = {
  // ... 现有的API
  
  // ✅ Phase 4新增: SKU相关API
  getSKUList: (orderNo: string) => 
    api.get(`/api/production/scan/sku/list/${orderNo}`),
  
  getSKUProgress: (params: {orderNo: string; styleNo: string; color: string; size: string}) =>
    api.get('/api/production/scan/sku/progress', {params}),
  
  getOrderSKUProgress: (orderNo: string) =>
    api.get(`/api/production/scan/sku/order-progress/${orderNo}`),
  
  getSKUReport: (orderNo: string) =>
    api.get(`/api/production/scan/sku/report/${orderNo}`),
};
```

### 2. 更新 OrderFlow.tsx - 添加SKU进度表格

在 Tabs 中添加新的 "SKU进度" 标签页：

```typescript
// 在 items 数组中添加
{
  key: 'sku-progress',
  label: 'SKU进度',
  children: (
    <div className="order-flow-module">
      <div className="order-flow-module-title">SKU扫码进度</div>
      <SKUProgressTable orderNo={currentOrderNo} />
    </div>
  ),
},
```

### 3. 创建 SKUProgressTable 组件

```typescript
// frontend/src/pages/Production/components/SKUProgressTable.tsx

import { Table, Progress, Tag, Spin } from 'antd';
import { useEffect, useState } from 'react';
import api from '../../../utils/api';

interface SKUProgressRecord {
  styleNo: string;
  color: string;
  size: string;
  totalCount: number;
  completedCount: number;
  remainingCount: number;
  progressPercent: string;
  completed: boolean;
}

interface SKUProgressTableProps {
  orderNo: string;
}

export default function SKUProgressTable({ orderNo }: SKUProgressTableProps) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SKUProgressRecord[]>([]);

  useEffect(() => {
    if (!orderNo) return;
    loadSKUProgress();
  }, [orderNo]);

  const loadSKUProgress = async () => {
    try {
      setLoading(true);
      const result = await api.production.getOrderSKUProgress(orderNo);
      
      // 构建表格数据
      const skuDetails = result.data?.details || [];
      setData(skuDetails);
    } catch (error) {
      console.error('获取SKU进度失败', error);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 100,
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 80,
    },
    {
      title: '订单数',
      dataIndex: 'totalCount',
      key: 'totalCount',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '已完成',
      dataIndex: 'completedCount',
      key: 'completedCount',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '待完成',
      dataIndex: 'remainingCount',
      key: 'remainingCount',
      width: 80,
      align: 'right' as const,
    },
    {
      title: '进度',
      key: 'progress',
      width: 150,
      render: (_: any, record: SKUProgressRecord) => (
        <Progress
          percent={parseInt(record.progressPercent)}
          size="small"
          format={() => `${record.progressPercent}%`}
          showInfo={true}
        />
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (_: any, record: SKUProgressRecord) => (
        record.completed ? (
          <Tag color="green">✓ 完成</Tag>
        ) : (
          <Tag color="processing">⏳ 进行中</Tag>
        )
      ),
    },
  ];

  return (
    <Spin spinning={loading}>
      <Table
        size="small"
        columns={columns}
        dataSource={data}
        rowKey={(r) => `${r.styleNo}:${r.color}:${r.size}`}
        pagination={false}
        scroll={{ x: 'max-content' }}
      />
      <div style={{marginTop: 16, fontSize: 12, color: '#666'}}>
        <div>点击"刷新"按钮即时更新最新的扫码进度</div>
      </div>
    </Spin>
  );
}
```

### 4. 更新OrderFlow.tsx中的刷新逻辑

在现有的 `loadData` 或刷新函数中调用 SKU 进度加载：

```typescript
const loadData = async (orderNo: string) => {
  try {
    // 现有的加载逻辑
    // ...
    
    // ✅ 新增: 加载SKU进度
    const skuProgress = await api.production.getOrderSKUProgress(orderNo);
    setSKUProgressData(skuProgress.data);
  } catch (error) {
    console.error('加载数据失败', error);
  }
};
```

## 测试检查表

- [ ] PC端访问订单详情页面加载正常
- [ ] 点击"SKU进度"标签页显示表格
- [ ] 表格显示正确的SKU列表（颜色、尺码、数量）
- [ ] 进度条显示0-100%正确
- [ ] 完成状态标签显示正确（绿色完成/蓝色进行中）
- [ ] 点击刷新按钮更新最新数据
- [ ] 响应式设计在小屏幕也能正常显示

## 优势

- ✅ PC端可视化SKU进度追踪
- ✅ 实时刷新获取最新状态
- ✅ 用户友好的进度显示
- ✅ 快速判断订单完成度

## 文件清单

需要修改:
- `frontend/src/utils/api.ts` - 添加API调用
- `frontend/src/pages/Production/OrderFlow.tsx` - 添加标签页和加载逻辑

需要创建:
- `frontend/src/pages/Production/components/SKUProgressTable.tsx` - SKU进度表格组件

## 预估工作量

- 编码: 2-3小时
- 测试: 1小时
- 总计: 0.5天 ✓

---

**注**: 如需与后端集成测试，确保:
1. 后端 SKU API 已正确部署
2. MySQL 数据库中 ScanRecord 表已添加新字段 (scanMode, skuCompletedCount, skuTotalCount)
3. 数据库迁移脚本已执行

