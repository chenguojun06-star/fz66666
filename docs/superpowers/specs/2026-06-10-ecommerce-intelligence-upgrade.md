# 电商智能化升级 - 超越聚水潭

> 最后更新：2026-06-10
> 状态：设计中

---

## 一、目标

对标聚水潭，在"跨平台库存统一"、"智能仓库分配"、"订单拆分"、"库存预警"、"智能补货"、"采购建议"6个方向全面升级，实现简单好用的电商仓储一体化。

---

## 二、核心架构

```
电商订单(Webhook)
     ↓
[跨平台库存统一池] EcUniversalStockPool
     ↓ 检查实时可售库存
[智能仓库分配器] SmartWarehouseAllocator
     ↓ 按优先级/库存量分配
[订单拆分引擎] OrderSplitEngine
     ↓ 不足时自动拆单
[库存预警中心] StockAlertService
     ↓ 低于安全库存时触发
[智能补货引擎] SmartReplenishmentService
     ↓ 基于历史销量+在途+库存
[采购建议单] PurchaseSuggestionSheet
     ↓ 一键转正式采购单
```

---

## 三、数据模型

### 3.1 EcUniversalStock（跨平台库存统一池）

```sql
CREATE TABLE t_ec_universal_stock (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    style_id BIGINT NOT NULL,           -- 款式ID
    sku_id BIGINT NOT NULL,             -- SKU ID
    warehouse_id BIGINT,                -- 仓库ID（NULL表示多仓合计）
    total_warehoused INT DEFAULT 0,     -- 总入库
    total_outstock INT DEFAULT 0,       -- 总出库
    pending_orders INT DEFAULT 0,       -- 待发货订单占用
    available_stock INT DEFAULT 0,      -- 可售库存
    safe_stock INT DEFAULT 0,           -- 安全库存
    buffer_stock INT DEFAULT 5,         -- 缓冲库存
    last_sync_time DATETIME,            -- 最后同步时间
    create_time DATETIME,
    update_time DATETIME
);
```

### 3.2 EcWarehouseAllocation（仓库分配记录）

```sql
CREATE TABLE t_ec_warehouse_allocation (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    order_id BIGINT NOT NULL,           -- 电商订单ID
    warehouse_id BIGINT NOT NULL,       -- 分配的仓库
    allocated_quantity INT NOT NULL,    -- 分配数量
    allocation_type VARCHAR(20),         -- AUTO/MANUAL
    priority INT DEFAULT 0,             -- 分配优先级
    create_time DATETIME
);
```

### 3.3 EcOrderSplit（订单拆分记录）

```sql
CREATE TABLE t_ec_order_split (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    original_order_id BIGINT NOT NULL, -- 原始订单
    split_order_no VARCHAR(50),          -- 拆分后的订单号
    warehouse_id BIGINT,                 -- 对应仓库
    split_quantity INT NOT NULL,         -- 拆分数量
    split_reason VARCHAR(100),           -- PARTIAL_STOCK/跨仓/SELLER_CONFIRM
    status INT DEFAULT 0,                -- 0-待处理 1-已发货 2-已取消
    create_time DATETIME
);
```

### 3.4 EcStockAlert（库存预警）

```sql
CREATE TABLE t_ec_stock_alert (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    style_id BIGINT NOT NULL,
    sku_id BIGINT,
    warehouse_id BIGINT,
    alert_type VARCHAR(20),             -- LOW_STOCK/OUT_OF_STOCK/STALE
    current_stock INT,
    safe_stock INT,
    message TEXT,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_time DATETIME,
    create_time DATETIME
);
```

### 3.5 EcPurchaseSuggestion（采购建议）

```sql
CREATE TABLE t_ec_purchase_suggestion (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    style_id BIGINT NOT NULL,
    sku_id BIGINT,
    suggest_quantity INT NOT NULL,       -- 建议采购量
    urgency_level VARCHAR(20),           -- HIGH/MEDIUM/LOW
    reason TEXT,                         -- 计算原因
    sales_30d INT,                       -- 30天销量
    available_stock INT,                 -- 当前可售
    on_way_stock INT,                    -- 在途库存
    target_days INT DEFAULT 30,          -- 备货天数
    status INT DEFAULT 0,                -- 0-待确认 1-已转采购 2-已拒绝
    purchase_order_id BIGINT,            -- 关联的采购单
    create_time DATETIME
);
```

---

## 四、模块详细设计

### 4.1 跨平台库存统一池（EcUniversalStockPool）

**职责**：实时计算各SKU在各平台的可售库存

**算法**：
```
可售库存 = SUM(各仓库入库) - SUM(各仓库出库) - 待发货订单占用 - 安全库存 - 缓冲库存
```

**联动**：
- 入库时 → ProductWarehousingService → 更新跨平台库存
- 出库时 → ProductOutstockService → 更新跨平台库存
- 订单创建 → EcommerceOrderOrchestrator → 预占库存
- 订单取消 → EcommerceOrderOrchestrator → 释放预占

### 4.2 智能仓库分配器（SmartWarehouseAllocator）

**分配优先级**：
1. 有足够库存的仓库
2. 仓库优先级高的
3. 库存量最接近订单数量的（减少拆单）

**配置项**：
- 仓库优先级顺序（可在电商中心配置）
- 是否启用跨仓分配
- 最小分配数量门槛

### 4.3 订单拆分引擎（OrderSplitEngine）

**拆分策略**：
- `PARTIAL_STOCK`：部分发货，剩余等待
- `CROSS_WAREHOUSE`：跨仓库满足（多仓分配）
- `SELLER_CONFIRM`：需卖家确认

**拆分后处理**：
- 自动生成子订单记录
- 推送消息给买家（缺货部分）
- 超时自动取消未发货部分

### 4.4 库存预警中心（StockAlertService）

**预警类型**：
- `LOW_STOCK`：库存低于安全库存
- `OUT_OF_STOCK`：库存为0
- `STALE`：呆滞库存（30天无变动且高于安全库存2倍）

**预警推送**：
- 触发后推送到小云AI
- 页面"智能库存"Tab展示预警列表
- 支持一键生成采购建议

### 4.5 智能补货引擎（SmartReplenishmentService）

**计算公式**：
```
建议采购量 = (日均销量 × 备货天数) - 当前可售 - 在途库存 + 安全库存
```

**参数配置**：
- 备货天数（默认30天）
- 历史销量周期（7/14/30天）
- 季节性调整系数

### 4.6 采购建议单（PurchaseSuggestionSheet）

**操作流程**：
1. 系统自动生成建议采购量
2. 人工确认/调整数量
3. 一键转正式采购单
4. 采购单自动关联到款式

---

## 五、权限设计

| 权限码 | 说明 |
|--------|------|
| `ec:stock:view` | 查看跨平台库存 |
| `ec:stock:config` | 配置安全库存/仓库优先级 |
| `ec:allocation:view` | 查看仓库分配记录 |
| `ec:split:view` | 查看订单拆分记录 |
| `ec:alert:view` | 查看库存预警 |
| `ec:alert:resolve` | 处理库存预警 |
| `ec:suggestion:view` | 查看采购建议 |
| `ec:suggestion:approve` | 审批采购建议 |
| `ec:suggestion:convert` | 转正式采购单 |

**注意**：
- 所有操作需校验 `tenant_id` 多租户隔离
- 前端页面使用 `@PreAuthorize` 注解控制
- 小程序端只读，操作需PC端授权

---

## 六、前端页面

### 6.1 电商中心 - 智能库存Tab（新增）

```
┌─────────────────────────────────────────────────────────────┐
│  [预警列表] [补货建议] [库存明细] [分配记录]                  │
├─────────────────────────────────────────────────────────────┤
│  ⚠️ 紧急预警                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ A款-黑色-S  |  可售:3件  |  安全:20件  |  [生成采购]   ││
│  │ A款-白色-M  |  可售:0件  |  安全:15件  |  [生成采购]   ││
│  └─────────────────────────────────────────────────────────┘│
│                                                             │
│  📊 补货建议                                                 │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ 款式    | 30天销量 | 可售  | 在途 | 建议采购 | 操作      ││
│  │ B款    |  500件   | 50件  | 200  |   300件   | [详情]   ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 6.2 电商订单 - 拆分记录Tab（新增）

订单详情页展示拆分原因、分配的仓库

### 6.3 仓库页面 - 跨平台库存入口（新增）

仓库详情页展示该仓库在各平台的库存分布

---

## 七、与现有系统打通

### 7.1 仓库模块

| 现有Service | 联动点 |
|-------------|--------|
| `ProductWarehousingService` | 入库时同步更新跨平台库存 |
| `ProductOutstockService` | 出库时同步更新跨平台库存 |
| `WarehouseService` | 获取仓库列表用于分配 |

### 7.2 款式模块

| 现有Service | 联动点 |
|-------------|--------|
| `StyleInfoService` | 获取款式信息用于补货计算 |
| `ProductSkuService` | 获取SKU列表用于库存关联 |

### 7.3 电商模块

| 现有Service | 联动点 |
|-------------|--------|
| `EcommerceOrderOrchestrator` | 订单创建时预占库存、触发拆分 |
| `EcPlatformAdapter` | 各平台库存同步适配器 |
| `EcStockCalculator` | 废弃，迁移到新库存池 |

### 7.4 采购模块

| 现有Service | 联动点 |
|-------------|--------|
| `MaterialPurchaseOrchestrator` | 采购建议转正式采购单 |
| `MaterialPurchaseService` | 创建采购单 |

### 7.5 小云AI

| 工具 | 用途 |
|------|------|
| `StockAlertNotifyTool` | 推送库存预警 |
| `PurchaseSuggestionTool` | 查询/操作采购建议 |
| `EcStockQueryTool` | 查询跨平台库存 |

---

## 八、实施计划

### Phase 1: 数据层（1天）
- [ ] Flyway迁移：新建5张表
- [ ] Entity生成
- [ ] Mapper层

### Phase 2: 核心引擎（2天）
- [ ] EcUniversalStockPool 跨平台库存池
- [ ] SmartWarehouseAllocator 仓库分配器
- [ ] OrderSplitEngine 订单拆分引擎

### Phase 3: 智能预警（1天）
- [ ] StockAlertService 预警服务
- [ ] SmartReplenishmentService 补货引擎
- [ ] PurchaseSuggestionSheet 采购建议

### Phase 4: 集成打通（1天）
- [ ] 与ProductWarehousingService联动
- [ ] 与ProductOutstockService联动
- [ ] 与EcommerceOrderOrchestrator联动
- [ ] 与MaterialPurchaseOrchestrator联动

### Phase 5: 前端（1天）
- [ ] 电商中心智能库存Tab
- [ ] 预警列表/补货建议页面
- [ ] 订单拆分记录展示

### Phase 6: AI集成（0.5天）
- [ ] 小云AI预警推送
- [ ] 采购建议查询工具

### Phase 7: 测试验证（0.5天）
- [ ] 全链路测试
- [ ] 权限测试
- [ ] 演示操作流程

---

## 九、操作流程演示

### 场景1：订单进来 → 自动分配仓库

1. 淘宝买家下单 → Webhook推送到系统
2. `EcommerceOrderOrchestrator.receiveOrder()` 调用 `SmartWarehouseAllocator`
3. 分配结果写入 `t_ec_warehouse_allocation`
4. 订单状态更新为"待发货"，显示分配的仓库

### 场景2：库存不足 → 自动拆分

1. 拼多多买家下单2件，仓库只有1件
2. `OrderSplitEngine.split()` 生成拆分记录
3. 1件先发货，1件标记缺货等待
4. 买家收到部分发货通知
5. 系统触发 `StockAlertService` 预警

### 场景3：库存预警 → 智能补货

1. `StockAlertService` 检测到A款库存低于安全库存
2. 推送预警到小云AI → 管理员收到提醒
3. 管理员打开"智能库存"Tab → 查看补货建议
4. 确认建议采购量 → 点击"转采购单"
5. 系统调用 `MaterialPurchaseOrchestrator` 生成采购单

---

## 十、简化操作设计

为确保"简单好用"：

1. **一键操作**：预警列表支持批量生成采购建议
2. **默认配置**：安全库存/仓库优先级有默认值，无需首次配置
3. **智能提示**：每个操作都有小云AI引导
4. **状态透明**：订单拆分/仓库分配原因清晰展示
5. **撤销灵活**：拆分记录支持取消，操作可逆
