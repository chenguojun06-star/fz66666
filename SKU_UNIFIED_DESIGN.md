# 📦 SKU 数据结构完整设计文档

## 1️⃣ SKU 概念定义

### 当前混乱的地方
```
❌ 问题：SKU在不同地方定义不一致
- 小程序: "color + size 就是SKU"
- 后端: "color + size 是订单的特殊属性，明细是 items"
- PC端: "显示为 styleNo/color/size"
```

### 统一定义 (新标准)

**SKU = 最小库存单位 = (styleNo, color, size)**

```typescript
/**
 * SKU标准定义
 */
interface SKU {
  // === 识别字段 (唯一标识一个SKU) ===
  styleNo: string;      // 款号 (必填，如 "PO20260122001")
  color: string;        // 颜色 (必填，如 "黑色")
  size: string;         // 尺码 (必填，如 "L")
  
  // === 数量字段 ===
  totalQuantity: number;      // 订单要求的总数
  completedQuantity: number;  // 已完成数量
  pendingQuantity: number;    // 待完成数量 = totalQuantity - completedQuantity
  
  // === 关联字段 ===
  orderNo: string;            // 所属订单号 (如 "PO20260122001")
  batchNo?: string;           // 菲号 (裁剪阶段后才有，如 "PO20260122001-黑色-01")
}

/**
 * 订单 (Order) = 多个SKU的集合
 */
interface Order {
  orderNo: string;        // 订单号 (全局唯一)
  styleNo: string;        // 款号
  styleName: string;      // 款名
  
  // === 订单级数量 ===
  orderQuantity: number;  // 订单总数 (多种颜色尺码的总和)
  items: SKU[];           // SKU明细列表
  
  // === 订单进度 ===
  currentStage: string;   // 当前工序 (采购、裁剪、车缝...)
  progressWorkflow: any;  // 完整的工序流程配置
}

/**
 * 菲号 (Bundle) = 裁剪后的产物
 */
interface Bundle {
  bundleNo: string;       // 菲号 (格式: orderNo-color-batchSeq)
  styleNo: string;
  color: string;          // 单一颜色
  size: string;           // 可能有多个 (集合)
  quantity: number;       // 菲号内数量
  skuList: SKU[];         // 该菲号包含的SKU列表
}
```

---

## 2️⃣ 后端数据结构 (Java)

### ProductionOrder (订单主体)

```java
@Data
public class ProductionOrder {
  // 订单标识
  private String id;              // UUID
  private String orderNo;         // 订单号 (唯一)
  private String styleNo;         // 款号
  private String styleName;       // 款名
  
  // 订单级数量
  private Integer orderQuantity;  // 订单总数
  private Integer completedQuantity; // 已完成数
  
  // 订单明细 (SKU列表) - JSON格式存储
  private String orderDetails;    // JSON: [{color, size, quantity, ...}]
  
  // 进度追踪
  private String progressWorkflowJson; // 工序流程配置
  private String currentProcessName;   // 当前工序名
  private String currentProcessNode;   // 当前工序节点
  
  // 时间戳
  private LocalDateTime createdAt;
  private LocalDateTime updatedAt;
}

// 当前问题: ProductionOrder.color/size 是多余的
// 应该只在 orderDetails (items) 中使用
```

### ScanRecord (扫码记录)

```java
@Data
public class ScanRecord {
  private String id;
  
  // === SKU信息 ===
  private String orderNo;         // 订单号
  private String styleNo;         // 款号
  private String color;           // 颜色
  private String size;            // 尺码
  
  // === 扫码信息 ===
  private String bundleNo;        // 菲号 (可选，裁剪后才有)
  private Integer quantity;       // 本次扫码数量
  private String processNode;     // 工序 (采购/裁剪/车缝/入库)
  
  // === 来源标识 ===
  private String scanType;        // 扫码类型 (ORDER/BUNDLE/SKU)
  private String qrCodeFormat;    // QR格式标识
  
  // === 操作信息 ===
  private String operatorId;      // 操作员ID
  private LocalDateTime scanTime; // 扫码时间
}

// 新增字段需要:
// - bundleNo: 用于关联菲号
// - scanType: 用于区分来源
```

### CuttingBundle (菲号)

```java
@Data
public class CuttingBundle {
  private String id;
  
  // === 菲号标识 ===
  private String bundleNo;        // 唯一的菲号 (orderNo-color-seq)
  private String productionOrderId;
  private String productionOrderNo;
  
  // === SKU信息 ===
  private String styleNo;
  private String color;           // 菲号颜色 (单色)
  private List<String> sizeList;  // 尺码集合 (可能有多种)
  
  // === 数量 ===
  private Integer totalQuantity;  // 菲号总数
  private Integer completedQuantity;
  
  // === 菲号详情 ===
  private String skuJson;         // JSON: 该菲号包含的SKU列表
}
```

---

## 3️⃣ 小程序数据流程 (现状分析)

### 当前混乱的三种扫码模式

```javascript
// 模式1: 订单扫码 (ORDER)
// QR: PO20260122001
// 返回: Order { orderNo, styleNo, items: [ {color, size, qty}, ... ] }
// 行为: 显示 SKU 明细列表供用户确认

// 模式2: 菲号扫码 (BUNDLE)
// QR: PO20260122001-黑色-01
// 返回: Bundle { bundleNo, color, sizeList, quantity }
// 行为: 直接提交，数量自动

// 模式3: SKU扫码 (SKU)
// QR: {color: "黑色", size: "L", quantity: 50}
// 返回: {color, size, quantity}
// 行为: 需要用户确认订单号或自动匹配
```

### 问题在这里:
```
❌ SKU模式定义不清
- 什么是"SKU扫码"? 就是扫二维码读到颜色+尺码?
- 但二维码应该关联到哪个订单?
- SKU应该有orderNo才能完整

✅ 应该改为:
- 模式1: 订单号 → 返回订单+SKU列表
- 模式2: 菲号 → 返回菲号+SKU信息  
- 模式3: SKU二维码 → 返回 {订单号, 颜色, 尺码} (需要二维码包含订单号)
```

---

## 4️⃣ 新的统一扫码流程

### Step 1: 二维码识别 (QRCodeParser)

```javascript
/**
 * 解析二维码 → 返回标准化格式
 */
parseScanCode(rawQRCode) {
  const result = {
    scanType: null,           // 'ORDER' | 'BUNDLE' | 'SKU'
    orderNo: null,            // 订单号 (ORDER/BUNDLE/SKU都应有)
    bundleNo: null,           // 菲号 (仅BUNDLE)
    color: null,              // 颜色 (BUNDLE/SKU)
    size: null,               // 尺码 (BUNDLE/SKU)
    quantity: null,           // 数量 (BUNDLE/SKU)
  };
  
  // ===== 模式识别 =====
  
  // 模式1: 订单号 (6-15位数字)
  if (/^PO\d{8,14}$/.test(rawQRCode)) {
    result.scanType = 'ORDER';
    result.orderNo = rawQRCode;
    return result;
  }
  
  // 模式2: 菲号 (订单号-颜色-序列号)
  // 格式: PO20260122001-黑色-01
  const bundleMatch = rawQRCode.match(/^(PO\d+)-(.+)-(\d{2})$/);
  if (bundleMatch) {
    result.scanType = 'BUNDLE';
    result.orderNo = bundleMatch[1];
    result.bundleNo = rawQRCode;
    result.color = bundleMatch[2];
    // size 和 quantity 从后端Bundle信息获取
    return result;
  }
  
  // 模式3: SKU二维码 (JSON格式)
  // 格式: {"orderNo":"PO20260122001","color":"黑色","size":"L","qty":50}
  try {
    const json = JSON.parse(rawQRCode);
    if (json.orderNo && json.color && json.size) {
      result.scanType = 'SKU';
      result.orderNo = json.orderNo;
      result.color = json.color;
      result.size = json.size;
      result.quantity = json.qty || json.quantity;
      return result;
    }
  } catch (e) {}
  
  // 模式4: 文本格式SKU (逗号分隔)
  // 格式: PO20260122001,黑色,L,50
  const textMatch = rawQRCode.match(/^(PO\d+),(.+),(.+),(\d+)$/);
  if (textMatch) {
    result.scanType = 'SKU';
    result.orderNo = textMatch[1];
    result.color = textMatch[2];
    result.size = textMatch[3];
    result.quantity = parseInt(textMatch[4]);
    return result;
  }
  
  return null; // 无法识别
}
```

### Step 2: 数据补全 (ScanHandler)

```javascript
/**
 * 根据扫码结果补全数据
 */
async enrichScanData(parsedData, orderDetail) {
  // === 订单扫码: 获取SKU明细列表 ===
  if (parsedData.scanType === 'ORDER') {
    const items = orderDetail.items; // [{color, size, qty}, ...]
    return {
      ...parsedData,
      skuItems: items,  // 返回SKU列表供用户确认
      needConfirm: true // 需要用户选择
    };
  }
  
  // === 菲号扫码: 补全尺码和数量 ===
  if (parsedData.scanType === 'BUNDLE') {
    const bundle = await this.api.getBundle(parsedData.bundleNo);
    return {
      ...parsedData,
      sizeList: bundle.sizeList,
      quantity: bundle.quantity,
      skuItems: bundle.skuJson.parse(), // [{color, size}, ...]
      needConfirm: false // 可直接提交
    };
  }
  
  // === SKU扫码: 检查订单中是否存在 ===
  if (parsedData.scanType === 'SKU') {
    const matchedSKU = orderDetail.items.find(item =>
      item.color === parsedData.color && item.size === parsedData.size
    );
    
    if (!matchedSKU) {
      throw new Error(`订单中不存在 ${parsedData.color}/${parsedData.size}`);
    }
    
    // 如果扫码中没有数量，使用订单中的数量
    if (!parsedData.quantity) {
      parsedData.quantity = matchedSKU.qty;
    }
    
    return {
      ...parsedData,
      skuItems: [matchedSKU], // 只有一个SKU
      needConfirm: false     // 可直接提交
    };
  }
}
```

### Step 3: 工序推进 (StageDetector)

```javascript
/**
 * 根据扫码类型和现有进度推进工序
 */
async detectNextStage(scanType, parsedData, orderDetail, currentStage) {
  const stageSequence = [
    '采购',    // 0: 材料采购
    '裁剪',    // 1: 布料裁剪 → 产生菲号
    '车缝',    // 2: 缝纫加工
    '质检',    // 3: 质量检查
    '入库'     // 4: 成品入库
  ];
  
  const currentIndex = stageSequence.indexOf(currentStage);
  
  // 订单号扫码: 推进一个工序
  if (scanType === 'ORDER') {
    return stageSequence[currentIndex + 1] || '完成';
  }
  
  // 菲号扫码: 从裁剪跳到车缝
  if (scanType === 'BUNDLE') {
    if (currentIndex < 1) return '裁剪'; // 还在采购，推到裁剪
    return stageSequence[currentIndex + 1] || '完成';
  }
  
  // SKU扫码: 检查是否完全完成了当前工序
  if (scanType === 'SKU') {
    const allSKUsCompleted = orderDetail.items.every(item =>
      item.completedQty >= item.totalQty
    );
    
    if (allSKUsCompleted) {
      return stageSequence[currentIndex + 1] || '完成';
    } else {
      return currentStage; // 还在当前工序
    }
  }
}
```

### Step 4: 提交扫码 (ExecuteScan)

```javascript
/**
 * 统一的扫码提交格式
 */
async executeScan(request) {
  // 请求格式
  const scanRequest = {
    // === 必填 ===
    orderNo: string;           // 订单号
    styleNo: string;           // 款号
    color: string;             // 颜色
    size: string;              // 尺码
    quantity: number;          // 本次数量
    processNode: string;       // 工序 (采购/裁剪/车缝/质检/入库)
    
    // === 可选 ===
    bundleNo?: string;         // 菲号 (如有)
    operatorId?: string;       // 操作员 (自动获取)
    remark?: string;           // 备注
  };
  
  // 调用后端
  const result = await api.production.executeScan(scanRequest);
  
  // 返回格式
  return {
    success: boolean;
    message: string;
    // === 更新的信息 ===
    updatedOrder: Order;       // 更新后的订单
    nextStage: string;         // 推荐的下一工序
  };
}
```

---

## 5️⃣ 后端扫码处理流程

### Controller

```java
@PostMapping("/executeScan")
public Result<ScanResponse> executeScan(@RequestBody ScanRequest request) {
  // 1. 验证数据
  validateScanRequest(request);
  
  // 2. 获取订单
  ProductionOrder order = orderService.getByOrderNo(request.getOrderNo());
  
  // 3. 更新SKU进度
  // 在 orderDetails 中找到匹配的SKU，更新其 completedQty
  updateSkuProgress(order, request.getColor(), request.getSize(), request.getQuantity());
  
  // 4. 记录扫码
  ScanRecord record = new ScanRecord();
  record.setOrderNo(request.getOrderNo());
  record.setStyleNo(request.getStyleNo());
  record.setColor(request.getColor());
  record.setSize(request.getSize());
  record.setQuantity(request.getQuantity());
  record.setProcessNode(request.getProcessNode());
  record.setBundleNo(request.getBundleNo()); // 如有
  scanRecordService.save(record);
  
  // 5. 检查是否推进工序
  boolean allSKUsComplete = checkAllSKUsComplete(order);
  String nextStage = allSKUsComplete ? getNextStage(order) : order.getCurrentProcessName();
  
  // 6. 更新订单状态
  order.setCurrentProcessName(nextStage);
  orderService.updateById(order);
  
  return Result.ok(new ScanResponse(order, nextStage));
}
```

### Service

```java
private void updateSkuProgress(ProductionOrder order, String color, String size, int qty) {
  // 解析 orderDetails JSON
  List<SKUItem> items = JSON.parseArray(order.getOrderDetails(), SKUItem.class);
  
  // 找到匹配的SKU
  for (SKUItem item : items) {
    if (item.getColor().equals(color) && item.getSize().equals(size)) {
      // 更新已完成数量
      item.setCompletedQty(item.getCompletedQty() + qty);
      
      // 检查是否超额
      if (item.getCompletedQty() > item.getTotalQty()) {
        throw new BusinessException("扫码数量超过订单数量");
      }
      break;
    }
  }
  
  // 更新订单
  order.setOrderDetails(JSON.toJSONString(items));
  
  // 计算订单级完成数
  int totalCompleted = items.stream()
    .mapToInt(SKUItem::getCompletedQty)
    .sum();
  order.setCompletedQuantity(totalCompleted);
}
```

---

## 6️⃣ PC端数据展示

### 订单详情页

```typescript
/**
 * 显示订单的SKU明细表格
 */
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
    dataIndex: 'totalQty',
    width: 80
  },
  {
    title: '已完成',
    dataIndex: 'completedQty',
    width: 80,
    render: (text, record) => {
      const progress = (record.completedQty / record.totalQty * 100).toFixed(0);
      return (
        <Progress 
          percent={progress}
          format={percent => `${record.completedQty}/${record.totalQty}`}
        />
      );
    }
  },
  {
    title: '待完成',
    dataIndex: 'pendingQty',
    width: 80,
    render: (text, record) => record.totalQty - record.completedQty
  },
  {
    title: '菲号',
    dataIndex: 'bundleNo',
    width: 150
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 80,
    render: (text, record) => {
      if (record.completedQty >= record.totalQty) {
        return <Tag color="green">已完成</Tag>;
      }
      return <Tag color="blue">进行中</Tag>;
    }
  }
];
```

---

## 7️⃣ 数据一致性检查

### 三端数据验证规则

```
订单号验证:
✅ 格式: PO+8位日期+6位序列 (PO20260122001)
✅ 在三端都必须存在且一致

款号验证:
✅ 必须关联到一个有效的款号记录
✅ 在订单创建时固定，不可更改
✅ 在PC和小程序显示一致

SKU验证:
✅ color + size 必须在订单 items 中存在
✅ 颜色和尺码必须是正确的中文/英文标准
✅ completedQty ≤ totalQty (永远不超额)

菲号验证:
✅ 格式: 订单号-颜色-序列号 (PO20260122001-黑色-01)
✅ 只在裁剪阶段后才应该存在
✅ 一个菲号对应一个颜色
✅ 一个菲号可能对应多个尺码

工序验证:
✅ currentProcessName 必须是工序列表中的有效值
✅ 工序必须按顺序推进 (不能跳级)
✅ 完成数必须等于订单数才能推进
```

---

## 8️⃣ 迁移计划

### Phase 1: 数据结构统一 (当前)
- [x] 定义统一的SKU概念
- [x] 定义统一的二维码格式
- [ ] 更新后端ProductionOrder (删除冗余color/size)
- [ ] 更新后端ScanRecord (添加scanType字段)

### Phase 2: 小程序改造 (1天)
- [ ] 创建 SKUProcessor.js 统一处理
- [ ] 更新 QRCodeParser.js 按新格式解析
- [ ] 更新 ScanHandler.js 按新逻辑处理
- [ ] 更新 index.js UI 显示新数据

### Phase 3: 后端改造 (1天)
- [ ] 更新 ProductionOrderQueryService 返回新格式
- [ ] 更新 ScanController 按新逻辑处理
- [ ] 添加 ScanRecord.scanType 字段迁移脚本
- [ ] 添加数据验证规则

### Phase 4: PC端改造 (0.5天)
- [ ] 更新 OrderFlow.tsx 显示SKU进度
- [ ] 更新 ScanRecordList.tsx 显示新字段
- [ ] 添加 SKU进度图表

### Phase 5: 测试验证 (1天)
- [ ] 三端数据一致性测试
- [ ] 各工序流转测试
- [ ] 边界条件测试

---

## 📝 总结

**统一前的混乱**:
- SKU在三端定义不一致
- 二维码格式多种多样
- 扫码逻辑散落在多个地方
- 无法追踪单个SKU的进度

**统一后的清晰**:
✅ SKU = (styleNo, color, size) 的最小单位
✅ 二维码格式标准化 (ORDER/BUNDLE/SKU三种)
✅ 扫码逻辑集中在 SKUProcessor.js (小程序) 和 ScanController (后端)
✅ 每个SKU的进度都可以独立追踪
✅ 三端数据完全一致，无重复定义

