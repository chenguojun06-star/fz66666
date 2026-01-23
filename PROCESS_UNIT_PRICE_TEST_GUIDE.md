# 工序单价识别系统 - 快速测试指南

## 🚀 快速开始

此指南帮助你快速测试工序单价识别和成本计算功能。

---

## ✅ 测试清单

### 后端单元测试

#### 1. 测试工序单价获取接口

```bash
# 启动后端服务（如果未启动）
cd /Users/guojunmini4/Documents/服装66666/backend
mvn spring-boot:run &

# 等待服务启动（约30秒）
sleep 30

# 测试获取订单的工序单价列表
curl -X GET "http://localhost:8080/api/production/scan/process-prices/PO20260122001" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 预期响应:
# [
#   {"id": "...", "name": "做领", "unitPrice": 2.50, ...},
#   {"id": "...", "name": "上领", "unitPrice": 1.80, ...}
# ]
```

#### 2. 测试查询单个工序单价

```bash
curl -X GET "http://localhost:8080/api/production/scan/process-price/PO20260122001/做领" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 预期响应:
# {
#   "processName": "做领",
#   "unitPrice": 2.50,
#   "found": true
# }
```

#### 3. 测试计算订单总工价

```bash
curl -X GET "http://localhost:8080/api/production/scan/order-total-cost/PO20260122001" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 预期响应:
# {
#   "orderNo": "PO20260122001",
#   "totalUnitPrice": 12.50,
#   "totalCost": 625.00,
#   "quantity": 50
# }
```

---

### 小程序测试

#### 1. 测试SKUProcessor方法

在小程序开发者工具的Console中运行：

```javascript
// 1. 导入SKUProcessor
const SKUProcessor = require('/pages/scan/processors/SKUProcessor');

// 2. 创建测试订单对象（模拟）
const testOrder = {
  progressNodeUnitPrices: [
    { id: 'n1', name: '做领', unitPrice: 2.50, estimatedMinutes: 5 },
    { id: 'n2', name: '上领', unitPrice: 1.80, estimatedMinutes: 4 },
    { id: 'n3', name: '车缝', unitPrice: 3.00, estimatedMinutes: 10 }
  ]
};

// 3. 测试getProcessUnitPrices
const prices = SKUProcessor.getProcessUnitPrices(testOrder);
console.log('工序单价列表:', prices);
// 预期输出:
// [
//   { processName: '做领', unitPrice: 2.50, id: 'n1' },
//   { processName: '上领', unitPrice: 1.80, id: 'n2' },
//   { processName: '车缝', unitPrice: 3.00, id: 'n3' }
// ]

// 4. 测试getUnitPriceByProcess
const price = SKUProcessor.getUnitPriceByProcess(testOrder, '做领');
console.log('做领单价:', price);
// 预期输出: 2.50

// 5. 测试calculateScanCost
const cost = SKUProcessor.calculateScanCost(2.50, 20);
console.log('扫码成本:', cost);
// 预期输出: 50

// 6. 测试calculateCostSummary
const scanRequests = [
  { processNode: '做领', quantity: 20 },
  { processNode: '上领', quantity: 25 },
  { processNode: '车缝', quantity: 10 }
];
const summary = SKUProcessor.calculateCostSummary(scanRequests, testOrder);
console.log('成本统计:', summary);
// 预期输出:
// {
//   totalCost: 110,
//   scanCount: 3,
//   costBreakdown: [
//     { processName: '做领', unitPrice: 2.50, totalQuantity: 20, totalCost: 50 },
//     { processName: '上领', unitPrice: 1.80, totalQuantity: 25, totalCost: 45 },
//     { processName: '车缝', unitPrice: 3.00, totalQuantity: 10, totalCost: 30 }
//   ]
// }
```

#### 2. 集成测试：扫码流程中的工序单价识别

在小程序工作页面扫码：

```javascript
// 假设用户扫描了一个订单号 PO20260122001
// 1. 系统加载订单信息（包含progressNodeUnitPrices）
// 2. 用户选择工序"做领"
// 3. 系统自动获取工序单价

const order = await api.production.getOrderByNo('PO20260122001');
const unitPrice = SKUProcessor.getUnitPriceByProcess(order, '做领');
console.log('识别到的工序单价:', unitPrice);  // 输出: 2.50

// 4. 用户扫码并输入数量（如20）
// 5. 系统计算扫码成本
const scanCost = SKUProcessor.calculateScanCost(unitPrice, 20);
console.log('扫码成本:', scanCost);  // 输出: 50

// 6. 用户继续扫码其他工序
// 7. 最后系统生成成本统计摘要
const costSummary = SKUProcessor.calculateCostSummary(scanRequests, order);
console.log('本次扫码总成本:', costSummary.totalCost);
```

---

## 📊 完整的测试场景

### 场景1：单个工序的成本计算

**前置条件**：
- 订单号：PO20260122001
- 工序：做领（单价: 2.50元）
- 扫码数量：20件

**测试步骤**：
1. 打开小程序扫码页面
2. 扫描订单二维码
3. 系统自动加载订单的progressNodeUnitPrices
4. 选择工序"做领"
5. 输入数量"20"
6. 查看计算的成本：2.50 × 20 = 50.00元

**预期结果**：
- ✅ 工序单价正确识别为2.50
- ✅ 扫码成本正确计算为50.00
- ✅ 页面显示"本次扫码成本: ¥50.00"

---

### 场景2：多个工序的成本分布

**前置条件**：
- 订单号：PO20260122001
- 多个工序的扫码请求：
  - 做领：20件 × 2.50 = 50.00
  - 上领：25件 × 1.80 = 45.00
  - 车缝：10件 × 3.00 = 30.00

**测试步骤**：
1. 依次扫码多个工序
2. 查看每个工序的成本计算
3. 点击"查看成本统计"
4. 验证成本分布和总成本

**预期结果**：
- ✅ 做领成本：50.00
- ✅ 上领成本：45.00
- ✅ 车缝成本：30.00
- ✅ 总成本：125.00
- ✅ 成本分布图表正确显示

---

### 场景3：后端API验证

**测试步骤**：
1. 确保后端服务运行中
2. 调用REST API获取工序单价
3. 验证返回数据正确性
4. 验证精度处理（保留2位小数）

**预期结果**：
- ✅ API返回200状态码
- ✅ 返回的工序单价列表完整
- ✅ 单价精度正确（如2.50, 1.80）
- ✅ 计算结果精度正确（如50.00, 125.00）

---

## 🔧 调试技巧

### 1. 查看SKUProcessor的日志输出

```javascript
// 在开发者工具Console中查看日志
console.log('[SKUProcessor] ...');

// 示例：追踪工序单价的查询过程
const price = SKUProcessor.getUnitPriceByProcess(order, '做领');
// 输出: [SKUProcessor] 查询工序单价 - processName: 做领, unitPrice: 2.50
```

### 2. 验证progressNodeUnitPrices数据结构

```javascript
// 检查订单对象是否正确包含工序单价配置
const order = await api.production.getOrderByNo('PO20260122001');
console.log('订单的工序单价:', order.progressNodeUnitPrices);

// 如果为空，检查是否在progressWorkflowJson中
if (!order.progressNodeUnitPrices && order.progressWorkflowJson) {
  console.log('从progressWorkflowJson解析...');
  const workflow = JSON.parse(order.progressWorkflowJson);
  console.log('工序节点:', workflow.nodes);
}
```

### 3. 手动计算验证

```javascript
// 手动验证计算逻辑
const unitPrice = 2.50;
const quantity = 20;
const expected = 50.00;

const actual = SKUProcessor.calculateScanCost(unitPrice, quantity);
console.assert(actual === expected, `计算错误! 期望: ${expected}, 实际: ${actual}`);
```

---

## ❌ 常见问题排查

### 问题1：找不到工序单价

**症状**：返回 `unitPrice: 0`

**原因**：
- 工序名称不匹配（大小写、空格）
- progressNodeUnitPrices为空或未加载
- progressWorkflowJson格式不正确

**解决方案**：
```javascript
// 1. 检查工序名称是否正确
const availableProcesses = SKUProcessor.getProcessUnitPrices(order);
console.log('可用工序:', availableProcesses.map(p => p.processName));

// 2. 确保名称精确匹配（包括空格）
const correctName = availableProcesses[0].processName;
const price = SKUProcessor.getUnitPriceByProcess(order, correctName);
```

### 问题2：成本计算不准确

**症状**：计算结果与预期不符

**原因**：
- 精度丢失（JavaScript浮点数精度问题）
- 单位不一致（如单价是元，但输入的是分）
- 数据类型错误

**解决方案**：
```javascript
// 1. 使用Math.round确保精度
const cost = Math.round(unitPrice * quantity * 100) / 100;

// 2. 验证输入数据类型
console.log(typeof unitPrice, typeof quantity); // 应该都是number

// 3. 检查是否有额外的小数位
console.log(unitPrice.toFixed(2)); // 应该是'2.50'
```

### 问题3：后端API返回404

**症状**：调用API时返回404错误

**原因**：
- 订单号不存在
- 工序名称不匹配
- API路径错误

**解决方案**：
```bash
# 1. 验证订单是否存在
curl -X GET "http://localhost:8080/api/production/order/PO20260122001"

# 2. 检查API路由是否正确
curl -X GET "http://localhost:8080/api/production/scan/process-prices/PO20260122001"

# 3. 确保token有效
curl -X GET "http://localhost:8080/api/production/scan/process-prices/PO20260122001" \
  -H "Authorization: Bearer VALID_TOKEN"
```

---

## 📈 性能测试

### 测试工序单价查询的性能

```javascript
// 测试100次工序单价查询的耗时
const orders = [testOrder]; // 创建100个测试订单
const start = performance.now();

for (let i = 0; i < 100; i++) {
  SKUProcessor.getUnitPriceByProcess(orders[0], '做领');
}

const elapsed = performance.now() - start;
console.log(`100次查询耗时: ${elapsed.toFixed(2)}ms`);
// 预期: <100ms
```

### 测试成本统计的性能

```javascript
// 测试1000条扫码请求的成本统计计算
const largeRequests = [];
for (let i = 0; i < 1000; i++) {
  largeRequests.push({
    processNode: '做领',
    quantity: Math.random() * 50
  });
}

const start = performance.now();
const summary = SKUProcessor.calculateCostSummary(largeRequests, testOrder);
const elapsed = performance.now() - start;

console.log(`1000条请求成本统计耗时: ${elapsed.toFixed(2)}ms`);
// 预期: <500ms
```

---

## ✨ 验证通过的标准

所有下列项目都通过 ✅ 才表示工序单价功能完全可用：

- [ ] 后端编译成功（mvn clean compile）
- [ ] 获取工序单价列表API返回正确数据
- [ ] 查询单个工序单价API返回正确单价
- [ ] 计算订单总工价API返回正确总成本
- [ ] SKUProcessor.getProcessUnitPrices() 返回正确格式
- [ ] SKUProcessor.getUnitPriceByProcess() 返回正确单价
- [ ] SKUProcessor.calculateScanCost() 计算结果精确到2位小数
- [ ] SKUProcessor.calculateCostSummary() 生成的统计摘要完整正确
- [ ] 小程序扫码时自动识别工序单价
- [ ] 成本统计展示给用户
- [ ] 三端数据一致性验证通过

---

## 📝 测试报告模板

```
工序单价识别系统 - 测试报告

测试日期: 2026-01-23
测试版本: Phase 5.0
测试人员: [名字]

### 后端测试
- [ ] 编译测试: PASS / FAIL
- [ ] API1 (获取工序单价列表): PASS / FAIL
- [ ] API2 (查询单个工序单价): PASS / FAIL
- [ ] API3 (计算订单总工价): PASS / FAIL

### 小程序测试
- [ ] SKUProcessor方法: PASS / FAIL
- [ ] 扫码流程集成: PASS / FAIL
- [ ] 工序成本计算: PASS / FAIL
- [ ] 成本统计摘要: PASS / FAIL

### PC端测试
- [ ] 工序单价显示: PASS / FAIL
- [ ] 成本统计组件: PASS / FAIL

### 问题记录
[记录遇到的任何问题]

### 建议
[提出改进建议]

总体评分: __ / 100
```

---

*最后更新: 2026-01-23*
