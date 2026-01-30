# 电商对接与库存同步策略 (E-commerce Integration & Inventory Strategy)

## 1. 概述 (Overview)

本文档详细描述供应链系统 (Supply Chain System) 与外部电商平台 (如 Shopify, 淘宝, 抖音等) 的对接策略。核心目标是实现 SKU 信息的打通与库存数据的实时/准实时同步，防止超卖并提高运营效率。

## 2. 当前进展 (Current Status)

截止 2026-01-30，已完成以下基础建设：

- [x] **SKU 统一管理**: 建立了 `t_product_sku` 表，作为全系统唯一的 SKU 基础数据源。
- [x] **库存字段**: 在 SKU 表中增加了 `stock_quantity` 字段。
- [x] **标准 API**: 开发了标准库存查询与更新接口。
  - `GET /api/style/sku/inventory/{skuCode}`: 查询指定 SKU 库存。
  - `POST /api/style/sku/inventory/update`: 外部系统回调或人工修正库存。

## 3. 对接模式选择 (Integration Models)

### 3.1 模式对比

| 模式             | 描述                                 | 优点                         | 缺点                             | 适用场景             |
| :--------------- | :----------------------------------- | :--------------------------- | :------------------------------- | :------------------- |
| **Push (推)**    | 供应链库存变动时，主动推送给电商平台 | 实时性强，电商侧数据滞后极小 | 需处理推送失败重试，开发复杂度高 | 核心热销品，防止超卖 |
| **Pull (拉)**    | 电商平台定时查询供应链接口           | 实现简单，解耦               | 存在时间窗口延迟，非实时         | 长尾商品，全量校对   |
| **Event (事件)** | 基于 Webhook 或消息队列              | 架构优雅，扩展性好           | 依赖中间件稳定性                 | 复杂微服务架构       |

### 3.2 选定策略：混合模式 (Hybrid Strategy)

我们采用 **"实时增量推送 + 定时全量校准"** 的策略。

1.  **库存主数据 (Source of Truth)**: 供应链系统 (`t_product_sku.stock_quantity`) 为唯一可信库存源。
2.  **实时触发**: 当发生“成品入库”、“发货出库”等业务动作时，异步触发推送任务，调用电商平台 API 更新库存。
3.  **兜底机制**: 每日凌晨 3:00 执行全量库存比对任务，修正因网络波动等原因导致的不一致。

## 4. API 规范 (API Specification)

### 4.1 获取库存 (Get Inventory)

供外部系统查询当前可用库存。

- **URL**: `GET /api/style/sku/inventory/{skuCode}`
- **Response**:
  ```json
  {
    "code": 200,
    "message": "操作成功",
    "data": 150, // 当前库存数量
    "requestId": "..."
  }
  ```

### 4.2 更新库存 (Update Inventory)

用于接收外部系统的库存调整指令（如退货入库、盘点差异），或作为测试接口。

- **URL**: `POST /api/style/sku/inventory/update`
- **Body**:
  ```json
  {
    "skuCode": "STYLE001-RED-L",
    "quantity": 5 // 正数增加，负数减少
  }
  ```

## 5. 后续实施计划 (Implementation Roadmap)

### Phase 1: 适配器层建设 (Adapter Layer)

- 定义 `ExternalPlatformService` 统一接口。
- 实现 `MockPlatformAdapter` 用于本地测试。
- 实现 `ShopifyAdapter` (或其他首选平台) 的库存更新逻辑。

### Phase 2: 业务触发埋点 (Business Hooks)

- 在 `ScanRecordOrchestrator` (扫码入库) 成功后，发布 `InventoryChangedEvent`。
- 监听该事件并调用适配器推送库存。

### Phase 3: 全量同步任务 (Scheduled Sync)

- 使用 Spring Scheduled 实现每日全量同步 Job。
