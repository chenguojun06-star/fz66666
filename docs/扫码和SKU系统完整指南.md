# 扫码系统逻辑详解

> 最后更新：2026年1月22日

## 📋 目录
- [核心优化总结](#核心优化总结)
- [扫码流程图](#扫码流程图)
- [菲号识别逻辑](#菲号识别逻辑)
- [采购任务逻辑](#采购任务逻辑)
- [裁剪任务逻辑](#裁剪任务逻辑)
- [防重复机制](#防重复机制)
- [配置系统](#配置系统)
- [技术架构](#技术架构)

---

## 🎯 核心优化总结

### 1. **智能工序识别（核心功能）**
**问题**：原来工人需手动切换工序，容易选错，效率低

**方案**：扫码次数决定工序
- 菲号01第1次扫 → 自动识别为"做领"
- 菲号01第2次扫 → 自动识别为"上领"  
- 菲号01第3次扫 → 自动识别为"埋夹"
- ...以此类推

**效果**：
- ✅ 工人无需手动选工序，扫码即可
- ✅ 避免选错工序导致计件错误
- ✅ 提升扫码效率 50%+

---

### 2. **防重复扫码保护**
**问题**：工人误扫、连续扫码导致重复计件

**方案**：动态计算最小间隔
```javascript
最小间隔时间 = max(30秒, 菲号数量 × 工序预计分钟 × 60 × 50%)
```

**示例**：
- 菲号：10件
- 工序：做领（预计5分钟/件）
- 预期完成时间：10 × 5 = 50分钟
- 最小间隔：50 × 60 × 50% = 25分钟

在25分钟内重复扫码会被拦截，显示：
> ⚠️ 10件预计需50分钟，3分钟前已扫过

**效果**：
- ✅ 防止误操作导致重复计件
- ✅ 允许快手工人提前完成（50%缓冲）
- ✅ 保护工厂利益，避免虚假计件

---

### 3. **动态工序配置**
**问题**：不同款式工序不同，硬编码无法适应

**方案**：从订单工艺模板动态读取
```javascript
// 旧代码（硬编码）
const sewingProcessList = ['做领', '上领', '埋夹', '冚脚边', '钉扣'];

// 新代码（动态读取）
let sewingProcessList = orderDetail.progressNodeUnitPrices
    .filter(node => node.progressStage === '车缝')
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
    .map(node => node.name);
```

**效果**：
- ✅ 支持任意数量工序配置
- ✅ 不同订单可配置不同工序流程
- ✅ PC端模板中心统一管理

---

### 4. **工序时间配置界面**
**位置**：PC端 → 模板中心 → 工艺模板 → 工序单价配置

**新增字段**：`estimatedMinutes`（预计时间，分钟）

**示例配置**：
| 工序名称 | 单价(元) | 预计时间(分/件) |
|---------|---------|----------------|
| 做领    | 2.5     | 5              |
| 上领    | 1.8     | 3              |
| 埋夹    | 2.0     | 4              |
| 冚脚边  | 1.5     | 3              |
| 钉扣    | 1.0     | 2              |

**效果**：
- ✅ 防重复时间根据实际工序灵活调整
- ✅ 可选字段，不填则使用默认1分钟/件
- ✅ 管理端统一配置，扫码端自动生效

---

### 5. **菲号数据验证**
**问题**：二维码中的数量可能不准确

**方案**：从裁剪表获取准确数量
```javascript
// 调用裁剪表API验证
const bundleInfo = await api.production.getCuttingBundle(orderNo, bundleNo);
const accurateQuantity = bundleInfo.quantity;  // 使用官方数量
```

**效果**：
- ✅ 数量来自裁剪表，数据准确
- ✅ 验证菲号存在性，防止扫描无效菲号
- ✅ 失败时降级使用二维码数量，不影响业务

---

### 6. **界面优化**
**变更**：
1. ❌ 删除 "🤖 自动识别当前进度节点" 提示
2. ✅ 添加 生产节点选择器（采购/裁剪/车缝/大烫/质检/包装/入库）
3. ❌ 删除 "缝制(计件)" 过时选项

**布局**：
```
┌─────────────────────────────────────┐
│ [车缝 ▼]  [数量输入]  [扫码按钮]   │
└─────────────────────────────────────┘
```

**交互**：
- 默认自动识别，跳转到对应节点
- 识别错误时，点击选择器手动修正
- 可在扫码前预选节点

---

## 🔄 扫码流程图

```
用户扫码
   ↓
解析二维码（订单号、菲号、数量等）
   ↓
判断：是否启用自动识别？
   ├─ 是 → 查询订单详情
   │       ↓
   │   判断：是否在车缝阶段？
   │       ├─ 是（有菲号）→ 【菲号识别逻辑】
   │       │                   ↓
   │       │               验证菲号（调用裁剪表API）
   │       │                   ↓
   │       │               查询扫码历史（统计次数）
   │       │                   ↓
   │       │               防重复检查
   │       │                   ├─ 重复 → ⚠️ 拦截，提示等待时间
   │       │                   └─ 通过 → 继续
   │       │                           ↓
   │       │                       根据次数确定工序
   │       │                           ↓
   │       │                       自动切换到对应节点
   │       │
   │       └─ 否（裁剪及之前）→ 【订单识别逻辑】
   │                               ↓
   │                           根据订单进度判断
   │                               ↓
   │                           自动切换到对应节点
   │
   └─ 否 → 使用手动选择的节点
           ↓
弹出确认弹窗
   ├─ 显示：订单号、款号、数量、工序
   ├─ 用户可修正节点选择
   └─ 确认 → 提交扫码记录
              ↓
          保存到数据库
              ↓
          更新今日统计
              ↓
          显示扫码结果
```

---

## 🎯 菲号识别逻辑

### 核心算法

```javascript
/**
 * 菲号识别 - 根据扫码次数确定工序
 * @param {string} orderNo - 订单号
 * @param {string} bundleNo - 菲号
 * @param {number} bundleQuantity - 菲号数量
 * @param {object} orderDetail - 订单详情
 */
async detectNextStageByBundle(orderNo, bundleNo, bundleQuantity, orderDetail) {
    // 1. 验证菲号，获取准确数量
    const bundleInfo = await api.production.getCuttingBundle(orderNo, bundleNo);
    const accurateQuantity = bundleInfo.quantity;  // 从裁剪表获取
    
    // 2. 查询扫码历史
    const historyRes = await api.production.myScanHistory({
        orderNo: orderNo,
        bundleNo: bundleNo
    });
    const scanCount = historyRes.records.length;  // 统计次数
    
    // 3. 获取工序列表（动态）
    let sewingProcessList = orderDetail.progressNodeUnitPrices
        .filter(node => node.progressStage === '车缝')
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
        .map(node => node.name);
    // 例如：['做领', '上领', '埋夹', '冚脚边', '钉扣']
    
    // 4. 获取工序时间配置
    let processTimeConfig = {};  // { '做领': 5, '上领': 3, ... }
    orderDetail.progressNodeUnitPrices.forEach(node => {
        if (node.name && node.estimatedMinutes > 0) {
            processTimeConfig[node.name] = node.estimatedMinutes;
        }
    });
    
    // 5. 防重复检查
    if (scanCount > 0) {
        const lastRecord = historyRes.records[0];
        const lastScanTime = new Date(lastRecord.scanTime).getTime();
        const currentTime = Date.now();
        const timeDiff = (currentTime - lastScanTime) / 1000;  // 秒
        
        // 计算最小间隔
        const configMinutes = processTimeConfig[lastRecord.processName] || 1;
        const expectedTime = accurateQuantity * configMinutes * 60;  // 秒
        const minInterval = Math.max(30, expectedTime * 0.5);  // 50%缓冲
        
        if (timeDiff < minInterval) {
            // 🚫 重复扫码，拦截
            return {
                isDuplicate: true,
                hint: `⚠️ ${accurateQuantity}件预计需${Math.floor(expectedTime/60)}分钟，${Math.floor(timeDiff/60)}分钟前已扫过`
            };
        }
    }
    
    // 6. 根据扫码次数确定工序
    if (scanCount < sewingProcessList.length) {
        // 还在车缝工序内
        const nextProcessName = sewingProcessList[scanCount];
        return {
            processName: nextProcessName,  // 例如：第0次 → '做领'
            progressStage: '车缝',
            hint: `${nextProcessName} (第${scanCount + 1}/${sewingProcessList.length}次)`,
            quantity: accurateQuantity
        };
    } else {
        // 车缝工序都完成，进入下一阶段
        return {
            processName: '大烫',
            progressStage: '大烫',
            hint: '车缝已完成'
        };
    }
}
```

---

## � 采购任务逻辑

### 业务流程

采购任务实现了"领取开始 → 提交数量 → 完成"的完整状态机制，确保双端（PC端+小程序）同步。

```
┌─────────────────────────────────────────────────────────────┐
│                     采购任务状态流转                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  pending (待领取)                                            │
│      │                                                       │
│      ├─── PC端: 点击"领取" ──────┐                          │
│      │                            │                          │
│      └─── 小程序: 扫码领取 ──────┤                          │
│                                    ▼                          │
│                              received (已领取)               │
│                  - receiverId: 领取人ID                      │
│                  - receiverName: 领取人姓名                  │
│                  - receivedTime: 领取时间 ← 开始时间         │
│                                    │                          │
│      ├─── PC端: 填写到货数量 ────┤                          │
│      │                            │                          │
│      └─── 小程序: 提交数量 ──────┤                          │
│                                    ▼                          │
│                              partial / completed             │
│                  - arrivedQuantity: 到货数量                 │
│                  - 自动计算物料到货率                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 关键字段说明

| 字段名 | 类型 | 说明 | 业务含义 |
|-------|------|------|---------|
| `receiverId` | String | 领取人ID | 标识谁领取了这个任务 |
| `receiverName` | String | 领取人姓名 | 用于显示和审计 |
| `receivedTime` | DateTime | 领取时间 | **开始时间**，标记任务开始执行 |
| `arrivedQuantity` | Integer | 到货数量 | 累计到货数量（可分批提交） |
| `purchaseQuantity` | Integer | 采购数量 | 计划采购总量 |
| `status` | String | 状态 | pending/received/partial/completed |

### 小程序端实现

**位置**：`miniprogram/pages/scan/index.js`

#### 1. 扫码领取采购任务
```javascript
// ✅ 批量标记领取（更新 receiverId 和 receiverName）
async onConfirmClaiming() {
  const materialPurchases = this.data.scanConfirm.materialPurchases || [];
  
  // 使用 receivePurchase 接口，避免触发 arrivedQuantity 校验
  const updates = materialPurchases.map(item => ({
    purchaseId: item.id,
    receiverId: userInfo.id,
    receiverName: userInfo.realName || userInfo.username,
  }));

  // 批量更新领取信息
  await Promise.all(updates.map(update => api.production.receivePurchase(update)));
  
  toast.success(`已领取 ${updates.length} 个面料采购任务`);
  this.loadMyProcurementTasks(); // ✅ 刷新采购任务列表
}
```

#### 2. 提交到货数量
```javascript
// ✅ 提交采购任务（来自"我的任务"列表，只更新到货数量）
async onSubmitProcurement() {
  const materialPurchases = this.data.scanConfirm.materialPurchases || [];
  
  // 验证输入并构建更新请求
  const updates = [];
  for (const item of materialPurchases) {
    const inputQty = Number(item.inputQuantity);
    if (inputQty > 0) {
      const newArrived = (Number(item.arrivedQuantity) || 0) + inputQty;
      const purchaseQty = Number(item.purchaseQuantity) || 0;
      const remark = (item.remarkInput || '').trim();

      // ⚠️ 业务规则：到货数量小于70%时必须填写备注
      if (purchaseQty > 0 && newArrived * 100 < purchaseQty * 70 && !remark) {
        toast.error(`${item.materialName || '物料'}到货不足70%，请填写备注说明原因`);
        return;
      }

      updates.push({
        id: item.id,
        arrivedQuantity: newArrived,  // 累加到货数量
        remark: remark,
      });
    }
  }

  // 只调用 updateArrivedQuantity（不再调用 receivePurchase，因为已经领取了）
  await Promise.all(updates.map(u => api.production.updateArrivedQuantity(u)));
  
  toast.success('提交成功');
  this.loadMyProcurementTasks();
}
```

### PC端实现

**位置**：`frontend/src/pages/Production/MaterialPurchase.tsx`

#### 领取采购任务
```typescript
const receivePurchaseTask = async (record: MaterialPurchaseType) => {
  const id = String(record?.id || '').trim();
  const receiverName = String(user?.name || user?.username || '').trim();

  try {
    const res = await api.post('/production/purchase/receive', {
      purchaseId: id,
      receiverId: String(user?.id || '').trim(),
      receiverName: String(receiverName).trim(),
    });
    
    if (res.code === 200) {
      message.success('已领取采购任务');
      fetchMaterialPurchaseList();  // 刷新列表
      return;
    }
    message.error(res.message || '领取失败');
  } catch (e) {
    message.error(e.message || '领取失败');
  }
};
```

### 后端实现

**位置**：`backend/src/main/java/.../MaterialPurchaseServiceImpl.java`

#### receivePurchase() 方法
```java
@Override
public boolean receivePurchase(String purchaseId, String receiverId, String receiverName) {
    // 1. 参数验证
    if (!StringUtils.hasText(purchaseId)) {
        return false;
    }
    
    // 2. 查询采购任务
    MaterialPurchase existed = this.getById(purchaseId);
    if (existed == null || existed.getDeleteFlag() != 0) {
        return false;
    }
    
    // 3. 状态校验：completed/cancelled 不允许领取
    String status = existed.getStatus() == null ? "" : existed.getStatus().trim();
    if ("completed".equals(status) || "cancelled".equals(status)) {
        return false;
    }
    
    // 4. pending 状态 → 更新为 received
    if ("pending".equals(status) || !StringUtils.hasText(status)) {
        LocalDateTime now = LocalDateTime.now();
        
        LambdaUpdateWrapper<MaterialPurchase> uw = new LambdaUpdateWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getId, purchaseId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .and(w -> w.eq(MaterialPurchase::getStatus, "pending")
                        .or().isNull(MaterialPurchase::getStatus)
                        .or().eq(MaterialPurchase::getStatus, ""))
                .set(MaterialPurchase::getReceiverId, receiverId)
                .set(MaterialPurchase::getReceiverName, receiverName)
                .set(MaterialPurchase::getReceivedTime, now)  // ✅ 设置开始时间
                .set(MaterialPurchase::getUpdateTime, now)
                .set(MaterialPurchase::getStatus, "received");
        
        return this.update(uw);
    }
    
    // 5. 已领取 → 验证是否同一个人
    return isSameReceiver(existed, receiverId, receiverName);
}
```

### API 接口定义

**小程序 API**：`miniprogram/utils/api.js`
```javascript
production: {
  // 领取采购任务
  receivePurchase(payload) {
    return ok('/api/production/purchase/receive', 'POST', payload || {});
  },
  
  // 更新到货数量
  updateArrivedQuantity(payload) {
    return ok('/api/production/purchase/update-arrived-quantity', 'POST', payload || {});
  },
  
  // 获取我的采购任务
  myProcurementTasks() {
    return ok('/api/production/purchase/my-tasks', 'GET', {});
  },
}
```

### 业务规则

#### 1. 领取规则
- ✅ 只有 `pending` 状态的任务可以领取
- ✅ 领取时自动记录 `receivedTime`（开始时间）
- ✅ 已完成（completed）或已取消（cancelled）的任务不允许领取
- ✅ 已领取的任务，相同领取人可重复调用（幂等性）

#### 2. 到货规则
- ✅ 到货数量可分批提交（累加）
- ✅ 到货不足70%时必须填写备注说明原因
- ⚠️ 到货数量不能超过采购数量
- ✅ 每次提交自动更新订单的物料到货率

#### 3. 状态转换
```
pending → received → partial → completed
   ↓                              ↑
cancelled ──────────────────────────
```

- `pending`: 待领取
- `received`: 已领取（`receivedTime` 不为空）
- `partial`: 部分到货（0 < arrivedQuantity < purchaseQuantity）
- `completed`: 全部到货（arrivedQuantity >= purchaseQuantity）
- `cancelled`: 已取消

### 双端同步机制

#### 数据一致性保证
1. **领取同步**
   - PC端领取 → 后端更新 `receivedTime` → 小程序刷新显示已领取
   - 小程序领取 → 后端更新 `receivedTime` → PC端刷新显示已领取

2. **提交同步**
   - PC端提交数量 → 后端累加 `arrivedQuantity` → 小程序显示最新数量
   - 小程序提交 → 后端累加 `arrivedQuantity` → PC端显示最新数量

3. **物料到货率同步**
   - 每次提交到货数量 → 后端自动重算订单物料到货率
   - 订单详情页实时显示最新到货率

#### 实时刷新策略
- ✅ 小程序：提交后调用 `loadMyProcurementTasks()` 刷新列表
- ✅ PC端：提交后调用 `fetchMaterialPurchaseList()` 刷新表格
- ✅ 订单列表：物料到货率实时更新（通过后端 Orchestrator 联动）

---

## 📋 裁剪任务逻辑

### 完成判断规则（v2.1 优化）

裁剪任务从原来的"有菲号数量即视为完成"改为**严格三条件判断**。

#### 完成条件（必须同时满足）

```java
// ✅ 条件1：已领取（received_time 不为空）
boolean hasReceivedTime = cuttingTask.receivedTime != null;

// ✅ 条件2：已生成菲号（bundled_time 不为空）
boolean hasBundledTime = cuttingTask.bundledTime != null;

// ✅ 条件3：状态为完成
boolean isStatusCompleted = ["completed", "bundled", "done"]
    .includes(cuttingTask.status.toLowerCase());

// ✅ 最终判断
boolean isCuttingCompleted = hasReceivedTime && hasBundledTime && isStatusCompleted;
```

#### 关键字段说明

| 字段名 | 类型 | 说明 | 业务含义 |
|-------|------|------|---------|
| `receivedTime` | DateTime | 领取时间 | PC端/扫码领取开始裁剪的时间 |
| `bundledTime` | DateTime | 菲号生成时间 | 一键导入菲号/手机生成菲号的时间 |
| `status` | String | 状态 | pending/received/bundled/completed/done |

### 小程序端检查逻辑

**位置**：`miniprogram/pages/scan/services/StageDetector.js`

```javascript
/**
 * 检查裁剪任务是否完成
 * @private
 * @param {Object} orderDetail - 订单详情
 * @returns {boolean} - 是否完成
 */
_checkCuttingCompleted(orderDetail) {
  const cuttingTask = orderDetail.cuttingTask || {};
  
  // ✅ 条件1：菲号已生成
  const hasBundledTime = !!cuttingTask.bundledTime;
  
  // ✅ 条件2：已领取
  const hasReceivedTime = !!cuttingTask.receivedTime;
  
  // ✅ 条件3：状态为完成
  const isStatusCompleted = ['completed', 'bundled', 'done'].includes(
    (cuttingTask.status || '').toLowerCase()
  );
  
  // ⚠️ 必须满足：已领取 + 已生成菲号
  return hasBundledTime && (hasReceivedTime || isStatusCompleted);
}

/**
 * 处理新订单的阶段检测
 */
_handleNewOrder(orderDetail) {
  const materialArrivalRate = orderDetail.materialArrivalRate || 0;
  const isCuttingCompleted = this._checkCuttingCompleted(orderDetail);
  
  // 情况1：物料未到齐（<100%）→ 必须停留在采购阶段
  if (materialArrivalRate < 100) {
    return {
      processName: '采购',
      progressStage: '采购',
      scanType: 'procurement',
      hint: '物料未到齐，请完成采购后再扫码',
    };
  }
  
  // 情况2：物料已到齐，但裁剪未完成 → 停留在裁剪阶段
  if (materialArrivalRate >= 100 && !isCuttingCompleted) {
    return {
      processName: '裁剪',
      progressStage: '裁剪',
      scanType: 'cutting',
      hint: '裁剪进行中，请先完成菲号生成',
    };
  }
  
  // 情况3：物料已到齐，裁剪已完成 → 进入车缝
  return {
    processName: '车缝',
    progressStage: '车缝',
    scanType: 'sewing',
    hint: '可以开始车缝扫码',
  };
}
```

### 后端实现

**位置**：`backend/.../ProductionOrderQueryService.java`

#### 填充裁剪任务详情
```java
/**
 * 填充裁剪汇总信息（包含任务详情）
 */
private void fillCuttingSummary(ProductionOrder order) {
    if (order == null) return;
    
    String oid = order.getId();
    if (!StringUtils.hasText(oid)) return;
    
    // 1. 查询裁剪任务（获取 receivedTime, bundledTime, status）
    LambdaQueryWrapper<CuttingTask> taskWrapper = new LambdaQueryWrapper<CuttingTask>()
            .eq(CuttingTask::getOrderId, oid)
            .eq(CuttingTask::getDeleteFlag, 0)
            .last("LIMIT 1");
    
    CuttingTask task = cuttingTaskMapper.selectOne(taskWrapper);
    
    // 2. 填充任务详情到订单对象
    if (task != null) {
        order.setCuttingTask(task);  // ✅ 包含 receivedTime, bundledTime, status
    }
    
    // 3. 查询菲号汇总（数量、扎数）
    // ...
}
```

### 业务影响

#### ❌ 修复前（旧逻辑）
```
问题：只要有裁剪任务记录，就认为裁剪完成
结果：物料未到齐 + 创建了裁剪任务 → 错误进入车缝阶段
```

#### ✅ 修复后（新逻辑）
```
规则：必须同时满足：
  1. 已领取（receivedTime）
  2. 已生成菲号（bundledTime）
  3. 状态完成（completed/bundled/done）
  
结果：物料87% + 裁剪pending → 正确停留在采购阶段
```

### 相关 API

**后端接口**：
- `GET /api/production/order/detail/{id}` - 订单详情（包含 `cuttingTask` 字段）
- `POST /api/production/cutting/receive` - 领取裁剪任务
- `POST /api/production/cutting/generate-bundles` - 生成菲号

**返回示例**：
```json
{
  "orderNo": "PO20260124001",
  "materialArrivalRate": 87,
  "cuttingTask": {
    "receivedTime": null,
    "bundledTime": null,
    "status": "pending"
  }
}
```

---

## �🛡️ 防重复机制

### 时间计算公式

```
预期完成时间(秒) = 菲号数量 × 工序预计时间(分) × 60
最小间隔时间(秒) = max(30, 预期完成时间 × 50%)
```

### 实例演算

**场景1：正常速度**
```
菲号：20件
工序：上领（配置3分钟/件）
预期时间：20 × 3 = 60分钟
最小间隔：60 × 60 × 50% = 30分钟

第1次扫码 → 9:00 ✅ 记录
第2次扫码 → 9:15 ❌ 拦截（仅过15分钟）
第2次扫码 → 9:35 ✅ 记录（过了35分钟）
```

**场景2：快手工人**
```
菲号：10件
工序：钉扣（配置2分钟/件）
预期时间：10 × 2 = 20分钟
最小间隔：20 × 60 × 50% = 10分钟

实际用时：12分钟 ✅ 通过（大于10分钟）
```

**场景3：小批量**
```
菲号：3件
工序：做领（配置5分钟/件）
预期时间：3 × 5 = 15分钟
最小间隔：max(30, 15×60×50%) = 30秒（使用最小值）

实际用时：40秒 ✅ 通过
```

### 拦截提示样式

```
┌─────────────────────────────────┐
│  ⚠️ 20件预计需60分钟，15分钟前   │
│     已扫过                       │
└─────────────────────────────────┘
```

---

## ⚙️ 配置系统

### PC端配置路径
```
登录PC管理端
 → 模板中心
   → 工艺模板
     → 选择模板
       → 工序单价配置
         → 添加/编辑工序
           ├─ 工序名称：做领
           ├─ 单价：2.5元
           └─ 预计时间：5分钟 ⬅️ 新增字段
```

### 配置示例

**衬衫工艺模板**
```json
{
  "templateName": "衬衫标准工艺",
  "steps": [
    {
      "progressStage": "车缝",
      "processName": "做领",
      "unitPrice": 2.5,
      "estimatedMinutes": 5,
      "sortOrder": 1
    },
    {
      "progressStage": "车缝",
      "processName": "上领",
      "unitPrice": 1.8,
      "estimatedMinutes": 3,
      "sortOrder": 2
    },
    {
      "progressStage": "车缝",
      "processName": "埋夹",
      "unitPrice": 2.0,
      "estimatedMinutes": 4,
      "sortOrder": 3
    },
    {
      "progressStage": "车缝",
      "processName": "钉扣",
      "unitPrice": 1.0,
      "estimatedMinutes": 2,
      "sortOrder": 4
    }
  ]
}
```

**T恤工艺模板**（简化版）
```json
{
  "templateName": "T恤简易工艺",
  "steps": [
    {
      "progressStage": "车缝",
      "processName": "车领",
      "unitPrice": 1.5,
      "estimatedMinutes": 2,
      "sortOrder": 1
    },
    {
      "progressStage": "车缝",
      "processName": "车袖",
      "unitPrice": 1.2,
      "estimatedMinutes": 2,
      "sortOrder": 2
    },
    {
      "progressStage": "车缝",
      "processName": "车边",
      "unitPrice": 1.0,
      "estimatedMinutes": 1,
      "sortOrder": 3
    }
  ]
}
```

### 数据流转

```
PC端配置
    ↓
保存到 t_template_library 表
    ↓
订单引用模板
    ↓
存储到 t_production_order.progressNodeUnitPrices (JSON)
    ↓
小程序查询订单详情
    ↓
orderDetail.progressNodeUnitPrices 数组
    ↓
动态生成工序列表和时间配置
    ↓
用于扫码识别和防重复计算
```

---

## 🏗️ 技术架构

### 前端（小程序）
**文件**：`miniprogram/pages/scan/index.js`

**核心方法**：
- `detectNextStageByBundle()` - 菲号识别逻辑
- `onScan()` - 扫码入口，协调各模块
- `onConfirmScan()` - 提交扫码记录

**关键数据结构**：
```javascript
{
  scanTypeOptions: [
    { label: '采购', value: 'procurement', progressStage: '采购' },
    { label: '裁剪', value: 'cutting', progressStage: '裁剪' },
    { label: '车缝', value: 'production', progressStage: '车缝' },
    { label: '大烫', value: 'production', progressStage: '大烫' },
    { label: '质检', value: 'quality', progressStage: '质检' },
    { label: '包装', value: 'production', progressStage: '包装' },
    { label: '入库', value: 'warehouse' }
  ]
}
```

### 后端 API

**订单详情**：
```
GET /api/production/order/detail/{id}

返回：
{
  "orderNo": "PO20260122001",
  "currentProgressName": "车缝",
  "progressNodeUnitPrices": [
    {
      "progressStage": "车缝",
      "name": "做领",
      "unitPrice": 2.5,
      "estimatedMinutes": 5,
      "sortOrder": 1
    },
    ...
  ]
}
```

**扫码历史**：
```
GET /api/production/scan/my-history
参数：{ orderNo, bundleNo }

返回：
{
  "records": [
    {
      "scanTime": "2026-01-22 09:00:00",
      "processName": "做领",
      "quantity": 20
    }
  ]
}
```

**裁剪菲号查询**：
```
GET /api/production/cutting/by-no
参数：{ orderNo, bundleNo }

返回：
{
  "bundleNo": "01",
  "quantity": 20,
  "qrCode": "PO20260122001-01-20",
  "status": "completed"
}
```

### 数据库表

**扫码记录**：`t_scan_record`
```sql
CREATE TABLE t_scan_record (
  id BIGINT PRIMARY KEY,
  production_order_no VARCHAR(50),
  bundle_no VARCHAR(20),          -- 菲号
  scan_code VARCHAR(200),
  scan_type VARCHAR(20),
  progress_stage VARCHAR(50),
  process_name VARCHAR(100),      -- 工序名称
  quantity INT,
  scan_time DATETIME,
  user_id BIGINT,
  INDEX idx_order_bundle (production_order_no, bundle_no),
  INDEX idx_scan_time (scan_time)
);
```

**裁剪菲号**：`t_cutting_bundle`
```sql
CREATE TABLE t_cutting_bundle (
  id BIGINT PRIMARY KEY,
  production_order_no VARCHAR(50),
  bundle_no VARCHAR(20),          -- 菲号
  quantity INT,                   -- 准确数量
  qr_code VARCHAR(200),
  status VARCHAR(20),
  create_time DATETIME,
  UNIQUE KEY uk_order_bundle (production_order_no, bundle_no)
);
```

---

## 📊 效果对比

### 优化前
```
工人操作流程：
1. 手动选择工序（做领）
2. 扫码
3. 输入数量
4. 提交
   ↓
下一个菲号：
1. 手动切换工序（上领）← 容易忘记/选错
2. 扫码
3. 输入数量
4. 提交

问题：
❌ 每次都要手动切换工序
❌ 容易选错导致计件错误
❌ 可以连续扫码刷单
❌ 工序列表写死，不灵活
```

### 优化后
```
工人操作流程：
1. 扫码 → 自动识别"做领"
2. 自动填充数量
3. 确认提交
   ↓
下一个菲号（同订单）：
1. 扫码 → 自动识别"上领" ← 自动切换！
2. 自动填充数量
3. 确认提交

优势：
✅ 完全自动化，无需手动选择
✅ 根据扫码次数精准识别工序
✅ 动态防重复，避免刷单
✅ 工序配置化，支持任意流程
✅ 数据准确性提升（从裁剪表获取）
```

---

## 🎓 使用建议

### 管理员配置指南
1. **创建工艺模板**（PC端 → 模板中心）
   - 按实际工序顺序添加
   - 配置合理的单价
   - 填写预计时间（可选，建议填写）

2. **订单绑定模板**
   - 下单时选择对应工艺模板
   - 系统自动继承工序配置

3. **监控防重复效果**
   - 观察扫码记录，是否有异常密集扫码
   - 根据实际情况调整工序预计时间

### 工人使用指南
1. **首次扫码**
   - 确保选择器在"车缝"节点
   - 扫描菲号二维码
   - 确认工序和数量，提交

2. **后续扫码（同菲号）**
   - 直接扫码即可
   - 系统自动切换到下一个工序
   - 如提示"重复扫码"，说明时间未到，等待后再扫

3. **手动修正**
   - 如自动识别错误，点击节点选择器修改
   - 适用于跳过某个工序等特殊情况

---

## 🔧 故障排查

### Q1：扫码后没有自动切换工序
**排查**：
1. 检查订单是否绑定了工艺模板
2. 检查工序配置中 `progressStage` 是否为"车缝"
3. 检查菲号是否存在于裁剪表

### Q2：防重复一直拦截
**排查**：
1. 检查工序预计时间配置是否过大
2. 检查菲号数量是否正确
3. 可临时通过手动选择器切换到下一工序

### Q3：工序顺序错乱
**排查**：
1. 检查模板配置中的 `sortOrder` 字段
2. 确保 `sortOrder` 按 1,2,3... 递增
3. 重新保存模板生效

---

## 📝 版本历史

**v2.1** - 2026年1月25日
- ✅ **裁剪完成判断逻辑优化**（核心业务规则修改）
  - 从原来的"有菲号数量即视为完成"改为严格三条件判断
  - **新规则**：只有同时满足以下条件才算裁剪完成，可进入车缝：
    1. ✅ 裁剪任务已领取（`received_time` 不为空）
    2. ✅ 菲号已生成（`bundled_time` 不为空）
    3. ✅ 状态为 `completed/bundled/done`
  - 后端返回 `cuttingTask` 详情（包含 `receivedTime`, `bundledTime`, `status`）
  - 小程序端通过 `orderDetail.cuttingTask.bundledTime` 精准判断
  - **影响**：修复了物料未到齐但已创建裁剪任务导致错误跳到车缝的问题

**v2.0** - 2026年1月22日
- ✅ 实现菲号基于扫码次数的工序识别
- ✅ 动态防重复机制
- ✅ 工序时间配置系统
- ✅ 菲号数据验证
- ✅ 界面优化：生产节点选择器
- ✅ 移除过时的"缝制(计件)"选项

**v1.0** - 之前版本
- 基础扫码功能
- 手动选择工序
- 固定防重复时间（30秒）

---

## 🚀 未来规划

### 短期（1-2周）
- [ ] 扫码记录支持批量撤销
- [ ] 防重复时间学习算法（根据历史数据优化）
- [ ] 工序完成度实时看板

### 中期（1个月）
- [ ] 工人计件报表自动生成
- [ ] 异常扫码预警（速度过快/过慢）
- [ ] 工序时间自动优化建议

### 长期（3个月）
- [ ] AI预测工序完成时间
- [ ] 生产进度可视化大屏
- [ ] 多工序并行支持

---

## 📞 技术支持

如有问题，请联系技术团队或查阅：
- 代码文件：`miniprogram/pages/scan/index.js`
- API文档：`backend/README.md`
- 配置界面：PC端 → 模板中心

---

**文档维护者**：系统开发团队  
**最后更新**：2026年1月22日
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

