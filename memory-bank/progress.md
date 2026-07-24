# 进度跟踪

> 本文件由 AI 助手自动维护，记录项目开发进度
> 最后更新：2026-07-23（智能化开关补全 8 个 HIGH 风险点，共 15 个开关全部默认关闭）

## 已完成

### 2026-07-24 平台详情页顶部标签改为中文平台名 ✅

- [x] 识别 `/ecommerce/platform/:code` 路径
- [x] 从 `PLATFORM_LIST` 解析平台中文名
- [x] 顶部最近访问标签显示「{平台名} - 平台详情」
- [x] npx tsc --noEmit 通过
- [x] 提交 ec985965f 已推送到 origin/main

---

### 2026-07-23 智能化开关补全 8 个 HIGH 风险自动执行点 ✅

用户诉求："全部优化好这些 这些这些智能化的 还是不要自动 让用户可以设置这些 理解吗 怕出现问题"

全系统核查发现仍有 8 个 HIGH 风险 @Scheduled 方法会自动执行写操作/对外通知/派单但无用户可配置开关，全部补齐：

- [x] **AiPatrolJob 4 个跨租户巡检方法纳入 AUTO_PATROL_EXEC 开关**
  - scanProductionAnomalies / scanExtendedAnomalies / runDailyPatrol / checkTaskOrderProgress
  - 用 isActionEnabledForAnyTenant 粗粒度控制，全租户未开启则跳过
- [x] **EcSyncJob.retryJob 纳入 AUTO_EC_STOCK_SYNC 开关**
  - 按租户检查，关闭则不自动重试推库存/价格到电商平台
- [x] **SmartNotifyJob.autoDetectAndNotify 纳入新开关 AUTO_MIND_PUSH**
  - 在 doAutoDetect 租户循环内按租户检查，关闭则不自动推送微信/站内通知
- [x] **XiaoyunDailyInsightJob 纳入新开关 AUTO_DAILY_INSIGHT_DISPATCH**
  - 关闭则不自动生成洞察+派发协作任务
- [x] **AgentBackgroundTaskJob 纳入新开关 AUTO_AGENT_BACKGROUND_TASK**
  - 关闭则不自动执行 AI 后台任务
- [x] **BackendActionFlagService 新增 3 个开关枚举**（AUTO_MIND_PUSH/AUTO_DAILY_INSIGHT_DISPATCH/AUTO_AGENT_BACKGROUND_TASK）
- [x] **Flyway V202612070001 初始化 3 个新开关默认关闭**
- [x] **前端 ProfileSmartSettingsPanel.tsx 补充 3 个新开关文案**

**验证**：后端 mvn compile exit 0、前端 npx tsc --noEmit 0 errors
**变更范围**：后端 6 文件（5 Job + 1 Service）+ 1 Flyway 迁移 + 前端 1 文件
**决策记录**：D-044

---

### 2026-07-23 智能化功能全部改为用户可配置开关（用户核心诉求）✅

用户决策："全部优化好这些 这些这些智能化的 还是不要自动 让用户可以设置这些 理解吗 怕出现问题"

- [x] **AiPatrolJob 全部 @Scheduled 方法受开关控制**
  - `scanPersonalTaskReminders` 新增 `AUTO_TASK_REMINDER` 开关检查（本次新增）
  - `executeAutoActions` 已有 `AUTO_PATROL_EXEC` 开关
  - `scanOverdueCollaborationTasks` 已有 `AUTO_TASK_ESCALATION` 开关
  - `pushHighSeverityAlerts` 已有 `AUTO_HIGH_SEVERITY_DISPATCH` 开关
- [x] **EcSyncJob stockSyncJob 受 `AUTO_EC_STOCK_SYNC` 开关控制**
  - 注入 `BackendActionFlagService`，按租户判断开关
  - 关闭时仅本地计算库存，不推送到平台
- [x] **前端配置面板补充 5 个新开关文案**
  - ProfileSmartSettingsPanel.tsx 的 BACKEND_ACTION_LABELS 新增 5 条
- [x] **编译错误修复**
  - EcPriceSyncItem.java 添加 @NoArgsConstructor + @AllArgsConstructor
  - EcStockDiscrepancyOrchestrator.java getSkuName() 改为 buildSkuName(sku)
- [x] **确认 P1-2 返工智能派单已是手动**（SmartAssignmentOrchestrator 仅推荐不派单）
- [x] **确认 P1-3 物料对账差异已是仅展示**（explainException 只列原因不操作）

**验证**：后端 mvn compile exit 0、前端 npx tsc --noEmit 0 errors

---

### 2026-07-23 撤销 AiUpgradeCenter 独立页面 + Skills市场（用户决策回滚）✅

用户决策："集成到现有的这些里面来升级 不要多余的东西 很多用户都不知道这些玩意有什么用 要做好现有的升级就好 他们不是技术性的用户 都是普通用户 根本不需要技术性的东西 我们要做的是用户体验与使用这些好用"

- [x] **前端清理**
  - 删除 `frontend/src/modules/intelligence/pages/AiUpgradeCenter/` 整个目录（7 Tab + index.tsx）
  - `frontend/src/modules/intelligence/index.tsx` 移除 AiUpgradeCenter 导出
  - `frontend/src/routeConfig.ts` 移除 aiUpgradeCenter 路径/菜单项/页面元信息/权限码映射
  - `frontend/src/App.tsx` 移除 AiUpgradeCenter 导入 + 路由注册
- [x] **后端清理**
  - 删除 6 个 Controller（BrowserAgent/VisualAIInspection/FashionAIAsset/SmartScheduling/DigitalTwinSnapshot/SkillMarket）
  - 删除 6 个 Orchestrator（同上）
  - SkillTemplate.java 移除 7 个市场字段
- [x] **数据库回滚迁移（遵守 P0 #1 不修改已应用迁移）**
  - V202607230001/V202607230002 保留不删
  - 新增 V202607230003__rollback_ai_upgrade_tables.sql（幂等 DROP 5 表 + 7 字段 + 1 索引）

**验证**：后端 mvn compile exit 0、前端 npx tsc --noEmit 0 errors、全代码库 grep 无残留引用

**下一步方向**：智能化能力下沉到现有业务模块中作为内嵌辅助功能，不另立独立页面

---

### 2026-07-23 下单页智能化模块 P2+P3 共 7 项修复（全部完成）✅

用户要求"剩余的7个全部要优化好"，全部修复完毕。npx tsc --noEmit 通过。

- [x] **P2-9 OrderFactorySelector deliveryOnTimeRate null/undefined 兜底**
  - 新增 formatRate + FactoryStatBlock 子组件，消除 INTERNAL/EXTERNAL 重复渲染
- [x] **P2-10 SmartStyleInsightCard calcInsight 竞态保护 + 错误态区分**
  - useRef requestId + hasError state，错误时显示"重试"
- [x] **P2-11 StyleQuotePopover 失败清 data + 竞态保护 + Popover 关闭取消在飞请求**
- [x] **P2-12 FactoryInsightDrawer 错误态 UI + 重试按钮**
  - 新增 error state + Alert + 重试按钮
- [x] **P2-13 useOrderIntelligence 两个 fetch 竞态保护 + visible=false 重置**
  - deliveryRequestIdRef + schedulingRequestIdRef；弹窗关闭清空残留
- [x] **P3-14 多文件硬编码颜色改 CSS 变量**（5 个文件）
  - OrderFactorySelector / SmartStyleInsightCard / StyleQuotePopover / FactoryInsightDrawer / OrderSchedulingInsights
- [x] **P3-15 折叠态 loading 指示** — OrderSchedulingInsights + OrderLearningInsightCard
  - 新增 LoadingOutlined 旋转图标 + "分析中..."文字

**变更范围**：7 个前端文件
**验证**：npx tsc --noEmit 通过（exit 0）

---

### 2026-07-23 下单页智能化模块优化（P0+P1 共 9 项修复）✅

用户需求：盘点下单页所有智能化模块、检查逻辑问题、确认无资料下单弹窗是否支持智能化。

**调研结论**：下单页集成 8 类智能化模块（交货期智能建议 / AI 排产建议 / 款式报价建议 / 订单学习推荐 / 工厂全动态详情 Drawer / 智能款式分析卡 / 工厂产能数据 / 工序进度加载）；无资料下单弹窗（CuttingCreateTaskModal）此前完全未集成任何 intelligenceApi。

**P0 修复（2 项）**：
- [x] **P0-1 useOrderIntelligence deliverySuggestion 依赖项**
  - 原 `selectedFactoryStat?.factoryName` + eslint-disable 掩盖问题，工厂对象其他字段变化不触发重算
  - 改为整体 `selectedFactoryStat` + `factoryMode` + `fetchDeliverySuggestion` 依赖
- [x] **P0-2 FactoryInsightDrawer 防抖重构**
  - 原 useEffect 无防抖，open/orderQuantity/plannedDeadline 任一变化即触发 3 个 API 并行雪崩
  - 重构为：open 从 false→true 立即加载 / factoryName 变化立即加载 / 其他参数变化 600ms 防抖
  - 用 ref 保存最新参数避免闭包过期

**P1 修复（4 项）**：
- [x] **P1-3 无资料下单弹窗接入 FactoryInsightDrawer**
  - CuttingCreateTaskModal 新增「查看工厂全动态详情」镂空按钮（仅在 selectedFactoryStat 存在时显示）
  - useMemo 聚合 createOrderLines 计算总下单数量传给 Drawer
  - 接入交期预测/产能缺口/在产订单明细三大模块
  - 跳过交期建议/排产/订单学习：无资料下单无款号工价基础，FactoryInsightDrawer 已覆盖核心场景
- [x] **P1-4 StyleQuotePopover fetchedRef 缓存冲突**
  - destroyOnHidden=true 销毁内容，但 fetchedRef 在父作用域导致首次拉取后永不刷新
  - 去掉 fetchedRef，改为 onOpenChange 触发拉取（每次打开重新拉）
- [x] **P1-5 SmartStyleInsightCard 拉取量 + 防抖**
  - pageSize 100→30（足够算周期/准时率/频率统计）
  - 新增 400ms 防抖，避免快速切换款号时连续拉取
- [x] **P1-6 orderLearningApi 404 永久禁用改 5 分钟冷却**
  - 原 sessionStorage 布尔值永久标记不可用，后端修复后前端仍不重试
  - 改为时间戳 + 5 分钟冷却，过期自动恢复

**P2 修复（2 项）**：
- [x] **P2-7 排产建议加 500ms 防抖**
  - 原 useEffect 无防抖，visible/styleNo/totalOrderQuantity 变化即触发
  - 加 schedulingTimerRef + setTimeout 500ms + cleanup
- [x] **P2-8 selectedStyle 对象引用依赖**
  - 原 `selectedStyle` 整体引用依赖，setState 创建新引用导致重复拉取
  - 改为 `selectedStyle?.id` + `selectedStyle?.styleNo` 字段依赖

**变更范围**：前端 6 文件修改（useOrderIntelligence.ts / FactoryInsightDrawer.tsx / CuttingCreateTaskModal.tsx / StyleQuotePopover.tsx / SmartStyleInsightCard.tsx / orderLearningApi.ts），无后端变更。

**验证**：
- npx tsc --noEmit 通过（exit 0）

**待办（用户未确认）**：
- 剩余 P2 级 4 个问题（问题 9-12）+ P3 级 3 个问题（问题 14-16）未处理
- 无资料下单是否需要接入更多智能化模块（交期建议/排产/订单学习）— 已自行跳过，待用户确认

### 2026-07-23 下单页工厂全动态时间线（4 项 Gap 全部完成）✅

用户阶段四需求：下单人员在选择工厂时即可看到该工厂的全动态时间线（当前负载/预计完工/每天产量），不重复现有智能化逻辑、不占窗口位置（用 Drawer）。

**4 项 Gap + 时间线可视化组件**：
- [x] **Gap 1：预下单三档交期预测 API（不依赖 orderId）**
  - 新建 PreOrderDeliveryPredictionRequest/Response DTO + PreOrderDeliveryPredictionOrchestrator
  - 独特设计：用工厂总负载（含本单）计算排队时间，输出 timelineNodes 供前端直接渲染
  - 端点：`POST /intelligence/pre-order-delivery-prediction`
- [x] **Gap 2：产能缺口分析集成到下单页**
  - 复用现有 `CapacityGapOrchestrator.analyze()`（4 档 gapLevel）
  - Drawer 调用 `intelligenceApi.getCapacityGap()`，按 factoryName 过滤
- [x] **Gap 3：工厂当前在产订单明细（可点击详情查看）**
  - 新建 FactoryActiveOrderDTO + FactoryActiveOrderOrchestrator
  - 按 plannedEndDate 排序，danger/warning/safe 三档风险分类
  - 端点：`GET /intelligence/factory-active-orders?factoryName=xxx`
- [x] **Gap 4：后端下单时产能预警（不阻断，仅 warning）**
  - 新建 FactoryCapacityWarningHelper（@Component）
  - 阈值：5000 件 / 20 单
  - warnIfOverloaded 不抛异常，仅 log.warn
  - evictFactoryCapacityCache 删除 Redis key `factory_capacity:{tenantId}`
  - ProductionOrderOrchestrator.saveOrUpdateOrder 末尾 afterCommit 回调 warnIfOverloaded
  - evictCacheAfterCommit 同步路径 + afterCommit 路径都加 evictFactoryCapacityCache
- [x] **时间线可视化组件（详情视图）**
  - 新建 FactoryInsightDrawer.tsx（720px 宽 Drawer，destroyOnClose）
  - 三大区块：交期预测时间线（水平节点）+ 产能缺口分析 + 在产订单明细 Table（7 列）
  - Promise.all 并行 3 API
  - OrderFactorySelector.tsx 加「查看工厂全动态详情」镂空按钮（内部 + 外发工厂各一处）
  - renderInsightDrawer 在 return 末尾只渲染一次
  - intelligenceApi.ts + operation.ts 新增 4 类型 + 3 API 方法

**算法复用（不重复造轮子）**：
- 新建 FactoryVelocityCalculator.java 从 DeliveryPredictionOrchestrator 拆薄
- 复用 EWMA(α=0.33) + 趋势检测(最小二乘,±25%) + 季节性修正(周末70%) + P80 百分位混合(6:4) + 历史偏差校准
- 区别：单订单聚合 vs 工厂所有在制订单聚合

**踩坑修复（编译期）**：
- 后端：MyBatis-Plus `qw.ne("status", "a","b","c")` 不支持多值 → `qw.notIn("status", Arrays.asList(...))`
- 前端：ApiClient.post 泛型 R 默认 = T，`api.post<{code,data:T}>` 返回 `Promise<{code,data:T}>`，await 后直接 `.data`

**验证**：
- mvn compile -q 通过（exit 0）
- npx tsc --noEmit 通过（exit 0）

**变更范围**：后端 8 文件（5 新建 + 3 修改）+ 前端 4 文件（1 新建 + 3 修改）= 12 文件。

### 2026-07-22 小云AI P0+P1 前沿升级全部完成（待提交）✅

延续 GitHub 前沿调研（Mem0/Letta/Langfuse/Graphiti/Cognee/AWS S3 Vectors），本次完成 P0 三项 + P1 五项共 8 项智能化升级：

**P0 阶段（已完成）**：
- [x] P0-1 MCP 工具入参提示注入防御（4 个 MCP，仅本地）
- [x] P0-2 反思记忆闭环（ReflectiveMemoryWriter + 5 文件修改）
- [x] P0-3 L4 ProceduralMemory 自编辑工具集（AgentTool+Controller+CRUD）
- [x] P0-4 Langfuse 全链路追踪（span 层级 + 主对话接入 + submitScore）

**P1 阶段（已完成）**：
- [x] **P1-1 t_ai_long_memory 时序字段**（Graphiti 时序知识图谱方向）
  - 新建 Flyway V202707221000 — valid_from/valid_to/superseded_by + 2 索引 + 回填
  - 修改 AiLongMemory entity + LongTermMemoryOrchestrator（supersedeOldMemories + retrieve 过滤）
- [x] **P1-2 扫码 State Graph + HITL**（LangGraph 状态机方向）
  - 新建 ScanState（11 状态枚举）+ ScanStateGraph（状态机+HITL）+ Controller
  - 新建 Flyway V202707221002 — t_scan_state_log
  - 零侵入：未修改任何现有 ScanRecordOrchestrator 代码
- [x] **P1-3 t_shared_agent_memory + 消息总线**（AWS S3 Vectors 多 Agent 协作方向）
  - 新建 Flyway V202707221001 — t_shared_agent_memory
  - 新建 Entity/Mapper/Service/CleanupJob
  - MultiAgentGraphOrchestrator 已集成 readFacts/writeFact
- [x] **P1-4 离线评估 dataset**（Langfuse 离线评估方向）
  - 新建 Flyway V202707221003 — t_eval_dataset + t_eval_item
  - 新建 Entity/Mapper/Service/Job/DTO
  - 每周日 02:00 离线评估
- [x] **P1-5 记忆巩固定时任务**（Cognee 离线巩固方向）
  - 新建 MemoryConsolidationService + MemoryConsolidationJob + ConsolidationResult DTO
  - 每天 03:30 巩固相似记忆

**验证**：
- mvn compile -q 通过（exit 0）
- check-flyway-sql 无新增警告（253 个全为历史遗留）
- audit-tenant-id 无新增违规（1 处历史遗留 RoleTemplate）
- 6 个 MCP node --check 通过

**变更范围**：P0 17 文件 + P1 25 文件 = 42 文件，4 个新 Flyway 迁移。
**非任务文件**保持未暂存：PatternProductionController.java、types/style.ts。

### 2026-07-22 小云AI P0 前沿升级（待提交）✅

延续 GitHub 前沿调研（Mem0/Letta/Langfuse/Graphiti/Cognee），本次完成 P0 三项智能化升级：

- [x] **P0-1 MCP 工具入参提示注入防御**（仅本地，.trae/ 在 .gitignore）
  - db-query-mcp 新增 `assertNoSqlInjection` + `stripStringLiterals`，接入 3 个工具函数
  - flyway-mcp/test-runner-mcp/memory-bank-mcp 修复路径穿越/ReDoS 等 4 个 HIGH 风险
  - 参考 Azure DevOps MCP 2026-07 漏洞
- [x] **P0-2 反思记忆闭环**（Mem0/Letta 前沿方向）
  - 新建 ReflectiveMemoryWriter + SelfCritiqueResult DTO
  - 修改 AiAgentOrchestrator/ConversationReflectionOrchestrator/PromptContextProvider/AiAgentPromptHelper/IntentBasedPriorityRouter
  - SelfCritic 评分<75 → AiLongMemory(layer=REFLECTIVE) → 下次类似问题召回 → prompt 注入
- [x] **P0-3 L4 ProceduralMemory 自编辑工具集**（Letta 自编辑记忆方向）
  - 新建 ProceduralMemoryCreateDTO/UpdateDTO/ProceduralMemoryTool/ProceduralMemoryController
  - 修改 ProceduralMemoryService（追加 6 个 CRUD）+ AiAgentToolAccessService（注册工具）
  - AI 可自编辑 SOP，从"只读检索"升级为"自编辑进化"
- [x] **P0-4 Langfuse 全链路追踪**（Langfuse 28.4k star + OpenTelemetry 方向）
  - 增强 LangfuseTraceOrchestrator（beginSpan/endSpan/recordEvent/recordGeneration）
  - 新建 LangfuseSpanContext（ThreadLocal span 栈）+ LangfuseSpanHelper（try-with-resources）
  - 修改 AgentLoopEngine（5 个关键节点 span 包裹）+ AiAgentOrchestrator（pushTrace/submitScore/clear）
- [x] mvn compile -q 通过（exit 0）
- [x] audit-tenant-id 无新增违规（1 处历史遗留）
- [x] 6 个 MCP node --check 通过
- [x] 非任务文件保持未暂存：PatternProductionController.java、types/style.ts

**变更范围**：17 个文件（9 修改 + 8 新建），599 行新增。
**下一步**：P1-1~P1-5（时序字段/扫码 State Graph/共享记忆/离线评估/记忆巩固）。

### 2026-07-22 前端 eslint warning 全面清零（commit 6db64aecf）

- [x] 修复 54 个 react-hooks/exhaustive-deps warning（34 个文件）
- [x] 清理 8 个遗留 no-unused-vars warning
- [x] 3 组 subagent 并行执行（Group 1: 18 文件 / Group 2: 11 文件 / Group 3: 9 文件）
- [x] 全局 `npx tsc --noEmit` 0 errors
- [x] 全局 `npx eslint . --max-warnings 500` 0 warnings
- [x] 推送到远程（commit 6db64aecf，117 files changed）
- [x] 非任务文件保持未暂存：`PatternProductionController.java`、`types/style.ts`

**最终状态**：eslint 从 62 warnings → 0 warnings，CI 完全清零。

### 2026-07-22 前端 400-500 行超大文件拆分收尾（commit dbbbda837）

- [x] 拆分约 50 个 400-500 行区间超大 TS/TSX 业务文件
- [x] 三种拆分模式：目录化拆分（主组件+子组件）、Hook 拆分、列组按业务域拆分
- [x] 严格保持 API 路径、参数签名、字段名、返回值结构、业务逻辑不变
- [x] 修复目录化后相对路径层级问题（多加一层 `../`）
- [x] 修复 Hook 含 JSX 必须用 .tsx 扩展名问题
- [x] 修复共享 utils.ts interface 未导出（TS4058）问题
- [x] 修复类型系统兼容性（可选 vs 必填、索引签名）
- [x] 全局 `npx tsc --noEmit` 验证通过（0 errors）
- [x] 推送到远程（commit dbbbda837）
- [x] 非任务文件保持未暂存：`PatternProductionController.java`、`types/style.ts`

**最终统计**：500+ 行剩 2 个（intelligenceApi.ts/routeConfig.ts）、400-500 行剩 1 个（utils/api/core.ts 472 行）、300-400 行剩 146 个待推进。

### 2026-07-19 员工打卡后端健壮性增强（P1+P2 全修）

- [x] **P1**：WorkAttendance 实体补齐 @TableField(fill=FieldFill.INSERT/INSERT_UPDATE) 注解（修复 updateTime 永不更新的 bug）
- [x] **P2.1**：Mapper 新增 selectLatestOpen + Service 新增 findLatestOpen（查最近未下班打卡记录）
- [x] **P2.1**：Orchestrator.clockOut 新增跨天兜底分支（凌晨下班打卡补到昨晚的上班卡，避免工时丢失）
- [x] **P2.2**：Orchestrator.clockIn save 调用 try-catch DuplicateKeyException，并发兜底返回"今日已上班打卡"
- [x] mvn compile 验证通过（exit 0，2188 源文件）
- [x] check-flyway-sql.py 验证通过
- [x] audit-tenant-id.py 验证通过（1 处历史遗留 RoleTemplate 违规，非本次引入）
- [x] 决策 D-042 记录：员工打卡健壮性增强 — 实体注解对齐 + 跨天补卡兜底 + 并发竞态兜底

### 2026-07-19 财务数据链路闭环（Phase 1-4 + Phase 3 全部完成）

- [x] **Phase 1 止血（5 项核心修复）**：反向账单机制 + SalesReturn/FactoryShipment/ShipmentReconciliation/ReconciliationStatus 联动
- [x] **Phase 2 补齐（5 项 P0 修复）**：ProductionCleanup/FinishedWarehouse/PurchaseReturn/MaterialPurchase 系列
- [x] **Phase 2.5 EXTERNAL_FACTORY 核查（3 P0 + 6 P1 + 1 P2）**：SecondaryProcessOrchestrator 非法枚举修复 + 前端 SHIPMENT 选项
- [x] **Phase 4 审计修复（3 处编译错误）**：SalesReturnOrchestrator/FactoryShipmentOrchestrator/ShipmentReconciliationOrchestrator
- [x] **Phase 3-1: isOwnFactory 字段化** — Flyway V202707191000 幂等加列 + 多租户安全回填
- [x] **Phase 3-2: undoPatternScan 双写** — PatternProductionOrchestrator 重写，5 项修复（多租户/工资结算/ScanRecord 镜像/备注日志/时间窗）
- [x] **Phase 3-3: 样衣开发费用统一接入 BillAggregation** — StyleInfoOrchestrator 新增 pushStyleDevelopmentBill/reverseStyleDevelopmentBill，金额=materialCost+processCost
- [x] mvn compile 编译验证通过（exit 0）
- [x] check-flyway-sql.py 验证通过
- [x] 决策 D-041 记录：财务数据链路闭环 — 反向账单机制 + isOwnFactory 字段化 + 样衣开发费用统一接入

### 2026-07-18 三端数据流转一致性核查 + 3个P0级多租户漏洞修复

- [x] P0: 修复 PatternRevisionController.java list 接口缺少 tenant_id 过滤
- [x] P0: 修复 PatternProductionOrchestrator.java 列表查询缺少 tenant_id 过滤
- [x] P0: 修复 PatternProductionController.java 新端点（后置校验改为查询时直接带 tenant_id 过滤）
- [x] 三端一致性核查：共发现 47 项问题（13 P0 / 16 P1 / 18 P2），已记录待办
- [x] 小程序样衣开发进度显示修复（stage-detail 别名匹配/进度条UI/缓存重建）
- [x] 仓库库位选择修复（GET改POST + 字典兜底逻辑）
- [x] 工序展示与 PC 端配置对齐（按 stageKey 过滤 + 父阶段分组）
- [x] 代码质量扫描核实（删除3张未引用图片，确认误报）

### 2026-07-16 全局 API 响应处理规范清理 + P0 级问题修复

- [x] P0: 修复 `dashboard/order-detail/index.js` 2 处 `res.code !== 200` 判断错误（ok() 失败直接 throw，不会走到 then）
- [x] P0: 更新 `ScanSubmitter.js` 扫码成功判断逻辑注释，明确 ok() 返回值语义
- [x] P1: 清理 `defect/index.js` 冗余 `res.data` 判断
- [x] P1: 清理 `sample-development/index/index.js` 2 处冗余判断
- [x] P1: 清理 `home/index.js` + `more-apps/index.js` 收藏应用加载冗余判断
- [x] P1: 清理 `order/create/index.js` 2 处冗余判断
- [x] P1: 清理 `warehouse/sample/scan-action/index.js` 3 处冗余判断
- [x] P1: 清理 `components/purchase-cart-drawer/index.js` 2 处冗余判断
- [x] P1: 清理 `components/ai-assistant/index.js` 2 处冗余判断
- [x] 确认 `tenant.publicList()` / `system.login()` / `tenant.workerRegister()` 使用 raw()，`res.data` 判断正确，未修改
- [x] ESLint 验证：13 个 errors 均为历史遗留，本次修改未引入新 error
- [x] 新增决策 D-039：API 响应处理规范 — ok() vs raw() 必须严格区分

### 2026-07-15 PC 质检入库页订单号字体过大修复

- [x] 定位根因：`WarehousingTable.tsx` 订单号列硬编码 `fontSize: 14`，违背设计系统 `--table-cell-font-size: 12px`
- [x] 将文件中 9 处硬编码 `fontSize: 14` 统一改为 `var(--table-cell-font-size)`
- [x] 订单号下方生产方/组织路径改为 11px 灰色副标题样式
- [x] 前端 `npx tsc --noEmit` 0 errors

### 2026-07-14 质检页面款式图片不显示修复 + 外发管理状态确认

- [x] 定位质检列表图片缺失根因：`ScanRecord.styleId` 为空导致 `enrichStyleInfo` 无法匹配封面图
- [x] 后端 `ScanRecordEnrichHelper.enrichStyleInfo` 增加 `orderId → ProductionOrder.styleId` 兜底查询
- [x] 修复覆盖 `list/getByOrderId/getByStyleNo/getHistory/getMyHistory` 全链路扫码记录接口
- [x] 修复 `miniprogram/pages/defect/index.js` ESLint `no-empty` 错误
- [x] H5 `source-miniapp` / `public/source-miniapp` / `dist/source-miniapp` 同步 `defect/index.js`
- [x] 核查外发管理命名：小程序/H5 菜单与页面标题已统一为「外发管理」
- [x] 确认外发发货功能已实现：入口在「外发管理 → 我的订单 → 展开卡片 → 发货」
- [x] 后端 `mvn compile -q` 通过；`defect/index.js` ESLint 0 errors；H5 三端 diff 一致

### 2026-07-14 全量 API 模块核查 + 3 处修复

- [x] 扫描 `miniprogram/utils/api-modules/*.js` 全部 14 个模块的导出与语法
- [x] 发现并修复 `return.js` `salesReturn.reject` 参数传递 bug（`options.params` 不生效）
- [x] 发现并修复 `finance.js` `factoryShipment.listByOrder` 错误端点（`/list-by-order` → `/search`）
- [x] `api.js` 补充导出 `fieldConfig`
- [x] 修复 `field-config.js` 未使用 `raw` import 导致的 ESLint error
- [x] H5 `source-miniapp` + `public/source-miniapp` 同步以上修改
- [x] `node --check` 全部 api-modules 通过；`npx eslint` 0 errors；`mvn compile -q` 通过

### 2026-07-14 销售模块运行时错误修复 + 验证闭环

- [x] 新建 `miniprogram/utils/api-modules/ecommerce.js`，实现 `getSalesStats` / `listOrders`
- [x] `miniprogram/utils/api.js` 导入并导出 `ecommerce` 模块
- [x] 修复 `pages/sales/overview/index.js` 与 `pages/sales/order-list/index.js` 对 `api.ecommerce` 的调用
- [x] 后端 `DictController` 增加 `POST /api/system/dict/list-by-type` 映射，保留 `GET /by-type` 兼容
- [x] 后端 `EcommerceOrderOrchestrator.calcSalesStats` + `EcommerceOrderController.salesStats` 实现销售统计
- [x] 后端 `mvn compile -q` 通过
- [x] 小程序 4 个关键文件 ESLint 0 errors（仅历史 warnings）
- [x] H5 `source-miniapp` + `public/source-miniapp` 与小程序 source diff 一致

### 2026-07-14 样衣开发筛选/搜索/阶段后端联通性修复

- [x] 后端 `PatternProductionOrchestrator.listWithEnrichment` 支持 `status=OVERDUE/WARNING`，按交期过滤并重新分页
- [x] 前端 `sample-development/index/index.js` 删除 `OVERDUE/WARNING` 前端本地过滤，直接传 `status` 给后端
- [x] 修复 `sample-development/detail/index.js` 4 个 ESLint 硬错误
- [x] H5 `source-miniapp` + `public/source-miniapp` + `dist/source-miniapp` 三端同步
- [x] ESLint 0 错误、H5 三端 diff 一致、后端 `mvn compile -q` 通过
- [x] 记录决策 D-038：虚拟状态筛选必须后端过滤并重新分页
- [x] 修复 `sample-development/detail/index.js` `formatNodeTime` iOS 日期解析报错（MM-dd HH:mm 不应 replace 成 MM/DD HH:mm）
- [x] H5 三端同步 iOS 日期解析修复

### 2026-07-12 样衣开发阶段详情数据打通 + H5 三端同步

- [x] 小程序 `stage-detail/index.js` 工艺单/尺寸表/工序配置/码数单价改为调用 PC 端同款 API
- [x] 尺码表按部位×尺码矩阵展示
- [x] 工序配置优先 `styleApi.listProcesses` + 兜底 `patternProcessConfig`
- [x] 生产制单调用 `production.getProductionSheet` 展示完整 BOM/尺码/款式信息
- [x] 码数单价调用 `production.listSizePrices` 按工序×尺码矩阵展示
- [x] H5 `source-miniapp` + `public/source-miniapp` 三份拷贝与小程序完全一致
- [x] H5 `public/source-miniapp/utils/api-modules/production.js` 补充 `getProductionSheet`
- [x] JS 语法检查通过；无新增 `?.` / `padStart`；硬编码颜色未新增

### 2026-07-10 小程序/UI/性能/扫码全量优化日

- [x] iOS 日期格式兼容 + 样衣扫码脱离大货菲号系统
- [x] 性能优化 — 5 处 N+1 查询改为批量查询、7 个 RiskDetector 全表扫描加时间过滤/LIMIT
- [x] 工序进度条显示「完成件数/总件数 · 完成菲数/总菲数」
- [x] 小程序全局 UI 专业化 — 去 emoji、SVG 图标、镂空按钮、蓝色导航、纯色无渐变、卡片阴影
- [x] 字体/按钮/输入框高度统一（12px 主体、24-32px 按钮、32px 输入框）
- [x] 订单详情页图片轮播功能
- [x] 样衣开发详情页与 PC 端数据互通、附件预览下载
- [x] 设计预览页面创建与 6 类问题修复
- [x] 采购/样衣/裁剪/生产管理等多个页面交互 bug 修复
- [x] 样衣开发与采购节点数据联动（quick-edit + stock-check 接口）
- [x] 已关闭订单采购记录过滤修复
- [x] WebSocket 日志级别与后端 500 问题排查
- [x] 采购表格勾选后序号列消失修复（global.css 移除 position/z-index）
- [x] 前端类型检查通过、生产构建通过
- [x] 外发工厂/发货多端逻辑一致性修复（手机端+H5+后端）

### 2026-07-09 出库优化 + 工序阶段修复 + WebSocket修复

- [x] 工序阶段误判修复 — 二次工艺禁用时动态跳过，不再误拦车缝（`ec9b20fd0`）
- [x] 出库仓库/库位选择优化 — 3个出库场景移除选择器，改为显示当前位置（`324ec2b06`）
  - 样衣借出：移除仓库/库位选择，显示当前存储位置
  - 物料出库：移除仓库/库位选择，显示当前位置
  - 成品扫码出库：移除仓库/库位选择，表格增加"当前库位"列
  - 后端统一自动从库存记录获取仓库和库位
- [x] WebSocket修复（3项）— token缺失 / 握手500 / StrictMode双重挂载（`88a782352` + `c356c8660` + `3c26e7bff`）
- [x] RESTful迁移第二批 — 7个Controller + 15个前端/小程序/H5文件（`324ec2b06`）
- [x] Flyway修复 — V202606240001/002/003 MySQL 8.0兼容 + V20260708002表名错误（`ae98091a0` + `afa2d72c0`）
- [x] CI优化 — 门禁job合并 + 变量名修复（`531d7adc1` + `0b4d3e3cd`）

### 2026-07-05 ~ 2026-07-08 高密度问题修复（64 个提交）

- [x] P0：扫码页崩溃打不开修复（`e1902dfdb`）
- [x] P0：订单进度球数据全部不显示修复 — 异步线程租户上下文丢失（`585af8405`）
- [x] P0：订单列表异步线程租户上下文丢失系统性修复（`786310508`）
- [x] P0：扫码按钮点不动 + Flyway CI 校验失败修复（`1e9ef17fb`）
- [x] P0：Flyway 版本号撞车 + V49 非幂等导致迁移链路卡死修复（`1eb11c809`）
- [x] P0：20个P0问题修复 — 数据链路断点+状态码英文+多端不一致（`523efce49`）
- [x] P1：25个P1问题修复 — 多模式覆盖+数据链路+跨端一致性+状态码兜底（`21a03dff5`）
- [x] 扫码模块 20+ 项修复（样衣扫码/大货扫码/扫码页2次整体重做）
- [x] Flyway/迁移 4 项修复（版本号撞车/非幂等/DELIMITER bug/CI校验）
- [x] 小程序 8 项修复（编译报错/状态判断/wx:if/app.json/领取功能/工序保存）
- [x] 裁剪模块 5 项修复（404/领取提示/冗余页面/入口合并）
- [x] 采购模块 7 项修复（弹窗/超领bug/字段补全/封面图/布局对齐）
- [x] 工序跟踪 3 项修复（终态订单/UUID归组/节点时间+iOS日期）
- [x] 中文化/字段一致性 3 项（全系统多端中文化/颜色图片回填）
- [x] 新功能 5 项（数据链路可视化地图/统计卡片/聚水潭对接/字段配置简化/操作日志全链路）
- [x] 补录 memory-bank/activeContext.md（7-05~7-08 记录，之前滞后到 7-04）
- [x] 创建 TRAE 项目记忆 project_memory.md（含"记忆同步规则"）
- [x] 小程序样衣开发列表点击不跳转修复（改 `data-item` 为字符串 `data-style-id` / `data-id`）

### 2026-07-04 款式一键复制功能实现完成

- [x] 后端：`StyleInfoOrchestrator.copyStyle()` 补充工序/二次工艺/报价复制逻辑
- [x] 后端：修复 `buildNewStyleFromSource()` 扩展字段复制（sizeColorConfig/洗水唛等）
- [x] 后端：新增 `copyProcessToNewStyle()` / `copySecondaryProcessToNewStyle()` / `copyQuotationToNewStyle()` 方法
- [x] 后端：新增 `StyleQuotationService` / `StyleQuotation` 导入
- [x] 后端编译验证通过（`mvn compile -q` exit code 0）
- [x] 前端：API路径验证正确（`/style/info/${id}/copy`）
- [x] 前端编译验证通过（`npx tsc --noEmit` exit code 0）
- [x] 更新 `memory-bank/activeContext.md` 记录本次变更

---

## 已完成

### 2026-07-02 小云 AI P1 实用能力升级 5 项全部完成

- [x] P1-4 L4 Procedural Memory 完整实现（`SkillCrystallizationService.promoteToProcedural()` + `tryPromoteAsync()`）
- [x] P1-1 Agentic RAG 三阶段闭环（`AgenticRagService.retrieve()` 3 轮自纠正 + LLM 重写 + 启发式评分）
- [x] P1-3 巡检自动执行闭环（`AiPatrolJob.performAutoAction()` 创建真实任务 + 微信通知）
- [x] P1-2 NlQuery 完成（`NlQueryTool` @AgentToolDef 升级 + @DataTruth 修正）
- [x] P1-5 Hermes Learning Loop（`AgentLoopEngine` qualityScore 接入 SelfCritiqueGate + `recordFeedback()` 反馈回写 + 新事件类型）
- [x] 后端编译验证通过（`mvn compile -q -pl .` exit code 0）
- [x] 更新 `memory-bank/activeContext.md` 记录本次变更
- [x] 添加决策 D-032（小云 AI P1 五项实用能力升级）

### 2026-07-02 新增 P0 #23 MCP 工具强制调用规则（配置 ≠ 自动调用）

- [x] `.trae/rules/project_rules.md` 新增 P0 #23（10 个强制场景 + 降级规则 + tenantId 规则 + 例外清单）
- [x] `.trae/rules/agent-workflow.md` 嵌入 MCP 强制调用（第1/3/5/6步）
- [x] `memory-bank/mcp-tools-cheatsheet.md` 顶部新增 P0 #23 强制场景表
- [x] 更新 `memory-bank/activeContext.md` 记录本次变更
- [x] 添加决策 D-031（P0 #23 MCP 工具强制调用规则）

### 2026-07-02 MCP 工具体系全面优化（调研 + 配置 + 文档同步）

- [x] 调研 GitHub 2026 最火 AI 工具（MCP/Skill/Agent），4 方向并行核实
- [x] 创建 `.trae/mcp.json`（含 6 自研 MCP + Serena，之前缺失）
- [x] 接入 Serena（uvx）替代未实现的 code-search-mcp
- [x] 更新 `memory-bank/mcp-tools-cheatsheet.md`（决策树 + 36 工具清单 + Serena）
- [x] 更新 `.trae/rules/dev-mcp-design.md` 状态（设计 → 已实现 6/7）
- [x] 同步 `.trae/mcp-servers/MCP_CONFIG_TEMPLATE.md`（5 → 7 MCP + GitHub 可选）
- [x] 更新 `memory-bank/activeContext.md` 记录本次变更
- [x] 添加决策 D-029（Serena 替代 code-search-mcp）+ D-030（MCP 配置统一管理）

### 2026-06-23 系统全面体验优化（8大模块）

**背景**：用户反馈"线上经常出问题""操作不好用""信息不清晰"，全面梳理并按P0/P1/P2优先级批量修复。

- [x] 🔴 P0-1：数据库性能加固
  - t_scan_record新增9个多租户联合索引（tenant_id前缀）
  - 慢查询告警阈值从1000→500，新增慢查询比例监控（>1%告警）
  - Flyway迁移：V20270623001__add_scan_record_tenant_indexes.sql
- [x] 🔴 P0-2：AI接口超时对齐
  - AI_VISION_TIMEOUT_MS从30s→60s
  - 3个AI识别接口全部显式配置60s超时
- [x] 🔴 P0-3：加载状态+防重提交
  - 5个高频页面（成品库存/原料库存/订单列表/用户列表）增加双重防御
  - UI loading + useRef逻辑锁
- [x] 🟡 P1-1：错误提示友好化
  - GlobalExceptionHandler 5种异常提示改为用户友好文案
  - 前端新增showErrorWithRetry（带重试按钮的错误通知）
- [x] 🟡 P1-2：交互一致性规范
  - 6个核心页面分页默认值统一为20
  - 10个页面成功提示/危险确认弹窗全部符合规范
- [x] 🟡 P1-3：表单草稿自动保存
  - 新增useFormDraft Hook（300ms防抖+localStorage+7天过期）
  - 订单创建/款号新增/采购申请3个长表单集草稿保存与恢复
- [x] 🟢 P2-1：信息层级优化
  - 7个核心表格空状态增加"去创建"操作引导
  - 13处日期格式统一
  - 工资结算页面统计卡片视觉突出
- [x] 🟢 P2-2：视觉降噪
  - 定义6色状态CSS变量系统
  - 10个核心页面状态标签颜色统一收敛
- [x] 后端 mvn compile BUILD SUCCESS
- [x] 前端 npx tsc --noEmit 0 errors
- [x] Flyway SQL校验：新增迁移幂等性通过
- [x] 多租户隔离审计：本次修改未引入新风险
- [x] 更新 memory-bank/activeContext.md + progress.md

### 2026-06-23 权限系统大牌水准优化

**背景**：用户要求"优化到大牌的水准，比他们的系统要好用更简单，租户开户就马上知道怎么使用"。

- [x] 新租户开户向导 - TenantSetupGuide 组件（RoleList/index.tsx 集成）
- [x] 预设角色模板 - 7个模板已就绪（管理员/跟单员/仓库管理员/财务/质检/生产主管/裁剪师傅）
- [x] 数据权限维度验证 - all/team/own + factoryId 供应商隔离
- [x] 供应商数据隔离验证 - SupplierPortalController 完整实现
- [x] 权限矩阵可视化验证 - RoleList 页面功能完善
- [x] TypeScript 错误修复 - TenantSetupGuide.tsx res.message 类型问题
- [x] 编译错误修复 - RoleTemplateController.java Result.error → Result.badRequest
- [x] 后端编译验证 - mvn compile BUILD SUCCESS
- [x] 前端编译验证 - npx tsc --noEmit 0 errors

### 2026-06-20 小云AI 6大升级 + 开发效能体系

**借鉴来源**：Ruflo Truth Scoring / Claude Agent SDK / RooFlow Context Portal / GenericAgent / Hermes GEPA / SIJE 7-Agent / Agency-Agents 215角色

- [x] 🔴 P0-1：SelfCritiqueGate 多视角对抗评审
  - 新增 MultiPerspectiveCritic.java（285行，4视角并行：业务30%+数据30%+租户25%+权限15%，一票否决）
  - 新增 AdversarialJudgePipeline.java（215行，高风险场景Round 2验证+HighRiskDetector）
  - 新增 ConvergenceStopCondition.java（88行，连续2轮提升<5分停止）
  - 修改 SelfCritiqueGate.java（177→298行，集成多视角+对抗+收敛）
- [x] 🔴 P0-2：MCP 生产化
  - 新增 McpResourceSanitizer.java（95行，防prompt injection）
  - 新增 McpIdentityContext.java（113行，身份传播值对象）
  - 新增 McpToolError.java（130行，SERF结构化错误5类码）
  - 新增 McpTimeoutBudget.java（70行，ATBA自适应超时QUERY/REPORT/COMPUTATION）
  - 修改 McpResourceProvider接口（+默认方法向后兼容）+ 3个Provider实现 + McpProtocolService + 2个Controller
- [x] 🔴 P0-3：Memory Bank 数据库化（ConPort 模式）
  - Flyway V202606201003（t_memory_bank_entry + t_memory_bank_relation 两表）
  - 新增 MemoryBankEntry/Relation Entity + Mapper（含CTE递归traverseGraph）
  - 新增 MemoryBankDbService.java（274行，upsert/semanticSearch/addRelation/importFromMarkdown）
  - 新增 MemoryBankRelationService.java（76行，知识图谱遍历depth≤2）
  - 新增 MemoryBankMigrationRunner.java（132行，启动时Markdown→DB迁移，Redis幂等）
  - 修改 MemoryBankService（双写兼容）+ EvolutionOrchestrator（D-021指标）
- [x] 🟡 P1-1：Skill 三层渐进式披露
  - Flyway V202606201001（t_skill_template新增6字段：metadata_yaml/skill_md/references_json/token_budget/disclosure_level/disclosure_updated_at）
  - 新增 SkillDisclosureLoader.java（195行，三层按需加载+token估算+旧数据降级）
  - 新增 SkillDisclosureController.java（95行，REST API三层查询）
  - 修改 SkillTemplate Entity（+6字段）+ SkillAutoCreationService（生成三层）+ SkillExecutionTool（按需加载）
- [x] 🟡 P1-2：技能结晶化 + GEPA 遗传优化
  - Flyway V202606201002（t_prompt_optimization表）
  - 新增 SkillCrystallizationService.java（239行，高频问题Redis语义哈希计数→结晶化→跳过LLM）
  - 新增 GepaPromptOptimizer.java（337行，17个prompt块当基因，遗传算法种群10/代数≤5）
  - 新增 ConstraintGates.java（193行，三重门控：尺寸/语义漂移/测试套件）
  - 新增 EvolutionEventLogger.java（169行，events.jsonl append-only审计）
  - 修改 EvolutionOrchestrator（D-021注册3新组件+指标+健康检查）
- [x] 🟡 P1-3：服装专属 Skills（10个）
  - scan-flow-expert / wage-settlement-guard / tenant-isolation-auditor / delivery-forecast-advisor / supplier-risk-agent / quality-inspection-advisor / production-scheduling-advisor / cost-negotiation-advisor / fabric-sourcing-strategist / compliance-checker
  - 路径：.trae/skills/<name>/SKILL.md（每个80-115行）
- [x] 🟢 P2-2：per-call model selection + 成本爆炸防御
  - 新增 ModelSelectionRouter.java（242行，ECONOMY/STANDARD/PREMIUM三级，四维评估）
  - 新增 CostExplosionGuard.java（307行，上下文肥大+重复检测+熔断）
  - 修改 AiInferenceRouter（+chatWithModelSelection/+chatPremium）+ AiAgentOrchestrator（接入防御）+ EvolutionOrchestrator（D-021）+ application.yml（配置块）
- [x] 🟢 开发 skills 补充（8个）
  - orchestrator-scaffolder / tenant-isolation-auditor / transaction-boundary-checker / ai-tool-scaffolder / skill-scaffolder / mcp-resource-scaffolder / prompt-block-optimizer / evolution-component-scaffolder
  - 路径：.trae/skills/<name>/SKILL.md（每个108-141行）
- [x] 🟢 开发 MCP 服务器设计文档
  - 新增 .trae/rules/dev-mcp-design.md（410行）
  - 4个MCP：db-query-mcp / flyway-mcp / test-runner-mcp / code-search-mcp
  - 含工具清单/多租户安全/技术栈/集成方式/实施路线图
- [x] 后端 mvn compile BUILD SUCCESS（全部模块编译通过）
- [x] Flyway 迁移脚本 V202606201001/V202606201002/V202606201003 校验通过
- [x] EvolutionOrchestrator D-021 合规（17组件全部注册：原12 + 新5）
- [x] 新增铁律 D-022（多视角对抗评审强制启用）+ D-023（MCP resource description 必须 sanitize）+ D-024（Memory Bank 数据库化）+ D-025（per-call model selection 强制启用）
- [x] 更新 memory-bank/activeContext.md + decisionLog.md + progress.md
- [x] 新建 optimization-log-20260620.md

### 2026-06-19 Controller 事务边界全面治理 + 文档体系更新
- [x] 🔴 P0-1：PatternRevisionController → PatternRevisionOrchestrator 化（save/update/remove 全部下沉
- [x] 🔴 P0-2：PatternProductionController → PatternProductionOrchestrator 化
- [x] 🔴 P0-3：ProductionOrderNodeController → ProductionOrderOrchestrator.saveNodeOperations
- [x] 🔴 P0-4：SupplierUser / SupplierPortal Controller → SupplierUserOrchestrator 化
- [x] 🔴 P0-5：MaterialPickingController.audit() → MaterialPickingOrchestrator.audit
- [x] 🔴 P0-6：PaymentCallbackController → PaymentCallbackOrchestrator 化
- [x] 🔴 P0-7：AiMetricsOrchestrator.generateSnapshot() 加 @Transactional
- [x] 🔴 P0-8：ClosedOrderAiDataCleanupService 加 assertTenantOwnership 租户校验
- [x] 🟡 P1-1：GlobalExceptionHandler 新增 SecurityException 处理器（403 + 友好提示）
- [x] 🟡 P1-2：文档全面更新（decisionLog / productContext / project_rules / mcp-tools-cheatsheet）
- [x] 🟡 P1-3：新建 optimization-log-20260619.md（完整记录本轮治理
- [x] 🟢 P2-1：新增 memory-bank-updater Skill（.trae/skills/memory-bank-updater/SKILL.md）
- [x] 🟢 P2-2：新增 ci-rollback Skill（.trae/skills/ci-rollback/SKILL.md）
- [x] 后端 mvn compile BUILD SUCCESS（编译验证）
- [x] 更新 memory-bank/activeContext.md + decisionLog.md + progress.md

### 2026-06-18 小云AI CL4R1T4S 借鉴升级（6项优化）
- [x] P0-1 SelfCritiqueGate 输出前硬门控（PASS/SOFT_FAIL/HARD_FAIL 三档决策）
- [x] P0-2 memory_limitations 上下文块（四层记忆边界声明）
- [x] P0-3 响应延迟优化（PostTurnHooks异步 + 线程池扩容 + 缓存阈值降低 + Checkpoint异步 + MAS缓存）
- [x] P1-1 HIGH_RISK 工具 opt-in + 7条反例规则（结构化suggest + TTL 60→300）
- [x] P1-2 上下文块意图动态优先级（IntentBasedPriorityRouter）
- [x] P2-1 EvolutionOrchestrator 统一12组件 + 量化评估 + 补MemoryNudge @Scheduled
- [x] P2-2 MCP resources 启用（memory:// knowledge:// factory:// + 3个ResourceProvider）
- [x] 后端 mvn clean compile -q BUILD SUCCESS（3次验证）
- [x] 更新 memory-bank/activeContext.md + decisionLog.md + progress.md
- [x] 新建 optimization-log-20260618.md
- [x] 新增铁律 D-020（MCP resources 多租户隔离）+ D-021（自我进化组件统一可观测）

### 2026-06-11
- [x] 🔴 安全修复：微信支付回调验签逻辑不完整 → 使用 wechatpay-java SDK 实现正确验签
- [x] 🔴 安全修复：WechatPayAdapter.verifyCallback() 直接返回 false → 实现完整的 SDK 验签
- [x] 🟡 安全修复：数据库密码未校验 → 生产环境强制要求配置密码
- [x] 🟢 安全增强：IntegrationHttpClient 添加 HTTPS URL 强制校验
- [x] 🔧 修复：SampleWorkflowTool.saveSampleReview() 参数不匹配问题
- [x] 后端 mvn compile BUILD SUCCESS
- [x] Flyway SQL 校验通过

### 2026-06-01
- [x] 🔴 P0修复：getByOrderNo() 无 tenant_id 过滤 — 跨租户数据泄露
- [x] 🔴 P0修复：createOrderFromStyle() 未显式设置 tenant_id
- [x] 🔴 P0修复：PurchaseCartOrchestrator addItem/updateItem 添加 @Transactional
- [x] 🔴 P0修复：PurchaseDetailView.tsx specification→specifications 字段名修正（4处）
- [x] 🔴 P0修复：ProductionOrderController updateBasicInfo() 多表更新添加 @Transactional
- [x] 🔴 P0修复：ProductionOrderController quickEdit/urge/urgeReply 添加 @Transactional
- [x] 🟡 P1修复：PurchaseCartController 添加 @PreAuthorize
- [x] 🟡 P1修复：ProductionOrderController detail()/flow()/timeline() 添加 TenantAssert
- [x] 🟡 P1修复：ProductionOrderController healthScores() IDOR 修复（过滤租户归属）
- [x] 采购车系统全链路（后端Orchestrator/Service/Controller + 前端组件/Hook/API + 小程序同步）
- [x] 样衣开发展开视图 + 采购快捷操作
- [x] ResizableTable 增强
- [x] 小程序全量 var→const 重构 + 页面优化
- [x] 补写 2026-05-12/13 优化日志
- [x] 补写 2026-06-01 优化日志
- [x] 更新 memory-bank（activeContext + progress + decisionLog D-012/D-013/D-014）
- [x] 后端 mvn compile BUILD SUCCESS
- [x] 前端 npx tsc --noEmit 0 errors

### 2026-05-29
- [x] 自动化测试缺口分析：审查近期代码变更，识别3个缺少测试覆盖的核心模块
- [x] 新增测试：WarehouseLocationOrchestratorTest（11个测试用例）
  - P0 SQL语法错误修复验证：空标识符集合返回空列表，不执行SQL查询
  - 有效标识符查询入库记录并更新usedCapacity
  - 创建/批量初始化/容量更新等核心路径
- [x] 新增测试：GraphRagServiceTest（10个测试用例）
  - 知识图谱上下文构建：空消息、无匹配关键词、无实体、空结果
  - 关系链格式化输出、关系类型翻译（MANUFACTURED_BY等）
  - 数据库异常静默处理、实体去重
- [x] 新增测试：FactoryProfileLearningServiceTest（7个测试用例）
  - 工厂画像上下文：无数据、格式化表格、低评分预警、S/A级推荐
  - 工厂名称截断、null值默认值处理、数据库异常静默处理
- [x] 测试验证：28个新测试全部通过（BUILD SUCCESS）
- [x] 确认 TenantAiConfigService 已有完整测试覆盖（无需新增）

### 2026-05-28
- [x] 小云AI 9大智能化升级（全部3轮）深度审查 + 7项修复
- [x] 🔴 修复 AgentCheckpoint 实体冲突 — 删除 agent/checkpoint/AgentCheckpoint.java，transient 字段合并到 entity 版本
- [x] 🔴 修复 AgentCheckpointManager — 正确 import intelligence.entity.AgentCheckpoint + intelligence.mapper.AgentCheckpointMapper
- [x] 🔴 修复 AgentLoopEngine — import 切换到 intelligence.entity.AgentCheckpoint
- [x] 🔴 修复 AgentCheckpointManager selectCount().intValue() 类型转换
- [x] 确认 HandoffEngine/SubAgentRegistry/Skill YAML 无其余问题
- [x] 后端 mvn compile BUILD SUCCESS, 0 errors
- [x] 前端 npx tsc --noEmit 0 errors（1项预存测试错误，与本次无关）
- [x] memory-bank 更新
- [x] 小云AI 6大智能化升级 — 上下文工程系统（工具结果智能摘要）
- [x] 小云AI 6大智能化升级 — 结构化输出（JSON置信度+行动建议）
- [x] 小云AI 6大智能化升级 — 多层级记忆引擎（工作中/情景/语义）
- [x] 小云AI 6大智能化升级 — 主动风险检测（7类业务风险扫描）
- [x] 小云AI 6大智能化升级 — Prompt进化系统（自进化提示词）
- [x] AgentLoopEngine 集成全部6个新Service
- [x] xiaoyun-base-prompt.yaml 提示词升级（规划先行+结构化输出+智能增色）
- [x] PromptEvolutionService 编译错误修复（@Getter + 5缺失方法 + getDeleteFlag）
- [x] 后端 mvn compile BUILD SUCCESS, 0 errors, 0 Checkstyle violations
- [x] 前端 npx tsc --noEmit 0 errors
- [x] memory-bank 全面更新

### 2026-05-13
- [x] 订单号生成格式统一：SerialOrchestrator/ProductionOrderServiceImpl/ProductionOrderCommandService 三入口统一为 PO+yyyyMMddHHmmss
- [x] ProductionOrderCommandService 添加唯一性检查（JdbcTemplate 绕过逻辑删除）
- [x] 前端 OrderCreateModal placeholder 更新为 PO20260513143025
- [x] 小程序 fallback 从 ORD+Date.now() 改为 PO+yyyyMMddHHmmss
- [x] 编译验证通过：后端 mvn compile + 前端 tsc --noEmit 0 errors
- [x] 测试缺口分析：审查最近代码提交，识别4个缺少测试覆盖的核心模块
- [x] 新增测试：OrderDeliveryRiskOrchestratorTest（8个测试用例）
- [x] 新增测试：ProductionProgressToolTest（2个测试用例）
- [x] 新增测试：SystemOverviewToolTest（4个测试用例）
- [x] 新增测试：DeepAnalysisToolTest（4个测试用例）
- [x] 测试验证：18个新测试全部通过（BUILD SUCCESS）

### 2026-05-12
- [x] P0修复：扫码撤回工资结算拦截（ScanUndoHelper + settlementStatus检查）
- [x] P1修复：ScanRecordOrchestrator.undo()添加@Transactional
- [x] P1修复：MaterialStockMapper lockStock/decreaseStockWithCheck可用量检查
- [x] P1修复：PayableMapper atomicAddPaidAmount原子更新
- [x] P1修复：WagePaymentOrchestrator原子更新替代read-modify-write
- [x] P1修复：MaterialPurchaseMapper atomicAddArrivedQuantity原子更新
- [x] P1修复：MaterialInboundOrchestrator原子更新arrivedQuantity
- [x] P1修复：ProductWarehousingRollbackHelper入库回退工资结算拦截
- [x] P1修复：ShipmentReconciliationOrchestrator扫码成本计算统一过滤
- [x] P1修复：V20260512003唯一索引加入tenant_id
- [x] P1兼容性修复：前端cutting/by-code GET→POST
- [x] P2兼容性修复：小程序material/roll/list-by-inbound GET→POST
- [x] 测试修复：MaterialInboundOrchestratorTest mock对齐（lenient + 双次返回值）
- [x] 全面系统测试完成：2781单元 + 315集成 + 22并发/幂等 = 0故障
- [x] 集成5大AI Agent方法论到开发流程

### 2026-05-05
- [x] P0修复：PC端AI助手消息空白（useAiChat.ts防御式消息创建）
- [x] 小云AI自我进化系统（SelfCriticService + QuickPathQualityGate + DataTruthGuard 5级 + DynamicFollowUpEngine + RealTimeLearningLoop）
- [x] 误报治理：StatusTranslator补全映射 + 提示词增加订单终态精确区分
- [x] Flyway修复：V20260505001版本号重复 + V20260308b表名冲突
- [x] AgentLoopEngineTest补充Mock

### 2026-05-03
- [x] P0修复：部署后全站404白屏（index.html内联恢复脚本 + nginx修复 + try_files修复）

### 2026-05-02
- [x] V202605020932 VIEW迁移失败修复
- [x] SmartRemark巡检remarks字段溢出修复
- [x] 扫码记录tenant_id为NULL修复
- [x] V202605021000 Flyway迁移失败修复
- [x] Flyway版本号重复修复
- [x] 10处旧式API端点迁移RESTful
- [x] REGEXP编码修复兼容MySQL 8.0
- [x] t_factory索引修改修复
- [x] DbColumnDefinitions新增38列覆盖
- [x] DbTableDefinitions新增6张表定义
- [x] 8处Service层@Transactional违规移除
- [x] 前端WagePayment 22处中性色替换

## 当前任务

- 无进行中任务

## 待办

- [ ] 小云AI全链路测试（规划引擎+结构化输出+主动风险检测实际效果验证）
- [x] P1性能：MaterialPurchase统计查询DATE()函数索引失效（291d42b55）
- [x] P1性能：订单列表查询添加缓存（已接入OrderListCacheHelper）
- [ ] P2：@Version与手写原子SQL混用风险统一
- [ ] P2：前端移除xlsx重复依赖
- [ ] P2：vendor-react-antd chunk拆分
- [x] P2：RESTful迁移第二批（cutting-task/by-style-no等）
- [ ] 前端硬编码颜色值批量替换（~555处中性色）
- [ ] Service层@Transactional违规治理（剩余62处，需逐个分析调用链）

### 2026-06-20 测试闭环（已完成）

- [x] 测试闭环：5389 tests, 0 failures, 0 errors（从 122 失败修复到 0）
- [x] 主代码 bug 修复 5 个：
  - EcStockSyncEventListener/EcSyncJob 添加 @ConditionalOnProperty（条件Bean依赖者未加条件注解）
  - GepaPromptOptimizer 拆分 @Scheduled 带参方法（Spring 禁止 @Scheduled 带参数）
  - DagExecutor 并行任务用 state 副本（HashMap 并发写入 bug）
  - ScanUndoHelper 提取 safeRecomputeProgress（异常传播导致撤销返回失败）
- [x] 测试配置修复：application-test.yml 添加 allow-bean-definition-overriding
- [x] 测试文件修复 13 个（Service/Controller/集成测试 mock 缺失与断言修正）
- 详见 `.trae/rules/optimization-log-20260620.md` 第十五章
### 2026-07-08 二次工艺筛选 + 菲号显示修复（`bee543b48`）

- [x] 二次工艺筛选去混入尾部子工序 — `riskBadgeRenderers.tsx` 使用 `isSecondaryProcessSubNode` 过滤
- [x] 菲号显示带订单号信息 — `useProcessTrackingColumns.tsx` 接收 `orderNo`，纯数字 bundleNo 拼接订单号
