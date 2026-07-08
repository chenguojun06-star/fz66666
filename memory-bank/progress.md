# 进度跟踪

> 本文件由 AI 助手自动维护，记录项目开发进度
> 最后更新：2026-07-08（补录 7-05~7-08 共 64 个提交）

## 已完成

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
- [ ] P1性能：MaterialPurchase统计查询DATE()函数索引失效
- [ ] P1性能：订单列表查询添加缓存
- [ ] P2：@Version与手写原子SQL混用风险统一
- [ ] P2：前端移除xlsx重复依赖
- [ ] P2：vendor-react-antd chunk拆分
- [ ] P2：RESTful迁移第二批（cutting-task/by-style-no等）
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
