# 决策日志

> 记录重要的架构和实现决策，包括上下文、决策、理由
> 最后更新：2026-07-18（补录 D-040 多租户隔离强化 — 查询时直接带 tenant_id 过滤）

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

## D-018：CloudBase 探针配置强制入版本控制

- **上下文**：cloudbaserc.json 历史上无 InitialDelaySeconds，CloudBase 默认 2s，Spring Boot 启动需 90s+，探针过早检测导致容器判死重启
- **决策**：所有 CloudBase 探针参数必须在 cloudbaserc.json 中明确声明（InitialDelaySeconds: 300, PeriodSeconds: 30, TimeoutSeconds: 10, FailureThreshold: 5）
- **理由**：依赖云端默认值导致 P0 事故（INC-20260612-001）

## D-019：禁止使用 socat 做探针"作弊"

- **上下文**：socat 代理层绕过探针检测，让应用处于不健康状态但"看起来健康"
- **决策**：禁止使用 socat 来"伪造"健康状态，探针必须检测真实应用端口
- **理由**：socat 掩盖了探针配置缺失问题，正确做法是配置 InitialDelaySeconds

## D-020：MCP resources 多租户隔离

- **上下文**：MCP resources 启用后，MemoryBank/KnowledgeBase/FactoryProfile 暴露为 resources，存在跨租户读取风险
- **决策**：所有 McpResourceProvider 实现必须 list/read 带 tenantId，校验资源归属当前租户，从 UserContext.tenantId() 获取（不信任 URI 中嵌入的 tenantId）
- **理由**：A 工厂读取 B 工厂的记忆 = P0 事故（P0 铁律 4 + 15）

## D-021：自我进化组件必须有统一可观测

- **上下文**：12个自我进化组件散落各处，无统一 metrics 汇总，"自我进化空转"无法被发现（DynamicFollowUpEngine 孤儿、MemoryNudge.expireOldNudges 死代码、EvolutionEnginePatrolJob 空壳）
- **决策**：12个进化组件必须通过 EvolutionOrchestrator.getUnifiedMetrics() 汇总指标；新增进化组件时必须在 EvolutionOrchestrator 注册并暴露量化指标
- **理由**：统一可观测是"自我进化"的前提，散落各处时无法发现空转

## D-022：多视角对抗评审强制启用

- **日期**：2026-06-20
- **上下文**：原 SelfCritiqueGate（2026-06-18 引入）只做单一维度评分，高风险场景（涉及钱/权限/数据删除/跨租户）下幻觉/越权/数据错误仍可能通过门控。单一评审视角存在"盲区"，无法覆盖业务正确性、数据真实性、多租户安全、权限合规四个维度的独立风险。
- **决策**：高风险场景必须触发 MultiPerspectiveCritic 4视角并行评审 + AdversarialJudgePipeline Round 2 对抗评审
  - 4视角权重：业务正确性 30% + 数据真实性 30% + 多租户安全 25% + 权限合规 15%
  - 一票否决：任一视角得分<40 → 整体 HARD_FAIL，不再加权平均
  - 收敛停止：连续 2 轮评分提升<5 分停止，≤3 轮上限
  - 普通场景可跳过对抗评审（Round 2），但多视角评审（Round 1）不可跳过
- **理由**：
  1. 单一 SelfCriticService 评分容易"盲区"，4视角并行 + 一票否决堵住幻觉/越权/数据错误
  2. 高风险场景的代价远高于额外评审成本（钱/权限/数据删除一旦错误难以挽回）
  3. 对抗评审（Round 2）用反方立场质疑，能发现 Round 1 的确认偏差
  4. 收敛停止条件防止"无限打磨"消耗 token，符合 AI Hard Limits
- **借鉴来源**：Ruflo Truth Scoring + Claude Agent SDK Judge-and-iterate
- **执行规则**：
  1. HighRiskDetector 检测高风险场景（涉及钱/权限/数据删除/跨租户）→ 触发 Round 2
  2. 所有场景必须执行 Round 1（4视角并行）
  3. 任一视角<40 分 → HARD_FAIL，不再加权
  4. 连续 2 轮提升<5 分 → 停止迭代

## D-023：MCP resource description 必须 sanitize

- **日期**：2026-06-20
- **上下文**：2026-06-18 启用 MCP resources 后，resource description 直接暴露给 AI。如果 description 包含 prompt injection 模式（如 `ignore previous instructions`、`system: you are now...`、`<script>`），AI 行为可能被劫持。resource description 来源包括用户可控内容（如知识库条目标题、工厂画像描述），存在注入风险。
- **决策**：所有 McpResourceProvider 实现返回的 resource description 必须经过 `McpResourceSanitizer.sanitize()` 处理
  - 过滤 prompt injection 模式（`ignore previous`/`system:`/`<script>`/`assistant:`/`user:`）
  - 转义特殊字符（`<`/`>`/`&`/`"`/`'`）
  - 长度截断 ≤500 字符
  - 禁止直接返回用户可控内容作为 description
- **理由**：
  1. prompt injection 可劫持 AI 行为，导致越权/数据泄露/错误操作
  2. resource description 是 AI 上下文的一部分，注入风险等同于用户消息
  3. 用户可控内容（知识库标题/工厂描述）必须经过 sanitize，不可信任
  4. 违反 = P0 安全事故（prompt injection 可劫持 AI 行为）
- **执行规则**：
  1. 所有 McpResourceProvider.listResources() 返回的 description 必须经过 sanitize
  2. 所有 McpResourceProvider.readResource() 返回的 contents 必须经过 sanitize
  3. Code Review 时检查新增 Provider 是否调用 McpResourceSanitizer
  4. 禁止绕过 sanitize 直接返回原始内容

## D-024：Memory Bank 数据库化

- **日期**：2026-06-20
- **上下文**：Memory Bank 原为 Markdown 文件（product-context/active-context/system-patterns/decision-log/progress），AI 每次需要"通读全文"才能找到上下文，token 浪费严重（5个文件 ~10K token），且无法做语义检索。决策间关系（如 D-022 依赖 D-020）无法表达，知识图谱缺失。
- **决策**：Memory Bank 必须双写（Markdown + DB）
  - 写入：MemoryBankService 同时写 Markdown 文件 + t_memory_bank_entry 表
  - 读取：优先 DB 语义检索（topK=5），回退 Markdown 通读
  - 关系：决策/模式间关系必须存入 t_memory_bank_relation（知识图谱，关系类型 DEPENDS_ON/RELATES_TO/DERIVED_FROM）
  - 迁移：启动时 MemoryBankMigrationRunner 自动 Markdown → DB（Redis 幂等，key: `memory_bank:migration:done`）
  - 新增记忆类型时，必须同时更新 DB schema 和 Markdown 模板
- **理由**：
  1. Markdown 通读 token 浪费严重（~10K token），DB 语义检索 topK=5 仅 ~500 token，降低 ~70%
  2. 知识图谱关系支持"决策 D-022 依赖 D-020"类关联查询，Markdown 无法表达
  3. 双写兼容确保向后兼容，旧代码无感知，可渐进迁移
  4. 启动时自动迁移 + Redis 幂等，避免重复迁移
- **借鉴来源**：RooFlow Context Portal 2026-02-19（ConPort 模式）
- **执行规则**：
  1. MemoryBankService 所有写入操作必须双写（Markdown + DB）
  2. 读取操作优先 DB 语义检索，回退 Markdown
  3. 决策/模式间关系必须存入 t_memory_bank_relation
  4. 新增记忆类型时同步更新 DB schema 和 Markdown 模板
  5. 启动时 MemoryBankMigrationRunner 自动迁移，Redis 幂等

## D-025：per-call model selection 强制启用

- **日期**：2026-06-20
- **上下文**：所有 AI 调用原使用同一模型（glm-4-plus 旗舰），简单查询（如"今天有几条待办"）也用旗舰模型，成本高（旗舰 ~$0.05/次 vs 经济 ~$0.005/次，5-10倍差距）。同时上下文无限膨胀导致 token 成本爆炸，单会话可能消耗 $10+。
- **决策**：所有 AI 调用必须经过 ModelSelectionRouter 选择模型
  - 简单查询（复杂度<30）→ ECONOMY（glm-4-flash）
  - 一般对话（30-70）→ STANDARD（glm-4）
  - 复杂推理（>70）→ PREMIUM（glm-4-plus）
  - 禁止简单查询用旗舰模型（成本浪费 5-10 倍）
  - CostExplosionGuard 必须开启：
    - 上下文 >32K token → 自动摘要压缩
    - 连续 3 轮相似度>0.9 → 强制终止
    - 单会话 >$5 → 熔断，拒绝后续调用
    - 单轮工具调用 >10 次 → 强制收敛
  - 熔断时返回友好提示，不静默失败
- **理由**：
  1. 简单查询用旗舰模型成本浪费 5-10 倍，per-call selection 降低 ~80% 成本
  2. 上下文肥大是 token 成本爆炸主因，自动压缩防止失控
  3. 重复检测防止 AI"原地打转"消耗资源
  4. 熔断机制防止单会话成本失控（>$5 阈值基于业务可接受上限）
  5. 四维评估（意图复杂度+上下文长度+工具调用数+历史轮次）确保模型选择准确

## D-026：设置管理模块数据模型澄清

- **日期**：2026-06-22
- **上下文**：FactoryList (t_factory) 和 PartnerManagement (t_organization_unit) 被误认为重复功能，实际管理不同数据。用户反馈"搞的乱七八糟，不知道去哪改"。
- **决策**：不合并两个页面，明确区分职责
  - FactoryList (t_factory)：管理供应商/外发工厂/客户的主数据（联系人、资质、合同）
  - PartnerManagement (t_organization_unit)：管理外部企业的组织架构和成员分配
  - 供应商账号 (t_supplier_user)：独立账号体系，管理供应商用户
- **理由**：
  1. t_factory 和 t_organization_unit 是不同表，管理不同数据，不应合并
  2. 用户困惑的原因是菜单标签不清，不是功能重复
  3. 优化方向：菜单重组 + 供应商账号独立页面 + 预设角色模板

## D-027：预设角色模板平台级共享

- **日期**：2026-06-22
- **上下文**：新租户创建角色时不知道该创建哪些角色，需要预设模板参考。
- **决策**：角色模板表 t_role_template 为平台级（tenantId = null），预设模板所有租户共享
  - 预设模板：admin / merchandiser / warehouse_keeper / finance / quality_inspector 等
  - 租户可自定义模板（category=CUSTOM），仅自己可见
  - apply 方法只创建新角色，不修改现有角色
- **理由**：
  1. 平台级预设模板避免重复创建，新租户直接使用
  2. 租户自定义模板隔离，确保不影响其他租户
  3. apply 方法幂等，只增不减

- **借鉴来源**：Claude Agent SDK per-call model selection + Ruflo 成本爆炸防御
- **执行规则**：
  1. 所有 AI 调用必须经过 ModelSelectionRouter，禁止直接指定模型
  2. 复杂场景可用 `chatPremium()` 强制 PREMIUM，但需注释原因
  3. CostExplosionGuard 必须开启，不可关闭
  4. 熔断时返回友好提示（如"本次对话已较长，建议开启新会话"），不静默失败
  5. application.yml 中 model-selection.enabled 和 cost-guard 配置不可设为 false

## D-026：线程池大小必须可配置，禁止硬编码

- **日期**：2026-06-20
- **上下文**：AiAgentToolExecHelper 和 AiAgentPromptHelper 线程池用硬编码 `Executors.newFixedThreadPool(16)`/`new ThreadPoolExecutor(16,32...)`，调整并发需改代码+重新编译+重新部署，对"一两分钟才回答"问题无快速调优手段
- **决策**：所有 AI 相关线程池大小必须通过 @Value + application.yml 读取，不可硬编码
  - tool-executor: core=16, max=32, queue=256（默认值仅在未配置时使用）
  - prompt-executor: core=12, max=24, queue=128
  - 允许通过 application.yml 或环境变量 XIAOYUN_TOOL_EXECUTOR_* 覆盖
- **理由**：
  1. 硬编码需改代码+重新编译+重新部署，调试周期太长
  2. 不同租户/不同场景需求不同（开发机/不同时段负载不同，需动态调整
  3. 性能调优无需重新部署

## D-027：多工具并发调用必须有流式进度

- **日期**：2026-06-20
- **上下文**：原 executeToolsConcurrently 等所有工具全部完成后才输出，用户看到大片空白等待，"一两分钟才回答"问题最直观的是空白等待
- **决策**：多工具并发调用使用 CompletableFuture.anyOf 模式，完成一个立即推送一个的完成一个立即推送一个
  - 每个工具完成后立即触发 onThinking 进度事件，格式：`(2/5) [完成: query_order]…`
  - 工具执行过程中持续更新状态，不再"永远一片空白"
- **理由**：
  1. 用户能看到实时进展，减少焦虑（"一两分钟才回答"的核心痛点之一就是完全不知道AI在干什么）
  2. anyOf 模式只需循环处理，不阻塞主线程，不影响性能
  3. 与现有缓存机制兼容（cached result caching机制兼容（tool-executor 不变
## D-028：Prompt 上下文块必须有优先级

- **日期**：2026-06-20
- **上下文**：AiAgentPromptHelper 所有上下文块使用同一超时（3s），导致关键信息（工厂画像/实体记忆/当前问题）被其他次要信息（行为画像/历史洞察）一样可能被超时截断，关键信息丢失
- **决策**：Prompt 上下文块按优先级分级设置不同级设置三级超时保护：
  - HIGH（3s）：工厂画像/实体记忆/当前问题 — 永不缩减到 核心不缩减
  - MEDIUM（1.8s）：RAG 检索/知识图谱 — 可降级为精简版本，不影响主流程
  - LOW（1s）：行为画像/历史洞察 — 超时直接放弃，不影响主流程
- **理由**：
  1. 关键信息必须优先，确保不被其他次要信息不被不被时间紧迫时丢失
  2. 次要信息可降级，非关键信息超时可降级为精简版本
  3. 次要信息超时可降级为精简版本，不影响主流程
  4. 关键信息永不缩减，次要信息超时直接放弃

## D-029：code-search-mcp 用 Serena 替代，不自研

- **日期**：2026-07-02
- **上下文**：`.trae/rules/dev-mcp-design.md` 设计的 4 个开发专用 MCP 中，code-search-mcp（语义搜索 + AST 调用链 + 影响范围分析）一直未实现。调研发现 GitHub 上 Serena（https://github.com/oraios/serena，24.5k★）已是代码语义搜索事实标准，基于 LSP（Language Server Protocol）的语义级理解比 grep 省 token 3-5 倍，支持 Java/TS/JS 等 30+ 语言。
- **决策**：不自研 code-search-mcp，改用外部 MCP Serena 替代。Serena 通过 `uvx serena-mcp` 按需下载，已写入 `.trae/mcp.json`。
- **理由**：
  1. Serena 已是行业事实标准（24.5k★），自研重复造轮子无价值
  2. LSP 语义级理解比原设计的 ripgrep + tree-sitter 更精准
  3. 原设计的 find_tenant_violations / find_transaction_violations 已由 anti-pattern-mcp + test-runner-mcp.audit_tenant_id 覆盖
  4. Serena 支持 find_symbol / find_referencing_symbols / replace_symbol_body 等，完全覆盖原设计的 find_callers / find_callees / impact_analysis
- **影响**：`.trae/rules/dev-mcp-design.md` 状态更新为"已实现 6/7 + Serena 替代"

## D-030：MCP 配置文件统一管理

- **日期**：2026-07-02
- **上下文**：项目 6 个自研 MCP 代码已就绪，但 `.trae/mcp.json` 配置文件一直未创建，导致 MCP 无法被 Trae IDE 加载。MCP_CONFIG_TEMPLATE.md 模板也只含 5 个 MCP（缺 test-runner-mcp）。
- **决策**：
  1. 创建 `.trae/mcp.json`，包含 6 个自研 MCP + 1 个外部 MCP（Serena）
  2. 补齐 test-runner-mcp 配置（模板原缺失）
  3. flyway-mcp 和 test-runner-mcp 添加 PROJECT_ROOT 环境变量
  4. MCP_CONFIG_TEMPLATE.md 同步更新，新增 GitHub MCP 可选配置说明
- **理由**：
  1. 配置文件缺失导致已就绪的 MCP 代码无法使用，是 P0 级配置缺陷
  2. 统一配置管理，避免代码就绪但配置缺失的"最后一公里"问题
  3. GitHub MCP 作为可选项预留，需用户提供 PAT 后启用

## D-031：P0 #23 MCP 工具强制调用规则（配置 ≠ 自动调用）

- **日期**：2026-07-02
- **上下文**：D-029/D-030 完成 MCP 配置后，用户质疑"配置 MCP ≠ AI 会自动调用"。确认 AI 习惯用原生工具（RunCommand+SQL / mvn / Read）走熟悉路径，导致 6 个自研 MCP + Serena 形同虚设。仅靠"建议"无法改变 AI 行为，必须写入 P0 铁律强制。
- **决策**：
  1. 新增 P0 #23「MCP 工具强制调用规则」到 `project_rules.md`，列出 10 个强制场景表格（查业务数据 / Flyway 校验 / 编译验证 / 符号搜索 / 影响评估 / 反模式检测 / 记忆加载等），每场景明确"必须用 XX-mcp" + "禁止 YY 替代"
  2. 制定降级规则：MCP 不可用时必须明确告知用户"XX-mcp 不可用，降级为 YY"，并手动遵守对应 P0 铁律（#4 多租户 / #1 Flyway / #13 工具验证）
  3. tenantId 传递规则：从 UserContext 获取（测试租户=1 东方制衣厂），禁止编造 0/null
  4. 例外清单：项目内文件读写仍用原生工具（Read/Edit/Write/Glob/Grep，P0 铁律），MCP 不替代原生文件操作
  5. `agent-workflow.md` 嵌入 MCP 强制调用：第1步用 memory-bank-mcp、第3步用 change-impact-mcp + serena、第5步用 anti-pattern-mcp、第6步质量门控表格新增"强制 MCP 工具"列
  6. `mcp-tools-cheatsheet.md` 顶部新增 P0 #23 强制场景表速查
- **理由**：
  1. "建议使用 MCP"无法克服 AI 走熟悉路径的惯性，必须 P0 铁律级强制
  2. 10 个场景覆盖开发全流程（记忆加载→调研→影响评估→反模式→Flyway→编译→租户审计→业务数据验证），不留盲区
  3. 降级规则避免"MCP 不可用就停止工作"，但强制告知用户保持透明
  4. 例外清单防止过度执行（文件读写仍用原生工具，符合 P0 铁律）
- **影响**：
  - `project_rules.md` P0 铁律从 22 条增加到 23 条
  - `agent-workflow.md` 第1/3/5/6步嵌入 MCP 强制调用
  - `mcp-tools-cheatsheet.md` 顶部新增 P0 #23 强制场景表

## D-032：小云 AI P1 五项实用能力升级（Agentic RAG + NlQuery + 巡检闭环 + L4 程序性记忆 + Hermes 学习闭环）

- **日期**：2026-07-02
- **上下文**：基于对小云 AI 全量代码（165+ Orchestrators / 85+ Services / 100 Agent Tools）的系统核查，识别 5 项 P1 实用能力缺口。用户明确选择"实用能力升级"方向，跳过 P0（已稳定）和 P2（高阶但非急需）层级，要求 5 项全部实现。同时要求对孤儿组件"列出实际用处，不处理"。
- **决策**：按"最小工作量优先"顺序实现 5 项 P1：
  1. **P1-4 L4 Procedural Memory**：补全 `SkillCrystallizationService.promoteToProcedural()`（设计稿定义但未实现的唯一缺口），结晶化技能 useCount≥20 时自动升级为 `t_procedural_memory`，幂等性通过 sop_name 唯一性保证
  2. **P1-1 Agentic RAG**：将 `AgenticRagService.retrieve()` 从单次检索+兜底改造为 3 轮自纠正循环。LLM 查询重写（3s 超时+规则兜底）+ 启发式相关性评分（关键词 60% + 来源数 25% + 长度 15%）+ 阈值 0.30 触发提前停止
  3. **P1-3 巡检自动执行**：修复 `AiPatrolJob.performAutoAction()` 的 3 处断点：调用 `TaskCenterOrchestrator.createTask()` 创建真实跟进任务（带 UserContext 多租户隔离，try/finally 恢复）+ `WxAlertNotifyService.notifyAlert()` 推送微信订阅消息
  4. **P1-2 NlQuery**：`NlQueryTool` 从老式 AbstractAgentTool 升级为 `@AgentToolDef` + `@McpToolAnnotation`（readOnly=true, timeout=15s, 6 个 tags）；`/nl-query` 端点 `@DataTruth` source 从 AI_DERIVED 修正为 REAL_DATA
  5. **P1-5 Hermes Learning Loop**：4 处改动 — (a) `AgentLoopEngine` L667 硬编码 `qualityScore=0.8` 改为取 `SelfCritiqueGate.getScore()/100`（评分范围 0-100 归一化到 0-1，对齐 MIN_QUALITY_FOR_CRYSTALLIZE=0.75）；(b) `SkillCrystallizationService.recordFeedback()` 异步回写 successCount/avgRating（5 分制，score≥4 计入成功）；(c) `/ai-feedback` 接入反馈回写；(d) `EvolutionEventLogger` 新增 SKILL_FEEDBACK_RECEIVED 事件类型
- **关键设计权衡**：
  1. **P1-4 阈值 useCount≥20 而非 successCount≥10**：因 successCount/avgRating 在 P1-5 之前从未自动更新（仅手动 API），用 useCount 作即时可用的代理指标；P1-5 完成后两者协同（成功反馈累加 successCount，达到双重阈值可考虑更严格升级条件）
  2. **P1-1 评分用启发式而非 LLM-as-Judge**：避免在关键路径增加额外 LLM 调用（+1-2s 延迟），LLM 仅用于第 2+ 轮的查询重写；启发式评分（关键词/来源数/长度）足够区分"无结果/弱匹配/强匹配"三态
  3. **P1-3 createTask 用 try/finally 保护 UserContext**：Job 层无 HTTP 请求上下文，必须手动设置 system 身份（userId="system"），完成后恢复原 UserContext，避免污染后续 Job 调用
  4. **P1-5 qualityScore 归一化**：SelfCritiqueGate 评分范围 0-100（GateResult.pass 默认 80.0），需 /100 映射到 MIN_QUALITY_FOR_CRYSTALLIZE=0.75 的 0-1 标度
- **未处理项**（用户明确"不处理"）：
  - `ProcessKnowledgeOrchestrator` 加载已删除的 IE 知识文件（ai_ie_parts_knowledge.json）— 静默失败但不影响功能
  - 工序知识库（模板中心）vs AI 工序建议数据源不一致 — 已在 project_memory 记录，待统一处理
  - `AgentLoopEngineTest` 中其他硬编码值（非 L667）— 测试代码，不影响生产
- **影响**：
  - 小云 AI 实用能力从"基本可用"提升到"自纠正 + 自学习 + 自执行"闭环
  - L4 Procedural Memory 设计稿（five-layer-memory-design.md）的 P0 阶段全部落地
  - Hermes 学习闭环形成：用户反馈 → SkillTemplate.successCount/avgRating 更新 → useCount≥20 触发 ProceduralMemory 升级 → 下次直接调用 SOP 步骤
  - 编译验证通过（`mvn compile -q -pl .` exit code 0），无需回滚

## D-033：工序进度实时同步从轮询改为 WebSocket 推送

- **日期**：2026-07-08
- **上下文**：所有工序节点（扫码/采购/裁剪/车缝/二次工艺/尾部质检/入库/返修申报）均依赖 30 秒轮询更新进度，用户反馈"进度不同步"、"扫码了半天看不到变化"。前端 useWebSocket.ts 为空壳实现，无法建立真实 WebSocket 连接。order:progress:changed 事件仅在 PC 手动改进度时触发，扫码等其他操作不触发。
- **决策**：
  1. 后端新增 `OrderProgressWebSocketServer`（@ServerEndpoint），按订单号分组推送
  2. `ScanExecutorSupport.recomputeProgressSync` 后添加 WebSocket 推送（带 tenantId 多租户隔离）
  3. 前端重写 `useWebSocket.ts`，实现真实连接 + 自动重连 + 心跳检测
  4. 前端生产列表和订单详情订阅 WS 消息，收到后立即刷新数据
  5. 保留 5 分钟长轮询作为兜底（防止 WS 断连后完全不更新）
- **关键设计权衡**：
  1. **按订单号分组而非全量广播**：避免无关消息浪费带宽，一个订单的进度变化只推送给关注该订单的客户端
  2. **5 分钟长轮询兜底**：WS 连接可能因网络/nginx 超时断开，长轮询确保最终一致性
  3. **ServerEndpointExporter Bean 必须存在**：Spring Boot 内嵌 Tomcat 需要此 Bean 才能注册 @ServerEndpoint，缺失会导致 WS 连接 404
  4. **Nginx 需配置 WS 升级**：proxy_set_header Upgrade $http_upgrade + Connection "upgrade"，超时设 30min
- **影响**：
  - 扫码后进度从"最多等30秒"变为"秒级实时"
  - 新增文件：OrderProgressWebSocketServer.java、WebSocketConfig.java
  - 修改文件：ScanExecutorSupport.java、useWebSocket.ts、useProductionListData.ts、useOrderSync.ts
  - 部署后需验证 WS 连接是否成功建立（浏览器 F12 → Network → WS）

## D-034：异步线程必须显式传递租户上下文

- **日期**：2026-07-08
- **上下文**：P0 事故——生产订单列表和进度球数据全部不显示。根因：ProductionOrderQueryService 使用 CompletableFuture.runAsync 创建异步线程，ThreadLocal 中的 UserContext（含 tenantId）未传递到异步线程，导致 TenantAssert.assertTenantContext 抛异常、TenantInterceptor 跳过租户过滤，引发进度数据丢失和跨租户数据泄漏风险。
- **决策**：
  1. **所有异步操作必须显式传递 tenantId**：禁止在异步线程中依赖 ThreadLocal 的 UserContext
  2. **优先使用 UserContext.wrap()**：包裹 Runnable/Callable，自动捕获和恢复上下文
  3. **无法 wrap 时从数据库记录取 tenantId**：如订单查询场景，先从主记录获取 tenantId，再传入异步任务
  4. **Code Review 检查项**：凡是看到 CompletableFuture / @Async / 新建 Thread，必须检查是否传递了租户上下文
- **关键教训**：
  - ThreadLocal 在异步线程中默认不继承（InheritableThreadLocal 也仅在创建线程时继承，线程池复用时失效）
  - 多租户系统中，异步线程丢失 tenantId = 数据隔离失效 = P0 级事故
  - 修复顺序：先从数据源头获取 tenantId（最安全），再考虑上下文传递
- **影响**：
  - 修复了订单进度球数据不显示的 P0 事故
  - 系统性排查并修复了订单列表中所有异步线程的租户上下文传递
  - 提交：585af8405（进度球修复）+ 786310508（系统性修复）

## D-035：操作日志与业务字段必须分离，禁止污染业务字段

- **日期**：2026-07-08
- **上下文**：用户反馈样衣详情中"生产要求"字段出现无关操作日志（如"退回纸样开发"、"修改款式"）。根因：StyleOperationAppendHelper.java 将所有操作日志都追加到 style_info.description 字段（"生产要求"字段），而该字段是给制单人员填写业务内容的地方，操作日志混入后业务内容被污染。
- **决策**：
  1. **操作日志写入专用表**：t_style_operation_log，禁止写入业务字段
  2. **业务字段（description/生产要求）只保存用户主动输入的内容**：系统操作不得自动追加
  3. **历史数据清理**：用 Flyway 迁移脚本将已混入的操作日志从 description 中分离到专用表
  4. **通用规则**：所有业务对象的"备注/描述"字段，系统自动日志都走独立 operation_log 表，不污染业务字段
- **关键设计权衡**：
  - 专用表 vs JSON 扩展列：专用表查询性能更好、支持按时间/操作人筛选、不影响原表结构
  - 清理脚本幂等性：使用 PREPARE/EXECUTE 模式，重复执行不损坏数据
- **影响**：
  - 修复文件：StyleOperationAppendHelper.java、StyleStageHelper.java
  - 新增迁移：V20260708002__clean_operation_logs_from_style_description.sql
  - 提交：befdce60f

## D-036：工序阶段前置校验必须动态跳过被禁用的阶段

- **日期**：2026-07-09
- **上下文**：没有二次工艺的款式（hasSecondaryProcess=false），扫码进车缝时被误拦截："二次工艺阶段尚未开始，暂不能进入车缝"。根因：ProductionScanStageSupport.validateParentStagePrerequisite 用固定数组索引 FIXED_PRODUCTION_NODES[currentIdx - 1] 找前置阶段，没考虑该阶段被禁用的场景。
- **决策**：
  1. **新增 findPrevEnabledStage 方法**：从当前阶段往前遍历，跳过所有被 isStageExplicitlyDisabled 判定为禁用的阶段，返回第一个启用的阶段
  2. **isStageExplicitlyDisabled 判断逻辑**：检查 hasSecondaryProcess=false（二次工艺禁用）或 nodeOperations 中该阶段被移除
  3. **ProcessStageDetector.isAutoSkippableStageName 增强**：二次工艺阶段也检查 hasSecondaryProcess，若禁用则自动跳过
- **理由**：固定数组索引无法适应动态禁用场景，必须运行时动态判断
- **影响**：
  - 修改文件：ProductionScanStageSupport.java / ProcessStageDetector.java
  - 新增测试：ProductionScanStageSupportTest.java（3个测试用例）
  - 提交：ec9b20fd0
- **教训**：用户反馈"这个问题为什么反反复复在处理"——说明之前修复不彻底，只处理了表面没解决根因

## D-037：出库不需要选仓库/库位，系统自动从库存记录获取

- **日期**：2026-07-09
- **上下文**：样衣借出弹窗要求用户选"出库仓库"和"库位"，用户反馈"出库是样衣在仓库里面的东西出去，为什么还要选仓库？只有入库才有选择库位"。核实发现物料出库、成品扫码出库都有同样问题。
- **决策**：
  1. **出库移除仓库/库位选择器**：样衣借出、物料出库、成品扫码出库三个场景统一移除
  2. **改为只读显示当前存储位置**：让用户知道东西从哪里出，但不需要手动选
  3. **后端自动从库存记录获取仓库和库位**：
     - 样衣：从 SampleStock.warehouseAreaId/warehouseAreaName 获取
     - 物料：从 MaterialInventory.warehouseAreaId/location 获取
     - 成品：从最新 ProductWarehousing 记录获取（SKU本身不存库位）
  4. **成品库存查询接口增强**：/style/sku/inventory/{skuCode} 返回值从 Integer 改为 {stock, warehouseLocation, warehouseAreaId, warehouseAreaName}
- **理由**：出库时库存已经在仓库里了，系统应该知道东西在哪里。入库才需要选（决定放哪里）。
- **参考实现**：TransferToOutstockModal（样衣转出库）本身就是正确实现——没有仓库选择，应作为标准参考
- **影响**：
  - 后端：SampleStockOrchestrator / MaterialWarehouseOperationOrchestrator / FinishedOutstockHelper / ProductSkuController
  - 前端：LoanModal.tsx / OutboundModal.tsx / QrcodeOutboundModal.tsx / types.ts / useOutboundActions.ts
  - 提交：324ec2b06

## D-038：虚拟状态筛选必须后端过滤并重新分页

- **日期**：2026-07-14
- **上下文**：用户反馈样衣开发列表页「已延期」「临近交期」筛选按钮「跟狗屎一样」，分页错乱、数据随机
- **根因**：`OVERDUE` / `WARNING` 是前端虚拟状态，实现为后端按无状态分页返回后，前端再本地过滤。导致每页实际条目数随机、`total` 不准确、翻页体验极差
- **决策**：
  1. 虚拟状态筛选改由后端统一过滤并重新分页
  2. 后端 `PatternProductionOrchestrator.listWithEnrichment` 识别 `status=OVERDUE/WARNING`，按 `deliveryTime` / `styleInfo.deliveryDate` 过滤后手动分页
  3. 前端直接传 `status=OVERDUE/WARNING` 给后端，删除前端本地过滤逻辑
- **理由**：
  - 分页控件依赖准确的 `total` / `pages`，前端本地过滤会破坏分页语义
  - 交期计算规则应集中在一处（后端），避免前后端逻辑不一致
  - 搜索 + 筛选组合时，后端统一过滤才能保证结果正确
- **影响**：
  - 后端：`PatternProductionOrchestrator.java` 新增 `filterByDueDate` / `resolveDeliveryDate` / `paginateManually`
  - 前端：`miniprogram/pages/sample-development/index/index.js` 删除本地过滤
  - H5：`h5-web/source-miniapp` / `public/source-miniapp` / `dist/source-miniapp` 三端同步

## D-039：API 响应处理规范 — ok() vs raw() 必须严格区分

- **日期**：2026-07-16
- **上下文**：全局排查发现 9+ 个页面存在 API 响应处理不一致问题：`ok()` helper 已统一解包 `Result.data`，但大量页面仍残留 `res.data` / `res.code` 判断，导致部分页面数据全空（P0级），代码可读性差
- **根因**：
  1. 历史迁移不彻底：从裸 `request()` → ok()/raw()` 迁移时，部分页面未同步更新响应处理
  2. 缺少统一规范，开发者不知道哪些 API 用 ok()、哪些用 raw()
- **决策**：
  1. **ok() 包装的 API：成功时 `.then(res => res` 拿到的就是业务数据对象，失败直接 `.catch()`，**禁止**在 then 里判断 `res.code` / `res.data`
  2. **raw() 包装的 API：返回完整响应体 `{ code, data, message }`，需自行判断 `res.code === 200` 并取 `res.data`
  3. **使用原则**：
     - 业务接口默认用 **ok()**（95% 以上）
     - 登录/注册/公开接口（无需鉴权、需读 code）用 **raw()**
     - 需读 HTTP 状态码的场景用 **raw()**
  4. **当前 raw() 清单（仅 3 处）**：`system.login` / `tenant.publicList` / `tenant.workerRegister`
- **理由**：
  - ok() 统一解包减少重复判断，减少出错概率
  - 明确边界清晰，开发者一看 API 函数名就知道返回格式
  -失败统一走 catch，错误处理集中
- **影响**：
  - 小程序：清理 9 个文件的冗余 `res.data` 判断，修复 2 处 P0 级 `res.code` 判断错误
  - 后续新增 API 函数必须明确标注是 ok() 还是 raw() 包装
  - H5 三端同步同样规范

## D-040：多租户隔离强化 — 查询时直接带 tenant_id 过滤，禁止依赖后置校验

- **日期**：2026-07-18
- **上下文**：三端数据流转一致性核查中发现 3 个 P0 级多租户隔离漏洞，均采用"先查全量 → 再用 TenantAssert.assertBelongsToCurrentTenant 后置校验"模式，存在数据泄露风险窗口（查询已返回全量数据，校验失败才拒绝）
- **根因**：
  1. D-014 虽要求"所有读接口必须校验资源租户归属"，但未明确要求"查询时即带 tenant_id 过滤"
  2. 后置校验模式在数据量小时代价低，但一旦数据量大或并发高，会泄露其他租户数据
- **决策**：
  1. **所有多租户表的列表/详情查询必须在 SQL/Mapper 查询时直接带 `tenant_id` 过滤条件**（`.eq(Entity::getTenantId, tenantId)`）
  2. **禁止使用"先查全量 → 后置 TenantAssert 校验"模式**
  3. TenantAssert.assertBelongsToCurrentTenant 仅用于"按主键查询单条详情"场景的二次防御，不能作为唯一的隔离手段
  4. 新增 Controller 端点时，查询条件必须显式带 tenant_id，Code Review 必检
- **理由**：
  - 查询时过滤是数据库层面的隔离，零窗口泄露
  - 后置校验是应用层校验，存在"查到再拒绝"的时间窗口
  - 符合 P0 铁律 4（多租户隔离）的最严格实现
- **影响**：
  - 修复 PatternRevisionController.list、PatternProductionOrchestrator 列表查询、PatternProductionController 新端点
  - 后续所有新增查询接口必须遵循此决策
  - audit-tenant-id.py 扫描会持续监控

