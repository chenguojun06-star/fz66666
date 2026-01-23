# 🎯 SKU统一系统 - 快速参考表

## 📌 核心概念

| 概念 | 定义 | 组成 | 示例 |
|------|------|------|------|
| **SKU** | 最小库存单位 | styleNo + color + size | ST001 + 黑色 + L |
| **订单** | SKU的集合 | orderNo + items(SKU列表) | PO20260122001 (2-3个SKU) |
| **菲号** | 裁剪后的产物 | orderNo + color + batchNo | PO20260122001-黑色-01 |
| **数量** | 最小单位 | 件(个) | 50件 |

---

## 🔄 三种扫码模式

### 1️⃣ 订单扫码 (ORDER)

```
二维码: PO20260122001
↓
识别: 这是订单号
↓
获取: 订单详情 + SKU列表
↓
显示: SKU明细表单 (用户选择数量)
↓
提交: 逐个SKU发送请求
```

**何时用**: 首次进入工序时，需要确认各SKU的处理数量

---

### 2️⃣ 菲号扫码 (BUNDLE)

```
二维码: PO20260122001-黑色-01
↓
识别: 这是菲号
↓
获取: 菲号信息 (一个颜色，可能多个尺码)
↓
显示: 直接确认 (无需选择)
↓
提交: 按菲号数量批量提交
```

**何时用**: 裁剪后有菲号时，快速扫码提交

---

### 3️⃣ SKU扫码 (SKU)

```
二维码: {orderNo: 'PO...', color: '黑色', size: 'L', qty: 50}
↓
识别: 这是一个SKU
↓
获取: 验证SKU是否在订单中存在
↓
显示: 直接确认 (固定数量)
↓
提交: 单个SKU提交
```

**何时用**: 特定场景，如质检入库时只扫特定SKU

---

## 📊 数据结构速查

### SKU对象

```javascript
{
  // === 唯一标识 ===
  styleNo: 'ST001',         // 款号
  color: '黑色',            // 颜色
  size: 'L',                // 尺码
  orderNo: 'PO20260122001', // 订单号
  
  // === 数量 ===
  totalQuantity: 50,        // 订单数
  completedQuantity: 30,    // 已完成
  pendingQuantity: 20,      // 待完成 (= total - completed)
  
  // === 可选 ===
  bundleNo: 'PO-黑色-01'   // 关联菲号
}
```

### 订单对象

```javascript
{
  // === 基本信息 ===
  orderNo: 'PO20260122001',
  styleNo: 'ST001',
  styleName: '连衣裙',
  
  // === SKU明细 ===
  items: [
    {color: '黑色', size: 'L', quantity: 50, completedQty: 30},
    {color: '黑色', size: 'M', quantity: 30, completedQty: 0},
    ...
  ],
  
  // === 进度 ===
  currentStage: '裁剪',
  progressWorkflow: {...}
}
```

### 扫码请求

```javascript
{
  orderNo: 'PO20260122001',  // 必填
  styleNo: 'ST001',           // 必填
  color: '黑色',              // 必填
  size: 'L',                  // 必填
  quantity: 50,               // 必填
  processNode: '裁剪',        // 必填 (采购/裁剪/车缝/质检/入库)
  bundleNo: 'PO-黑色-01',    // 可选 (有菲号时)
  operatorId: 'OP001',        // 可选
  remark: '备注'              // 可选
}
```

---

## 🛠️ SKUProcessor 常用方法

### 规范化

```javascript
// 将后端返回的items转换为标准SKU列表
const skuList = SKUProcessor.normalizeOrderItems(
  items,        // 后端返回的订单明细
  orderNo,      // 订单号
  styleNo       // 款号
);
```

### 构建表单

```javascript
// 用于弹窗显示
const formItems = SKUProcessor.buildSKUInputList(skuList);
// 返回: [
//   { label: '黑色/L', color, size, totalQuantity, inputQuantity },
//   { label: '黑色/M', ... },
//   ...
// ]
```

### 验证

```javascript
// 单个SKU验证
const result = SKUProcessor.validateSKUInput(input);
if (!result.valid) {
  console.error(result.error);
}

// 批量验证
const batch = SKUProcessor.validateSKUInputBatch(skuInputList);
console.log(batch.validList);  // 有效的列表
console.log(batch.errors);     // 错误信息
```

### 生成请求

```javascript
// 转换为扫码请求格式
const requests = SKUProcessor.generateScanRequests(
  validList,      // 验证后的有效列表
  orderNo,
  styleNo,
  processNode     // 工序名
);
// 可直接调用 api.production.executeScan(requests)
```

### 计算统计

```javascript
// 获取订单的总体进度
const summary = SKUProcessor.getSummary(skuList);
// 返回: {
//   totalSKUs: 2,
//   completedSKUs: 1,
//   pendingSKUs: 1,
//   totalQuantity: 80,
//   completedQuantity: 50,
//   pendingQuantity: 30,
//   overallProgress: 62.5%
// }
```

---

## ⚠️ 常见错误和修复

| 错误 | 原因 | 修复 |
|------|------|------|
| SKU在订单中不存在 | 颜色或尺码写错 | 检查小程序和后端的拼写一致性 |
| 数量超额 | inputQty > totalQty | 验证时加入上限检查 |
| 没有识别出二维码格式 | 二维码不符合规范 | 确保二维码按标准格式生成 |
| 菲号解析失败 | 格式不是 order-color-seq | 检查菲号生成逻辑 |
| SKU重复 | 订单中有重复的color/size | 后端保存时需要去重 |

---

## 📋 迁移检查清单

### Phase 2: 小程序改造

- [ ] ScanHandler.js 导入 SKUProcessor
- [ ] ScanHandler 的 SKU 处理改用 SKUProcessor
- [ ] index.js 的 showConfirmModal 改用 SKUProcessor
- [ ] 表单验证改用 SKUProcessor.validateSKUInputBatch
- [ ] WXML 显示新的 summary 统计
- [ ] 测试三种扫码模式都能正常工作

### Phase 3: 后端改造

- [ ] 创建 SKUService 类
- [ ] 添加 ScanRecord.scanType 字段
- [ ] 更新 ScanController 使用新的请求格式
- [ ] 添加 SKU级别的验证
- [ ] 测试数据一致性

### Phase 4: PC端改造

- [ ] OrderDetail.tsx 显示 SKU 进度表格
- [ ] 显示每个 SKU 的完成进度
- [ ] 显示订单总体进度
- [ ] 添加色值和尺码的搜索过滤

---

## 🔗 文件对应关系

```
SKU_UNIFIED_DESIGN.md          (设计文档，900行)
├─ 概念定义
├─ 后端结构 (Java)
├─ 小程序结构 (JS)
├─ 后端流程设计
├─ PC端显示规范
├─ 数据验证规则
└─ 迁移计划框架

SKUProcessor.js                (实现模块，450行)
├─ 规范化: normalizeOrderItems()
├─ 构建: buildSKUInputList()
├─ 验证: validateSKUInputBatch()
├─ 转换: generateScanRequests()
├─ 统计: getSummary()
└─ 工具: parseBundle(), formatDisplay() 等

SKU_MIGRATION_GUIDE.md         (执行指南，500行)
├─ Phase 2: 小程序改造
├─ Phase 3: 后端改造
├─ Phase 4: PC端改造
├─ Phase 5: 测试验证
└─ 时间线规划

SKU_DATA_FLOW_DIAGRAM.md       (流程图，600行)
├─ 订单扫码流程 (ORDER)
├─ 菲号扫码流程 (BUNDLE)
├─ SKU信息查询
├─ 数据库结构关系
├─ 小程序页面数据流
└─ 对象定义图解
```

---

## 🚀 快速开始

### 最小化改造 (只改小程序)

```javascript
// 1. 在 pages/scan/index.js 引入
const SKUProcessor = require('./processors/SKUProcessor');

// 2. 在 showConfirmModal 中使用
showConfirmModal(data) {
  const skuList = SKUProcessor.normalizeOrderItems(data.skuItems, data.orderNo, data.styleNo);
  const formItems = SKUProcessor.buildSKUInputList(skuList);
  const summary = SKUProcessor.getSummary(skuList);
  
  this.setData({
    scanConfirm: {
      skuList: formItems,
      summary: summary
    }
  });
}

// 3. 在 onConfirmSubmit 中验证和提交
async onConfirmSubmit() {
  const batch = SKUProcessor.validateSKUInputBatch(this.data.scanConfirm.skuList);
  if (!batch.valid) {
    wx.showToast({ title: batch.errors[0], icon: 'none' });
    return;
  }
  
  const requests = SKUProcessor.generateScanRequests(
    batch.validList,
    this.data.scanConfirm.detail.orderNo,
    this.data.scanConfirm.detail.styleNo,
    this.data.scanConfirm.detail.progressStage
  );
  
  try {
    await Promise.all(requests.map(r => api.production.executeScan(r)));
    wx.showToast({ title: '成功', icon: 'success' });
  } catch (e) {
    wx.showToast({ title: e.message, icon: 'none' });
  }
}
```

### 完整改造 (三端统一)

参考 SKU_MIGRATION_GUIDE.md 的 Phase 2-5

---

## 📞 问题排查

**问题**: SKU在订单中不存在
```javascript
// 排查步骤
1. 检查后端返回的 items 中是否有该颜色尺码
2. 检查小程序的 color/size 拼写是否一致
3. 检查是否是 trim() 导致的空格问题
```

**问题**: 数量超过订单数
```javascript
// 排查步骤
1. 检查 validat

eSKUInput 是否调用了
2. 检查 input.totalQuantity 是否正确赋值
3. 检查后端是否正确返回了 quantity 字段
```

**问题**: 菲号无法识别
```javascript
// 排查步骤
1. 检查菲号格式是否为 orderNo-color-seq
2. 检查颜色是否有特殊字符
3. 检查是否需要 URL encode
```

---

**最后更新**: 2026-01-23  
**版本**: 1.0 (设计和工具库已就绪，待阶段性改造)

