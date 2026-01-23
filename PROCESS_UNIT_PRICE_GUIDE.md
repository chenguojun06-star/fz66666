# 工序单价识别与成本计算系统 (Phase 5)

## 🎯 功能概述

实现扫码系统中的**工序单价自动识别和成本计算**功能，使系统能够：

1. **自动识别工序单价** - 从订单的`progressNodeUnitPrices`读取
2. **动态计算扫码成本** - 根据工序单价和扫码数量计算
3. **生成成本统计** - 展示订单的工序成本分布
4. **支持成本查询** - 提供REST API查询工序单价和订单总成本

---

## 📊 数据结构定义

### 1. 工序单价配置格式

工序单价存储在订单的两个字段之一：

#### 方式A: `progressNodeUnitPrices`（数组格式）
```javascript
// 订单.progressNodeUnitPrices
[
  {
    "id": "node-1",
    "name": "做领",           // 工序名称
    "unitPrice": 2.50,        // 单价
    "estimatedMinutes": 5
  },
  {
    "id": "node-2",
    "name": "上领",
    "unitPrice": 1.80,
    "estimatedMinutes": 4
  },
  // ... 更多工序
]
```

#### 方式B: `progressWorkflowJson`（JSON字符串格式）
```json
{
  "nodes": [
    {
      "id": "cutting",
      "name": "裁剪",
      "unitPrice": 3.00
    },
    {
      "id": "sewing",
      "name": "车缝",
      "unitPrice": 2.50
    }
  ]
}
```

### 2. ScanRecord中的新增字段

```java
/**
 * 工序单价 (识别的工序对应的单价)
 */
private BigDecimal processUnitPrice;  // 如: 2.50

/**
 * 本次扫码工序成本 = processUnitPrice * quantity
 */
private BigDecimal scanCost;          // 如: 50.00
```

### 3. 成本统计数据结构

```javascript
{
  "totalCost": 150.50,                    // 本次扫码总成本
  "scanCount": 5,                         // 扫码请求数
  "costBreakdown": [                      // 工序成本分布
    {
      "processName": "做领",
      "unitPrice": 2.50,
      "totalQuantity": 20,
      "totalCost": 50.00
    },
    {
      "processName": "上领",
      "unitPrice": 1.80,
      "totalQuantity": 25,
      "totalCost": 45.00
    }
  ]
}
```

---

## 🔧 实现方案

### Phase 5.1: 后端改造 ✅ COMPLETED

**修改文件**：
1. `ScanRecord.java` - 添加2个字段
   - `processUnitPrice` - 工序单价
   - `scanCost` - 本次扫码成本

2. `SKUService.java` - 添加4个新方法接口
   - `getProcessUnitPrices(orderNo)` - 获取工序单价列表
   - `getUnitPriceByProcess(orderNo, processName)` - 查询单个工序单价
   - `attachProcessUnitPrice(scanRecord)` - 为扫码记录附加单价
   - `calculateOrderTotalCost(orderNo)` - 计算订单总成本

3. `SKUServiceImpl.java` - 实现4个新方法
   ```java
   // 示例实现
   @Override
   public Map<String, Object> getUnitPriceByProcess(String orderNo, String processName) {
     // 1. 从ProductionOrder查询progressNodeUnitPrices
     // 2. 遍历列表，匹配processName
     // 3. 返回对应的unitPrice
   }
   
   @Override
   public boolean attachProcessUnitPrice(ScanRecord scanRecord) {
     // 1. 调用getUnitPriceByProcess获取单价
     // 2. 设置scanRecord.processUnitPrice
     // 3. 计算scanCost = processUnitPrice * quantity
     return true;
   }
   ```

4. `ScanRecordController.java` - 添加3个新API端点
   - `GET /api/production/scan/process-prices/{orderNo}` - 查询工序单价列表
   - `GET /api/production/scan/process-price/{orderNo}/{processName}` - 查询单个工序单价
   - `GET /api/production/scan/order-total-cost/{orderNo}` - 计算订单总成本

**编译验证**：✅ mvn clean compile SUCCESS

---

### Phase 5.2: 小程序改造 ✅ COMPLETED

**修改文件**：`miniprogram/pages/scan/processors/SKUProcessor.js`

**新增方法**：

#### 1. 获取工序单价列表
```javascript
getProcessUnitPrices(order) {
  // 从order.progressNodeUnitPrices或progressWorkflowJson读取
  // 返回格式: [{processName: '做领', unitPrice: 2.50}, ...]
}
```

#### 2. 查询单个工序单价
```javascript
getUnitPriceByProcess(order, processName) {
  // 根据工序名称查找单价
  // 返回: number (如: 2.50)
}
```

#### 3. 为SKU附加工序单价
```javascript
attachProcessUnitPricesToSKU(skuList, order) {
  // 为每个SKU附加工序单价信息
  // 返回: SKU[] (附加了unitPrice)
}
```

#### 4. 计算扫码成本
```javascript
calculateScanCost(unitPrice, quantity) {
  // 成本计算: unitPrice * quantity
  // 返回: number (保留2位小数)
}
```

#### 5. 生成成本统计摘要
```javascript
calculateCostSummary(scanRequests, order) {
  // 根据扫码请求列表和订单配置计算成本统计
  // 返回: { totalCost, costBreakdown: [{processName, unitPrice, totalCost}, ...] }
}
```

**集成点**：
- 扫码确认弹窗时调用`getProcessUnitPrices(order)`
- 提交扫码时调用`calculateCostSummary(scanRequests, order)`
- 显示成本统计给用户

---

### Phase 5.3: PC端改造 (READY)

**修改文件**：`frontend/src/pages/Production/ProgressDetail.tsx`

**新增组件**：
1. 工序单价配置编辑面板
2. 成本统计展示组件
3. 工序成本分布图表

**新增功能**：
```typescript
// 获取工序单价列表
const processPrices = await api.production.getProcessPrices(orderNo);

// 显示成本统计
<CostSummaryCard
  totalCost={orderCostInfo.totalCost}
  costBreakdown={orderCostInfo.costBreakdown}
/>
```

---

## 📱 小程序集成步骤

### 第1步：在扫码页面导入SKUProcessor
```javascript
const SKUProcessor = require('../../scan/processors/SKUProcessor');
```

### 第2步：在扫码确认弹窗中显示工序单价
```javascript
// 获取订单的工序配置
const processPrices = SKUProcessor.getProcessUnitPrices(this.data.currentOrder);

// 显示工序单价列表给用户
this.setData({ processPrices: processPrices });
```

### 第3步：提交扫码时计算成本
```javascript
// 构建扫码请求列表
const scanRequests = SKUProcessor.generateScanRequests(...);

// 计算成本统计
const costSummary = SKUProcessor.calculateCostSummary(
  scanRequests,
  this.data.currentOrder
);

console.log('扫码成本统计:', costSummary);
// 输出: {
//   totalCost: 150.50,
//   costBreakdown: [
//     {processName: '做领', unitPrice: 2.50, totalQuantity: 20, totalCost: 50.00},
//     ...
//   ]
// }
```

### 第4步：提交到后端时附加工序信息
```javascript
// 调用后端API
const response = await api.production.submitScan({
  ...scanRequest,
  processName: processName,
  // 后端会自动调用attachProcessUnitPrice
});
```

---

## 🔌 REST API 接口

### 1. 获取工序单价列表
```
GET /api/production/scan/process-prices/{orderNo}

请求示例:
GET /api/production/scan/process-prices/PO20260122001

响应示例:
[
  {
    "id": "node-1",
    "name": "做领",
    "unitPrice": 2.50,
    "estimatedMinutes": 5
  },
  ...
]
```

### 2. 查询单个工序单价
```
GET /api/production/scan/process-price/{orderNo}/{processName}

请求示例:
GET /api/production/scan/process-price/PO20260122001/做领

响应示例:
{
  "processName": "做领",
  "unitPrice": 2.50,
  "found": true
}
```

### 3. 计算订单总工价
```
GET /api/production/scan/order-total-cost/{orderNo}

请求示例:
GET /api/production/scan/order-total-cost/PO20260122001

响应示例:
{
  "orderNo": "PO20260122001",
  "totalUnitPrice": 12.50,    // 单件工价合计
  "totalCost": 625.00,         // 订单工价合计 (单价 * 数量)
  "quantity": 50
}
```

---

## ✅ 验证清单

### 后端验证
- [ ] Java编译成功：`mvn clean compile` ✅
- [ ] ScanRecord新字段可访问
- [ ] SKUService接口定义无误
- [ ] SKUServiceImpl实现完整
- [ ] ScanRecordController新增3个API端点
- [ ] 调用`attachProcessUnitPrice(scanRecord)`成功附加单价
- [ ] API测试：获取工序单价列表
- [ ] API测试：查询单个工序单价
- [ ] API测试：计算订单总成本

### 小程序验证
- [ ] SKUProcessor新方法可调用
- [ ] `getProcessUnitPrices(order)`返回正确格式
- [ ] `calculateCostSummary(requests, order)`返回成本统计
- [ ] 扫码确认弹窗显示工序单价
- [ ] 成本统计摘要正确计算

### PC端验证
- [ ] 工序单价配置可编辑
- [ ] 成本统计组件正确显示
- [ ] 订单总工价正确计算

### 三端一致性验证
- [ ] 工序单价来源一致（都从progressNodeUnitPrices读取）
- [ ] 扫码数据包含processUnitPrice和scanCost
- [ ] 成本统计结果三端一致

---

## 🚀 使用示例

### 示例1：扫码时自动识别工序单价

小程序页面：
```javascript
Page({
  async onScan(result) {
    // 扫码后获取订单
    const order = await api.production.getOrderByNo('PO20260122001');
    
    // 自动获取工序单价
    const unitPrice = SKUProcessor.getUnitPriceByProcess(order, '做领');
    console.log('做领单价:', unitPrice);  // 输出: 2.50
    
    // 计算扫码成本
    const scanCost = SKUProcessor.calculateScanCost(unitPrice, 20);
    console.log('扫码成本:', scanCost);    // 输出: 50.00
  }
})
```

### 示例2：显示工序成本分布

小程序页面：
```javascript
Page({
  async showCostSummary() {
    const order = await api.production.getOrderByNo('PO20260122001');
    const scanRequests = [...]; // 扫码请求列表
    
    // 计算成本统计
    const summary = SKUProcessor.calculateCostSummary(scanRequests, order);
    
    console.log('成本统计:', summary);
    // 输出示例:
    // {
    //   totalCost: 150.50,
    //   costBreakdown: [
    //     {processName: '做领', unitPrice: 2.50, totalQuantity: 20, totalCost: 50.00},
    //     {processName: '上领', unitPrice: 1.80, totalQuantity: 25, totalCost: 45.00}
    //   ]
    // }
    
    // 显示给用户
    this.setData({ costSummary: summary });
  }
})
```

### 示例3：后端API查询工序成本

```bash
# 1. 获取订单的所有工序单价
curl "http://localhost:8080/api/production/scan/process-prices/PO20260122001"

# 2. 查询特定工序的单价
curl "http://localhost:8080/api/production/scan/process-price/PO20260122001/做领"

# 3. 计算订单的总工价
curl "http://localhost:8080/api/production/scan/order-total-cost/PO20260122001"
```

---

## 🔍 注意事项

### 1. 工序名称匹配
- 查询时需要精确匹配工序名称（区分大小写中文）
- 如果找不到对应工序，返回 `unitPrice: 0`
- 建议在UI中列出所有可用工序供用户选择

### 2. 精度处理
- 单价和成本计算都保留2位小数
- JavaScript中使用 `Math.round(value * 100) / 100` 确保精度
- Java中使用 `BigDecimal` 确保精度

### 3. 错误处理
- 订单号为空时返回空列表
- 工序单价配置不存在时返回默认值0
- JSON解析失败时记录warning但不中断流程

### 4. 性能考虑
- 工序单价查询应该被缓存以避免重复查询
- 批量计算时使用`calculateCostSummary`而非逐个计算
- 避免在UI渲染时频繁调用计算方法

---

## 📋 后续改进

- [ ] 添加工序单价的历史版本管理
- [ ] 支持动态调整工序单价（需要权限控制）
- [ ] 生成成本分析报表
- [ ] 实现工序单价与报价单的联动
- [ ] 添加工序单价的通知提醒（如果价格异常）

---

*文档最后更新: 2026-01-23*  
*维护者: GitHub Copilot*
