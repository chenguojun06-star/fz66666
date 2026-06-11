# 决策日志

> 记录重要的架构和实现决策，包括上下文、决策、理由
> 最后更新：2026-06-11

---

## D-001：事务边界仅在 Orchestrator 层

- **上下文**：Service层互调导致事务嵌套，数据不一致
- **决策**：@Transactional 只在 Orchestrator，Service 禁止加事务
- **理由**：单一事务边界，避免嵌套回滚、连接泄漏
- **特例**：REQUIRES_NEW / Controller直接调用 / AI工具入口（需注释原因）

## D-002：子工序映射动态化

- **上下文**：硬编码子工序关键词（如 `LIKE '%绣花%'`），新增工序需改代码
- **决策**：优先级 模板progressStage > t_process_parent_mapping DB > 兜底
- **理由**：管理员可随时增改映射，无需发版

## D-003：VIEW修改必须走 Flyway

- **上下文**：ViewMigrator/DbViewRepairHelper 云端不执行，导致本地正常云端异常
- **决策**：VIEW 修改只通过 Flyway V*.sql `CREATE OR REPLACE VIEW`
- **理由**：Flyway 在云端自动执行，ViewMigrator 云端不跑

## D-004：Flyway 动态SQL禁止字符串字面量

- **上下文**：`SET @s` 内 `COMMENT ''xxx''` 被 Flyway 解析器截断，静默失败
- **决策**：动态SQL内只用 DEFAULT NULL / DEFAULT 0，回填用独立 UPDATE
- **理由**：Flyway 把 `''` 当边界截断，导致云端缺列但迁移记录成功

## D-005：错误恢复代码必须内联

- **上下文**：2026-05-03 全站404白屏事故，恢复代码在可能404的外部JS里
- **决策**：关键恢复脚本内联在 index.html `<head>` 中
- **理由**：外部JS本身可能404，恢复代码永远不执行

## D-006：SSE事件防御式消息创建

- **上下文**：快速通道直接发answer事件，无前置thinking，前端AI消息空白
- **决策**：answer/answer_chunk/follow_up_actions 统一「有则更新，无则创建」
- **理由**：不依赖特定事件前置，任何SSE事件都能创建AI消息

## D-007：集成5大AI Agent方法论

- **上下文**：DeerFlow/RooFlow/agency-agents/Ruflo/Hermes 各有优势
- **决策**：提取核心理念融入开发流程，不安装独立软件
- **理由**：项目已有成熟架构，需要的是方法论而非新框架
  - RooFlow → Memory Bank 持久化上下文
  - agency-agents → 专业角色分工
  - DeerFlow → 深度调研流程
  - Ruflo → 多智能体编排
  - Hermes → 自进化学习闭环

## D-008：并发数据更新使用原子SQL替代read-modify-write

- **上下文**：Payable付款金额、MaterialPurchase到货数量、MaterialStock库存扣减均使用先读后写模式，并发场景数据丢失
- **决策**：所有累加/扣减操作使用 `SET col = col + #{delta}` 原子SQL，配合WHERE条件CAS语义
- **理由**：
  - read-modify-write在并发下丢失更新（两个事务同时读旧值，各自+delta，后写覆盖前写）
  - 原子SQL在InnoDB行锁保护下执行，单语句内读+写不可分割
  - WHERE条件（如 `quantity - locked_quantity >= delta`）提供CAS语义，不满足条件返回0行受影响
- **适用范围**：PayableMapper.atomicAddPaidAmount、MaterialPurchaseMapper.atomicAddArrivedQuantity、MaterialStockMapper.lockStock/decreaseStockWithCheck

## D-009：工资结算双字段校验

- **上下文**：扫码撤回仅检查payrollSettlementId，但部分记录settlementStatus="payroll_settled"而payrollSettlementId为null
- **决策**：同时检查payrollSettlementId和settlementStatus，任一满足即拦截撤回
- **理由**：数据写入时序可能导致只更新了status未回写settlementId，双字段互为兜底

## D-010：唯一索引必须包含tenant_id

- **上下文**：V20260512003唯一索引 `(material_code, color, size, delete_flag)` 缺少tenant_id，不同租户可能使用相同物料编码
- **决策**：唯一索引改为 `(tenant_id, material_code, color, size, delete_flag)`
- **理由**：多租户场景下，SKU唯一性应在租户内保证，跨租户允许相同编码

## D-011：小云AI 6模块智能化升级架构

- **上下文**：小云AI当前存在响应"傻"的问题——复杂问题无计划乱查工具、提示词冗余但无结构、无上下文压缩导致token浪费、无记忆导致重复提问、无主动风险检测、提示词静态不进化
- **决策**：从GitHub前沿Agent项目（OpenManus/CrewAI的Plan-Execute-Verify、Anthropic的Context Engineering、OpenAI的Structured Output、Letta/Mem0的多层级记忆、ACE框架的Prompt Evolution）提取6大核心模式，实现轻量级Service层升级
- **理由**：
  1. PEV规划引擎：LLM先制定执行计划再调用工具，复杂度>50分的问题强制走计划模式，避免AI"拍脑袋"连查工具
  2. 上下文工程：>2000字符的工具结果自动摘要压缩，减少token浪费；对话历史智能压缩，保持关键信息
  3. 结构化输出：AI最终回答被解析为JSON（summary/insights/actions/risks/dataPoints/confidenceScore），前端可独立渲染
  4. 多层级记忆：工作中记忆（会话级）→情景记忆（对话级）→语义记忆（租户级），解决重复提问问题
  5. 主动风险检测：扫描用户消息和AI回答中的7类业务风险，不等用户问就主动预警
  6. Prompt进化：基于5维度反馈评分，24小时自动生成提示词优化建议
- **关键设计原则**：
  - 所有新服务使用 `@Autowired(required = false)`，确保缺失时不影响现有功能
  - 不修改数据库Schema（纯内存/提示词操作）
  - AgentLoopEngine 集成点清晰：循环前注入（规划+风险+记忆）、工具结果处理（摘要压缩）、最终回答处理（结构化+风险扫描+反馈记录）
- **修改文件**：AgentLoopEngine.java（核心集成）、PromptEvolutionService.java（修复编译+补齐方法）、xiaoyun-base-prompt.yaml（提示词升级）
- **新增文件**：AgentPlan.java、AgentPlanningEngine.java、ContextEngineeringService.java、StructuredResponseService.java、MemoryHierarchyService.java、ProactiveRiskDetectionService.java、PromptEvolutionService.java

## D-012：前端字段名必须与后端Entity完全一致

- **上下文**：PurchaseDetailView.tsx 使用 `specification`（单数）但后端 Entity 和 TS 类型定义都是 `specifications`（复数），导致新增面辅料行时规格数据丢失
- **决策**：前端字段名必须与后端 Entity 字段名完全一致，禁止用 `as any` 绕过 TypeScript 类型检查
- **理由**：`as any` 绕过类型检查后，字段名拼写错误不会被编译器捕获，运行时数据丢失且难以排查
- **执行规则**：
  1. 新增前端类型定义时，必须对照后端 Entity 逐字段核对
  2. 禁止使用 `as any` 访问后端已有但前端类型未定义的字段，应补充类型定义
  3. Code Review 时检查所有 `as any` 使用

## D-013：Controller层写操作必须有事务保护

- **上下文**：ProductionOrderController 的 updateBasicInfo/quickEdit/urge/urgeReply 4个方法在 Controller 层直接执行多步写操作，没有 @Transactional，部分失败时数据不一致
- **决策**：Controller 层写操作必须有 @Transactional 保护（临时方案），后续应下沉到 Orchestrator 层
- **理由**：
  1. 项目铁律规定事务只在 Orchestrator 层，但当前这些方法逻辑在 Controller 中，无法立即重构
  2. 临时在 Controller 加 @Transactional 比无事务安全得多
  3. 后续迭代中将逻辑下沉到 Orchestrator 后移除 Controller 的 @Transactional
- **适用范围**：ProductionOrderController.updateBasicInfo/quickEdit/urge/urgeReply

## D-014：所有读接口必须校验资源租户归属

- **上下文**：ProductionOrderController 的 detail()/flow()/timeline() 三个读接口没有校验订单是否属于当前租户，healthScores() 未校验 orderIds 租户归属（IDOR）
- **决策**：所有按 ID 查询资源的读接口，必须在返回前校验 `TenantAssert.assertBelongsToCurrentTenant()`；批量查询接口必须先过滤出属于当前租户的 ID
- **理由**：
  1. MyBatis-Plus 租户插件对 `getById` 可能不生效（取决于插件配置）
  2. IDOR（Insecure Direct Object Reference）是 OWASP Top 10 漏洞
  3. 攻击者可通过猜测 ID 读取其他租户数据
- **执行规则**：
  1. 所有 `getById` 后必须 `TenantAssert.assertBelongsToCurrentTenant()`
  2. 所有批量查询必须先过滤租户归属
  3. Code Review 时检查所有新增的读接口

## D-015：容器内禁止使用 localhost 作为网络目标

- **上下文**：P0 事故 INC-20260611-001，docker-entrypoint.sh 中 socat 用 `localhost` 转发到 Tomcat，Ubuntu 24.04 解析 `localhost` 为 IPv6 `::1`，Tomcat 只监听 IPv4 `0.0.0.0`，导致 Connection refused → 全线 502
- **决策**：容器内所有网络目标地址必须使用明确的 IP 地址，禁止使用 `localhost`
- **理由**：
  1. `localhost` 的 IPv4/IPv6 解析行为依赖 glibc 版本和 `/etc/gai.conf` 配置，不可预测
  2. Ubuntu 24.04 (Noble) 默认 IPv6 优先，旧版可能不同
  3. 明确 IP 地址消除了歧义，行为可预测
- **执行规则**：
  1. 容器内回环连接用 `127.0.0.1`，不用 `localhost`
  2. HEALTHCHECK 中用 `127.0.0.1`
  3. 代理/转发配置用 `127.0.0.1`
  4. 本地开发脚本（不在容器内）可继续用 `localhost`

## D-016：去掉不必要的 socat 代理层

- **上下文**：docker-entrypoint.sh 用 socat 做端口转发（外部 8088 → 内部 8089），但 Spring Boot 的 `server.port=${PORT:8088}` 已能直接读取 PORT 环境变量
- **决策**：去掉 socat 代理层，让 Tomcat 直接监听 PORT 环境变量指定的端口
- **理由**：
  1. socat 代理完全多余，Spring Boot 本身支持动态端口
  2. 代理层增加了故障点（本次 P0 事故就是 socat 引起的）
  3. 减少镜像体积（不需要安装 socat）
  4. 减少启动复杂度（少一个进程管理）
- **附加**：JVM 启动参数加 `-Djava.net.preferIPv4Stack=true` 作为防御性措施

## D-017：永久移除 WebSocket 全局广播

- **上下文**：用户多次明确表示不需要全局广播通知（"别人扫了码其他人也能看到"），只保留本地提示（"自己操作自己看到本地提示"）。PC 端已砍，小程序端和后端需彻底清理。
- **决策**：永久移除所有 WebSocket 全局广播代码，禁止加回
- **理由**：
  1. 全局广播对业务无实际价值，干扰用户
  2. WebSocket 连接错误（"未完成的操作"）影响小程序稳定性
  3. 减少后端资源消耗（广播推送）
- **已删除文件**：
  - `backend/.../websocket/` 目录（7个文件）
  - `WebSocketConfig.java`
  - `RealTimePushService.java`
  - `DataSyncAspect.java`
- **已清理字段的 文件**（13个）：
  - `ScanRecordOrchestrator.java`
  - `ProductionOrderOrchestrator.java`
  - `CuttingBundleSplitTransferOrchestrator.java`
  - `ScanUndoHelper.java`
  - `ProductionScanExecutor.java`
  - `MaterialPurchaseStatusHelper.java`
  - `ProductWarehousingServiceImpl.java`
  - `WarehousingWriteHelper.java`
  - `ProductWarehousingPostActionHelper.java`
  - `WagePaymentOrchestrator.java`
  - `ChangeApprovalOrchestrator.java`
  - `ProactivePatrolAgent.java`
  - `UnifiedCacheManager.java`
  - `OrderRemarkController.java` ← 本次清理
  - `OrderImageOrchestrator.java` ← 本次清理
- **小程序端**：已删除 `websocket.js`，`app.js` 移除连接代码
- **执行规则**：
  1. 禁止在任何新代码中引入 WebSocket 全局广播
  2. 禁止在代码审查中批准涉及全局广播的 PR
  3. 业务通知走操作结果返回本地提示，不走广播
