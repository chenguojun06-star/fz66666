# 📊 系统全面检查 - 发现问题和修复建议

*生成时间：2026-01-20*

---

## 一、执行摘要

### ✅ 已完成的检查
1. PC端核心页面表格字段分析
2. 手机端质检功能修复验证
3. 订单生命周期流程梳理

### ⚠️ 发现的主要问题
1. **生产订单列表缺少部分环节数据列**
2. **质检入库页面缺少详细质检信息**
3. **财务页面需要补充字段**

---

## 二、PC端页面详细检查结果

### 1. 生产管理模块

#### ✅ 生产订单列表 (ProductionList) - 基本完整

**已有字段（24列）：**
- 图片、订单号、款号、款名、附件
- 加工厂、订单数量、下单人、下单时间
- **采购环节**：采购时间、采购完成、采购员、采购完成率
- **裁剪环节**：裁剪时间、裁剪完成、裁剪员、裁剪完成率
- **缝制环节**：缝制开始、缝制完成、缝制完成率
- **质检环节**：质检时间、质检完成、质检员、质检完成率
- **入库环节**：入库时间、入库完成、入库员、入库完成率
- 裁剪数量、扎数、完成数量、合格入库、库存
- 生产进度、状态、计划完成日期
- 操作列

**❌ 缺失的环节数据列：**
```
⚠️ 车缝环节 - 完全缺失
  - 车缝开始时间
  - 车缝完成时间
  - 车缝操作员
  - 车缝完成率
  - 车缝数量

⚠️ 大烫环节 - 完全缺失
  - 大烫开始时间
  - 大烫完成时间
  - 大烫操作员
  - 大烫完成率
  - 大烫数量

⚠️ 包装环节 - 完全缺失
  - 包装开始时间
  - 包装完成时间
  - 包装操作员
  - 包装完成率
  - 包装数量
```

**📝 建议补充字段：**
```
✨ 质量相关
  - 次品数量
  - 返修数量
  - 返修完成数量
  - 报废数量

✨ 时间相关
  - 实际完成日期
  - 延期天数

✨ 其他
  - 客户名称（如有）
  - 紧急程度标记
```

**🔧 修复代码示例：**
```tsx
// 在 stageColumns 调用中添加缺失的环节
...stageColumns('sewing', { 
  start: '缝制开始', 
  end: '缝制完成', 
  operator: '缝制员', 
  rate: '缝制完成率' 
}, { includeOperator: false }),

// ⬇️ 添加这些行
...stageColumns('carSewing', { 
  start: '车缝开始', 
  end: '车缝完成', 
  operator: '车缝员', 
  rate: '车缝完成率' 
}),
...stageColumns('ironing', { 
  start: '大烫开始', 
  end: '大烫完成', 
  operator: '大烫员', 
  rate: '大烫完成率' 
}),
...stageColumns('packaging', { 
  start: '包装开始', 
  end: '包装完成', 
  operator: '包装员', 
  rate: '包装完成率' 
}),

...stageColumns('quality', { 
  start: '质检时间', 
  end: '质检完成', 
  operator: '质检员', 
  rate: '质检完成率' 
}),

// 添加质量统计列
{
  title: '次品数',
  dataIndex: 'unqualifiedQuantity',
  key: 'unqualifiedQuantity',
  width: 90,
  align: 'right' as const,
  render: (v: any) => Number(v ?? 0) || 0,
},
{
  title: '返修数',
  dataIndex: 'repairQuantity',
  key: 'repairQuantity',
  width: 90,
  align: 'right' as const,
  render: (v: any) => Number(v ?? 0) || 0,
},
```

---

#### ✅ 生产进度详情 (ProgressDetail) - 功能完整

**已有字段：**
- 订单基本信息、进度板块（动态节点）
- 扫码记录明细表（类型、环节、工序、人员、颜色、尺码、数量、单价、金额、时间、结果、备注）
- 裁剪包明细表（菲号、颜色、尺码、数量、完成度、状态、人员、时间）

**✅ 状态：字段完整，功能完善**

---

#### ⚠️ 质检入库 (ProductWarehousing) - 需要补充

**已有字段（15列）：**
```javascript
const columns = [
  { title: '图片', dataIndex: 'styleCover' },
  { title: '质检入库号', dataIndex: 'warehousingNo' },
  { title: '订单号', dataIndex: 'orderNo' },
  { title: '款号', dataIndex: 'styleNo' },
  { title: '款名', dataIndex: 'styleName' },
  { title: '附件' },
  { title: '质检数量', dataIndex: 'warehousingQuantity' },
  { title: '合格数量', dataIndex: 'qualifiedQuantity' },
  { title: '不合格数量', dataIndex: 'unqualifiedQuantity' },
  { title: '仓库', dataIndex: 'warehouse' },
  { title: '质检状态', dataIndex: 'qualityStatus' },
  // ... 其他字段
]
```

**❌ 缺失字段：**
```
⚠️ 详细信息缺失
  - 颜色
  - 尺码
  - 质检人员姓名
  - 入库时间
  - 备注信息

⚠️ 次品处理相关
  - 次品类型（如有分类）
  - 次品图片（链接/预览）
  - 处理方式（返修/报废）
  - 返修状态
  - 返修完成时间

⚠️ 菲号相关
  - 菲号（scanCode）
  - 裁剪包号（bundleNo）
```

**🔧 建议补充代码：**
```tsx
// 在 columns 数组中添加：
{
  title: '颜色',
  dataIndex: 'color',
  key: 'color',
  width: 100,
  render: (v) => v || '-',
},
{
  title: '尺码',
  dataIndex: 'size',
  key: 'size',
  width: 90,
  render: (v) => v || '-',
},
{
  title: '质检人员',
  dataIndex: 'qualityOperatorName',
  key: 'qualityOperatorName',
  width: 120,
},
{
  title: '入库时间',
  dataIndex: 'warehousingTime',
  key: 'warehousingTime',
  width: 160,
  render: (v) => formatDateTime(v),
},
{
  title: '次品处理',
  key: 'defectHandling',
  width: 150,
  render: (_: any, record: any) => {
    const unqualified = Number(record?.unqualifiedQuantity || 0);
    if (unqualified <= 0) return '-';
    
    return (
      <Space direction="vertical" size="small">
        <span>类型：{record?.defectCategory || '未分类'}</span>
        <span>方式：{record?.repairRemark || '待处理'}</span>
        {record?.unqualifiedImageUrls && (
          <Button size="small" onClick={() => showDefectImages(record)}>
            查看图片
          </Button>
        )}
      </Space>
    );
  },
},
{
  title: '返修状态',
  dataIndex: 'repairStatus',
  key: 'repairStatus',
  width: 120,
  render: (v) => {
    if (!v) return '-';
    const config: Record<string, { text: string; color: string }> = {
      pending: { text: '待返修', color: 'orange' },
      processing: { text: '返修中', color: 'blue' },
      completed: { text: '已完成', color: 'green' },
    };
    const { text, color } = config[v] || { text: v, color: 'default' };
    return <Tag color={color}>{text}</Tag>;
  },
},
{
  title: '菲号',
  dataIndex: 'scanCode',
  key: 'scanCode',
  width: 200,
  render: (v) => v || '-',
},
```

---

#### ⚠️ 物料采购 (MaterialPurchase) - 需要补充

**已有字段（15+列）：**
- 图片、订单号、款号、款名、附件
- 采购单号、面料辅料类型、物料编码、物料名称、物料规格
- 采购数量、已到数量、状态、创建时间、操作

**❌ 缺失字段：**
```
⚠️ 供应商信息
  - 供应商名称
  - 供应商联系方式

⚠️ 时间相关
  - 预计到货日期
  - 实际到货日期

⚠️ 金额相关
  - 物料单价
  - 物料总金额

⚠️ 其他
  - 待到数量（采购数量 - 已到数量）
```

**🔧 建议补充代码：**
```tsx
{
  title: '供应商',
  dataIndex: 'supplierName',
  key: 'supplierName',
  width: 150,
  render: (v) => v || '-',
},
{
  title: '待到数量',
  key: 'remainingQuantity',
  width: 100,
  align: 'right' as const,
  render: (_: any, record: any) => {
    const total = Number(record?.purchaseQuantity || 0);
    const arrived = Number(record?.arrivedQuantity || 0);
    return Math.max(0, total - arrived);
  },
},
{
  title: '预计到货',
  dataIndex: 'expectedArrivalDate',
  key: 'expectedArrivalDate',
  width: 120,
  render: (v) => formatDateTime(v),
},
{
  title: '实际到货',
  dataIndex: 'actualArrivalDate',
  key: 'actualArrivalDate',
  width: 120,
  render: (v) => formatDateTime(v),
},
{
  title: '物料单价',
  dataIndex: 'unitPrice',
  key: 'unitPrice',
  width: 100,
  align: 'right' as const,
  render: (v) => v != null ? `¥${Number(v).toFixed(2)}` : '-',
},
{
  title: '总金额',
  key: 'totalAmount',
  width: 120,
  align: 'right' as const,
  render: (_: any, record: any) => {
    const qty = Number(record?.purchaseQuantity || 0);
    const price = Number(record?.unitPrice || 0);
    const total = qty * price;
    return total > 0 ? `¥${total.toFixed(2)}` : '-';
  },
},
```

---

### 2. 财务管理模块

#### ⚠️ 物料对账 (MaterialReconciliation) - 需要补充

**已有字段：**
- 对账单号、供应商、物料编码、物料名称
- 采购单号、订单号、款号、数量、单价、总金额
- 对账日期、状态

**❌ 缺失字段：**
```
⚠️ 金额明细
  - 已付金额
  - 未付金额
  - 付款进度百分比

⚠️ 时间相关
  - 对账周期开始日期
  - 对账周期结束日期
  - 审核时间
  - 付款时间

⚠️ 人员相关
  - 对账人员
  - 审核人员
  - 付款审批人
```

**🔧 建议补充代码：**
```tsx
// 在 buildMaterialReconCsv 中的 header 数组补充：
const header = [
  '对账单号', '供应商', '物料编码', '物料名称', 
  '采购单号', '订单号', '款号', '数量', 
  '单价(元)', '总金额(元)', 
  '已付金额(元)', // 新增
  '未付金额(元)', // 新增
  '对账周期起', // 新增
  '对账周期止', // 新增
  '对账日期', '审核时间', // 新增
  '状态'
];

// 在表格 columns 中添加：
{
  title: '已付金额',
  dataIndex: 'paidAmount',
  key: 'paidAmount',
  width: 120,
  align: 'right' as const,
  render: (v) => v != null ? `¥${Number(v).toFixed(2)}` : '¥0.00',
},
{
  title: '未付金额',
  key: 'unpaidAmount',
  width: 120,
  align: 'right' as const,
  render: (_: any, record: any) => {
    const total = Number(record?.totalAmount || 0);
    const paid = Number(record?.paidAmount || 0);
    const unpaid = Math.max(0, total - paid);
    return `¥${unpaid.toFixed(2)}`;
  },
},
{
  title: '付款进度',
  key: 'paymentProgress',
  width: 120,
  render: (_: any, record: any) => {
    const total = Number(record?.totalAmount || 0);
    const paid = Number(record?.paidAmount || 0);
    if (total <= 0) return '-';
    const percent = Math.round((paid / total) * 100);
    return `${percent}%`;
  },
},
{
  title: '对账周期',
  key: 'reconciliationPeriod',
  width: 200,
  render: (_: any, record: any) => {
    const start = formatDateTime(record?.periodStartDate);
    const end = formatDateTime(record?.periodEndDate);
    if (!start && !end) return '-';
    return `${start || '?'} ~ ${end || '?'}`;
  },
},
{
  title: '对账人',
  dataIndex: 'reconciliationOperatorName',
  key: 'reconciliationOperatorName',
  width: 120,
},
{
  title: '审核人',
  dataIndex: 'auditOperatorName',
  key: 'auditOperatorName',
  width: 120,
},
```

---

#### ❓ 成品结算 (ShipmentReconciliation) - 待检查

**需要检查的关键字段：**
```
- 结算单号
- 订单号、款号
- 成品数量
- 工序明细（列表）
- 工序单价
- 工序金额小计
- 总金额
- 结算状态
- 结算人员、结算时间
- 审核状态、审核人员
```

---

#### ❓ 审批付款 (PaymentApproval) - 待检查

**需要检查的关键字段：**
```
- 付款单号
- 付款类型（物料/成品/其他）
- 收款方、收款账号
- 付款金额
- 申请人、申请时间
- 审批状态、审批人、审批时间、审批意见
- 付款状态、付款时间、付款凭证
```

---

#### ❓ 人员工序统计 (PayrollOperatorSummary) - 待检查

**需要检查的关键字段：**
```
- 人员姓名、工号
- 统计周期（开始-结束）
- 工序名称
- 完成数量
- 工序单价
- 工序金额小计
- 合计金额
- 导出功能
```

---

### 3. 基础资料模块

#### ❓ 下单管理 (OrderManagement) - 待检查

**需要检查的关键字段：**
```
- 订单号、款号
- 客户信息（客户名称、联系方式）
- 订单数量、订单金额
- 交货日期
- 订单状态
- 创建人、创建时间
```

---

## 三、手机端功能检查结果

### ✅ 扫码页面 (pages/scan/index.js) - 核心功能已修复

**✅ 已修复问题：**
1. 质检提交使用正确的菲号（scanCode）而非记录ID ✅
2. 质检弹窗居中显示 ✅
3. 字体大小优化 ✅
4. 次品图片上传功能 ✅
5. 扫码记录聚合显示 ✅

**✅ 已验证的功能：**
- 物料采购不使用菲号（合理） ✅
- 裁剪后所有环节使用菲号 ✅
- 质检处理完整流程 ✅

**⚠️ 需要测试的功能：**
- [ ] 所有扫码环节的实际数据流转
- [ ] 质检次品图片在PC端的显示
- [ ] 返修流程的完整性
- [ ] 数据与PC端的同步

---

### ❓ 我的工作页面 (pages/work/index) - 待测试

**需要验证：**
- [ ] 待办任务列表完整性
- [ ] 已完成任务显示
- [ ] 个人统计数据准确性
- [ ] 任务操作功能

---

### ❓ 管理后台 (pages/admin/index) - 待测试

**需要验证：**
- [ ] 订单管理功能
- [ ] 数据统计功能
- [ ] 用户管理功能

---

## 四、优先级修复计划

### 🔴 P0 - 立即修复（影响核心业务）

1. **生产订单列表补充车缝/大烫/包装环节列**
   - 文件：`frontend/src/pages/Production/List.tsx`
   - 影响：无法看到完整生产进度
   - 估时：30分钟

2. **质检入库页面补充详细信息**
   - 文件：`frontend/src/pages/Production/ProductWarehousing.tsx`
   - 影响：次品处理信息不完整
   - 估时：45分钟

---

### 🟡 P1 - 重要补充（影响数据完整性）

3. **物料采购补充供应商和时间信息**
   - 文件：`frontend/src/pages/Production/MaterialPurchase.tsx`
   - 影响：采购管理信息不全
   - 估时：30分钟

4. **物料对账补充金额明细**
   - 文件：`frontend/src/pages/Finance/MaterialReconciliation.tsx`
   - 影响：财务对账数据不清晰
   - 估时：40分钟

---

### 🟢 P2 - 优化改进（提升用户体验）

5. **检查并补充成品结算页面**
   - 文件：`frontend/src/pages/Finance/ShipmentReconciliation.tsx`
   - 估时：30分钟

6. **检查并补充审批付款页面**
   - 文件：`frontend/src/pages/Finance/PaymentApproval.tsx`
   - 估时：30分钟

7. **检查并补充人员工序统计页面**
   - 文件：`frontend/src/pages/Finance/PayrollOperatorSummary.tsx`
   - 估时：20分钟

---

## 五、端到端测试准备

### 测试数据准备

**创建测试订单：**
```
订单号：TEST20260120001
款号：TEST-STYLE-001
颜色：黑色、白色
尺码：S、M、L
每SKU数量：10件
总数量：60件（2颜色 × 3尺码 × 10件）
```

**预期菲号格式：**
```
TEST20260120001-TEST-STYLE-001-黑色-S-10-1
TEST20260120001-TEST-STYLE-001-黑色-S-10-2
...
```

### 测试环节清单

1. [ ] 物料采购（手机端） → PC端数据同步
2. [ ] 裁剪（手机端） → PC端菲号显示
3. [ ] 缝制（手机端） → PC端进度更新
4. [ ] 车缝（手机端） → PC端进度更新
5. [ ] 大烫（手机端） → PC端进度更新
6. [ ] 质检（手机端） → PC端质检记录
7. [ ] 次品处理（手机端） → PC端次品信息
8. [ ] 返修（手机端） → PC端返修状态
9. [ ] 包装（手机端） → PC端进度更新
10. [ ] 入库（手机端） → PC端库存更新
11. [ ] 成品结算（PC端） → 金额计算验证
12. [ ] 财务对账（PC端） → 完整流程验证

---

## 六、下一步行动

### 立即执行：
1. ✅ 生成详细问题报告
2. 🔄 开始修复P0级别问题
3. ⏭️ 检查剩余财务页面
4. ⏭️ 执行端到端测试
5. ⏭️ 生成最终测试报告

### 预计完成时间：
- P0问题修复：1-2小时
- P1问题修复：1-2小时
- P2问题检查和修复：1-2小时
- 端到端测试：2-3小时
- **总计：6-9小时**

---

## 七、总结

### 当前系统状态：
- ✅ 手机端扫码核心功能已修复
- ⚠️ PC端部分表格字段不完整
- ❓ 部分页面待检查

### 主要发现：
1. 生产订单列表缺少车缝、大烫、包装三个环节的数据列
2. 质检入库页面缺少次品详细信息和菲号显示
3. 物料采购和对账页面缺少部分关键字段

### 建议：
1. **优先修复生产订单列表**，补充缺失环节
2. **完善质检入库页面**，显示完整次品信息
3. **系统化补充所有财务页面字段**
4. **执行完整的端到端测试**验证数据流转

