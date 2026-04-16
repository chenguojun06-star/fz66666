## 2026-04-17

- WebSocket 实时推送补齐：ScanRecordOrchestrator.undo() 新增 broadcastScanUndo / broadcastDataChanged / broadcastOrderProgressChanged；QualityScanExecutor 新增 broadcastQualityChecked / broadcastOrderProgressChanged / broadcastDataChanged；WarehouseScanExecutor 新增 broadcastScanSuccess / broadcastWarehouseIn / broadcastOrderProgressChanged / broadcastDataChanged / broadcastProcessStageCompleted；ProductionScanExecutor 新增 broadcastScanRealtime / broadcastOrderProgressChanged / broadcastProcessStageCompleted。
- 所有 WebSocket 推送均包裹在 try-catch 中，推送失败不影响主业务流程（非阻断式设计）。

## 2026-04-16

- 修复 Docker Alpine 镜像导致微信 API TLS 连接失败（PKIX path building failed）：恢复 eclipse-temurin:21-jre（Debian）基础镜像 + 安装 ca-certificates + update-ca-certificates -f。
- WeChatMiniProgramClient 新增 trust-all-certs 配置项（默认关闭），application.yml 新增 wechat.trust-all-certs: ${WECHAT_TRUST_ALL_CERTS:false}。
- 修复 ProductSkuServiceImpl.updateStock() 事务传播级别：从默认 REQUIRED 改为 REQUIRES_NEW，防止 SKU 库存更新失败导致外层扫码事务被标记 rollback-only。

## 2026-04-11

- 修复 `GET /api/search/global` 在命令面板中持续返回 500 的问题。
- 根因：`GlobalSearchResult` 及其内部类依赖 Lombok `@Builder` 生成的内部 builder 类，热更新/类加载阶段出现 `NoClassDefFoundError`（`GlobalSearchResult$GlobalSearchResultBuilder`、`OrderItemBuilder`）。
- 处理：移除全局搜索 DTO 的 `@Builder` 依赖，并将 `GlobalSearchOrchestrator` 从 builder 映射改为构造器创建对象，彻底规避运行时 builder 类缺失。
- 影响：全局搜索接口不再因为 builder 类加载失败触发 `NestedServletException`，前端命令面板恢复可用。

## 2026-03-20

- 权限缓存链路从 `RedisTemplate<Object>` 多态反序列化切换为 `StringRedisTemplate + ObjectMapper` 显式 JSON 字符串存储，修复 `role:perms:*` / `user:perms:*` / `tenant:ceiling:*` 在旧缓存格式混杂时反复出现的 Jackson `START_ARRAY` 告警。
- `PermissionCalculationEngine` 启动清理补齐 `super:all:perms`，并在读取损坏权限缓存时只删除当前 key 后自动回源 DB 重建，避免相同坏缓存长期循环告警。
- `IntelligenceInferenceOrchestrator` 新增场景级超时封顶与快速失败：`ai-advisor` 最大 20 秒、`nl-intent` 最大 12 秒，其余场景最大 60 秒；`ai-advisor/nl-intent` 超时不再重试，避免分钟级阻塞。

## 2026-03-16

- Dashboard 热点查询改为最小字段选择：`DailyBriefOrchestrator` 的高风险订单查询与 `DashboardQueryServiceImpl` 的延期订单、最近订单、最近款号、最近扫码、最近采购查询不再默认读取实体全部列。
- 修复云端 `t_production_order` 存在无关扩展列缺失时，`/api/dashboard/daily-brief` 与 `/api/dashboard/urgent-events` 被整条 SELECT 拖垮返回 500 的问题。
- 本次修复把仪表盘热点接口与近期订单表扩展字段解耦，降低 schema 漂移对首页可用性的影响。
- 继续收敛 dashboard 模块剩余的 `ProductionOrder` 全字段查询：工厂首页统计、交期预警、延期订单列表、订单数量折线图改为最小字段读取，进一步降低 `customer_id` 等扩展列缺失的连带影响。
- 新增 dashboard 依赖表二轮核对脚本与说明，覆盖 `t_style_info`、`t_scan_record`、`t_material_purchase`、`t_product_warehousing`，把首页主要非订单依赖表的 schema drift 也纳入可复用排查流程。
- 新增 `t_production_order.customer_id` 云端补偿 SQL 与说明，单独管理 CRM 客户关联列缺失这一低优先级结构债，避免继续与 dashboard 可用性问题混淆。
- 修复 `StyleBomServiceImpl` 的 BOM 缓存失效缺口：删除逻辑从单键删除改为按 `style:bom:<styleId>:*` 模式清理，避免写后命中旧值。
- `TemplateLibraryServiceImpl` 的进度模板 / 工价模板本地缓存键增加租户维度，消除同款号跨租户模板串用风险。
- `DataCenterQueryServiceImpl` 与 `AiAdvisorService` 的缓存键统一补齐租户前缀，避免数据中心统计与 AI 日报建议结果跨租户复用。
- 新增 `docs/缓存全盘审计报告-20260316.md`，记录当前缓存规模、已修复问题与待继续治理的结构性风险。

## 2026-03-12

- 核对并移除 StyleInfo 旧删除兼容壳：删除 `DELETE /api/style/info/{id}`，审批流改为直接调用 `scrap(...)`，避免仓内继续保留误导性的删除语义。
- StyleInfo 删除改为报废留档，使用 `SCRAPPED` 状态保留开发样记录，不再级联清除样板生产数据。
- StyleInfo 列表与详情查询已纳入 `SCRAPPED` 状态，并把进度节点统一显示为“开发样报废”。
- StyleInfo 各阶段流转在 Orchestrator 层增加报废冻结校验，避免报废记录继续被修改推进。
# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased] - 2026-08-14 修复2026-04-10生产日志异常

### Bug Fixes
- **[交期预测] 补充预测日志写入失败的完整堆栈输出**
  - 文件：`DeliveryPredictionOrchestrator.java` 第 187 行
  - 问题：`predictionLogMapper.insert()` 抛出异常后，`catch` 块仅打印 `le.getMessage()`，
    SLF4J 未收到 `Throwable` 参数，生产日志中看不到堆栈，难以定位根因。
  - 修复：`log.warn("...{}", le.getMessage())` → `log.warn("...{}", le.getMessage(), le)`，
    SLF4J 自动追加完整堆栈。

- **[DB迁移] 补充 `t_intelligence_prediction_log` 的 Flyway 迁移脚本**
  - 文件：新增 `V202608141100__create_intelligence_prediction_log_table.sql`
  - 问题：该表历史上通过非标准方式创建，缺少 Flyway 脚本，导致新环境/CI 中
    `DeliveryPredictionOrchestrator` 写日志时触发 `BadSqlGrammarException`，被 catch 静默吞掉。
  - 修复：使用 `CREATE TABLE IF NOT EXISTS` 幂等模式补充迁移脚本，不影响已有环境。

### Root Cause Analysis（2026-04-10 生产日志错误溯源）
| 错误 | 根因 | 状态 |
|---|---|---|
| `[交期预测] 保存预测日志失败` | `t_intelligence_prediction_log` 部分环境缺表 + catch 无堆栈 | ✅ 已修复 |
| `[付款中心] 查询账单汇总待收付款失败` | `t_bill_aggregation` 2026-04 时尚未建表（8月迁移脚本补齐） | ℹ️ 历史遗留，表已存在 |
| HTTP 500 `GET /api/finance/bill-aggregation/stats` | 同上，`BadSqlGrammarException` → 500 | ℹ️ 历史遗留，表已存在 |
| HTTP 500 `POST /api/finance/bill-aggregation/list` | 同上 | ℹ️ 历史遗留，表已存在 |

## [Unreleased] - 2026-03-07

### 🐛 Operation Log Capture Fixed
- Fixed the unified operation-log aspect so destructive actions resolve target names before controller execution, preventing deleted orders and cancelled documents from losing order numbers, style numbers, and business document numbers.
- Expanded captured detail fields for `POST`/`PUT`/`DELETE` operations to include reasons, remarks, expected ship dates, business IDs, and path variables, reducing empty `{}` detail payloads in the system log UI.
- Added route recognition for both `/production/order` and `/production/orders` patterns so production actions no longer fall back to ambiguous module detection as often.

### 🧭 Action Center Enabled
- Added `ActionCenterOrchestrator` to aggregate production, factory, anomaly, notification, and finance-audit signals into one unified action queue.
- Added `FollowupTaskOrchestrator` to convert domain risks into normalized follow-up tasks and brain actions.
- Added `SmartEscalationOrchestrator` to centralize escalation level and due-hint rules.
- Added `GET /api/intelligence/action-center` to expose the current action-center snapshot.
- Updated `IntelligenceBrainOrchestrator` so business actions are delegated to the action-center layer instead of being assembled inline.
- Extended the action pipeline with `FinanceAuditOrchestrator` findings so finance review tasks join the same intelligent execution surface.

### 📈 Why This Helps
- Moves the intelligence module from signal reporting toward concrete next-step generation.
- Keeps action building, escalation policy, and brain aggregation isolated in separate orchestrators.
- Creates a stable backend boundary for future persistent tasks, approval loops, and durable execution.

### 🧠 Intelligence Brain Skeleton
- Added `IntelligenceBrainOrchestrator` to aggregate health, pulse, delivery risk, anomaly, notification, and learning signals into one unified snapshot.
- Added `IntelligenceBrainSnapshotResponse` as the backend DTO for a single AI brain view.
- Added `GET /api/intelligence/brain/snapshot` to expose the current tenant brain snapshot.

### ✨ Improvements
- Promoted tenant smart feature flags into the unified intelligence control surface.
- Established the backend foundation for future action center, signal center, and learning loop work.

### 📈 Impact
- The intelligence module now has a central entry instead of only scattered point capabilities.
- Future frontend cockpit and mini-program guidance can consume a single source of intelligent system state.

### 🧩 Independent Orchestration Hardening
- Added `IntelligenceModelGatewayOrchestrator` as an isolated orchestration boundary for future LiteLLM / unified model routing integration.
- Added `IntelligenceObservabilityOrchestrator` as an isolated orchestration boundary for AI observability providers such as OpenLIT / Langfuse / OTel.
- Extended `IntelligenceBrainSnapshotResponse` with `modelGateway` and `observability` summaries.
- Updated `IntelligenceBrainOrchestrator` to expose gateway/observability readiness as low-priority signals and setup actions.
- Added default-off `ai.gateway.*` and `ai.observability.*` settings to keep current production behavior unchanged until explicitly enabled.

### 📈 Why It Helps
- Keeps future AI infrastructure concerns out of core business orchestrators.
- Preserves the current Java orchestration architecture while preparing safe integration points.
- Makes the next phase of AI rollout feature-flagged and low-risk.

### 🧠 Real Inference Path Enabled
- Added `IntelligenceInferenceOrchestrator` to centralize AI inference routing.
- Added `IntelligenceInferenceResult` to carry provider, model, fallback, latency, and error metadata.
- Refactored `AiAdvisorService` to delegate real inference calls to the orchestration layer instead of direct point-to-point HTTP logic.
- Extended `IntelligenceObservabilityOrchestrator` with unified invocation logging via `recordInvocation()`.
- Enhanced `/api/intelligence/ai-advisor/status` to surface current gateway and observability state.
- Added `ai.gateway.litellm.api-key` support for real LiteLLM virtual-key based routing.

### 📈 Why This Helps
- Establishes a real AI nerve path instead of only a configuration skeleton.
- Makes future AI use cases reusable across the intelligence module through one orchestrated inference path.
- Keeps model routing, fallback, and observability isolated from business controllers and services.

## [1.0.0] - 2026-02-26

### 🚀 Release
- **Version 1.0.0**: Initial stable release for cloud deployment.

### ✨ Features
- **Orchestrator Pattern**: Implemented 37 orchestrators to decouple business logic from controllers.
- **Consistency Job**: Added `ProductionDataConsistencyJob` to auto-repair production progress every 30 mins.
- **Security**: Removed unused dependencies and optimized logging configurations.

### 🐛 Fixes
- Fixed potential null pointer warnings in `CacheAspect` and `CommonController`.
- Removed dead code in `DashboardOrchestrator`.
