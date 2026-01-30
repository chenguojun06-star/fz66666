# 生产端扫码SKU生成功能优化方案 (Scan SKU Optimization Plan)

## 1. 现状分析与风险识别 (Current Analysis & Risks)

### 1.1 核心流程分析

当前生产端扫码生成/校验 SKU 的流程如下：

1.  **扫码 (Scan)**: 前端提交 `scanCode`, `orderNo`, `color`, `size`。
2.  **校验 (Validate)**: 后端 `validateSKU` 方法读取 `ProductionOrder`，解析 `orderDetails` (JSON)，遍历查找匹配的 SKU。
3.  **统计 (Statistics)**: `getOrderSKUProgress` 方法遍历所有 SKU，并对每个 SKU 执行一次 `count(*)` 数据库查询。

### 1.2 性能瓶颈 (Bottlenecks)

1.  **JSON 解析开销 (High CPU)**:
    - 每次校验 SKU 或查询进度时，都需要反序列化 `orderDetails` JSON 字符串。对于包含 50+ SKU 的订单，这会消耗大量 CPU。
2.  **N+1 查询问题 (Database IO)**:
    - `getOrderSKUProgress` 方法在循环中调用 `getSKUProgress`，导致一个请求触发 N 次数据库查询（N = SKU 数量）。
    - 示例：若订单有 50 个 SKU，查询一次进度需执行 51 次 SQL。并发 100 次请求将导致 5100 次 SQL，瞬间击穿数据库。
3.  **缺乏缓存 (No Caching)**:
    - 订单的 SKU 配置（颜色/尺码）是静态的，但目前每次都从数据库读取并解析。

### 1.3 风险评估

- **响应时间**: 在 SKU 较多的情况下，接口响应时间可能超过 1s，严重影响工人扫码节奏。
- **并发能力**: 数据库连接池极易被 N+1 查询耗尽，导致系统拒绝服务 (DoS)。

## 2. 优化方案 (Optimization Strategy)

### 2.1 数据库优化 (Database)

- **索引优化**:
  - 确保 `t_scan_record` 表存在复合索引：`idx_order_sku (order_no, style_no, color, size, scan_result)`。
  - 这一索引可覆盖所有进度统计查询，实现 "Covering Index" 扫描，无需回表。

### 2.2 代码逻辑重构 (Code Refactoring)

- **消除 N+1 查询**:
  - 将 `getOrderSKUProgress` 的 N 次查询重构为 1 次聚合查询：
    ```sql
    SELECT color, size, COUNT(*)
    FROM t_scan_record
    WHERE order_no = ? AND scan_result = 'success'
    GROUP BY color, size
    ```
  - 在内存中将聚合结果映射到 SKU 列表，将复杂度从 O(N) 降低到 O(1)。
- **引入本地缓存 (Local Cache)**:
  - 使用 `Caffeine` 或 `ConcurrentHashMap` 缓存解析后的 `orderDetails` 对象。
  - Key: `order:details:{orderNo}`, TTL: 5分钟 (或订单更新时失效)。

### 2.3 架构演进 (Architecture)

- **异步处理**:
  - 扫码动作仅做“写入记录”和“简单校验”，将复杂的“进度计算”和“报表更新”放入消息队列或异步线程池处理。
  - 响应时间可压缩至 50ms 以内。

## 3. 实施计划 (Implementation Plan)

### 3.1 第一阶段：核心代码重构 (已完成)

- [x] 重构 `SKUServiceImpl.getOrderSKUProgress`，使用 `GROUP BY` 替代循环查询。
- [x] 优化 `validateSKU`，增加 JSON 解析结果的简单缓存（请求级复用）。

### 3.2 第二阶段：引入缓存层 (已完成)

- [x] 引入 Caffeine Cache。
- [x] 对 `resolveSkuListFromOrderDetails` 添加本地缓存 (TTL 5分钟)。

### 3.3 第三阶段：异步化与架构升级 (已完成)

- [x] 配置 `AsyncConfig` 开启 Spring 异步支持。
- [x] 将 `recomputeProgressFromRecords` 改造为 `@Async` 异步执行，解除扫码接口对进度计算的强依赖。
- [x] 增加异步执行的异常捕获与失败记录机制 (`insertOrchestrationFailure`)。

### 3.4 第四阶段：性能压测与验证 (Q2)

- [ ] **工具**: JMeter / Gatling。
- [ ] **场景**: 模拟 100 个并发用户同时扫码，订单包含 50 个 SKU。
- [ ] **目标**:
  - 平均响应时间 < 200ms。
  - TPS (吞吐量) > 1000。
  - 错误率 0%。

## 4. 回滚策略 (Rollback)

- 代码均通过 Git 管理，若新逻辑出现数据不一致，可立即 Revert 代码并重新部署。
- 数据库索引变更属于非破坏性操作，无需回滚。

---

**附：性能优化前后对比预估**

| 指标              | 优化前             | 优化后        | 提升幅度 |
| :---------------- | :----------------- | :------------ | :------- |
| 单次进度查询SQL数 | N (SKU数量)        | 1             | **N倍**  |
| 扫码接口响应时间  | ~500ms             | < 100ms       | 500%     |
| 数据库CPU负载     | 高 (解析+大量查询) | 低 (索引扫描) | 显著降低 |
