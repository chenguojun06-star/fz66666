# A 子项目：小云核心智能化升级 — 设计文档

> 项目：服装供应链生产管理平台 — 智能化小云
> 文档日期：2026-06-01
> 文档类型：Brainstorming 设计文档（已获用户批准）
> 后续实施：调用 writing-plans skill 产出实施计划

---

## 0. 背景与目标

### 0.1 项目现状（基于 2026-06-01 全面核实）

- 后端智能化模块：**175+ Orchestrator / 100+ Tool / 60+ Service / 48+ Controller**
- 前端 GlobalAiAssistant：**5383 行** 组件代码
- 数据库：**423 个 Flyway 迁移**（30+ 个 AI 相关）
- 编译状态：后端 `mvn compile` BUILD SUCCESS、前端 `tsc --noEmit` 0 errors
- 真实"虚假实现"：**2 处**（SmartNotificationOrchestrator 3 个通知方法只打日志 + SmartWorkflowOrchestrator 5 处 [Notify] called 占位）
- 中风险：5 处（A/B 阶段已识别）
- 已完成升级：6 大智能化升级（上下文工程/结构化输出/多层级记忆/主动风险/Prompt 进化）+ 9 大 Agent 升级（Skills/Durable Execution/Handoffs/DAG/Swarm）
- 自我进化系统：SelfCritic 5 维 / QuickPathQualityGate / DataTruthGuard 5 级验证
- 6 个 SpecialistAgent：PMC/财务/品控/CEO 4 角色辩论 + 6 领域专家
- 知识图谱：5 节点 **0 关系**（`buildGraphFromBusinessData` 只 upsertEntity，从未 upsertRelation）

### 0.2 用户已确认的 4 大设计约束

| 约束 | 决策 | 出处 |
|------|------|------|
| 兼容策略 | **严格向后兼容**（保留所有现有 API） | 用户 Q1 回答 |
| 验收标准 | **两者都要**（代码质量 + 智能化可见收益） | 用户 Q2 回答 |
| 风险红线 | **三大命根不动**（扫码/财务/工资）+ **双跑安全网** | 用户 Q3 回答 |
| 起点选择 | 用户授权我做工程决策，选 **A 核心业务重构** | 用户 Q4 回答 |

### 0.3 用户已确认的设计方向

- 5 大方向分解为 **5 个独立子项目** 串行推进：A→B→C→D→E
- 第 1 个子项目 = **A 核心智能化升级**
- **6 大能力合并为 3 大智能化引擎**（认知/执行/感知）

---

## 1. 设计目标

### 1.1 一句话目标

> **让小云从"能回答"升级到"会思考+会执行+会感知"**

### 1.2 验收指标（量化）

| 引擎 | 指标 | 当前基线 | 目标值 | 测量方式 |
|------|------|---------|--------|---------|
| 🧠 认知 | 单意图→多意图组合 | 35 个互斥意图 | top-3 组合 + 否定/时间范围 | 多意图测试集 |
| 🧠 认知 | 知识图谱关系 | 0 条 | >1000 条 | 边数统计 |
| 🧠 认知 | 自评维度 | 5 维 | 7 维 | SelfCriticService |
| ⚙️ 执行 | 状态管理 | while 循环 | 有向图 + 检查点 | 端到端测试 |
| ⚙️ 执行 | Prompt 迭代 | 人工月级 | 系统周级 | `t_prompt_evolution_history` |
| ⚙️ 执行 | 故障恢复 | 不可恢复 | 100% 可恢复 | `t_agent_checkpoint` |
| 👁️ 感知 | 推送噪声 | 24 条/日 | 3 条/日 | `t_push_history` |
| 👁️ 感知 | 推送时机 | 固定 | 智能 | `t_push_timing_pattern` |
| 通用 | 小云采纳率 | 基线建立中 | +30% | `t_ai_execution_feedback` |
| 通用 | 复杂查询成功率 | 30% | 85% | 多意图组合测试集 |
| 代码 | Orchestrator 行数 | 平均 180 行 | 平均 80 行 | `wc -l` |
| 代码 | Service 层 @Transactional 违规 | 62 处 | 0 处 | 静态扫描 |

---

## 2. 整体架构

### 2.1 3 大智能化引擎

```
                   ┌───────────────────────────┐
                   │   用户输入 / 业务事件      │
                   └───────────┬───────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
   ┌──────────▼────────┐  ┌────▼─────────┐  ┌───▼───────────┐
   │  🧠 认知引擎       │  │ ⚙️ 执行引擎   │  │ 👁️ 感知引擎   │
   │  CognitionEngine   │←→│ ExecutionEng │←→│ PerceptionEng  │
   │                   │  │              │  │               │
   │ ├─ 多意图识别      │  │ ├─ AgentLoop │  │ ├─ 7类风险并行 │
   │ ├─ 知识图谱推理    │  │ │  2.0 图式化 │  │ ├─ 智能合并    │
   │ ├─ 自我批评 7 维   │  │ ├─ 检查点     │  │ └─ 推送时机    │
   │ └─ 跨对话学习      │  │ ├─ 时间旅行   │  │                │
   │                   │  │ └─ Prompt 进化 │  │                │
   └──────────┬────────┘  └──────┬───────┘  └───┬────────────┘
              │                  │              │
              └──────────────────┴──────────────┘
                               │
                   ┌───────────▼───────────────┐
                   │   统一监控层（Langfuse）    │
                   └───────────────────────────┘
```

### 2.2 引擎接口抽象

```java
// 1) 认知引擎接口
public interface CognitionEngine {
    MultiIntentResult recognizeIntent(String query, Long tenantId);
    ReasoningResult reason(KnowledgeContext ctx, String question);
    CriticScore selfEvaluate(AnswerContext ctx);
    CrossDialogLearning loadUserPreference(Long userId);
}

// 2) 执行引擎接口
public interface ExecutionEngine {
    ExecutionResult execute(ExecutionRequest req);
    Checkpoint saveCheckpoint(String threadId, Object state);
    ExecutionResult timeTravel(String threadId, int stepIndex);
    PromptVariant selectBestPrompt(String intent);
}

// 3) 感知引擎接口
public interface PerceptionEngine {
    RiskSet detectAllRisks(Long tenantId);
    RiskSet mergeRisks(List<RiskSet> riskSets);
    PushSchedule schedulePush(RiskSet merged, Long userId);
}
```

### 2.3 双跑安全网（Feature Flag 模式）

```java
@Component
public class IntelligenceFeatureFlag {
    @Value("${intelligence.cognition.enabled:false}")
    private boolean cognitionEnabled;
    
    @Value("${intelligence.cognition.rollout.tenant:internal}")
    private String rolloutTenant;
    
    public boolean useNewCognition(Long tenantId) {
        return cognitionEnabled && isInRollout(tenantId);
    }
}
```

**灰度策略**：内部租户 → 种子租户（5个）→ 50% → 100%，每阶段 3 天观察期

---

## 3. 详细设计

### 3.1 🧠 认知引擎（CognitionEngine）

#### 3.1.1 多意图识别

**当前**：`NlQueryOrchestrator` 35 个意图互斥路由

**升级后**：
```java
@Service
public class MultiIntentRecognizer {
    public MultiIntentResult recognize(String query, Long tenantId) {
        // 1) LLM 多标签分类
        List<IntentCandidate> cands = llmClient.classifyMultiLabel(query, topK=3);
        // 返回：[{intent: "overdue", conf: 0.92}, {intent: "factory_ranking", conf: 0.78}]
        
        // 2) 查询修饰符提取（否定/时间范围）
        QueryModifier mod = modifierExtractor.extract(query);
        // 返回：{timeRange: "last_month", exclude: ["XX 工厂"]}
        
        // 3) 意图组合模板匹配
        return compositionEngine.compose(cands, mod, tenantId);
    }
}
```

**新增表**：
- `t_intent_composition_template`（组合模板）
- `t_nl_query_log`（NlQueryLearningTracker 持久化）

**Flyway 迁移**：V20260601__create_intent_composition_template.sql

#### 3.1.2 知识图谱真实化

**当前**：`KnowledgeGraphOrchestrator.buildGraphFromBusinessData()` 只 upsertEntity，从未 upsertRelation

**升级后**：
```java
@Service
public class KnowledgeGraphBuilder {
    static final List<RelationExtractor> EXTRACTORS = List.of(
        new FactoryProducesOrder(),      // factory → order
        new OrderContainsStyle(),         // order → style
        new StyleRequiresProcess(),       // style → process
        new ProcessDependsOnProcess(),    // process → process
        new SupplierSuppliesMaterial(),   // supplier → material
        new FactoryDeliversShipment(),    // factory → shipment
        new WorkerInspectsQuality(),      // worker → quality
        new OrderBelongsToTenant()        // order → tenant
    );
    
    @Scheduled(cron = "0 0 3 * * ?")  // 凌晨 3 点全量
    public void rebuildFull() {
        truncateEdges();
        for (var extractor : EXTRACTORS) {
            extractor.extract();  // 全量
        }
    }
    
    // Canal 监听业务表 binlog → 增量
    @CanalListener("t_production_order")
    public void onOrderChange(OrderChangeEvent evt) {
        new FactoryProducesOrder().extractIncremental(evt.getOrderId());
    }
}
```

**新增表**（已存在 `t_kg_node/edge`，但需补字段）：
- `t_kg_edge` 增加 `confidence_score` / `extracted_at` / `source_table`

#### 3.1.3 自我进化 7 维

**当前**：`SelfCriticService` 5 维评分

**升级后**：7 维（新增 cross_dialog_learning + user_value）

```java
public CriticScore evaluate(AnswerContext ctx) {
    return CriticScore.builder()
        .dataTruth(0.25)              // 降权
        .toolEfficiency(0.15)         // 降权
        .completeness(0.15)
        .hallucination(0.10)
        .contextUse(0.10)
        .crossDialogLearning(0.15)    // 新增
        .userValue(0.10)              // 新增
        .build();
}
```

**新增数据源**：
- `crossDialogLearning` ← `t_ai_user_profile` + `t_ai_conversation_memory`
- `userValue` ← `t_ai_feedback` + `t_ai_execution_feedback`

---

### 3.2 ⚙️ 执行引擎（ExecutionEngine）

#### 3.2.1 AgentLoopEngine 2.0（图式化）

**当前**：`agent/loop/AgentLoopEngine.java` while 循环

**升级后**：
```java
public class AgentLoopEngineV2 {
    public ExecutionResult execute(ExecutionRequest req) {
        DagGraph graph = DagGraph.builder()
            .addNode("llm_reason", llmReasonNode)
            .addNode("tool_exec", toolExecNode)
            .addNode("critic_review", criticNode)
            .addNode("format_output", formatNode)
            .addEdge("llm_reason", "tool_exec", cond::isToolCall)
            .addEdge("tool_exec", "critic_review", cond::hasResult)
            .addEdge("critic_review", "llm_reason", cond::needMore)
            .addEdge("critic_review", "format_output", cond::isFinal)
            .build();
        
        // 检查点 + 时间旅行
        return graph.executeWithCheckpoint(req);
    }
}
```

**复用现有**：`agent/dag/DagExecutionEngine.java`（已有雏形，扩展为生产级）

**检查点表**（已存在 `t_agent_checkpoint`，补字段）：
- `node_id VARCHAR(128)`
- `edge_id VARCHAR(128)`
- `state_diff MEDIUMTEXT`
- `metadata_json TEXT`
- `step_index INT`
- `status VARCHAR(32)`
- `created_at DATETIME`

#### 3.2.2 Prompt 进化系统

**当前**：单版本 prompt（`xiaoyun-base-prompt.yaml`）

**升级后**：
```java
@Service
public class PromptEvolutionEngine {
    // 5 模板并行（10% 流量）
    public String selectBestPrompt(String intent) {
        List<PromptVariant> variants = registry.getVariants(intent);
        PromptVariant chosen = abTestRouter.route(intent, variants);
        return chosen.render();
    }
    
    // 每周进化
    @Scheduled(cron = "0 0 4 ? * SUN")  // 周日凌晨 4 点
    public void evolve() {
        for (var intent : intents) {
            List<PromptVariant> sorted = registry.getVariants(intent)
                .stream()
                .sorted(Comparator.comparingDouble(PromptVariant::getAdoptionRate).reversed())
                .toList();
            
            // 保留 top-3，淘汰 bottom-2
            registry.keep(sorted.subList(0, 3));
            // 复制 top-1 加微扰生成新变体
            registry.addNew(sorted.get(0).mutate());
        }
    }
}
```

**新增表**：
- `t_prompt_variant`（变体表）
- `t_prompt_ab_log`（A/B 日志）
- `t_prompt_evolution_history`（进化历史）

---

### 3.3 👁️ 感知引擎（PerceptionEngine）

**当前**：20+ 定时任务（ProactivePatrolAgent/AiPatrolJob/SmartRemarkAgent 等）零散执行

**升级后**：
```java
@Service
public class ProactiveRiskEngine {
    public void dailyCheck(Long tenantId) {
        // 1) 7 类风险并行检测
        CompletableFuture<RiskSet> f1 = detectDelayRisk(tenantId);
        CompletableFuture<RiskSet> f2 = detectQualityRisk(tenantId);
        CompletableFuture<RiskSet> f3 = detectCostRisk(tenantId);
        CompletableFuture<RiskSet> f4 = detectMaterialRisk(tenantId);
        CompletableFuture<RiskSet> f5 = detectDeliveryRisk(tenantId);
        CompletableFuture<RiskSet> f6 = detectFactoryRisk(tenantId);
        CompletableFuture<RiskSet> f7 = detectStagnantRisk(tenantId);
        
        RiskSet all = CompletableFuture.allOf(f1,f2,f3,f4,f5,f6,f7)
            .thenApply(v -> RiskSet.merge(f1.join(), f2.join(), ..., f7.join()))
            .join();
        
        // 2) 智能合并（同一订单多风险归并）
        RiskSet merged = merger.merge(all);
        
        // 3) 推送时机
        for (RiskItem item : merged.getItems()) {
            Long userId = item.getAssignee();
            PushSchedule schedule = pushScheduler.schedule(item, userId);
            executor.schedule(() -> doPush(item, userId), schedule.getDelay(), TimeUnit.SECONDS);
        }
    }
}
```

**新增表**：
- `t_push_timing_pattern`（用户推送时间模式）
- `t_push_history`（推送历史）

**推送时机学习**：
- 基于历史 `t_push_history.open_time` 字段，统计每个用户/角色的"最佳接收时间窗口"
- 简单时序模型 + 规则兜底（如"老板 8:00 必推送"）

---

## 4. 兼容性设计

### 4.1 严格向后兼容原则

- **所有现有 API 保留**：Controller 旧端点不变，标记 `@Deprecated`
- **旧路径默认开启**：Feature Flag 默认 `false`，老代码全量走原路径
- **新代码走新接口**：通过 Feature Flag 路由
- **三大命根零改动**：扫码/财务/工资相关代码完全不触碰

### 4.2 Flyway 迁移

仅新增表，不修改既有表：

| 新表 | 用途 |
|------|------|
| `t_intent_composition_template` | 多意图组合模板 |
| `t_nl_query_log` | NlQuery 持久化（替代 ConcurrentLinkedDeque） |
| `t_prompt_variant` | Prompt 变体 |
| `t_prompt_ab_log` | A/B 日志 |
| `t_prompt_evolution_history` | 进化历史 |
| `t_push_timing_pattern` | 推送时间模式 |
| `t_push_history` | 推送历史 |

### 4.3 CI 保护

```bash
# 在 CI 中加入
git diff --name-only HEAD~1 | grep -E "(ScanRecord|wage|payable|Finance|Settlement)" && {
  echo "❌ 禁止触碰三大命根（扫码/财务/工资）"
  exit 1
}
```

---

## 5. 实施步骤（4 阶段、12 周）

### 阶段 1：基础（2 周）
- [ ] 1.1 创建 3 大引擎抽象接口（`CognitionEngine/ExecutionEngine/PerceptionEngine`）
- [ ] 1.2 双跑 Feature Flag 框架（`IntelligenceFeatureFlag`）
- [ ] 1.3 监控埋点统一接入 Langfuse
- [ ] 1.4 CI 保护规则（三大命根不动）
- [ ] 1.5 Flyway 迁移：7 张新表

### 阶段 2：认知引擎（3 周）
- [ ] 2.1 多意图识别器（`MultiIntentRecognizer`）— 2 周
- [ ] 2.2 知识图谱 8 类关系抽取器 — 1 周（并行）
- [ ] 2.3 自我进化 7 维评分 — 1 周（并行）
- [ ] 2.4 NlQuery 持久化（内存→DB）— 1 周（并行）

### 阶段 3：执行引擎（3 周）
- [ ] 3.1 AgentLoopEngine 2.0 图式化（`DagExecutionEngine` 扩展）— 2 周
- [ ] 3.2 检查点 + 时间旅行（`t_agent_checkpoint` 字段补全）— 1 周（并行）
- [ ] 3.3 Prompt 进化系统（5 模板并行 + 周级进化）— 1 周（并行）

### 阶段 4：感知引擎（2 周）
- [ ] 4.1 7 类风险并行检测 — 1 周
- [ ] 4.2 智能合并 + 去重 — 0.5 周
- [ ] 4.3 推送时机学习 — 0.5 周

### 阶段 5：集成演示（2 周）
- [ ] 5.1 5 个业务演示场景（订单查询/扫码分析/工资查询/风险预警/报表生成）
- [ ] 5.2 端到端验证（双跑灰度）
- [ ] 5.3 性能基准测试（重构前 vs 后）
- [ ] 5.4 用户验收（演示给小云使用方）
- [ ] 5.5 老路径下线（灰度 100% 后）

**总计 12 周（含演示和验收）**

---

## 6. 技术选型

| 项 | 选型 | 理由 |
|----|------|------|
| 状态管理 | **自研 DagExecutionEngine**（扩展现有 `agent/dag/`） | 不引入 LangGraph 第三方依赖，保持项目轻量 |
| 图存储 | MySQL `t_kg_node/edge`（已有） | 已有表结构，扩展字段 |
| 监控 | **Langfuse**（已有 `LangfuseTraceOrchestrator`） | 业界标准，2026 事实标准 |
| 多意图分类 | LLM top-K + 后置校验 | 简单可靠，不引入额外 ML |
| A/B 测试 | 新增 `t_prompt_variant/ab_log` | 数据驱动 |
| 推送时机 | 简单时序统计 + 规则兜底 | 平衡 |
| 兼容性 | **严格向后兼容** | 三大命根不动 |

---

## 7. 质量保障

### 7.1 测试矩阵

每能力必须：
- ① 单元测试 ≥80% 覆盖
- ② 集成测试（端到端）
- ③ 性能基准（重构前 vs 后）

### 7.2 灰度发布

```
内部租户(1个) → 种子租户(5个) → 50% → 100%
每阶段 3 天观察期
```

### 7.3 回滚 SLA

- Feature Flag 关闭 → 30 秒内全量回滚到老路径
- 数据快照：每次发布前 `mysqldump`
- 监控告警：核心指标 5 分钟异常立即告警

### 7.4 验收清单

- [ ] 6 大能力全部通过双跑验证
- [ ] 5 个业务演示场景用户验收通过
- [ ] 性能基准达成（响应延迟不增 / 错误率不增）
- [ ] 三大命根路径 100% 回归通过
- [ ] 老路径灰度 100% 后方可下线

---

## 8. 风险与缓解

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| AgentLoopEngine 2.0 改动过大 | 🔴 高 | 双跑 1 个月；老路径保留只读 |
| 知识图谱全量重建耗时 | 🟡 中 | 异步 + 增量（Canal 监听） |
| Prompt A/B 干扰用户体验 | 🟡 中 | 灰度 5%→50%→100% |
| 6 大能力相互依赖失败 | 🟡 中 | 能力独立可降级：感知失败不影响认知 |
| 三大命根被误改 | 🔴 高 | CI 保护：`grep` 强制扫描 |
| 监控缺失无法及时发现问题 | 🟡 中 | 阶段 1 必须先完成监控埋点 |

---

## 9. 后续衔接

A 子项目完成后，**剩余 4 个子项目**按以下顺序串行：

| 子项目 | 主题 | 周期 | 依赖 |
|--------|------|------|------|
| **B** | 数据准确性升级 | 3-4 周 | 依赖 A 的认知引擎 |
| **C** | 代码精简 | 2-3 周 | 依赖 A 的执行引擎 |
| **D** | 架构稳定性 | 2-3 周 | 依赖 A/B/C 完成 |
| **E** | 智能化深度升级 | 6-12 周 | 依赖 A/B/C/D 全部完成 |

---

## 10. 参考资料

- [docs/AI小云迭代升级方案-v1.0.md](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/docs/AI小云迭代升级方案-v1.0.md)（2026-04-30 既有方案）
- [docs/AI升级路线图-v1-20260311.md](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/docs/AI升级路线图-v1-20260311.md)（v1 路线图）
- [.trae/rules/DATA_SAFETY_CHECKLIST.md](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/.trae/rules/DATA_SAFETY_CHECKLIST.md)（多租户数据安全）
- [.trae/rules/optimization-log-20260528.md](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/.trae/rules/optimization-log-20260528.md)（9大Agent升级记录）
- [LangGraph 30k⭐](https://github.com/langchain-ai/langgraph)（业界图式化标准）
- [Langfuse](https://langfuse.com/)（可观测性标准）

---

**文档版本**：v1.0
**待续**：调用 writing-plans skill 产出实施计划
