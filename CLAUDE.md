# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

服装MES（Manufacturing Execution System）— 服装加工行业的生产执行系统，三端协同（PC管理后台 + 微信小程序扫码 + H5移动端）。

## Tech Stack

- **Backend**: Spring Boot 3.4.5 + Java 21 + MyBatis-Plus 3.5.12 + Flyway + Redis + MySQL 8.0
- **Frontend**: React 18 + TypeScript + Vite 7 + Ant Design 6 + Zustand
- **Mini Program**: 微信原生小程序
- **AI**: 小云AI智能体（Azure OpenAI + MCP Tools + DAG编排）

## Distributed Lock

`DistributedLockService` (`common.lock` package) provides Redis-based distributed locking via Lua scripts:
- `executeWithLock(key, timeout, unit, supplier)` — lock & auto-release, throws if busy
- `executeWithStrictLock(key, timeout, unit, supplier)` — same but throws immediately on contention
- `executeWithLockOrFallback(key, timeout, unit, supplier)` — retries once, then throws

Already used in 10+ AI jobs and production consistency jobs. Lock key prefix: `fashion:lock:`.
**Do NOT add Redisson** — existing implementation covers all needs.

## Architecture Constraints (P0 Rules)

```
Controller → Orchestrator → Service → Mapper
```

- **Orchestrator layer is mandatory** for cross-service/跨表 logic. 330 orchestrators (business + AI, across 14 domain modules).
- **Services must NOT call each other** — all cross-service orchestration goes through Orchestrator.
- **Controllers must NOT call multiple services** — delegate to Orchestrator.
- **@Transactional only in Orchestrator layer** — never in Service or Controller.
- **Java unit test sources stay local only** — per P0 policy, Java test sources (*Test.java in src/test/) are gitignored and never committed. Shell integration tests (scripts/test/) and Playwright E2E tests (frontend/e2e/) ARE committed.

## Backend Module Structure (14 modules)

| Module | Orchestrators | Responsibility |
|--------|--------------|----------------|
| production | 31 | 生产订单、扫码、裁剪、质检、进度 |
| finance | 21 | 工资结算、对账、报销、付款、成本 |
| system | 15 | 租户、用户、角色、工厂、配置 |
| style | 9 | 款式信息、BOM、工艺、报价 |
| warehouse | 8 | 物料库存、入库、出库、调拨 |
| intelligence | 130 | 小云AI对话、知识库、异常检测 |
| selection | 4 | 选款审核、批次、候选 |
| integration | 3 | 开放API、电商订单、支付/物流 |
| dashboard | 3 | 数据看板、趋势分析 |
| crm | 3 | 客户管理 |
| template | 2 | 生产模板、款式模板 |
| procurement | 2 | 采购订单、供应商评分 |
| wechat | 2 | H5/小程序授权 |
| datacenter | 1 | 数据同步、质量管理 |
| search | 1 | 全局搜索 |

> 各模块编排器数量为 CLAUDE.md 历史记录值，实际总数 330 个会随迭代变化，以代码为准。

## Frontend Module Structure (10 modules)

basic, crm, dashboard, finance, integration, intelligence, production, selection, system, warehouse

## Common Commands

```bash
# Backend
cd backend && mvn clean test -DskipTests=false   # 运行Java单元测试
cd backend && mvn spring-boot:run                 # 启动后端 (port 8088)

# Frontend  
cd frontend && npm run dev                        # 启动前端 (port 5173)
cd frontend && npm run lint                       # ESLint
cd frontend && npm run type-check                 # TypeScript 类型检查
cd frontend && npm run check:all                  # 全量检查（lint + type + deps + circular）
cd frontend && npm run test                       # Vitest 单元测试
cd frontend && npm run test:e2e                   # Playwright E2E测试

# Shell集成测试（需先启动后端）
./scripts/test/test-complete-business-flow.sh     # 完整业务流程E2E
./scripts/test/test-all-settlement-flows.sh       # 结算流程测试
./scripts/test/test-tenant-isolation.sh           # 多租户隔离测试

# Full stack
./dev-public.sh                                   # 一键启动（MySQL + 后端 + 前端）
```

## Testing Landscape

| Type | Count | Location | Language |
|------|-------|----------|----------|
| Shell集成测试 | 24 scripts / 7.7k lines | `scripts/test/` | Bash |
| 根目录测试 | 3 scripts / 453 lines | `test-*.sh` | Bash |
| Playwright E2E | 3 specs / 393 lines | `frontend/e2e/` | TypeScript |
| Python冒烟测试 | 1 script / 198 lines | `scripts/smoke_test.py` | Python |
| Flutter测试 | 2 files | `flutter/test/`, `flutter_app/test/` | Dart |
| Java单元测试源码 | ❌ Gitignored (P0策略) | `backend/src/test/` | Java |
| Java编译测试遗存 | 13 .class | `backend/target_test-classes/` | (源码已git隔离) |

Note: Java单元测试源码按项目P0铁律"测试代码隔离"从未提交到git仓库。Shell集成测试覆盖完整业务流程链路。

## Key Design Rules

1. **Entity-Flyway alignment**: 每新增 `@TableField("xxx")` 必须有对应 Flyway 迁移脚本
2. **No hardcoded colors/fonts**: 使用 CSS 变量 (var(--primary-color) 等 Design Token)
3. **Print font-family must end with `serif`** (not `sans-serif`) — macOS Safari bug
4. **No global WebSocket notifications** — use page-level `useWebSocket()` only
5. **No gradient colors** — pure colors only, use Design Token variables
6. **SKU system**: 款号+颜色+尺码 三维统一，三端共享
7. **Full copilot instructions** at `.github/copilot-instructions.md` — read it for complete P0/P1 rules

## 第三方平台对接与集成规范（P0 铁律）

本节来自电商模块对接的真实事故复盘，违反任一条都可能造成"看起来成功、实际没生效"的静默故障。

### 禁止模式（Code Review 必查）

1. **禁止"HTTP 200 即成功"**
   调用第三方 API 后**必须解析业务响应**再判定成败。平台普遍会在 HTTP 200 里返回
   `error_response`，只看状态码会把失败当成成功。
   ```java
   // ❌ 禁止：发完就计数成功
   httpClient.postJson(url, payload, Map.class);
   synced++;
   // ✅ 正确：先校验再计数
   Map<String,Object> resp = httpClient.postJson(url, payload, Map.class);
   if (EcPlatformApiSupport.isSuccess(resp)) synced++; else failed++;
   ```
2. **禁止无签名直连第三方 API**
   淘宝/京东/拼多多等强制校验 `sign`。签名统一用 `SignatureUtils.buildSortedSign()`
   （参数按 key 排序 + 密钥包裹 + MD5 大写，三平台规则一致），**不要自己再写一遍**。
   签名规则**必须以官方文档的代码示例为准**，并写单测守护拼接内容与顺序。
   历史教训：顺丰签名曾多拼了 `appKey`，导致**密钥完全正确也会被拒**，
   现象极像"密钥填错了"，排查成本很高。厂商文档的示例输出有时与自身示例矛盾，
   以代码示例为准，并在拿到账号后用官方签名测试工具实测确认。
3. **禁止桩实现混入主干**
   不允许出现 `return null` / 仅打日志的"占位方法"来冒充已实现功能。
   确实做不了要显式返回失败（如 `-1`、`false`）并让调用方感知，**不能假装成功**。
4. **方法名必须与行为一致**
   名为 `syncXxx` / `pushXxx` 的方法必须真的对外同步；只做本地计算就别叫 sync
   （历史教训：`EcStockOrchestrator.syncAllStock` 只本地重算，从未推送平台）。
5. **禁止同一能力在两处各写一套**
   同一能力只保留一个实现出口，其余处透传调用。历史教训：平台库存拉取在
   `PlatformNotifyService` 与 `EcStockDiscrepancyOrchestrator` 各写一份，
   一边修成真实现、另一边仍是桩。
6. **造轮子前先搜现有工具**
   新增签名/HTTP/加解密能力前，先查 `integration/util/`（已有 `SignatureUtils`、
   `IntegrationHttpClient`、`JstApiGuard`）。
7. **禁止用随机数/常量伪造业务数据**
   财务对账严禁 `Math.random()` 编造差异，物流严禁 `"SF"+时间戳` 编造运单号。
   宁可返回"不可用"，也不能编造——假数据会被当真使用（财务据此申诉核账、
   假运单号被回传电商平台污染真实订单），比功能缺失严重得多。
   ```java
   // ❌ 禁止：伪造差异 / 伪造运单号
   double diff = amount * (Math.random() * 0.1);
   String mockNo = "SF" + System.currentTimeMillis();
   // ✅ 正确：做不了就显式返回不可用，让调用方走人工流程
   return List.of();               // 平台账单拉不到 → 空，不编造
   throw new LogisticsException("渠道尚未接入真实API，无法自动下单");
   ```
8. **Mock/降级实现必须可被识别并拦截**
   适配器要显式声明自己是否已接入真实 API（参考 `LogisticsService.isRealImplementation()`）。
   未接入的渠道，其"成功返回"必须被管理器拦截（参考 `LogisticsManager.requireRealChannel`），
   **不得让编造数据流向下游**。将来真接入后，只需 override 该标识返回 `true` 即自动放行。
9. **只读接口禁止"缺失即兜底"**
   看板/悬浮面板/详情这类只读查询，字段查不到就返回 `null` 或 `linked=false` + `reason`，
   由前端显示"—/暂无数据"。**严禁把缺失写成 0、把未知进度写成 0%、把无交期写成"正常"**——
   0 和"无数据"在业务上是两回事，兜底会让人把缺失当成真实经营结果。
   参考 `EcProductionLinkOrchestrator`：`belowSafeStock` 仅在安全库存 >0 时才判定，
   销量趋势的 0 必须来自真实流水为空，而不是默认值。
10. **关联字段必须成对写入（id + 单号）**
   建立跨模块关联时，`xxxId` 与 `xxxNo` 必须同时落库。只写单号会导致
   `isNull(xxxId)` 这类 SQL 判空条件**静默失效**（条件恒为真）。
   历史事故：`EcommerceOrder.productionOrderId` 从未赋值，
   使仓库"待发货需求"把已投产订单重复计入，库存欠数虚高。
   另外：新增 `xxxId` 字段后要全局搜一次"谁在用 `isNull(xxxId)` 判空"。
11. **事件类必须有真实发布方（禁止"孤儿监听器"）**
   定义了 `XxxEvent` + `@EventListener` 监听器，但**生产代码里没有任何
   `publishEvent`** —— 这条链路就是死代码，且极难发现（编译通过、测试通过、
   监听器单测也通过，因为测试里自己 `new` 了事件）。
   自查命令：`grep -rn "publishEvent" backend/src/main` 与
   `grep -rn "new XxxEvent(" backend/src/main` 必须都能命中。
   历史事故：`StockChangeEvent` 有两个监听器却无发布方，
   导致"入库/出库 → 电商库存重算"从未触发，`t_ec_universal_stock` 长期不刷新。
   修复方式见 `StockChangePublisher`（事务提交后发布 + 解析不到 SKU 就跳过）。
12. **自动动作事件要过开关，不得绕过"智能化不自动执行"原则**
   监听器里做**外部**写操作（推平台、发通知）前，必须查
   `BackendActionFlagService.isEnabled(tenantId, BackendActionKey.XXX)`，
   与手动入口保持同一开关。只做**本地重算**的分支不受开关限制。
13. **禁止用字符串切分猜款号（SKU 编码的真实格式）**
   真实 SKU 编码是「**款号直接拼颜色尺码，没有分隔符**」，
   例如 `BR24XQ0098E草绿色L(170/84A)`（款号 `BR24XQ0098E`，颜色 `草绿色`，尺码 `L(170/84A)`）。
   因此下面这些写法在真实数据上**恒不命中**，属于隐性 P0：
   - `skuCode.split("-")[0]`
   - `skuCode.indexOf('-')` 取前缀
   - `likeRight(skuCode, styleNo + "-")`
   - `eq(skuCode, styleNo)`

   正确做法（按优先级）：
   1. 有 `style_id` 就用 `style_id` 精确等值（`t_ec_universal_stock` 等表都有该列）；
   2. 只有 `sku_code` 时，先由 `t_product_sku`（sku_code → style_id）+ `t_style_info`
      解析出权威款号，再用 `IN (该款全部 sku_code)` 或前缀匹配；
   3. 解析不到就返回 `null` / 不匹配，**不要退回字符串猜测**。

   历史事故：`EcProductionLinkOrchestrator`、`EcommerceOrderOrchestrator`、
   `EcStockCalculator`、`ChannelSalesPredictor` 四处都用 `-` 切分猜款号，
   导致悬浮面板库存永远"暂无数据"、EC 单永远关联不上生产单、待发货占用恒为 0。
14. **入站 Webhook 的失败必须体现在 HTTP 状态码上（禁止"200 + 业务失败"）**
   平台侧（淘宝/京东/顺丰…）只看 **HTTP 状态码**决定是否重推。
   若失败时返回 200、只把失败写进 JSON body，平台会认为"已送达"而**不再重试**，
   订单/回调就被静默丢弃——线上现象是"平台说推送成功、系统里没有单"，极难排查。

   状态码约定（**所有入站回调必须一致**）：
   - `200` 处理成功 / 幂等命中重复推送
   - `401` 配置类错误：未配置平台、缺 AppKey/AppSecret、缺签名头、签名不匹配
     —— 重试无意义，需人工修配置
   - `500` 处理异常（DB 抖动等）—— 平台可安全重推，落库侧按业务唯一键幂等去重

   ```java
   // ❌ 禁止：异常也返回 200
   catch (Exception e) { return ResponseEntity.ok(Map.of("received", false)); }
   // ✅ 正确
   catch (Exception e) {
       return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
               .body(Map.of("received", false, "error", e.getMessage()));
   }
   ```

   历史事故：`EcommerceOrderController.receiveWebhook`（D-522 修）与
   `PlatformWebhookController.receiveOrder`（D-523 修）同一 bug 各写一遍；
   物流回调也曾把未处理写成 `processed=true`。**改动任一回调时，顺手扫一遍同类入口。**

15. **电商/仓库的每一张商品相关列表都必须带「款式图 + 款号」列**
   用户原话：「所有的电商的这些 必须都要有图片列，不然看都不好看，还不知道是什么订单」。
   只看一串 `skuCode` / 一个 `skuId` 数字，运营根本无法确认是不是那件货。

   两条硬性要求：
   - **列必须有**：新建任何电商/仓库列表（含 tab、弹窗里的明细）时，
     「款式图」列是**默认项**，不是可选项；列宽、占位灰块、点击预览全站统一。
   - **款号只能来自后端解析**：即铁律 13。前端一律走 `POST /api/style/sku/brief`
     （或 `POST /api/ecommerce/orders/brief` 按订单号回查），**禁止任何 `split('-')` 猜测**。

   统一实现（**照抄，不要各写各的**）：
   | 场景 | 后端 | 前端列工厂 |
   |------|------|-----------|
   | 行里有 `skuCode` | `POST /api/style/sku/brief` | `styleImageColumn` / `styleNoColumn` |
   | 行里只有订单号 | `POST /api/ecommerce/orders/brief` | `orderImageColumn` / `orderStyleNoColumn` |

   - 数据源：`useStyleCoverImages()`（`imageMap` / `briefBySku` + `orderImageMap` / `briefByOrderNo`）；
     接口自带摘要时用 `seedBriefs()` 省一次请求。
   - 查不到就显示占位/退回编码，**不编造默认图或假款号**。
   - 加新列表后自查：`grep -rn "split('-')\[0\]" frontend/src` 不应再出现商品相关命中。

   历史事故：`skuCode.split('-')[0]` 使款式图列**永远是灰块**、款号列显示整串编码
   （D-522 修后端四处，D-524 修电商全部列表，D-525 修商品仓储 + 入库/收货各处）。

   **已覆盖清单（改动前先对照，别重复劳动）**
   - 电商：电商中心 8 组列、退款、定价建议、库存差异、分销 2 组、平台详情订单、
     仓库-电商订单、合单发货弹窗。
   - 商品仓储（菜单名，代码目录 `FinishedInventory`）：主表、出库弹窗「商品编码明细」、
     入库记录抽屉明细、扫码出库弹窗、自由入库弹窗、商品编码详情抽屉、
     出库记录主表 + 出库单明细。
   - 入库/收货：质检入库列表（`WarehousingList` / `WarehousingTable`）、
     质检详情（`StyleInfoCard` / `IndependentDetailModal`）、出库接收（`OutstockReceive`）。
   - 有意不加（避免冗余/造假）：
     `InspectionDetail/OrderLinesTable`（同一款的颜色尺码行，表头已有大图）、
     `IndependentDetailModal` 明细表（同上）、`QcRecordsPanel`（质检记录非商品行）。
   - 小程序端未纳入本轮（另有 D-517 在改，避免三副本一致性检查冲突）。

   **两个"取图键"的差别（容易搞错）**
   - `t_product_sku.sku_code`：款号直接拼颜色尺码、**无分隔符** —— 走 `fetchBySkuCodes`。
   - 扫码/打印用的二维码：`款号-颜色-尺码-序号`，**有分隔符** —— 它拆出来的
     "款号-颜色-尺码" 不等于 sku_code，这类清单要用 `fetchByStyleNos` 按款号取款级封面。

### 判断"链路是否打通"的三层验证法

不要只看接口对不对得上就下结论，必须逐层验证：

| 层级 | 验证内容 | 方法 |
|------|---------|------|
| 1. 接口层 | 前端调用 ↔ 后端接口是否一一对应 | 静态比对 |
| 2. 实现层 | 后端方法是真实现还是桩 | **读方法体**：有没有签名、看没看响应、是不是 `return null` |
| 3. 数据层 | 线上是否真跑通过 | SSH 查库看各表 `COUNT`、看凭证真假、看日志 |

历史教训：电商模块第 1 层全通就误判"链路打通"，实际第 2 层是桩、
第 3 层订单 0 条且配置凭证为 `admin` 类占位值，从未真实跑通过。

### 新增平台适配器的检查清单

- [ ] 签名已接入（`SignatureUtils`），未自研算法
- [ ] 每个写操作都校验业务响应，失败计入 `failed` 并回传 `errorMessage`
- [ ] `pullStock` 等拉取方法有真实实现，失败返回 `-1` 而非一律 `-1`
- [ ] 无 `success(true)` 硬编码，无"按入参数量填充 null"的占位返回
- [ ] 已补单元测试覆盖：签名正确性（用真实 MD5 向量）、错误响应判失败
- [ ] 若为 Mock/降级实现：`isRealImplementation()` 返回 `false`，且其返回值被上游拦截、不外流

## Auto-Invocation Skills

根据当前任务类型**自动调用**对应技能，无需等待用户指令：

### 代码编写 / 开发
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 写前端UI组件/页面 | `frontend-design` | React+TS+Ant Design 高质量UI |
| 前端样式/主题 | `ui-styling` | shadcn/ui + Tailwind CSS 变量 |
| 实现新功能前 | `brainstorming` | 探索需求、设计、方案 |
| 多步骤/复杂任务前 | `writing-plans` | 先出计划，再写代码 |
| 多文件、独立子任务 | `dispatching-parallel-agents` | 并行执行独立任务 |

### 代码优化 / 重构
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 改动后代码质量审查 | `simplify` | 检查复用、质量、效率 |
| 设计系统/设计Token | `design-system` | Token架构、组件规范 |
| 品牌一致性 | `brand` | 品牌形象、视觉识别 |

### Bug修复 / 调试
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 遇到Bug/测试失败 | `systematic-debugging` | 系统化排查问题根因 |
| 按TDD模式修复 | `test-driven-development` | 先写测试再修代码 |

### 完成 / 提交 / 合并
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 完成工作、声明修复前 | `verification-before-completion` | 运行测试验证再断言 |
| 合并前代码审查 | `requesting-code-review` | 对照需求审查 |
| 收到审查反馈 | `receiving-code-review` | 验证反馈再实施 |

### 开发流程
| 场景 | 自动调用技能 | 说明 |
|------|------------|------|
| 新功能独立开发 | `using-git-worktrees` | 创建隔离 worktree |
| 执行实现计划 | `subagent-driven-development` | 按计划分步执行 |
| 减少权限弹窗 | `fewer-permission-prompts` | 扫描并添加权限白名单 |

## Key Reference Docs

- [CLAUDE.md](CLAUDE.md) — 完整架构规范与禁止模式（本文件）
- [模块与职责快速查询表.md](模块与职责快速查询表.md) — 编排器速查
- [设计系统完整规范-2026.md](设计系统完整规范-2026.md) — 前端UI强制规范
- [系统状态.md](系统状态.md) — 完整业务逻辑与数据流向
- [系统状态.md](系统状态.md) — 系统全景与更新日志
