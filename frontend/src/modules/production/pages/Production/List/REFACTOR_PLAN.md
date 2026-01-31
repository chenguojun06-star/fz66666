# Production/List 拆分方案

## 当前状态
- **原文件**: `index.tsx` (3800行)
- **问题**: 文件过大，可维护性差

## 拆分目标
将3800行拆分为：
- ✅ **主文件** (<500行) - 页面骨架和组件组合
- ✅ **6个子组件** (<300行/个)
- ✅ **2个Hooks** (<150行/个)

## 已完成 ✅

### 1. Hooks (2个)
- ✅ `hooks/useOrderList.ts` (85行) - 数据获取、分页、实时同步
- ✅ `hooks/useOrderActions.ts` (180行) - 增删改查、关单、报废

## 待创建组件

### 2. FilterPanel.tsx (~200行)
**功能**: 筛选面板  
**包含**:
- 订单号/款号/加工厂/状态筛选
- 日期范围选择
- 搜索/重置按钮
- 批量导出功能

**Props**:
```typescript
interface FilterPanelProps {
  queryParams: ProductionQueryParams;
  onSearch: (params: ProductionQueryParams) => void;
  onReset: () => void;
  onExport: () => void;
  selectedCount: number;
}
```

### 3. OrderTable.tsx (~400行)
**功能**: 订单表格  
**包含**:
- 列配置（25+列，可显示/隐藏）
- 表格数据展示
- 行操作按钮（查看、编辑、关单、报废）
- 排序功能
- 列表/卡片视图切换

**Props**:
```typescript
interface OrderTableProps {
  dataSource: ProductionOrder[];
  loading: boolean;
  total: number;
  queryParams: ProductionQueryParams;
  visibleColumns: Record<string, boolean>;
  onPageChange: (page: number, pageSize: number) => void;
  onRowClick: (record: ProductionOrder) => void;
  onQuickEdit: (record: ProductionOrder) => void;
  onViewLog: (record: ProductionOrder) => void;
  onCloseOrder: (record: ProductionOrder) => void;
  onScrapOrder: (record: ProductionOrder) => void;
  onOpenProcessDetail: (record: ProductionOrder, type: string) => void;
}
```

### 4. OrderDetailModal.tsx (~450行)
**功能**: 订单详情弹窗  
**包含**:
- 基本信息展示（款号、款名、订单号）
- SKU尺码表格
- 生产进度条
- 裁剪数量/入库数量统计
- 关闭按钮

**Props**:
```typescript
interface OrderDetailModalProps {
  visible: boolean;
  order: ProductionOrder | null;
  onClose: () => void;
}
```

### 5. ProcessDetailModal.tsx (~600行)
**功能**: 工序详情弹窗  
**包含**:
- 采购状态展示
- 工序节点状态展示
- 工序委派管理（Tab）
- 工厂选择、单价设置
- 保存委派操作

**Props**:
```typescript
interface ProcessDetailModalProps {
  visible: boolean;
  record: ProductionOrder | null;
  type: 'procurement' | 'cutting' | 'all';
  onClose: () => void;
  onSave: () => void;
}
```

### 6. QuickEditModal.tsx (~150行)
**功能**: 快速编辑弹窗  
**包含**:
- 备注编辑
- 预计出货日期选择
- 保存/取消按钮

**Props**:
```typescript
interface QuickEditModalProps {
  visible: boolean;
  order: ProductionOrder | null;
  onSave: (values: { remarks: string; expectedShipDate: string | null }) => void;
  onCancel: () => void;
  saving: boolean;
}
```

### 7. LogModal.tsx (~200行)
**功能**: 操作日志弹窗  
**包含**:
- 扫码记录表格
- 类型/环节/操作人/时间/结果列
- 分页

**Props**:
```typescript
interface LogModalProps {
  visible: boolean;
  title: string;
  records: ScanRecord[];
  loading: boolean;
  onClose: () => void;
}
```

## 新主文件结构 (index.tsx ~450行)

```typescript
import React from 'react';
import Layout from '@/components/Layout';
import { useOrderList } from './hooks/useOrderList';
import { useOrderActions } from './hooks/useOrderActions';
import FilterPanel from './components/FilterPanel';
import OrderTable from './components/OrderTable';
import OrderDetailModal from './components/OrderDetailModal';
import ProcessDetailModal from './components/ProcessDetailModal';
import QuickEditModal from './components/QuickEditModal';
import LogModal from './components/LogModal';
import './styles.css';

const ProductionList: React.FC = () => {
  // Hooks
  const {
    productionList,
    loading,
    total,
    queryParams,
    setQueryParams,
    fetchProductionList,
  } = useOrderList();

  const {
    handleQuickEditSave,
    handleCloseOrder,
    handleScrapOrder,
  } = useOrderActions(fetchProductionList);

  // Modal states
  const [orderModalVisible, setOrderModalVisible] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ProductionOrder | null>(null);
  // ... 其他状态

  return (
    <Layout>
      <div className="production-list-container">
        {/* 筛选面板 */}
        <FilterPanel
          queryParams={queryParams}
          onSearch={setQueryParams}
          onReset={() => setQueryParams({ page: 1, pageSize: 10 })}
          selectedCount={selectedRowKeys.length}
        />

        {/* 订单表格 */}
        <OrderTable
          dataSource={productionList}
          loading={loading}
          total={total}
          queryParams={queryParams}
          visibleColumns={visibleColumns}
          onPageChange={(page, pageSize) => setQueryParams({ ...queryParams, page, pageSize })}
          onRowClick={(order) => {
            setSelectedOrder(order);
            setOrderModalVisible(true);
          }}
          onQuickEdit={(order) => {
            setSelectedOrder(order);
            setQuickEditModalVisible(true);
          }}
          onCloseOrder={handleCloseOrder}
          onScrapOrder={handleScrapOrder}
        />

        {/* 弹窗组件 */}
        <OrderDetailModal
          visible={orderModalVisible}
          order={selectedOrder}
          onClose={() => setOrderModalVisible(false)}
        />

        <ProcessDetailModal
          visible={processDetailVisible}
          record={processDetailRecord}
          type={processDetailType}
          onClose={() => setProcessDetailVisible(false)}
          onSave={fetchProductionList}
        />

        <QuickEditModal
          visible={quickEditModalVisible}
          order={selectedOrder}
          onSave={handleQuickEditSave}
          onCancel={() => setQuickEditModalVisible(false)}
          saving={quickEditSaving}
        />

        <LogModal
          visible={logModalVisible}
          title={logTitle}
          records={logRecords}
          loading={logLoading}
          onClose={() => setLogModalVisible(false)}
        />
      </div>
    </Layout>
  );
};

export default ProductionList;
```

## 文件结构

```
frontend/src/modules/production/pages/Production/List/
├── index.tsx                 # 主文件 (~450行)
├── styles.css                # 样式文件
├── components/
│   ├── FilterPanel.tsx       # 筛选面板 (~200行)
│   ├── OrderTable.tsx        # 订单表格 (~400行)
│   ├── OrderDetailModal.tsx  # 详情弹窗 (~450行)
│   ├── ProcessDetailModal.tsx # 工序详情 (~600行)
│   ├── QuickEditModal.tsx    # 快速编辑 (~150行)
│   └── LogModal.tsx          # 日志弹窗 (~200行)
└── hooks/
    ├── useOrderList.ts       # 数据管理 (~85行) ✅
    └── useOrderActions.ts    # 操作逻辑 (~180行) ✅
```

## 优势

1. **可维护性** ✅
   - 每个文件<600行，职责单一
   - 组件独立测试
   - 修改不影响其他部分

2. **可复用性** ✅
   - FilterPanel 可用于其他列表页
   - OrderDetailModal 可在其他地方调用
   - Hooks 可在多个页面共享

3. **性能优化** ✅
   - 按需加载组件
   - 减少不必要的re-render
   - 更好的代码分割

## 下一步

用户确认方案后，我将：
1. 创建 6 个子组件文件
2. 重构主文件
3. 测试拆分后的代码
4. 更新导入路径
5. 验证功能正常

**预计完成时间**: 2-3 小时（手工）/ 30分钟（AI辅助）
