# 📦 SKU系统统一梳理 - 完整总结

## 🎯 问题出发点

**用户反馈**: "双端的sku弄清楚 不能乱七八糟的 sku号加上 款号颜色数量这些 后期扫码的进度进度这些"

**问题诊断**:
- ❌ SKU定义在三端(小程序/后端/PC端)不一致
- ❌ 二维码格式多种多样 (无标准)
- ❌ SKU处理逻辑散落在3个不同地方 (无规范)
- ❌ 扫码流程复杂，工序推进不清晰
- ❌ SKU进度追踪困难，无法独立管理

---

## ✅ 解决方案总体设计

### 1️⃣ 统一SKU定义

**标准SKU格式**:
```
SKU = (styleNo, color, size)
= (款号, 颜色, 尺码)
= 最小库存单位
```

**完整SKU对象**:
```javascript
{
  // === 识别字段 ===
  styleNo: 'ST001',      // 款号 (如PO20260122001)
  color: '黑色',         // 颜色
  size: 'L',             // 尺码
  orderNo: 'PO...',      // 订单号
  
  // === 数量字段 ===
  totalQuantity: 50,          // 订单要求数
  completedQuantity: 30,      // 已完成数
  pendingQuantity: 20,        // 待完成数 (= total - completed)
  
  // === 关联字段 ===
  bundleNo?: 'PO-黑色-01'    // 菲号 (有则关联)
}
```

**关键约定**:
- ✅ 每个SKU独立追踪进度
- ✅ color 和 size 必须规范化 (统一中文)
- ✅ quantity 永远是 totalQuantity 的下标
- ✅ completedQuantity 不能超过 totalQuantity

---

### 2️⃣ 标准化二维码格式

三种扫码模式，三种二维码格式:

#### 模式1: 订单号 (ORDER)
```
二维码内容: PO20260122001
识别方式: 格式 PO + 8位日期 + 6位序列 = 订单号
后端返回: 订单详情 + SKU列表
小程序处理: 显示SKU明细表 (用户选择数量)
```

#### 模式2: 菲号 (BUNDLE)
```
二维码内容: PO20260122001-黑色-01
识别方式: 订单号-颜色-序列号 (裁剪阶段产生)
后端返回: 菲号信息 + 尺码列表 + 数量
小程序处理: 直接确认 (无需用户输入)
```

#### 模式3: SKU编码 (SKU)
```
二维码内容: PO20260122001,黑色,L,50
           或 JSON: {orderNo, color, size, qty}
识别方式: 包含订单号、颜色、尺码、数量的完整编码
后端返回: SKU验证 + 确认数量
小程序处理: 直接提交或简单确认
```

---

### 3️⃣ 集中的SKU处理逻辑 (SKUProcessor.js)

**职责分离**:

| 功能 | 旧代码 | 新方案 |
|------|--------|--------|
| SKU规范化 | 散落在ScanHandler/index.js | SKUProcessor.normalizeOrderItems() |
| 表单构建 | 手工map | SKUProcessor.buildSKUInputList() |
| 数量验证 | 各处不同 | SKUProcessor.validateSKUInputBatch() |
| 请求生成 | 手工转换 | SKUProcessor.generateScanRequests() |
| 进度统计 | 无 | SKUProcessor.getSummary() |
| 菲号解析 | 正则匹配 | SKUProcessor.parseBundleNo() |

**模块大小**: 450行，包含25个方法

---

### 4️⃣ 三端数据结构统一

#### 小程序 (miniprogram/)
```javascript
// 扫码输入 → 规范化 → 表单展示 → 用户确认 → 验证 → 提交
QRCodeParser.parse()
  ↓
ScanHandler.handle()
  ↓
SKUProcessor.normalizeOrderItems()
SKUProcessor.buildSKUInputList()
  ↓
页面显示SKU表单
  ↓
SKUProcessor.validateSKUInputBatch()
SKUProcessor.generateScanRequests()
  ↓
api.production.executeScan(request)
```

#### 后端 (Java)
```
数据结构:
- ProductionOrder (订单)
  - orderNo, styleNo
  - items: [{color, size, quantity, completedQty}]
  - currentStage, progressWorkflow
  
- ScanRecord (扫码记录)
  - orderNo, color, size, quantity
  - processNode (工序)
  - bundleNo (可选)
  - scanType (NEW: ORDER/BUNDLE/SKU)
  
- CuttingBundle (菲号)
  - bundleNo, color, sizeList
  - quantity, skuJson
```

#### PC端 (React)
```
显示方式:
1. 订单详情页 → SKU进度表格
2. 每行显示一个SKU:
   - 款号/颜色/尺码/订单数/已完成/进度条
3. 订单级统计:
   - 总进度百分比
   - 已完成SKU数
   - 工序推进情况
```

---

### 5️⃣ 完整的扫码流程

```
用户扫描二维码
    ↓
QRCodeParser识别格式 (ORDER/BUNDLE/SKU)
    ↓
ScanHandler获取后端数据
    ↓
SKUProcessor规范化数据
    ↓
┌─────────┬──────────┬──────────┐
│         │          │          │
▼         ▼          ▼          ▼
ORDER   BUNDLE     SKU        其他
│       │          │          │
▼       ▼          ▼          ▼
显示   直接      检查        错误
表单   提交     存在          ↓
│       │        │          弹窗
▼       ▼        ▼
用户 后端     可提交
选择 推进     │
│    工序     ▼
▼    ↓     直接
验证  返回   提交
│    │
▼    ▼
生成────────────────
请求
│
▼
批量提交 api.executeScan()
│
▼
后端处理:
- 验证订单/颜色/尺码
- 更新SKU进度
- 记录扫码日志
- 检查是否推进工序
│
▼
返回结果 & 刷新小程序
│
▼
显示下一步操作建议
```

---

## 📊 创建的文档和模块

### 📄 设计文档 (4个，共2600行代码)

1. **SKU_UNIFIED_DESIGN.md** (900行)
   - 完整的SKU概念定义
   - 后端/小程序/PC端数据结构规范
   - 三种扫码模式的详细说明
   - 数据验证规则

2. **SKU_MIGRATION_GUIDE.md** (500行)
   - Phase 1-5 分阶段改造计划
   - 小程序/后端/PC端的具体改造步骤
   - 单元测试和集成测试用例
   - 时间线和优先级

3. **SKU_DATA_FLOW_DIAGRAM.md** (600行)
   - 三种扫码模式的完整流程图
   - 小程序页面数据流
   - 数据库结构关系图
   - 关键对象定义

4. **SKU_QUICK_REFERENCE.md** (365行)
   - 快速参考表 (快速查看)
   - 常见问题排查
   - 最小化改造指南
   - 常用方法速查

### 💻 实现模块 (1个，450行)

**SKUProcessor.js** (小程序模块)
```javascript
25个方法，包括:
- 规范化: normalizeOrderItems()
- 验证: validateSKUInput(), validateSKUInputBatch()
- 转换: generateScanRequests()
- 统计: getSummary(), calculateProgress()
- 工具: parseBundleNo(), formatSKUDisplay(), sortSKUList()
```

---

## 🚀 后续改造计划

### Phase 1: 完成 ✅
- [x] 创建SKU设计文档
- [x] 创建SKUProcessor模块
- [x] 制定迁移计划

### Phase 2: 小程序改造 (预计1天)
- [ ] 在 ScanHandler 中使用 SKUProcessor
- [ ] 在 index.js 中使用 SKUProcessor
- [ ] 更新 WXML 显示统计摘要
- [ ] 测试三种扫码模式

### Phase 3: 后端改造 (预计1天)
- [ ] 创建 SKUService
- [ ] 添加 ScanRecord.scanType 字段
- [ ] 更新 ScanController 使用新格式
- [ ] 单元测试

### Phase 4: PC端改造 (预计0.5天)
- [ ] OrderDetail 显示 SKU 进度表
- [ ] 添加搜索和过滤
- [ ] 性能优化

### Phase 5: 集成测试 (预计1天)
- [ ] 三端数据一致性测试
- [ ] 各工序流转测试
- [ ] 边界条件测试

**总工时**: 3.5-4 天 (分阶段)

---

## 🎁 核心收益

| 方面 | 改进 |
|------|------|
| **代码规范** | SKU处理集中，无重复代码 |
| **可维护性** | 改一个地方，三端同步 |
| **数据一致性** | 统一的数据结构和验证规则 |
| **功能扩展** | SKU进度独立追踪，支持颗粒度操作 |
| **问题定位** | 清晰的错误堆栈，易于调试 |
| **开发效率** | 新功能只需更新SKUProcessor |
| **用户体验** | 更清晰的流程，更好的提示信息 |

---

## 📌 要点总结

### ✅ 已做
1. 定义了统一的SKU格式
2. 设计了三种二维码格式
3. 创建了 SKUProcessor 统一处理
4. 写了完整的迁移指南
5. 画了详细的数据流程图

### 🟡 待做 (分阶段)
1. 改造小程序 (使用SKUProcessor)
2. 改造后端 (添加SKUService)
3. 改造PC端 (显示SKU进度)
4. 完整测试验证

### 💡 可选优化
1. 缓存SKU列表提高性能
2. 虚拟列表支持大量SKU
3. SKU拆分/合并功能
4. 数据分析和报表

---

## 📍 文档索引

| 文档 | 用途 | 查看时机 |
|------|------|----------|
| **SKU_UNIFIED_DESIGN.md** | 理解设计 | 第一次阅读 |
| **SKU_QUICK_REFERENCE.md** | 快速查询 | 开发时查看 |
| **SKU_MIGRATION_GUIDE.md** | 执行改造 | 开始改造时 |
| **SKU_DATA_FLOW_DIAGRAM.md** | 理解流程 | 需要理解数据流 |

---

## 🔗 相关链接

提交记录:
- `867df707` - 创建SKU设计文档
- `a06b780d` - 快速参考表

分支状态:
- 当前分支: `main`
- 所有更改已推送到 `origin/main`

---

**现在你有了**:
1. ✅ 清晰的SKU定义和规范
2. ✅ 完整的设计文档和流程图
3. ✅ 可直接使用的 SKUProcessor 模块
4. ✅ 分阶段的改造计划
5. ✅ 快速参考表和常见问题解答

**下一步**: 
- 根据 SKU_MIGRATION_GUIDE.md 分阶段改造
- 或者等待确认后直接开始 Phase 2

**有任何问题**: 
- 查看 SKU_QUICK_REFERENCE.md 的"问题排查"部分
- 或者参考 SKU_UNIFIED_DESIGN.md 的详细说明

