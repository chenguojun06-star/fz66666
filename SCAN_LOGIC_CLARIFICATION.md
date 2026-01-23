# 扫码系统业务逻辑说明

**文档版本**: v1.0  
**创建日期**: 2026-01-23  
**目的**: 澄清生产节点、工序、扫码识别的关系

---

## 一、核心概念

### 1. 生产节点（Progress Stage）- 固定7个阶段

生产订单的主流程，**固定不变**：

```
采购 → 裁剪 → 车缝 → 大烫 → 质检 → 包装 → 入库
```

**对应字段**:
- 数据库字段: `progress_stage` (t_progress_node_unit_price表)
- 订单字段: `current_process_name` (t_production_order表)
- 代码变量: `progressStage`

**特点**:
- 数量固定（7个）
- 顺序固定
- 不可配置

---

### 2. 工序（Process）- 灵活配置

每个生产节点下可能有**多个工序**，特别是**车缝阶段**。

**对应字段**:
- 数据库字段: `name` (t_progress_node_unit_price表)
- 代码变量: `processName`

**示例** - 车缝阶段的5个工序：

| 序号 | 工序名称 | 单价(元) | 预计时间(分钟) | progressStage |
|-----|---------|---------|---------------|---------------|
| 1   | 做领    | 2.50    | 5             | 车缝          |
| 2   | 上领    | 1.80    | 3             | 车缝          |
| 3   | 埋夹    | 2.00    | 4             | 车缝          |
| 4   | 冚脚边  | 1.50    | 3             | 车缝          |
| 5   | 钉扣    | 1.00    | 2             | 车缝          |

**特点**:
- 数量不固定（根据订单配置）
- 可以只有1个工序（如"车缝"本身）
- 可以有多个工序（如上表5个）
- 每个工序有独立的单价和时间

---

### 3. 扫码单价（Unit Price）

工人扫码完成工序后，根据**工序名称**结算单价。

**对应字段**:
- 数据库字段: `unit_price` (t_progress_node_unit_price表)
- 扫码记录: `unit_price` (t_scan_record表)

---

## 二、扫码识别逻辑

### 场景1: 只有1个工序

**订单配置**:
```json
{
  "progressNodeUnitPrices": [
    {
      "progressStage": "车缝",
      "name": "车缝",
      "unitPrice": 10.0,
      "estimatedMinutes": 20
    }
  ]
}
```

**扫码行为**:
- 第1次扫菲号 → 识别为"车缝"，单价10元
- 第2次扫菲号 → 车缝完成，进入"大烫"

---

### 场景2: 有多个工序（车缝分解）

**订单配置**:
```json
{
  "progressNodeUnitPrices": [
    {
      "progressStage": "车缝",
      "name": "做领",
      "unitPrice": 2.5,
      "estimatedMinutes": 5,
      "sortOrder": 1
    },
    {
      "progressStage": "车缝",
      "name": "上领",
      "unitPrice": 1.8,
      "estimatedMinutes": 3,
      "sortOrder": 2
    },
    {
      "progressStage": "车缝",
      "name": "埋夹",
      "unitPrice": 2.0,
      "estimatedMinutes": 4,
      "sortOrder": 3
    },
    {
      "progressStage": "车缝",
      "name": "冚脚边",
      "unitPrice": 1.5,
      "estimatedMinutes": 3,
      "sortOrder": 4
    },
    {
      "progressStage": "车缝",
      "name": "钉扣",
      "unitPrice": 1.0,
      "estimatedMinutes": 2,
      "sortOrder": 5
    }
  ]
}
```

**扫码行为**:
- 第1次扫菲号 → 识别为"做领"，单价2.5元
- 第2次扫菲号 → 识别为"上领"，单价1.8元
- 第3次扫菲号 → 识别为"埋夹"，单价2.0元
- 第4次扫菲号 → 识别为"冚脚边"，单价1.5元
- 第5次扫菲号 → 识别为"钉扣"，单价1.0元
- 第6次扫菲号 → 车缝完成，进入"大烫"

**总单价**: 2.5 + 1.8 + 2.0 + 1.5 + 1.0 = **8.8元**

---

## 三、代码实现逻辑

### 1. 工序列表提取

位置: `StageDetector.js` → `_extractSewingProcesses()`

```javascript
_extractSewingProcesses(orderDetail) {
  const nodes = orderDetail.progressNodeUnitPrices;
  
  // 筛选progressStage为"车缝"的所有工序
  const sewingProcesses = nodes
    .filter(node => node.progressStage === '车缝')
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map(node => node.name);
  
  // 返回: ["做领", "上领", "埋夹", "冚脚边", "钉扣"]
  return sewingProcesses;
}
```

### 2. 工序识别

位置: `StageDetector.js` → `detectByBundle()`

```javascript
async detectByBundle(orderNo, bundleNo, bundleQuantity, orderDetail) {
  // 1. 查询该菲号的扫码历史
  const scanHistory = await this._getScanHistory(orderNo, bundleNo);
  const scanCount = scanHistory.length;  // 已扫次数
  
  // 2. 获取车缝工序列表
  const sewingProcessList = this._extractSewingProcesses(orderDetail);
  // 例: ["做领", "上领", "埋夹", "冚脚边", "钉扣"]
  
  // 3. 根据扫码次数判断当前工序
  if (scanCount < sewingProcessList.length) {
    // 还在车缝阶段
    const currentProcess = sewingProcessList[scanCount];
    // scanCount=0 → "做领"
    // scanCount=1 → "上领"
    // ...
    return {
      processName: currentProcess,
      progressStage: '车缝',
      scanType: 'production'
    };
  } else {
    // 车缝完成，进入下一阶段
    return {
      processName: '大烫',
      progressStage: '大烫',
      scanType: 'production'
    };
  }
}
```

### 3. 单价查询

位置: `ScanHandler.js` → `_prepareScanData()`

```javascript
_prepareScanData(parsedData, stageResult, orderDetail) {
  // 从orderDetail.progressNodeUnitPrices中查找单价
  const nodes = orderDetail.progressNodeUnitPrices || [];
  const matchedNode = nodes.find(
    node => node.name === stageResult.processName
  );
  
  const unitPrice = matchedNode ? matchedNode.unitPrice : 0;
  
  return {
    orderNo: parsedData.orderNo,
    bundleNo: parsedData.bundleNo,
    processName: stageResult.processName,  // 工序名称
    progressStage: stageResult.progressStage,  // 生产节点
    unitPrice: unitPrice,  // 单价
    quantity: stageResult.quantity
  };
}
```

---

## 四、数据库表结构

### 1. t_progress_node_unit_price（工序单价配置表）

| 字段名 | 类型 | 说明 | 示例 |
|-------|------|------|------|
| id | VARCHAR | 主键 | test-node-001 |
| template_id | VARCHAR | 模板ID | test-template-001 |
| progress_stage | VARCHAR | **生产节点** | 车缝 |
| name | VARCHAR | **工序名称** | 做领 |
| unit_price | DECIMAL | 单价 | 2.50 |
| estimated_minutes | INT | 预计时间 | 5 |
| sort_order | INT | 排序 | 1 |

### 2. t_production_order（生产订单表）

| 字段名 | 类型 | 说明 | 示例 |
|-------|------|------|------|
| order_no | VARCHAR | 订单号 | PO20260122001 |
| current_process_name | VARCHAR | 当前工序 | 做领 |
| production_progress | DECIMAL | 生产进度 | 20.5 |
| progress_node_unit_prices | JSON | **工序单价列表** | [{...}] |

**progress_node_unit_prices 示例**:
```json
[
  {
    "progressStage": "车缝",
    "name": "做领",
    "unitPrice": 2.5,
    "estimatedMinutes": 5,
    "sortOrder": 1
  },
  {
    "progressStage": "车缝",
    "name": "上领",
    "unitPrice": 1.8,
    "estimatedMinutes": 3,
    "sortOrder": 2
  }
]
```

### 3. t_scan_record（扫码记录表）

| 字段名 | 类型 | 说明 | 示例 |
|-------|------|------|------|
| id | VARCHAR | 主键 | UUID |
| order_no | VARCHAR | 订单号 | PO20260122001 |
| bundle_no | VARCHAR | 菲号 | 1 |
| progress_stage | VARCHAR | **生产节点** | 车缝 |
| progress_node_name | VARCHAR | **工序名称** | 做领 |
| unit_price | DECIMAL | **单价** | 2.50 |
| quantity | INT | 数量 | 10 |
| scan_count | INT | 扫码次数 | 1 |
| scan_time | DATETIME | 扫码时间 | 2026-01-23 17:00:00 |

---

## 五、关键区别对比

| 项目 | 生产节点 | 工序 |
|-----|---------|------|
| **英文名** | Progress Stage | Process Name |
| **数据库字段** | progress_stage | name |
| **代码变量** | progressStage | processName |
| **数量** | 固定7个 | 可配置（1-N个） |
| **顺序** | 固定 | 可自定义 |
| **单价** | 无 | 有独立单价 |
| **示例** | 车缝 | 做领、上领、埋夹 |

---

## 六、常见问题

### Q1: 为什么需要区分"生产节点"和"工序"？

**A**: 
- **生产节点**是大流程，用于订单整体进度跟踪
- **工序**是小任务，用于工人计件结算

例如：订单进度显示"车缝阶段"，但工人实际做的是"做领"工序。

### Q2: 如果车缝只有1个工序怎么配置？

**A**: 
```json
{
  "progressStage": "车缝",
  "name": "车缝",
  "unitPrice": 10.0
}
```
这样扫1次就完成车缝阶段。

### Q3: 工序单价总和应该等于什么？

**A**: 
- 如果分解工序：各工序单价之和 ≈ 整体工序价格
- 如果不分解：直接配置整体价格

例如：
- 不分解：车缝 = 10元
- 分解后：做领2.5 + 上领1.8 + ... = 8.8元（总价接近）

### Q4: 如何判断车缝阶段完成？

**A**: 
```javascript
if (scanCount >= sewingProcessList.length) {
  // 车缝完成，进入大烫
}
```
扫码次数 ≥ 工序数量 → 当前阶段完成

---

## 七、测试验证

### 测试数据: PO20260122001

**工序配置**: 5个车缝工序
- 做领、上领、埋夹、冚脚边、钉扣

**测试菲号**: PO20260122001-01

**预期结果**:
```
第1次扫码 → 做领（2.5元）
第2次扫码 → 上领（1.8元）
第3次扫码 → 埋夹（2.0元）
第4次扫码 → 冚脚边（1.5元）
第5次扫码 → 钉扣（1.0元）
第6次扫码 → 大烫（进入下一阶段）
```

**验证命令**:
```sql
-- 查看订单工序配置
SELECT progress_node_unit_prices 
FROM t_production_order 
WHERE order_no = 'PO20260122001';

-- 查看扫码记录
SELECT scan_count, progress_node_name, unit_price, scan_time
FROM t_scan_record
WHERE bundle_no LIKE 'PO20260122001-01%'
ORDER BY scan_time;
```

---

**文档维护**: 如业务逻辑调整，请同步更新本文档  
**最后更新**: 2026-01-23
