# 智能采购推荐升级设计 — 待采购订单列表 + 批量按需计算

> 版本：v1.0
> 日期：2026-08-22
> 状态：设计稿（待用户评审）
> 方案：方案A — 待采购订单列表 + 按需批量计算 + 2小时缓存
> 关联铁律：P0 #4（多租户隔离）、P0 #2（事务边界）、D-001（Orchestrator ≤150行）

---

## 一、设计目标

### 1.1 解决的核心痛点

| 现有问题 | 升级后目标 |
|---------|-----------|
| 用户必须手动输入订单号才能分析 | 打开 Drawer 直接看到「所有需要采购的订单列表」，点开即可操作 |
| 一次只能处理一个订单，效率低 | 可批量勾选多个订单，一键推送所有缺料到购物车 |
| 不知道哪些订单该采购、缺多少 | 列表一目了然：缺料种数、预计金额、紧急程度 |
| 全量重算炸数据库 | 批量SQL优化 + 2小时缓存 + 分页计算，单页SQL ≤10次 |

### 1.2 非目标（本期不做）

- ❌ 不新增数据库表（复用现有 `t_purchase_cart_item` 存结果）
- ❌ 不改动现有单订单分析逻辑（`calculateNetDemand` 保留）
- ❌ 不改动后台巡检 Job（`SourcingSpecialistPatrolJob` 保留）
- ❌ 不做前端复杂可视化图表（后续再迭代）

---

## 二、用户确认的关键参数

| 参数 | 值 | 说明 |
|-----|---|------|
| 方案 | A — 待采购订单列表 + 按需批量计算 | |
| 默认筛选 | ① 排除终态订单 ② 物料到位率 < 80% ③ 近 60 天创建 | 全部可由用户在前端调整 |
| 缓存 TTL | 2 小时 | Redis / Caffeine，过了自动重算 |

---

## 三、后端设计

### 3.1 新增 API 清单

在现有 `SmartSourcingController`（[SmartSourcingController.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/controller/SmartSourcingController.java)）中新增 3 个接口：

| Method | Path | 说明 | 复杂度 |
|--------|------|------|--------|
| `GET` | `/api/production/smart-sourcing/orders` | **订单列表（轻量）**：仅查 `t_production_order`，返回分页订单基本信息，不做净需求计算 | O(1) 次SQL |
| `POST` | `/api/production/smart-sourcing/orders-overview` | **订单批量概览**：传入 `orderNos[]`（≤20个），返回每个订单的缺料汇总（缺料种数、预计金额等），结果缓存2小时 | O(10) 次批量SQL（见3.2） |
| `GET` | `/api/production/smart-sourcing/order-detail/{orderNo}` | **单订单详情（缓存优先）**：返回物料明细（同现有 `net-demand`，但带缓存）。用户展开列表行时调用 | 优先读缓存，miss 才计算 |

> **现有接口保留不变**：`/net-demand/{orderNo}`、`/generate/{orderNo}`、`/generate-batch` 继续支持单订单分析和手动输入。

### 3.2 批量概览 SQL 优化方案（核心：从 N×M 次降到 ~10 次）

原 `buildNetDemandDetails` 对每个BOM每个物料逐个查，N订单×M物料=4×N×M次SQL。

**改为批量查询**，步骤如下（全部带 `tenant_id` 过滤）：

```
输入：orderNos[]（≤20个）

步骤1：批量查订单信息（1次SQL）
  SELECT * FROM t_production_order
  WHERE order_no IN (...) AND tenant_id = ?
  → 得到 orderId、styleNo、orderQty、status、materialArrivalRate...

步骤2：批量查款式（1次SQL）
  SELECT * FROM t_style_info WHERE style_no IN (...) AND tenant_id = ?

步骤3：批量查 BOM（1次SQL）
  SELECT * FROM t_style_bom
  WHERE style_id IN (...) AND tenant_id = ?
  → 按 styleId 分组，每个订单对应自己的 BOM

步骤4：批量查可用库存（1次SQL，关键优化）
  SELECT material_code, SUM(quantity - locked_quantity) AS available
  FROM t_material_stock
  WHERE material_code IN (<步骤3得到的所有materialCode去重>)
    AND tenant_id = ? AND delete_flag = 0
  GROUP BY material_code
  → 得到 Map<materialCode, availableStock>

步骤5：批量查在途采购（1次SQL，关键优化）
  SELECT material_code, SUM(purchase_quantity - arrived_quantity) AS in_transit
  FROM t_material_purchase
  WHERE material_code IN (...) AND tenant_id = ? AND delete_flag = 0
    AND status NOT IN ('completed','cancelled')
  GROUP BY material_code
  → 得到 Map<materialCode, inTransit>

步骤6：批量查历史采购价（1次SQL，关键优化）
  SELECT mp.material_code, mp.unit_price, mp.supplier_name, mp.create_time
  FROM t_material_purchase mp
  INNER JOIN (
    SELECT material_code, MAX(create_time) AS max_time
    FROM t_material_purchase
    WHERE material_code IN (...) AND tenant_id = ? AND delete_flag = 0
    GROUP BY material_code
  ) latest ON mp.material_code = latest.material_code
          AND mp.create_time = latest.max_time
  WHERE mp.tenant_id = ?
  → 得到 Map<materialCode, {lastPrice, lastSupplier, lastTime}>

步骤7：批量查供应商推荐（1~2次SQL，关键优化）
  7a. 收集所有BOM中指定了 supplierId 的，批量查 Factory
  7b. 其余未指定的，按物料类型查 S/A 级供应商（按评分取TOP1 per 物料类型，或全局TOP5做匹配）
  → 得到 Map<materialCode, recommendedSupplier>

步骤8：内存计算净需求 + 汇总（纯CPU，0 SQL）
  对每个订单的每个BOM项：
    demand = usageAmount × orderQty × (1 + lossRate%)
    netDemand = demand - availableStock(步骤4) - inTransit(步骤5)
    needPurchase = netDemand > 0
  订单级汇总：
    shortageCount = needPurchase 的物料数
    shortageAmount = Σ(needPurchase ? netDemand × bomUnitPrice : 0)
    bomItemsCount = BOM 总数
    criticalPath = 若缺面料则标记"面料缺口"（优先级高于辅料）

→ 输出：List<OrderOverviewDto>
```

**SQL 总量对比**（假设20个订单，每个10个BOM，共15种不同物料）：
| 方式 | SQL 次数 |
|-----|---------|
| 原实现逐个算 | 20 × (3 + 10×4) = **860 次** |
| 批量优化后 | **≤ 8 次**（7步 + 可能多1次供应商兜底） |

> ⚠️ **性能硬保护**：`orders-overview` 接口 `orderNos` 数组长度限制 20，超出返回 400。前端分页默认每页 20 条，对齐此限制。

### 3.3 缓存策略（2小时 TTL）

**缓存层次**（双层，Caffeine + Redis，对应L1/L2记忆模型）：

| 层 | 载体 | TTL | Key 格式 | 内容 |
|----|------|-----|----------|------|
| L1 本地 | Caffeine（SmartSourcingServiceImpl 内） | 2h | `smart-overview:{tenantId}:{orderNo}` | 单订单概览汇总 DTO |
| L1 本地 | Caffeine | 2h | `smart-detail:{tenantId}:{orderNo}` | 单订单物料明细（同 net-demand 返回） |

> 说明：现有项目已有 Caffeine + Redis（AiAgentMemoryHelper），但智能采购数据量不大（单订单几KB），**本期先用 Caffeine（进程内）**，避免引入序列化开销。如果后续多实例部署时发现缓存不共享，再切 Redis。

**缓存失效触发**：
1. 时间过期（2h）自动失效
2. 用户点「刷新最新状态」按钮 → 手动清除该订单的缓存键并强制重算
3. 购物车确认采购后 → 清除被确认订单的缓存（因为在途采购量会变）
4. 物料入库操作触发 `data:changed` → 清除所有订单概览缓存（因为库存变了，简单粗暴但安全）

### 3.4 新增 DTO 结构

```java
// ===== SmartSourcingOrdersResponse（轻量订单列表，0计算）=====
public class SmartSourcingOrdersPage {
    private List<OrderBasicDto> list;      // 当前页订单
    private long total;                    // 符合筛选的总数
    private SmartSourcingFilter defaultFilter; // 推荐给前端的默认筛选值
}

public class OrderBasicDto {
    private String orderNo;
    private String styleNo;
    private String styleName;
    private String coverImage;
    private Integer orderQuantity;
    private Integer materialArrivalRate;   // 已有字段，直接展示
    private String status;                 // pending/in_production/...
    private LocalDateTime createTime;
    private LocalDateTime deliveryDate;
    private String urgency;                // urgent/normal
    private String merchandiser;           // 跟单人
}

public class SmartSourcingFilter {
    // 所有筛选字段全部可选，前端可调整
    private Integer arrivalRateLessThan;   // 默认 80，可改成 0~100 任意值
    private List<String> excludeStatuses;  // 默认 ["completed","scrapped","cancelled","closed","archived"]
    private Integer createdWithinDays;     // 默认 60，可选 7/14/30/60/90/180/365
    private String searchKeyword;          // 订单号/款号 模糊搜索
    private List<String> statuses;         // 可选：只看某些状态
}

// ===== SmartSourcingOverviewResponse（批量概览，有计算）=====
public class SmartSourcingOverviewResponse {
    private Map<String /*orderNo*/, OrderOverviewDto> overviews;
    private List<String /*orderNo*/> fromCache;  // 哪些是缓存命中的（前端显示"缓存"标签）
    private List<String /*orderNo*/> computed;   // 哪些是新算的
}

public class OrderOverviewDto {
    private String orderNo;
    private int bomItemsCount;          // 物料总数
    private int shortageCount;          // 缺料种数（needPurchase=true 的数量）
    private int sufficientCount;        // 充足种数
    private BigDecimal shortageAmount;  // 缺料预计金额（Σ 净需求×预估单价）
    private BigDecimal totalBomAmount;  // BOM总金额
    private List<String> criticalMaterials;  // 关键缺料TOP3（面料优先）
    private String criticalPath;        // "面料缺2种，辅料缺3种" / "全部充足"
    private List<SourcingHint> hints;   // 智能提示：["BOM指定供应商3个", "历史采购价上涨12%"]
    private LocalDateTime computedAt;   // 计算时间（用于前端显示"XX分钟前更新"）
    private boolean fromCache;          // 是否来自缓存
}
```

### 3.5 Orchestrator / Service 边界划分

**事务边界规则（D-001）**：
- 新增方法全部是只读计算，**不需要 `@Transactional`**
- 只有"推送购物车"（调用 `PurchaseCartOrchestrator.batchAddItems`）需要事务，现有 `generate-batch` 已经走 Orchestrator，复用即可

| 职责 | 类 | 说明 |
|-----|---|------|
| 筛选订单列表（只读） | `SmartSourcingServiceImpl.listOrders()` | 直接 MyBatis-Plus 查询 `ProductionOrder` |
| 批量概览计算（只读） | `SmartSourcingServiceImpl.buildOverviewsBatch()` | 8步批量SQL + 内存汇总（核心优化） |
| 单订单详情（只读+缓存） | `SmartSourcingServiceImpl.getOrderDetailCached()` | 复用现有 `calculateNetDemand` + Caffeine 缓存包装 |
| 批量推送购物车（有写入） | 已有 `generateSourcingForOrders` → 内部调 `PurchaseCartOrchestrator` | 不新增，直接复用 |

---

## 四、前端设计

### 4.1 整体结构（Drawer 内 Tabs 切换）

打开「智能采购推荐」Drawer 后：

```
┌──────────────────────────────────────────────────────────────────────┐
│ 智能采购推荐                                                    _ □ X │
├──────────────────────────────────────────────────────────────────────┤
│ [ Tab 1: 待采购订单列表 ]  [ Tab 2: 单订单分析 ]                     │
├──────────────────────────────────────────────────────────────────────┤
│ 🔍 筛选区（可折叠，默认展开）                                         │
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 订单号/款号搜索：[________________] [🔍]                        │ │
│ │ 创建时间：[近60天 ▼]  物料到位率：[< 80% ▼]  状态：[全部 ▼]     │ │
│ │ [紧急度 □]  [按创建时间↓ ▼排序]      [重置筛选]  [应用筛选]    │ │
│ └─────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│ 📊 汇总栏                                                            │
│ ┌────────────┬────────────┬─────────────┬──────────────────────┐   │
│ │ 筛选后订单 │ 有缺料订单 │ 预计总金额  │ 已缓存 N 单           │   │
│ │    12 单   │   8 单     │  ¥ 52,340   │ (⏱刷新 2h内有效)     │   │
│ └────────────┴────────────┴─────────────┴──────────────────────┘   │
│                                                                      │
│ 📋 订单列表（分页，每页20条）                                         │
│ ┌─┬─────────┬──────┬──────┬───────┬──────┬──────┬────────┬────────┐│
│ │☑│订单号   │款号  │数量  │到位率 │缺料数│预计金│更新时间│ 操作  ││
│ ├─┼─────────┼──────┼──────┼───────┼──────┼──────┼────────┼────────┤│
│ │☑│PO2608.. │款A   │500件 │ 32%  │ 3种  │¥12.3k│5分钟前 │[详情] ││
│ │☑│PO2608.. │款B   │200件 │ 58%  │ 2种  │¥4.2k │10分钟前│[详情] ││
│ │ □PO2608.. │款C   │1000件│ 100% │ 0种  │ ¥0   │1小时前 │[详情] ││
│ │ □PO2608.. │款D   │300件 │ 45%  │ 5种  │¥38.7k│缓存2h │[详情↻]││
│ └─┴─────────┴──────┴──────┴───────┴──────┴──────┴────────┴────────┘│
│ [首页][1][2][3][下一页]  共 45 单                                   │
│                                                                      │
│ 🔘 底部操作栏（固定）                                                 │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ ☑ 全选本页 (3/3)  |  已选 3 单，预计缺料 10 种，金额 ¥55.2k    │  │
│ │                                        [↻刷新选中] [一键推送选中→购物车]│  │
│ └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

用户点「详情」→ 当前行展开，显示物料明细（复用原 Table 列结构）：
```
PO26080012 款A 500件 详情展开 ────────────────────────────────────────
┌──┬──────────────┬──────┬────┬──────┬────┬────┬──────────┬────────┐
│  │物料           │用量  │损耗│总需求│库存│在途│净需求    │推荐供应商│
├──┼──────────────┼──────┼────┼──────┼────┼────┼──────────┼────────┤
│🔴│梭织棉弹面料...│1.5m  │5%  │787.5m│ 100│ 50 │637.5m 需│XX纺织S级│
│🔴│涤纶里布......│1.2m  │3%  │618m  │ 50 │ 0  │568m 需  │YY里料A级│
│🟢│树脂拉链5#....│1条   │0%  │500条 │1000│ 0  │0  充足  │-       │
└──┴──────────────┴──────┴────┴──────┴────┴────┴──────────┴────────┘
                           [单独推送此订单→购物车]
```

Tab 2「单订单分析」完全保留现有手动输入逻辑，兜底用。

### 4.2 筛选条件设计（可配置，不写死）

| 筛选项 | 默认值 | 可选值/输入方式 | 备注 |
|-------|--------|---------------|------|
| 创建时间范围 | 近 60 天 | Dropdown：今天/7天/14天/30天/60天/90天/180天/365天/自定义区间 | 对应 `createdWithinDays` |
| 物料到位率 | < 80% | Dropdown：<50% / <60% / <70% / <80% / <90% / <100%（=全部） | 对应 `arrivalRateLessThan` |
| 订单状态 | 排除终态 | Multi-Select：可自由勾选/取消 进行中/待生产/暂停/已完成/已取消/已关单/已归档 | 对应 `excludeStatuses` + `statuses` |
| 搜索关键词 | 空 | Input：订单号/款号模糊匹配 | 对应 `searchKeyword` |
| 紧急度 | 全部 | Checkbox：☐ 只看急单 | 加条件 `urgency = 'urgent'` |
| 排序 | 创建时间 倒序 | Dropdown：创建时间↑/↓ / 交货时间↑ / 缺料数↓ / 到位率↑ / 预计金额↓ | 后端列表SQL排序 |

> 筛选条件**同步到 URL Query**，用户刷新页面后筛选条件保持。

### 4.3 交互流程（分阶段加载，不阻塞）

```
用户点击「智能采购推荐」按钮
  ↓
打开 Drawer，Tab 1 默认
  ↓
Step 1（同步，快）：调用 GET /orders（带默认筛选），显示订单列表骨架屏
  ↓ ✅ 列表 300ms 内显示（仅查 t_production_order）

Step 2（异步，后台）：拿当前页 orderNos（≤20个）→ 调用 POST /orders-overview
  ↓
  返回 overviews map → 更新对应行的「缺料数/预计金/更新时间/缓存标识」
  ↓ ✅ 每行更新不阻塞整体滚动

用户点某行「详情」
  ↓
调用 GET /order-detail/{orderNo} → 优先读缓存
  ↓ ✅ 缓存命中 <100ms，未命中 1~2s

用户勾选 N 个订单 → 点「一键推送选中→购物车」
  ↓
收集勾选的 orderNos → 调用 POST /generate-batch（现有接口）
  ↓ ✅ 成功后打开购物车 Drawer，清空勾选状态 + 清除被推送订单的缓存
```

### 4.4 视觉标识与提示（避免用户困惑）

| 元素 | 视觉样式 | 说明 |
|------|---------|------|
| 来自缓存的数据 | 行尾加灰色小标签 `⏱缓存 1h23m前`，详情按钮改成 `[详情↻]` | 告知用户数据非实时，可点↻刷新 |
| 正在加载概览 | 缺料数/预计金额 显示骨架屏 `----` | 不要空白 |
| 计算失败的订单 | 整行浅红色背景，操作列显示 `[重试]` 按钮 | 不影响其他订单 |
| 全部物料充足 | 整行浅绿背景，缺料数显示 `0 充足`，不参与勾选批量推送 | |
| 面料缺口 | criticalPath 文字加粗+红色图标 | 提醒关键路径 |
| 批量推送进度 | Modal 进度条「第 2/5 单处理中...」 | 避免用户重复点击 |

---

## 五、性能保护硬限制（防止炸数据库）

| 保护项 | 限制值 | 超出处理 |
|-------|-------|---------|
| `/orders-overview` 单次 orderNos 数量 | ≤ 20 | 返回 400："单次最多分析20个订单" |
| `/orders` 列表 pageSize | 默认 20，最大 50 | 超过 50 后端强制 clamp 到 50 |
| Caffeine 缓存最大条目 | 500 单（tenant 维度隔离） | LRU 淘汰最久未用的 |
| 后端计算超时 | 单接口 15s 超时（Spring MVC） | 返回 504 + "请减少订单数量重试" |
| 批量推送购物车 | 单次 ≤ 10 个订单 | 超出提示用户分批推送 |
| 缓存清除 `data:changed` 防抖 | 30s 内重复触发只清一次 | 防止短时间内入库频繁 → 缓存反复清空 |

---

## 六、数据链路与多租户隔离

### 6.1 所有查询必带 `tenant_id`

沿用现有 `SmartSourcingServiceImpl` 的写法（[SmartSourcingServiceImpl.java#L177-L188](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/production/service/impl/SmartSourcingServiceImpl.java#L177-L188)），所有新增查询：

```java
// 示例：批量订单列表（tenant_id 写在最前面的条件）
wrapper.eq(ProductionOrder::getTenantId, tenantId)
       .eq(ProductionOrder::getDeleteFlag, 0)
       .notIn(excludeStatuses != null, ProductionOrder::getStatus, excludeStatuses)
       .lt(arrivalRateLessThan != null, ProductionOrder::getMaterialArrivalRate, arrivalRateLessThan)
       .ge(createdWithinDays != null, ProductionOrder::getCreateTime, now.minusDays(createdWithinDays))
       .like(StringUtils.hasText(searchKeyword), ProductionOrder::getOrderNo, searchKeyword)
       .or()
       .like(StringUtils.hasText(searchKeyword), ProductionOrder::getStyleNo, searchKeyword);
```

### 6.2 缓存 Key 多租户隔离

```
Key 格式：smart-overview:{tenantId}:{orderNo}
示例    ：smart-overview:1001:PO202608220001
```

不同租户的缓存完全隔离，绝不串号。

---

## 七、错误处理与降级

| 场景 | 处理 |
|------|------|
| 批量概览 15s 超时 | 返回已完成的订单结果 + 失败列表，前端提示"N个订单计算超时，可单独点详情重试" |
| 单个订单计算失败（BOM缺失等） | 该订单行显示错误信息，不影响其他订单 |
| Caffeine 缓存崩了（OOM 等） | 降级为不缓存，每次实时计算（稍慢但可用） |
| 库存/在途查询返回空 | 视为 0，继续计算（不阻塞），但 hints 里提示"无库存记录，可能不准" |
| 推送购物车部分失败 | 已成功的照常入购物车，失败的列表展示，用户可勾选后重试 |

---

## 八、验收标准（完成后验证）

### 后端（必过）

- [ ] `GET /orders` 响应 ≤ 300ms（1万条订单数据量下）
- [ ] `POST /orders-overview` 传 20 个订单，响应 ≤ 3s，且 SQL ≤ 10 条（可通过 p6spy 日志验证）
- [ ] 缓存命中：第二次调用同 20 个订单，响应 ≤ 500ms
- [ ] 手动刷新（清除缓存后）：结果正确，2h 后自动过期
- [ ] 多租户测试：tenantA 的订单，tenantB 无论如何查不到

### 前端（必过）

- [ ] 打开 Drawer 300ms 内看到订单列表（骨架屏后显示真实数据）
- [ ] 筛选条件切换后 URL 同步更新，F5 刷新后保持
- [ ] 批量勾选 20 单 → 一键推送成功，购物车内数据正确
- [ ] 详情展开物料明细列对齐、数据完整（同原单订单分析一致）
- [ ] `npx tsc --noEmit` 0 errors

### 质量门控

- [ ] `mvn compile` BUILD SUCCESS
- [ ] anti-pattern 检查通过（无 Service 层 @Transactional，无 SQL 漏 tenant_id）
- [ ] 事务边界：只读计算无 @Transactional，推送走现有 PurchaseCartOrchestrator
- [ ] 反思三问（D-055）通过：①影响点全查过 ②批量接口无LLM调用（本地计算） ③ 端到端用真实账号测一遍

---

## 九、变更影响矩阵

| 模块 | 变更性质 | 关联引用点需同步 |
|-----|---------|----------------|
| 后端 SmartSourcingController | +3 新接口，不修改旧接口 | 前端 services/purchaseCartApi.ts |
| 后端 SmartSourcingServiceImpl | +批量计算方法 + Caffeine 缓存 | 无（内部改动） |
| 后端 DTO 包 | +5 新 DTO 类 | 无 |
| 前端 MaterialPurchase/index.tsx | Drawer 内部大改（Tab + 列表 + 筛选） | 无（文件内部） |
| 前端 purchaseCartApi.ts | +3 个 API 调用函数 | 无（现有函数保留） |
| 小程序/H5 | ❌ 不同步（智能采购推荐是PC端独占功能，且本次是PC端Drawer优化） | 无 |

> **P0铁律检查**：不涉及 Flyway、不涉及扫码/工资/质检核心流程、不修改旧接口 → 风险等级 P2（低）。

---

## 十、实施步骤（后续 Coding 阶段执行）

```
阶段一：后端（1天）
  ├── 新增 SmartSourcingFilter/OrderBasicDto/OrderOverviewDto 等 5 个 DTO
  ├── SmartSourcingServiceImpl.listOrders()：订单筛选+分页列表
  ├── SmartSourcingServiceImpl.buildOverviewsBatch()：8步批量SQL（核心优化）
  ├── Caffeine 缓存封装 + 手动刷新接口
  ├── SmartSourcingController 新增 3 个端点
  └── mvn compile + 本地用 Postman 测 SQL 数量和响应时间

阶段二：前端（1天）
  ├── purchaseCartApi.ts 新增 3 个 API 封装
  ├── 抽离筛选区组件 SmartSourcingFilterBar（可复用）
  ├── 抽离订单列表组件 SmartSourcingOrderList（分页+勾选+展开）
  ├── index.tsx Drawer 内部改 Tab 结构
  └── npx tsc --noEmit + 真实账号端到端测 5 个场景

阶段三：验证与优化（半天）
  ├── 真实 20 订单批量计算性能验证
  ├── 缓存过期测试 + 手动刷新测试
  └── 异常场景：超时/单订单失败/购物车部分失败
```

**预计总工时**：2.5 天（不含文档编写）。

---

> **评审完成后**：用户确认无修改 → 调用 writing-plans → 进入编码阶段。
