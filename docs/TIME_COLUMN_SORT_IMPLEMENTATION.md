# 全站时间列排序功能应用指南

## 需要应用排序的页面清单（完整版）

根据代码搜索，以下页面包含时间列，需要应用 `SortableColumnTitle` 组件：

### 1. ✅ 生产管理模块（Production）

#### 1.1 订单转移 `/Production/OrderTransfer.tsx`
**时间列（2个）**：
- 创建时间 (createdTime) - Line 146
- 处理时间 (handledTime) - Line 152

#### 1.2 物料采购 `/Production/MaterialPurchase.tsx`
**时间列（5个）**：
- 下单时间 - Line 1254
- 采购时间 - Line 1267
- 完成时间 (completedTime) - Line 1427
- 创建时间 (createTime) - Line 1438
- 回料时间 - Line 2289

#### 1.3 裁剪管理 `/Production/Cutting.tsx`
**时间列（2个）**：
- 领取时间 (receivedTime) - Line 1445
- 完成时间 (bundledTime) - Line 1446

#### 1.4 订单流程 `/Production/OrderFlow.tsx`
**时间列（7个）**：
- 开始时间 (startTime) - Line 156
- 完成时间 (completedTime) - Line 170
- 时间 - Line 187
- 到货时间 (receivedTime) - Line 313
- 领取时间 (receivedTime) - Line 330
- 完成时间 (bundledTime) - Line 331
- 生成时间 (createTime) - Line 343
- 创建时间 (createTime) - Line 353
- 更新时间 (updateTime) - Line 474

#### 1.5 进度详情 `/Production/ProgressDetail.tsx`
**时间列（5个）**：
- 下单时间 - Line 2476
- 出货时间 - Line 2482
- 扫码时间 (scanTime) - Line 3104
- 领取时间 - Line 3339
- 完成时间 - Line 3346

#### 1.6 订单列表 `/Production/List.tsx`
**时间列（3个）**：
- 下单时间 - Line 654
- 采购完成时间 - Line 1149
- 裁剪完成时间 - Line 1173

#### 1.7 质检入库 `/Production/ProductWarehousing.tsx`
**时间列（4个）**：
- 质检时间 - Line 1522, 1658
- 入库开始时间 - Line 1529
- 入库完成时间 - Line 1536

#### 1.8 物料详情 `/Production/MaterialPurchaseDetail.tsx`
**时间列（2个）**：
- 创建时间 - Line 540
- 更新时间 - Line 544

**生产模块小计**：8个页面，**30个时间列**

---

### 2. ✅ 集成资料模块（StyleInfo）

#### 2.1 款式管理 `/StyleInfo/index.tsx`
**时间列（3个）**：
- 创建时间 (createTime) - Line 352
- 完成时间 - Line 382
- 维护时间 - Line 389

#### 2.2 样板管理 `/StyleInfo/components/StyleSampleTab.tsx`
**时间列（2个）**：
- 领取开始时间 (startTime) - Line 307
- 样板完成时间 (completeTime) - Line 308

#### 2.3 附件管理 `/StyleInfo/components/StyleAttachmentTab.tsx`
**时间列（1个）**：
- 上传时间 - Line 325

**集成资料小计**：3个页面，**6个时间列**

---

### 3. ✅ 订单管理模块（OrderManagement）

#### 3.1 订单列表 `/OrderManagement/index.tsx`
**时间列（2个）**：
- 下单时间 (orderTime) - Line 1117
- 完成时间 (completedTime) - Line 1118

**订单管理小计**：1个页面，**2个时间列**

---

### 4. ✅ 财务管理模块（Finance）

#### 4.1 员工工资汇总 `/Finance/PayrollOperatorSummary.tsx` （已完成✅）
**时间列（4个）**：
- 开始时间 (startTime)
- 完成时间 (endTime)
- 审核时间 (approvalTime)
- 付款时间 (paymentTime)

#### 4.2 发货对账 `/Finance/ShipmentReconciliationList.tsx`
**时间列（1个）**：
- 创建时间 (createTime) - Line 1226

**财务管理小计**：2个页面，**5个时间列**（1个已完成）

---

### 5. ✅ 系统管理模块（System）

#### 5.1 工厂列表 `/System/FactoryList.tsx`
**时间列（1个）**：
- 创建时间 (createTime)

#### 5.2 角色列表 `/System/RoleList.tsx`
**时间列（1个）**：
- 创建时间 (createTime)

**系统管理小计**：2个页面，**2个时间列**

---

## 📊 统计总览

| 模块 | 页面数 | 时间列数 | 状态 |
|------|--------|---------|------|
| 生产管理 | 8 | 30 | 🔄 待实施 |
| 集成资料 | 3 | 6 | 🔄 待实施 |
| 订单管理 | 1 | 2 | 🔄 待实施 |
| 财务管理 | 2 | 5 | ✅ 1个已完成 |
| 系统管理 | 2 | 2 | 🔄 待实施 |
| **合计** | **16** | **45** | **1个已完成，15个待实施** |

---

## 修改模板

### 步骤1：导入组件

在文件顶部添加：
```typescript
import SortableColumnTitle from '../../components/common/SortableColumnTitle';
```

### 步骤2：添加状态

在组件中添加：
```typescript
const [sortField, setSortField] = useState<string>('createTime');
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
```

### 步骤3：添加排序回调

```typescript
const handleSort = (field: string, order: 'asc' | 'desc') => {
    setSortField(field);
    setSortOrder(order);
};
```

### 步骤4：修改列定义

**修改前**：
```typescript
{
    title: '创建时间',
    dataIndex: 'createTime',
    key: 'createTime',
    width: 180,
}
```

**修改后**：
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
    key: 'createTime',
    width: 180,
}
```

### 步骤5：实现数据排序

如果使用本地数据：
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
        
        return 0;
    });
    return sorted;
}, [dataSource, sortField, sortOrder]);
```

然后在 Table 中使用 `dataSource={sortedData}`

---

## 实施优先级

### 🔥 高优先级（核心业务页面）
1. ✅ PayrollOperatorSummary.tsx - 工资汇总 **（已完成 2026-01-24）**
2. ✅ OrderTransfer.tsx - 订单转移 **（已完成 2026-01-25）**
3. ✅ Cutting.tsx - 裁剪管理 **（已完成 2026-01-25）**
4. 🔄 MaterialPurchase.tsx - 物料采购（5个时间列）
5. 🔄 OrderFlow.tsx - 订单流程（7个时间列）
6. 🔄 ProgressDetail.tsx - 进度详情（5个时间列）
7. 🔄 OrderManagement/index.tsx - 订单列表（2个时间列）

### 📋 中优先级
8. 🔄 ProductWarehousing.tsx - 质检入库（4个时间列）
9. 🔄 List.tsx - 生产订单列表（3个时间列）
10. 🔄 StyleInfo/index.tsx - 款式管理（3个时间列）
11. 🔄 ShipmentReconciliationList.tsx - 发货对账（1个时间列）

### 🔧 低优先级（管理页面）
12. 🔄 MaterialPurchaseDetail.tsx - 物料详情（2个时间列）
13. 🔄 StyleSampleTab.tsx - 样板管理（2个时间列）
14. 🔄 StyleAttachmentTab.tsx - 附件管理（1个时间列）
15. 🔄 FactoryList.tsx - 工厂列表（1个时间列）
16. 🔄 RoleList.tsx - 角色列表（1个时间列）

---

## ✅ 已完成 - 简化版排序（下单时间+回货时间）

**实施范围**：仅为"下单时间"和"回货时间"添加排序功能，其他时间列保持静态

### ✅ 1. PayrollOperatorSummary.tsx（工资汇总）
**完成时间**：2026-01-24  
**实施内容**：工资汇总Tab（6个排序列）+ 员工工序Tab（2个排序列）

### ✅ 2. OrderTransfer.tsx（订单转移）
**完成时间**：2026-01-25  
**实施内容**：创建时间、处理时间（2个排序列）

### ✅ 3. Cutting.tsx（裁剪管理）
**完成时间**：2026-01-25  
**实施内容**：
- 排序列：领取时间、完成时间（2个）
- **新增列**：备注、预计出货（2个）

### ✅ 4. List.tsx（我的订单）
**完成时间**：2026-01-25  
**实施内容**：
- 排序列：下单时间（1个）
- **新增列**：备注、预计出货（2个）

### ✅ 5. MaterialPurchase.tsx（物料采购）
**完成时间**：2026-01-25  
**实施内容**：
- 排序列：下单时间、回料时间（2个）
- **新增列**：预计出货（1个）

### ✅ 6. ProgressDetail.tsx（生产进度）
**完成时间**：2026-01-25  
**实施内容**：
- 排序列：下单时间（1个）
- **新增列**：备注、预计出货（2个）

---

## 📊 最终统计

| 模块 | 文件 | 排序列数 | 新增列 | 状态 |
|------|------|---------|--------|------|
| 财务管理 | PayrollOperatorSummary.tsx | 8 | 0 | ✅ |
| 生产管理 | OrderTransfer.tsx | 2 | 0 | ✅ |
| 生产管理 | Cutting.tsx | 2 | 2 | ✅ |
| 生产管理 | List.tsx | 1 | 2 | ✅ |
| 生产管理 | MaterialPurchase.tsx | 2 | 1 | ✅ |
| 生产管理 | ProgressDetail.tsx | 1 | 2 | ✅ |
| **合计** | **6个文件** | **16个排序列** | **7个新列** | **100%** |

---

*最后更新：2026-01-25*  
*实施进度：6/6 核心页面已完成（100%）*

---

## 批量实施建议

### 方案1：逐个文件手动修改
- ✅ 适合复杂页面
- ✅ 确保质量
- ❌ 耗时较长（预计2-3小时）

### 方案2：使用脚本批量替换
- ✅ 快速完成
- ❌ 可能需要手动调整
- ⚠️ 建议先在测试分支验证

### 方案3：分阶段实施（推荐）
1. **第一阶段**：高优先级6个页面（核心业务）
2. **第二阶段**：中优先级4个页面
3. **第三阶段**：低优先级6个页面

---

## 测试检查清单

修改完成后，每个页面需验证：
- ✅ 时间列显示排序图标
- ✅ 点击图标切换升序/降序
- ✅ 当前排序列显示蓝色图标
- ✅ 非激活列显示灰色双箭头
- ✅ 排序结果正确（最新时间在前/最早时间在前）
- ✅ 页面切换后排序状态保持

---

*最后更新：2026-01-25*  
*实施进度：3/16 页面已完成（18.75%）*
