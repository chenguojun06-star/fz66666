# 🔄 SKU系统统一迁移指南

## 📋 执行清单

### Phase 1: 定义和理解 ✅ 已完成

- [x] 创建 `SKU_UNIFIED_DESIGN.md` - 完整的设计文档
- [x] 创建 `SKUProcessor.js` - 统一的SKU处理模块
- [x] 定义SKU的标准格式和规范

---

## Phase 2: 小程序改造 (当前)

### Step 1: 导入SKUProcessor模块

在需要使用SKU的地方导入:

```javascript
// pages/scan/index.js
const SKUProcessor = require('./processors/SKUProcessor');

// pages/scan/handlers/ScanHandler.js
const SKUProcessor = require('../processors/SKUProcessor');

// pages/scan/services/QRCodeParser.js
const SKUProcessor = require('../processors/SKUProcessor');
```

### Step 2: 更新ScanHandler.js的SKU处理

#### 旧代码问题:

```javascript
// ❌ 问题1: SKU定义不清
const isSku = (bundleNo == null) && color && size;

// ❌ 问题2: 数量处理分散
if (scanMode === this.SCAN_MODE.SKU && !parsedData.quantity) {
  const matchedItem = orderDetail.items.find(item =>
    item.color === parsedData.color && item.size === parsedData.size
  );
  // ... 自己判断
}

// ❌ 问题3: 没有统一的验证
```

#### 新代码方案:

```javascript
// ✅ 使用SKUProcessor统一处理

// 在 _handleScanResult 中
async _handleScanResult(parsedData, orderDetail) {
  // === 标准化数据 ===
  const skuList = SKUProcessor.normalizeOrderItems(
    orderDetail.items,
    orderDetail.orderNo,
    orderDetail.styleNo
  );
  
  // === 查找SKU ===
  const matchedSKU = skuList.find(sku =>
    sku.color === parsedData.color && sku.size === parsedData.size
  );
  
  if (!matchedSKU) {
    return this._errorResult(
      `订单中不存在 ${parsedData.color}/${parsedData.size}`
    );
  }
  
  // === 确定扫码数量 ===
  let quantity = parsedData.quantity;
  if (!quantity) {
    // 使用订单中的数量
    quantity = matchedSKU.totalQuantity;
  }
  
  // === 验证数量 ===
  if (quantity > matchedSKU.totalQuantity) {
    return this._errorResult(
      `数量(${quantity})超过订单数量(${matchedSKU.totalQuantity})`
    );
  }
  
  return {
    success: true,
    data: {
      ...parsedData,
      quantity: quantity,
      skuItems: skuList,
      matchedSKU: matchedSKU
    }
  };
}
```

### Step 3: 更新index.js的SKU表单处理

#### 旧代码:

```javascript
// ❌ 问题: 手工构造SKU列表，没有标准格式
const skuList = data.skuItems ? data.skuItems.map(item => ({
  ...item,
  inputQuantity: item.quantity || item.num || 0
})) : [];
```

#### 新代码:

```javascript
// ✅ 使用SKUProcessor统一构造

showConfirmModal(data) {
  // 标准化SKU列表
  const skuList = SKUProcessor.normalizeOrderItems(
    data.skuItems,
    data.orderNo,
    data.styleNo
  );
  
  // 构建表单项
  const formItems = SKUProcessor.buildSKUInputList(skuList);
  
  // 计算统计
  const summary = SKUProcessor.getSummary(skuList);
  
  this.setData({
    scanConfirm: {
      visible: true,
      loading: false,
      detail: {
        ...data,
        isProcurement: this.isProcurement(data)
      },
      skuList: formItems,
      summary: summary, // 新增: 显示统计摘要
      skuItems: skuList // 保留原始SKU列表
    }
  });
}
```

### Step 4: 更新表单验证

#### 旧代码:

```javascript
// ❌ 问题: 没有统一的验证逻辑
const tasks = skuList
  .filter(item => Number(item.inputQuantity) > 0)
  .map(item => { ... });
```

#### 新代码:

```javascript
// ✅ 使用SKUProcessor.validateSKUInputBatch

async onConfirmSubmit() {
  const skuInputList = this.data.scanConfirm.skuList;
  
  // 批量验证
  const validation = SKUProcessor.validateSKUInputBatch(skuInputList);
  if (!validation.valid) {
    wx.showToast({
      title: validation.errors[0],
      icon: 'none'
    });
    return;
  }
  
  // 生成扫码请求
  const requests = SKUProcessor.generateScanRequests(
    validation.validList,
    this.data.scanConfirm.detail.orderNo,
    this.data.scanConfirm.detail.styleNo,
    this.data.scanConfirm.detail.progressStage
  );
  
  // 批量提交
  try {
    this.setData({ 'scanConfirm.loading': true });
    await Promise.all(requests.map(req => api.production.executeScan(req)));
    wx.showToast({ title: '批量提交成功', icon: 'success' });
    // ... 刷新数据
  } catch (e) {
    wx.showToast({ title: e.message, icon: 'none' });
  } finally {
    this.setData({ 'scanConfirm.loading': false });
  }
}
```

### Step 5: WXML模板更新

#### 旧代码:

```xml
<!-- ❌ 问题: 没有显示SKU统计 -->
<view class="modal-header">
  <text class="modal-title">确认扫码数量</text>
</view>
```

#### 新代码:

```xml
<!-- ✅ 新增统计摘要 -->
<view class="modal-header">
  <text class="modal-title">确认扫码数量</text>
  <view class="sku-summary" wx:if="{{scanConfirm.summary}}">
    <text class="summary-item">
      SKU数: {{scanConfirm.summary.totalSKUs}}
    </text>
    <text class="summary-item">
      已选: {{scanConfirm.summary.completedSKUs}}
    </text>
    <text class="summary-item">
      进度: {{scanConfirm.summary.overallProgress}}%
    </text>
  </view>
</view>

<!-- ✅ SKU列表项 -->
<view class="sku-list">
  <view class="sku-item" wx:for="{{scanConfirm.skuList}}" wx:key="id">
    <view class="sku-info">
      <text class="sku-label">{{item.label}}</text>
      <text class="sku-qty">{{item.totalQuantity}}件</text>
    </view>
    <view class="sku-input">
      <input
        type="number"
        placeholder="输入数量"
        value="{{item.inputQuantity}}"
        data-id="{{item.id}}"
        bindchange="onModalSkuInput"
        class="quantity-input"
      />
    </view>
  </view>
</view>
```

---

## Phase 3: 后端改造 (后续)

### 准备工作

1. 在ScanRecord表添加以下字段:
   ```sql
   ALTER TABLE t_scan_record 
   ADD COLUMN scan_type VARCHAR(20) DEFAULT 'UNKNOWN',  -- 'ORDER', 'BUNDLE', 'SKU'
   ADD COLUMN bundle_no VARCHAR(100),  -- 菲号
   ADD COLUMN error_flag INT DEFAULT 0;  -- 是否有错误
   ```

2. 在ProductionOrder表清理冗余字段:
   ```sql
   -- 备注: color/size在订单级别是冗余的，应该只在items中
   -- 但由于现有代码依赖，暂时保留，未来可以迁移
   ```

### 后端改造步骤

1. 更新 `ProductionOrderQueryService.applyCurrentProcessName()`
   - 改用SKU级别的扫码记录统计
   - 检查是否所有SKU都已完成当前工序

2. 创建 `SKUService` 统一处理SKU逻辑
   ```java
   public class SKUService {
     // 更新SKU的已完成数量
     public void updateSKUProgress(String orderNo, String color, String size, int quantity) { }
     
     // 获取订单的SKU列表
     public List<SKU> getSkus(String orderNo) { }
     
     // 检查SKU是否完成
     public boolean isSKUCompleted(String orderNo, String color, String size) { }
     
     // 检查所有SKU是否完成
     public boolean areAllSKUsCompleted(String orderNo) { }
   }
   ```

3. 更新 `ScanController.executeScan()` 使用新的SKUService

---

## Phase 4: PC端改造 (后续)

### 订单详情页面

```typescript
// OrderDetail.tsx
import { Table, Progress, Tag } from 'antd';

// 获取订单的SKU列表
const skuList = order.items; // 已规范化为SKU[]

const columns = [
  {
    title: '款号',
    dataIndex: 'styleNo',
    width: 100
  },
  {
    title: '颜色',
    dataIndex: 'color',
    width: 80
  },
  {
    title: '尺码',
    dataIndex: 'size',
    width: 80
  },
  {
    title: '订单数',
    dataIndex: 'totalQuantity',
    width: 80
  },
  {
    title: '已完成',
    dataIndex: 'completedQuantity',
    width: 100,
    render: (text, record) => (
      <Progress
        percent={Math.round((record.completedQuantity / record.totalQuantity) * 100)}
        format={() => `${record.completedQuantity}/${record.totalQuantity}`}
        size="small"
      />
    )
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 80,
    render: (text, record) => {
      const isComplete = record.completedQuantity >= record.totalQuantity;
      return isComplete ? (
        <Tag color="green">完成</Tag>
      ) : (
        <Tag color="processing">进行中</Tag>
      );
    }
  }
];

return <Table columns={columns} dataSource={skuList} />;
```

---

## ⚠️ 迁移注意事项

### 1. 兼容性问题

由于现有代码的混乱,在迁移过程中需要处理:

```javascript
// ❌ 旧代码中可能存在的问题
item.quantity  // 订单明细中的数量字段
item.num       // 订单明细中的备用数量字段
item.qty       // 某些地方用的简称

// ✅ 统一为
sku.totalQuantity
sku.completedQuantity
```

### 2. 数据验证

在所有SKU操作前都要验证:

```javascript
// 每个SKU操作前都验证
if (!SKUProcessor.isValidSKU(color, size)) {
  throw new Error('无效的SKU信息');
}
```

### 3. 错误处理

```javascript
// 常见错误
throw new Error(`SKU ${color}/${size} 在订单中不存在`);
throw new Error(`SKU ${color}/${size} 数量超额(${input}>${total})`);
throw new Error(`订单中没有有效的SKU明细`);
```

---

## 📊 测试清单

### 单元测试 (SKUProcessor)

```javascript
// test/SKUProcessor.test.js
describe('SKUProcessor', () => {
  // 测试SKU键生成
  test('generateSKUKey should work', () => {
    const key = SKUProcessor.generateSKUKey('黑色', 'L');
    expect(key).toBe('黑色|L');
  });
  
  // 测试数据规范化
  test('normalizeOrderItems should work', () => {
    const items = [{ color: '黑色', size: 'L', quantity: 100 }];
    const skus = SKUProcessor.normalizeOrderItems(items, 'PO001', 'ST001');
    expect(skus[0].totalQuantity).toBe(100);
    expect(skus[0].pendingQuantity).toBe(100);
  });
  
  // 测试验证
  test('validateSKUInputBatch should reject empty input', () => {
    const result = SKUProcessor.validateSKUInputBatch([]);
    expect(result.valid).toBe(false);
  });
  
  // ... 更多测试
});
```

### 集成测试 (端到端)

```
场景1: 订单扫码 → 显示SKU列表 → 选择数量 → 提交
场景2: 菲号扫码 → 直接提交 → 返回成功
场景3: SKU扫码 → 数量不足 → 提示错误 → 修改数量 → 提交
场景4: 所有SKU完成 → 工序推进 → 显示下一工序
```

---

## 🚀 推送时间线

| 阶段 | 内容 | 时间 | 状态 |
|------|------|------|------|
| Phase 1 | 创建设计文档和SKUProcessor模块 | 2026-01-23 | ✅ 完成 |
| Phase 2 | 小程序改造 (ScanHandler, index.js, WXML) | 2026-01-24 | 🟡 待开始 |
| Phase 3 | 后端改造 (SKUService, Controller) | 2026-01-25 | 🟡 待开始 |
| Phase 4 | PC端改造 (OrderDetail表格) | 2026-01-26 | 🟡 待开始 |
| Phase 5 | 测试和验证 | 2026-01-27 | 🟡 待开始 |

---

## 💡 后续优化方向

### 1. 性能优化
- 缓存SKU列表 (避免重复解析JSON)
- 虚拟化长列表 (如果SKU超过100+)

### 2. 功能扩展
- SKU拆分 (一个SKU分成多个菲号)
- SKU合并 (多个SKU合并成一个菲号)
- SKU库存预警

### 3. 数据分析
- SKU级别的工序耗时分析
- SKU级别的错误率统计
- 颜色/尺码的偏好分析

---

**下一步**: 等待确认后开始 Phase 2 的小程序改造

