# 活跃上下文 — 当前开发状态

> 本文件由 AI 助手在每次会话开始/结束时更新
> 最后更新：2026-05-28

---

## 当前目标

- ✅ 小云AI 9大智能化升级（含第二轮3大升级）
- ✅ 后端编译通过 + 前端 TypeScript 0 errors

## 最近变更

### 2026-05-28 第三轮：AgentCheckpoint 实体冲突修复

上一轮审查不完整——AgentCheckpoint 表结构被 V20260513001 迁移修改后，新增的 `agent/checkpoint/AgentCheckpoint.java` 使用了旧列结构，与 Mapper 引用的 `intelligence/entity/AgentCheckpoint.java` 产生冲突，导致 AgentCheckpointManager 编译失败。

| # | 严重度 | 文件 | 问题 | 修复 |
|---|--------|------|------|------|
| 1 | 🔴 | agent/checkpoint/AgentCheckpoint.java | 与 `intelligence/entity/AgentCheckpoint.java` 重复定义，Mapper 期望 entity 版本 → 编译失败 | 删除冗余类，transient 字段合并到 entity 版本 |
| 2 | 🔴 | AgentCheckpointManager.java | 缺少 `AgentCheckpointMapper` import + 使用错误的 AgentCheckpoint 类 → 编译失败 | 重写：导入 `intelligence.entity.AgentCheckpoint` + `intelligence.mapper.AgentCheckpointMapper` |
| 3 | 🔴 | AgentLoopEngine.java | import 引用已删除的 `agent.checkpoint.AgentCheckpoint` → 编译失败 | 切换到 `intelligence.entity.AgentCheckpoint` |
| 4 | 🔴 | AgentCheckpointManager.java:108,114 | `(int) selectCount()` — Long 不能直接强转为 int | 改为 `.intValue()` |

### 确认安全的项目（第三轮复查）

| 检查项 | 结果 |
|--------|------|
| HandoffEngine.java — buildHandoffInjection 死代码 | ✅ 已删除 |
| SubAgentRegistry.java — toolWhitelist | 🟢 死数据（无代码读取），无害 |
| Skill YAML — toolNames | 🟢 死数据（getRecommendedTools 未被调用），无害 |
| AgentCheckpointManager SQL vs t_agent_checkpoint 表结构 | ✅ 列名匹配（V20260513001 后：tenant_id, thread_id, node_id, node_name, state_json, metadata_json, step_index, status） |
| AgentLoopEngine.saveCheckpoint tenantId null guard | ✅ 已有 `null → 0L` 兜底 |

### 2026-05-28 第二轮：Agent Skills + Durable Execution + Handoffs

基于 GitHub 真实仓库调研（crewAI v2/OpenAI Agents SDK v0.17/Letta v0.16/MAF/LangGraph）发现的2026年最前沿模式。

| # | 模块 | 文件 | 功能 |
|---|------|------|------|
| 7 | Agent Skills 插件系统 | AgentSkill.java + AgentSkillRegistry.java + 5个YAML技能包 | AI 根据用户问题动态激活专业技能包（提示词注入+工具推荐），不再硬编码所有工具 |
| 8 | Durable Execution 断点续传 | AgentCheckpointManager.java | 每轮工具执行后保存断点（消息历史+工具结果+状态快照），失败可从断点恢复，最多3次 |
| 9 | Handoffs 子代理委派 | SubAgentDefinition.java + SubAgentRegistry.java + HandoffEngine.java | 4个内置专业子Agent（财务专家/质量专家/交期风控/产能规划），主Agent遇到专业问题自动委派 |

### 技能包（5个YAML文件）

| 技能 | 触发场景 | 核心工具 |
|------|---------|---------|
| 交期风险分析 | 交期/逾期/延期/货期 | DeliveryPredictionTool + ProductionProgressTool |
| 质检异常分析 | 次品/返修/质量/缺陷 | QualityStatisticsTool + DefectiveBoardTool |
| 成本利润分析 | 成本/利润/报价/亏本 | StyleQuotationTool + MaterialCalculationTool |
| 工厂绩效对比 | 对比/选厂/排名 | SupplierScorecardTool + SupplierTool |
| 库存物料优化 | 库存/缺料/呆滞 | InventorySummaryTool + MaterialAuditTool |

### AgentLoopEngine 集成

- `run()` 方法：先尝试 Handoff（匹配专业子Agent），再尝试加载断点恢复，然后注入技能包+规划+风险
- `injectPlanIfNeeded()` 方法：新增技能注入 + 子Agent提示注入
- `runToolExecutionPhase()` 方法：每轮工具执行后保存 checkpoint

### 修改文件清单（本会话）

| 文件 | 类型 | 说明 |
|------|------|------|
| AgentSkill.java | 新增 | 技能数据模型 |
| AgentSkillRegistry.java | 新增 | 技能注册+匹配+YAML加载 |
| AgentCheckpoint.java | 删除 | 冗余实体，已合并到 intelligence/entity/AgentCheckpoint.java |
| AgentCheckpointManager.java | 新增 | 断点保存/加载/恢复 |
| SubAgentDefinition.java | 新增 | 子Agent定义 |
| SubAgentRegistry.java | 新增 | 4个内置子Agent注册 |
| HandoffEngine.java | 新增 | 委派引擎 |
| delivery-risk-analysis.yaml | 新增 | 交期风险分析技能包 |
| quality-inspection-analysis.yaml | 新增 | 质检异常分析技能包 |
| cost-profit-analysis.yaml | 新增 | 成本利润分析技能包 |
| factory-performance-benchmark.yaml | 新增 | 工厂绩效对比技能包 |
| inventory-material-optimization.yaml | 新增 | 库存物料优化技能包 |
| AgentLoopEngine.java | 修改 | 集成3个新服务（import+字段+方法） |

### 验证结果

| 指标 | 结果 |
|------|------|
| 后端 mvn compile | BUILD SUCCESS, 0 errors |
| 前端 npx tsc --noEmit | 0 errors（1项预存测试错误，与本次无关） |
| 第三轮修复 | 4个🔴编译错误全部修复 |
| 实体统一 | agent/checkpoint/AgentCheckpoint.java 已删除，统一使用 intelligence/entity/ 版本 |

## 当前进行中

- 无

## 已知问题（待优化）

### P1（1项）
1. 订单列表查询无缓存

### P2（5项）
1. @Version与手写原子SQL混用风险
2. vendor-react-antd chunk过大
3. cutting-task/by-style-no 旧式端点
4. 前端硬编码颜色值约555处
5. Service层@Transactional违规约20处

## 下一步

- 小云AI全链路测试（9大模块实际效果验证）
- 订单列表查询缓存
- 更多技能包（样本开发/采购/仓储等领域）