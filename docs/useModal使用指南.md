# useModal Hook 使用指南

**版本**: 1.0  
**文件位置**: `frontend/src/hooks/useModal.ts`  
**最后更新**: 2026-02-04

---

## 📖 概述

### 什么是 useModal？

`useModal` 是一个通用的弹窗状态管理 Hook，用于简化 Modal 组件的开关状态和数据传递。它提供了类型安全的 API，统一了弹窗管理模式。

### 为什么使用 useModal？

**传统方式的痛点**：
```tsx
// ❌ 旧方式：需要手动管理 2-3 个状态
const [detailModalVisible, setDetailModalVisible] = useState(false);
const [currentRecord, setCurrentRecord] = useState<ProductionOrder>();

// 打开弹窗需要 2 行代码
const handleView = (record: ProductionOrder) => {
  setCurrentRecord(record);
  setDetailModalVisible(true);
};

// 关闭弹窗需要 2 行代码
const handleClose = () => {
  setDetailModalVisible(false);
  setCurrentRecord(undefined); // 需要手动清理
};
```

**使用 useModal 的优势**：
```tsx
// ✅ 新方式：一行代码搞定
const detailModal = useModal<ProductionOrder>();

// 打开弹窗：一行代码
const handleView = (record: ProductionOrder) => {
  detailModal.open(record);
};

// 关闭弹窗：一行代码
const handleClose = () => {
  detailModal.close(); // 自动清理数据
};
```

**核心优势**：
- ✅ **代码更少**：从 4 行减少到 1 行（减少 75%）
- ✅ **类型安全**：TypeScript 自动推导数据类型
- ✅ **自动清理**：关闭弹窗时自动清空数据，避免内存泄漏
- ✅ **API 统一**：所有弹窗使用相同的 open/close 接口
- ✅ **延迟清理**：避免关闭动画时数据闪烁（300ms 延迟）

### 当前使用情况

**已应用页面**（14+ 实例）：
- ✅ MaterialPurchase：5 个弹窗（返回确认、重置、快速编辑、物料库、收货弹窗）
- ✅ List（生产订单列表）：2 个弹窗（快速编辑、日志查看）
- ✅ MaterialDatabase：1 个弹窗（物料详情）
- ✅ SampleInventory：3 个弹窗（入库、借用、历史记录）

**采用率**：~28.6%（10/35 Modal 使用页面）

---

## 🔧 API 文档

### 类型定义

```tsx
/**
 * useModal 返回值类型
 */
interface ModalState<T> {
  /** 弹窗是否可见 */
  visible: boolean;
  
  /** 弹窗关联的数据（打开时传入） */
  data: T | null;
  
  /** 打开弹窗 */
  open: (record?: T) => void;
  
  /** 关闭弹窗并清空数据 */
  close: () => void;
  
  /** 更新数据（不关闭弹窗） */
  setModalData: (newData: T | null) => void;
}
```

### 基本用法

```tsx
import { useModal } from '@/hooks';

// 创建弹窗实例（指定数据类型）
const modal = useModal<ProductionOrder>();

// 使用 modal.visible 控制弹窗显示
// 使用 modal.data 访问弹窗数据
// 调用 modal.open(data) 打开弹窗
// 调用 modal.close() 关闭弹窗
```

### 类型参数说明

```tsx
// 1. 指定实体类型（最常用）
const editModal = useModal<ProductionOrder>();  // 编辑订单
const detailModal = useModal<MaterialPurchase>(); // 查看采购单

// 2. 指定数组类型（批量操作）
const batchModal = useModal<ProductionOrder[]>(); // 批量删除/导出

// 3. 指定自定义数据类型
interface MaterialDatabaseModalData {
  onSelect: (material: MaterialDatabase) => void;
  defaultKeyword?: string;
}
const dbModal = useModal<MaterialDatabaseModalData>(); // 物料库选择器

// 4. 不传数据（无关联数据的弹窗）
const confirmModal = useModal<void>();  // 确认框
const logModal = useModal();            // 日志查看（使用 any）
```

### 返回值属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `visible` | `boolean` | 弹窗可见状态 |
| `data` | `T \| null` | 弹窗关联的数据（类型安全） |
| `open` | `(record?: T) => void` | 打开弹窗的方法，可选传入数据 |
| `close` | `() => void` | 关闭弹窗的方法，会延迟 300ms 清空数据 |
| `setModalData` | `(newData: T \| null) => void` | 更新数据的方法（不关闭弹窗） |

---

## 💡 使用示例

### 示例 1：实体编辑 Modal（最常用）

```tsx
import { useModal } from '@/hooks';
import ResizableModal from '@/components/common/ResizableModal';
import { Form, Input, Button } from 'antd';

interface ProductionOrder {
  id: string;
  orderNo: string;
  styleNo: string;
  quantity: number;
}

const OrderList: React.FC = () => {
  // 1. 创建弹窗实例（指定类型）
  const editModal = useModal<ProductionOrder>();
  
  const [form] = Form.useForm();

  // 2. 打开编辑弹窗
  const handleEdit = (record: ProductionOrder) => {
    editModal.open(record);
    form.setFieldsValue(record); // 回填表单
  };

  // 3. 提交编辑
  const handleSubmit = async () => {
    const values = await form.validateFields();
    // 调用 API 更新数据
    await updateOrder(editModal.data!.id, values);
    editModal.close();
  };

  return (
    <>
      <Button onClick={() => handleEdit(someRecord)}>编辑</Button>
      
      {/* 4. 使用 visible 和 data */}
      <ResizableModal
        title="编辑订单"
        visible={editModal.visible}
        onOk={handleSubmit}
        onCancel={editModal.close}
      >
        <Form form={form}>
          <Form.Item name="orderNo" label="订单号">
            <Input />
          </Form.Item>
          {/* 更多表单项 */}
        </Form>
      </ResizableModal>
    </>
  );
};
```

---

### 示例 2：无数据 Modal（日志/确认框）

```tsx
import { useModal } from '@/hooks';

const OrderList: React.FC = () => {
  // 不指定类型（或使用 void）
  const logModal = useModal();
  
  return (
    <>
      <Button onClick={() => logModal.open()}>查看日志</Button>
      
      <ResizableModal
        title="操作日志"
        visible={logModal.visible}
        onCancel={logModal.close}
        footer={<Button onClick={logModal.close}>关闭</Button>}
      >
        {/* 日志内容，不依赖 modal.data */}
        <LogViewer />
      </ResizableModal>
    </>
  );
};
```

---

### 示例 3：解构 API 用法（简化访问）

```tsx
import { useModal } from '@/hooks';

const MaterialDatabase: React.FC = () => {
  // 解构返回值
  const { visible, data: currentMaterial, open, close } = useModal<MaterialDatabase>();
  
  const handleView = (material: MaterialDatabase) => {
    open(material); // 直接使用解构的 open
  };

  return (
    <>
      <Button onClick={() => handleView(someMaterial)}>查看</Button>
      
      <ResizableModal
        title="物料详情"
        visible={visible}  {/* 直接使用 visible */}
        onCancel={close}   {/* 直接使用 close */}
      >
        {currentMaterial && (
          <div>
            <p>物料编号：{currentMaterial.materialCode}</p>
            <p>物料名称：{currentMaterial.materialName}</p>
          </div>
        )}
      </ResizableModal>
    </>
  );
};
```

---

### 示例 4：批量操作 Modal（数组类型）

```tsx
import { useModal } from '@/hooks';

const MaterialPurchase: React.FC = () => {
  // 使用数组类型
  const returnConfirmModal = useModal<MaterialPurchaseType[]>();
  
  const handleBatchReturn = (selectedRecords: MaterialPurchaseType[]) => {
    returnConfirmModal.open(selectedRecords);
  };

  const handleConfirmReturn = async () => {
    const records = returnConfirmModal.data!;
    // 批量退货
    await Promise.all(records.map(r => returnPurchase(r.id)));
    returnConfirmModal.close();
  };

  return (
    <>
      <Button onClick={() => handleBatchReturn(selectedRows)}>
        批量退货
      </Button>
      
      <ResizableModal
        title="确认退货"
        visible={returnConfirmModal.visible}
        onOk={handleConfirmReturn}
        onCancel={returnConfirmModal.close}
      >
        <p>确定要退货以下 {returnConfirmModal.data?.length} 条记录吗？</p>
        <ul>
          {returnConfirmModal.data?.map(item => (
            <li key={item.id}>{item.materialName}</li>
          ))}
        </ul>
      </ResizableModal>
    </>
  );
};
```

---

### 示例 5：自定义数据类型（回调函数）

```tsx
import { useModal } from '@/hooks';

interface MaterialDatabaseModalData {
  onSelect: (material: MaterialDatabase) => void;
  defaultKeyword?: string;
}

const MaterialPurchase: React.FC = () => {
  const materialDatabaseModal = useModal<MaterialDatabaseModalData>();
  
  const handleOpenDatabase = () => {
    materialDatabaseModal.open({
      onSelect: (material) => {
        // 选择物料后的回调
        console.log('选中物料：', material);
        materialDatabaseModal.close();
      },
      defaultKeyword: '面料',
    });
  };

  return (
    <>
      <Button onClick={handleOpenDatabase}>选择物料</Button>
      
      <ResizableModal
        title="物料库"
        visible={materialDatabaseModal.visible}
        onCancel={materialDatabaseModal.close}
      >
        <MaterialDatabasePicker
          onSelect={materialDatabaseModal.data?.onSelect}
          defaultKeyword={materialDatabaseModal.data?.defaultKeyword}
        />
      </ResizableModal>
    </>
  );
};
```

---

### 示例 6：更新数据（不关闭弹窗）

```tsx
import { useModal } from '@/hooks';

const OrderList: React.FC = () => {
  const editModal = useModal<ProductionOrder>();
  
  const handleEdit = (record: ProductionOrder) => {
    editModal.open(record);
  };

  // 保存后刷新数据（不关闭弹窗）
  const handleSave = async () => {
    const updated = await updateOrder(editModal.data!);
    
    // 使用 setModalData 更新数据
    editModal.setModalData(updated);
    
    message.success('保存成功');
    // 弹窗保持打开，数据已更新
  };

  return (
    <ResizableModal
      title="编辑订单"
      visible={editModal.visible}
      onCancel={editModal.close}
      footer={[
        <Button key="save" onClick={handleSave}>保存并继续编辑</Button>,
        <Button key="close" type="primary" onClick={editModal.close}>保存并关闭</Button>,
      ]}
    >
      {/* 表单内容 */}
    </ResizableModal>
  );
};
```

---

## 🔄 迁移指南

### 从 useState 迁移到 useModal

#### 场景 1：单个弹窗

**迁移前（4 行代码）**：
```tsx
const [visible, setVisible] = useState(false);
const [currentRecord, setCurrentRecord] = useState<ProductionOrder>();

// 打开弹窗
const handleEdit = (record: ProductionOrder) => {
  setCurrentRecord(record);
  setVisible(true);
};

// 关闭弹窗
const handleClose = () => {
  setVisible(false);
  setCurrentRecord(undefined);
};
```

**迁移后（1 行代码）**：
```tsx
const editModal = useModal<ProductionOrder>();

// 打开弹窗
const handleEdit = (record: ProductionOrder) => {
  editModal.open(record);
};

// 关闭弹窗
const handleClose = () => {
  editModal.close();
};
```

---

#### 场景 2：多个弹窗

**迁移前（12 行代码）**：
```tsx
const [editVisible, setEditVisible] = useState(false);
const [editRecord, setEditRecord] = useState<Order>();

const [deleteVisible, setDeleteVisible] = useState(false);
const [deleteRecord, setDeleteRecord] = useState<Order>();

const [logVisible, setLogVisible] = useState(false);
const [logRecord, setLogRecord] = useState<Order>();
```

**迁移后（3 行代码）**：
```tsx
const editModal = useModal<Order>();
const deleteModal = useModal<Order>();
const logModal = useModal<Order>();
```

---

### 替换模式速查表

| 旧代码 | 新代码 | 说明 |
|--------|--------|------|
| `const [visible, setVisible] = useState(false)` | `const modal = useModal<T>()` | 创建弹窗实例 |
| `const [data, setData] = useState<T>()` | 已包含在 `modal.data` | 数据自动管理 |
| `setVisible(true); setData(record)` | `modal.open(record)` | 打开弹窗 |
| `setVisible(false); setData(undefined)` | `modal.close()` | 关闭弹窗 |
| `visible` | `modal.visible` | 可见状态 |
| `data` | `modal.data` | 关联数据 |
| `setData(newData)` | `modal.setModalData(newData)` | 更新数据 |

---

### 迁移步骤（5 步完成）

**Step 1**：导入 useModal
```tsx
import { useModal } from '@/hooks';
```

**Step 2**：替换 useState 声明
```tsx
// Before
const [detailVisible, setDetailVisible] = useState(false);
const [currentRecord, setCurrentRecord] = useState<Order>();

// After
const detailModal = useModal<Order>();
```

**Step 3**：更新打开逻辑
```tsx
// Before
setCurrentRecord(record);
setDetailVisible(true);

// After
detailModal.open(record);
```

**Step 4**：更新关闭逻辑
```tsx
// Before
setDetailVisible(false);
setCurrentRecord(undefined);

// After
detailModal.close();
```

**Step 5**：更新 Modal 组件属性
```tsx
// Before
<ResizableModal
  visible={detailVisible}
  onCancel={() => setDetailVisible(false)}
>
  {currentRecord && <div>{currentRecord.orderNo}</div>}
</ResizableModal>

// After
<ResizableModal
  visible={detailModal.visible}
  onCancel={detailModal.close}
>
  {detailModal.data && <div>{detailModal.data.orderNo}</div>}
</ResizableModal>
```

---

## ⚡ 最佳实践

### 1. 始终指定类型参数

```tsx
// ✅ 推荐：显式指定类型
const editModal = useModal<ProductionOrder>();

// ❌ 避免：使用 any（丢失类型安全）
const editModal = useModal();  // data 类型为 any
```

---

### 2. 使用描述性变量名

```tsx
// ✅ 推荐：清晰的命名
const editModal = useModal<Order>();
const deleteModal = useModal<Order>();
const quickEditModal = useModal<Order>();
const confirmModal = useModal<void>();

// ❌ 避免：模糊的命名
const modal1 = useModal<Order>();
const modal2 = useModal<Order>();
const m = useModal<Order>();
```

---

### 3. 解构时重命名避免冲突

```tsx
// ✅ 推荐：解构时重命名
const {
  visible: editVisible,
  data: editData,
  open: openEdit,
  close: closeEdit
} = useModal<Order>();

const {
  visible: deleteVisible,
  data: deleteData,
  open: openDelete,
  close: closeDelete
} = useModal<Order>();
```

---

### 4. 使用 void 表示无数据弹窗

```tsx
// ✅ 推荐：显式使用 void
const confirmModal = useModal<void>();
confirmModal.open(); // 不传参数

// ⚠️ 可接受：省略类型（使用 any）
const logModal = useModal();
logModal.open(); // 不传参数
```

---

### 5. 关闭前验证必填字段

```tsx
const editModal = useModal<Order>();

const handleSave = async () => {
  // ✅ 推荐：使用非空断言前验证
  if (!editModal.data) {
    message.error('没有数据');
    return;
  }
  
  await updateOrder(editModal.data.id, values);
  editModal.close();
};
```

---

### 6. 利用延迟清理避免闪烁

```tsx
// useModal 内部已实现 300ms 延迟清理
const close = () => {
  setVisible(false);
  setTimeout(() => setData(null), 300); // 避免关闭动画时数据闪烁
};

// ✅ 直接使用即可
<ResizableModal visible={modal.visible} onCancel={modal.close}>
  {modal.data && <div>{modal.data.orderNo}</div>}
  {/* 关闭时不会立即消失，有 300ms 缓冲 */}
</ResizableModal>
```

---

### 7. 避免在 useEffect 中调用 open

```tsx
// ❌ 避免：在 useEffect 中自动打开弹窗
useEffect(() => {
  if (someCondition) {
    modal.open(someData);
  }
}, [someCondition]);

// ✅ 推荐：由用户操作触发
<Button onClick={() => modal.open(someData)}>打开</Button>
```

---

## 📊 对比分析

### 代码量对比

| 场景 | 使用 useState | 使用 useModal | 减少代码 |
|------|--------------|---------------|---------|
| 单个弹窗 | 4 行 | 1 行 | **-75%** |
| 3 个弹窗 | 12 行 | 3 行 | **-75%** |
| 5 个弹窗 | 20 行 | 5 行 | **-75%** |

### 类型安全对比

| 方面 | 使用 useState | 使用 useModal |
|------|--------------|---------------|
| 数据类型 | 手动管理（容易出错） | 自动推导（类型安全） |
| 空值检查 | 需要手动 `data?` | 需要手动 `modal.data?` |
| API 一致性 | 各异（setXxx） | 统一（open/close） |
| 数据清理 | 手动清理（可能忘记） | 自动清理（内置延迟） |

### 实际案例对比

**案例：MaterialPurchase.tsx（5 个弹窗）**

**迁移前**：
```tsx
// 20 行 useState 声明
const [returnConfirmVisible, setReturnConfirmVisible] = useState(false);
const [returnConfirmData, setReturnConfirmData] = useState<MaterialPurchaseType[]>();

const [returnResetVisible, setReturnResetVisible] = useState(false);
const [returnResetData, setReturnResetData] = useState<MaterialPurchaseType>();

const [quickEditVisible, setQuickEditVisible] = useState(false);
const [quickEditData, setQuickEditData] = useState<MaterialPurchaseType>();

const [materialDatabaseVisible, setMaterialDatabaseVisible] = useState(false);
const [materialDatabaseData, setMaterialDatabaseData] = useState<MaterialDatabaseModalData>();

const [receiveVisible, setReceiveVisible] = useState(false);
const [receiveData, setReceiveData] = useState<MaterialPurchaseType>();
```

**迁移后**：
```tsx
// 5 行 useModal 声明
const returnConfirmModal = useModal<MaterialPurchaseType[]>();
const returnResetModal = useModal<MaterialPurchaseType>();
const quickEditModal = useModal<MaterialPurchaseType>();
const materialDatabaseModal = useModal<MaterialDatabaseModalData>();
const receiveModal = useModal<MaterialPurchaseType>();
```

**效果**：减少 **75% 代码**（20 行 → 5 行）

---

## ❓ 常见问题

### Q1: 为什么使用 null 而不是 undefined？

**A**: 为了与 Ant Design 的 Form 组件兼容，Form 使用 `null` 表示空值。

```tsx
const modal = useModal<Order>();

// modal.data 类型为 Order | null（不是 undefined）
if (modal.data) {
  // TypeScript 自动推导为 Order
}
```

---

### Q2: 如何处理多层嵌套弹窗？

**A**: 每个弹窗独立管理，避免状态冲突。

```tsx
const parentModal = useModal<Order>();
const childModal = useModal<Detail>();

// 父弹窗打开
<ResizableModal visible={parentModal.visible} onCancel={parentModal.close}>
  <Button onClick={() => childModal.open(someDetail)}>查看详情</Button>
  
  {/* 子弹窗 */}
  <ResizableModal visible={childModal.visible} onCancel={childModal.close}>
    {/* 子弹窗内容 */}
  </ResizableModal>
</ResizableModal>
```

---

### Q3: 如何在弹窗关闭后刷新列表？

**A**: 在 `onCancel` 回调中处理。

```tsx
const editModal = useModal<Order>();

const handleCloseAndRefresh = () => {
  editModal.close();
  loadOrders(); // 刷新列表
};

<ResizableModal
  visible={editModal.visible}
  onCancel={handleCloseAndRefresh}
>
  {/* 内容 */}
</ResizableModal>
```

---

### Q4: 如何避免重复打开同一数据？

**A**: 检查 `modal.visible` 状态。

```tsx
const handleEdit = (record: Order) => {
  if (editModal.visible && editModal.data?.id === record.id) {
    return; // 已打开相同记录，不重复操作
  }
  editModal.open(record);
};
```

---

### Q5: 如何在弹窗内更新数据？

**A**: 使用 `setModalData` 方法。

```tsx
const handleUpdate = async () => {
  const updated = await updateOrder(modal.data!);
  modal.setModalData(updated); // 更新数据，弹窗保持打开
};
```

---

## 🔗 相关资源

### 源码位置
- **Hook 源码**: `frontend/src/hooks/useModal.ts`
- **类型导出**: `frontend/src/hooks/index.ts`

### 相关文档
- [ModalContentLayout 使用指南](./ModalContentLayout使用指南.md) - Modal 内容布局组件
- [开发指南 - Modal 最佳实践](../开发指南.md#modal最佳实践) - 完整开发规范

### 已应用文件
- `frontend/src/modules/warehouse/pages/MaterialPurchase/index.tsx`（5 个弹窗）
- `frontend/src/modules/production/pages/Production/List/index.tsx`（2 个弹窗）
- `frontend/src/modules/basic/pages/MaterialDatabase/index.tsx`（1 个弹窗）
- `frontend/src/modules/warehouse/pages/SampleInventory/index.tsx`（3 个弹窗）

### 设计原则
- **最小侵入**: 不改变现有 UI 和交互
- **类型安全**: 完全 TypeScript 类型推导
- **性能优化**: 延迟清理避免数据闪烁
- **易于理解**: API 简洁直观

---

**维护者**: 前端开发团队  
**最后更新**: 2026-02-04  
**版本**: v1.0

