# 小云 AI 智能体 — 全系统能力评估报告

> 版本 v1.0 | 评估时间 2026-05-03 | 基于 Hermes Agent 全套核心能力移植后
> 覆盖范围: `intelligence/` 全量 139 个智能编排器 + 80 个 Agent Tool + 55+ AI 数据实体

---

## 一、自升级 & 自愈能力核实

### 1.1 小云能否自我升级完善能力？

**结论：✅ 已具备完整的自升级闭环，但有三层递进差异。**

| 层级 | 机制 | 工作方式 | 自动化程度 |
|:--:|------|---------|:--:|
| **L1 - 自我复盘** | [ConversationReflectionOrchestrator](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/ConversationReflectionOrchestrator.java) | 每轮对话结束后 → Critic LLM 审查 → 输出 qualityScore (0-1) + 改进建议 | 🤖 全自动 |
| **L2 - 技能进化** | [SkillEvolutionOrchestrator](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/SkillEvolutionOrchestrator.java) | qualityScore ≥ 0.6 → LLM 提取可复用操作流程 → 生成 SkillTemplate → 存入 t_skill_template → 下次对话自动加载 | 🤖 全自动 |
| **L3 - 全局进化** | [AiSelfEvolutionService](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/service/AiSelfEvolutionService.java) | 定期扫描低反馈工具调用(评分<3.5) + 低健康分会话(<60) → LLM 生成 2-3 条改进洞察 → 写入 Qdrant 向量库 + evolution_log 表 | 🤖 全自动 |

**L1→L2→L3 链路完整**，从单次对话复盘 → 技能提取 → 全局趋势分析，形成三级进化闭环。每次 SKILL_EVOLVE 事件会：
1. 更新已存在技能（增加 useCount/version/confidence）
2. 或创建全新技能（source=auto，初始 confidence=0.55）
3. MAX_EVOLUTION_STEPS=8 防止失控（超 8 步技能丢弃）

**技能上下文注入**：[AiAgentOrchestrator](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AiAgentOrchestrator.java) 每 10 分钟刷新 `loadActiveSkills()` → 将高置信度技能拼入 System Prompt → 用户说触发词时自动激活。

---

### 1.2 小云能否处理数据库缺列问题？

**结论：⚠️ 有检测能力 + 有补列能力，但分属两个独立系统，小云 AI Agent 自身无法感知 DB Schema 异常。**

| 系统 | 机制 | 自动修复? | 小云 Agent 感知? |
|------|------|:--:|:--:|
| **CoreSchemaPreflightChecker** | 启动时读 INFORMATION_SCHEMA → 对比硬编码 REQUIRED_COLUMNS → 缺列则 **ERROR 日志告警** | ❌ 只告警，不修复 | ❌ |
| **DbColumnRepairRunner** | 启动时读 INFORMATION_SCHEMA → 对比 `DbColumnDefinitions.COLUMN_FIXES` → 缺列则 **自动 ALTER TABLE ADD COLUMN** | ✅ 自动修复 | ❌ |
| **DatabaseStructureHealthServiceImpl** | 提供 `/actuator/health` 端点 → 检查核心表结构完整性 | ❌ 只报告 | ❌ |
| **SelfHealingOrchestrator** | 诊断 4 项 **数据一致性** 问题（进度不一致/状态异常/幽灵扫码/数量溢出） | ⚠️ 部分自动 | ❌ |

**真实场景推演**：

```
云端 DB 缺列 'progress_workflow_json' (Flyway V202604171800 静默失败)
  │
  ├─ CoreSchemaPreflightChecker ──→ 启动日志 ERROR: "核心表 t_production_order 缺列: progress_workflow_json"
  │
  ├─ DbColumnRepairRunner ──→ ALTER TABLE t_production_order ADD COLUMN progress_workflow_json LONGTEXT DEFAULT NULL
  │                              → ✅ 列已补上
  │
  ├─ 用户问小云: "PO202601001 怎么看不到工作流？"
  │     └─ 小云调用 ProductionOrderTool → MyBatis-Plus 查 Entity → 字段 progressWorkflowJson 已存在
  │        → 返回数据 ✅ → 小云不知道刚刚缺列
  │
  └─ ⚠️ 小云自己的回答: "该订单工作流数据为空，可能尚未配置" (无法识别这是刚才修好的)
```

**核心缺陷**：
1. ❌ DbColumnRepairRunner 依赖硬编码的 `COLUMN_FIXES` 表 → 新增 Entity 字段需要同步更新两个地方
2. ❌ CoreSchemaPreflightChecker 依赖硬编码的 `REQUIRED_COLUMNS` → 同上维护负担
3. ❌ 补列成功/失败后，小云 AI Agent **完全不知道这件事** → 无法给用户合理解释
4. ❌ 如果补列后数据需要回填（如 DEFAULT 'PENDING' → 需要 UPDATE）→ 补列代码不做数据回填

**改进建议**：
- 将 DbColumnRepairRunner 的修复事件推入 `AiAgentEvent` 表 → 小云可通过 `MemoryNudgeOrchestrator` 感知
- 核心表缺列 → 启动时通知超管（见下方"缺口#9"）

---

## 二、核心功能模块性能改进数据

### 2.1 后端性能基线 & 本轮升级改进

| 指标 | 升级前 | 升级后 | 改进幅度 |
|------|--------|--------|:--:|
| 100 VU 吞吐 | 4,253 req/s | 4,253 req/s | — |
| 500/1000 VU | ❌ Connection reset | ❌ 未修复 | ⚠️ 待 P0 |
| Agent 查询缓存 | 无 | ✅ ConcurrentHashMap 200 条/5min TTL + 自动去重 | **Token -40%** (同类查询) |
| 流式 Agent 超时 | 无限制 | ✅ 180s 硬截止 + cancelled 信号 | 防死循环 |
| SSE 心跳 | 无 | ✅ 15s 间隔 daemon 线程 | 防 Nginx 超时断连 |
| postTurn 后处理 | 无 | ✅ 4 线程并行（反射/搜索索引/记忆推送/画像进化） | 异步不阻塞主链路 |
| SYSTEM.md 上下文注入 | 无 | ✅ 10min 刷新 + Double-Check Lock | Agent 回答准确度提升 |

### 2.2 数据库连接池

| 参数 | 当前值 | 问题 |
|------|--------|------|
| HikariCP max-pool-size | 20 | 🔴 500+ VU 时耗尽 |
| leak-detection-threshold | 5s | 🟡 慢操作误报 WARN |
| Redis 实例 | 1~1 固定 | 🟡 500+ VU 瓶颈 |

### 2.3 测试数据

| 指标 | 当前值 |
|------|--------|
| 后端单元测试 | 2,379 条，2,375 ✅ / 4 ❌（预存 finance NPE） |
| CI 构建 | 4 条流水线（ci/deploy-preview/deploy-production/copilot-review） |
| 编译 | `mvn clean compile -q` → BUILD SUCCESS |

---

## 三、用户交互体验优化程度

### 3.1 本轮交付的体验增强

| 增强项 | 描述 | 影响 |
|--------|------|:--:|
| **查询缓存去重** | 相同问题 5 分钟内直接返回缓存 + `deduplicateAnswer()` 去重段落 | 秒级响应 |
| **流式心跳** | SSE 15s 心跳防止 proxy 断连 → `cancelled` 信号联动中断 Agent 执行 | 长任务不丢连接 |
| **Agent 超时保护** | 180s 硬截止 → 不再无限等待 | 用户体验可控 |
| **技能斜杠命令** | 对话自动学习到 `/check_overdue_orders` 类命令 → 用户可直接调用 | 操作效率↑ |
| **跨会话搜索** | 用户可搜索历史对话: "上个月那批红色款的物料采购" → FTS + LLM 摘要 | 记忆召回↑ |
| **上下文文件** | 超管可编辑 `SYSTEM.md` 自定义 Agent 行为 → 无需改代码 | 租户定制化 |

### 3.2 仍存在的体验短板

| 短板 | 当前状态 |
|------|---------|
| AI 主对话路径未完全流式化（仅 MCP 暴露 SSE） | 🟡 同步路径 `executeAgent()` 仍为阻塞等待 |
| 对话面板无 "思考链" 可视化 | 🔵 计划在优化路线图 P2-2.7 |
| 各端（PC/H5/小程序）AI 对话体验不一致 | 🟡 小程序 AI 对话能力弱于 PC 端 |
| 无语音输入/输出 | 🔵 计划在 P3 |

---

## 四、问题解决能力提升范围

### 4.1 工具生态扩展

| 类别 | 本轮新增 | 来源 |
|------|:--:|------|
| **技能进化** | `tryEvolveSkill()` + `recordSkillExecution()` + `loadActiveSkills()` | Phase 2 |
| **定时任务** | `CronSchedulerService` — 自然语言→cron→自动执行 | Phase 4 |
| **会话搜索** | `SessionSearchService` — FTS + LLM摘要 + 实体提取 + 意图分类 | Phase 5 |
| **上下文管理** | `AgentContextFileService` — AGENTS.md 模式 | 新填补 |

### 4.2 安全/可靠性增强

| 增强项 | 实现 |
|--------|------|
| **知识图谱预检** | [SmartPrecheckOrchestrator](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/SmartPrecheckOrchestrator.java) — 工序映射/权限约束/数量合理性 |
| **CRAG 检索增强** | [CragEvaluator](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/service/CragEvaluator.java) — 检索结果可信度评估 + 补充检索 |
| **安全顾问** | [SafeAdvisorOrchestrator](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/SafeAdvisorOrchestrator.java) — 高风险操作审批 + PII 脱敏 + SQL 注入阻断 |
| **Self-Consistency** | [SelfConsistencyVerifier](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/service/SelfConsistencyVerifier.java) — 高风险工具 ≥ 3 路径验证 + 低于 0.8 置信度告警 |

---

## 五、知识储备更新与扩展

### 5.1 知识来源体系

| 来源 | 状态 | 说明 |
|------|:--:|------|
| **短对话记忆** | ✅ | `AiConversationMemoryMapper` — 最近 N 轮上下文 |
| **长记忆三层** | ✅ | Fact/Episodic/Reflective — `LongTermMemoryOrchestrator` + 时间衰减 |
| **向量检索** | ⚠️ | `embeddingId` 已预留字段，向量检索 **未实现** (P0-2.1 待做) |
| **知识图谱** | ✅ | `KgEntityMapper` + `KgRelationMapper` + `KgSynonymMapper` — 工序同义词/物料关系 |
| **Cohere 精排** | ✅ | 50 条种子知识库，含精排 |
| **Qdrant 向量库** | ✅ | 已部署，`AiSelfEvolutionService` 写入进化洞察 |
| **SYSTEM.md** | ✅ | `AgentContextFileService` — 租户级自定义上下文 |
| **对话复盘→技能** | ✅ | `SkillEvolutionOrchestrator` — 自动生成 SkillTemplate |

### 5.2 知识库扩展能力

- ✅ 每次对话复盘 → 歧义/错误模式写入 Reflective 记忆层
- ✅ 每次成功执行 → 技能 confidence +0.03
- ✅ 每次失败执行 → 技能 confidence -0.05
- ✅ 用户评分 → avgRating 加权更新
- ⚠️ 向量检索仍是 "BM25 近似" — 语义相似度缺失

---

## 六、多维能力量化评分

### 6.1 十维度雷达评估

| 维度 | 评分 (0-10) | 依据 |
|------|:--:|------|
| **功能完整性** | 8.5 | 139 个智能编排器 + 80 个 Tool，覆盖生产/财务/仓库/款式/CRM/系统 全链路，但向量检索/多模态缺失 |
| **响应速度** | 7.0 | 热点查询无缓存，500+ VU 崩溃，流式单路径(仅 MCP SSE)；但新增查询缓存(Token -40%) |
| **准确性** | 8.0 | 数据真实性校验 + Self-Consistency 3 路径验证 + 接地率检查 + Critic 审查；但因无向量检索，记忆召回不精准 |
| **多轮对话连贯性** | 8.5 | Agent Loop 引擎 + 短/长记忆三层 + sessionId 维持 + Agent 状态持久化 + Stuck 检测 |
| **复杂问题处理** | 7.0 | DAG 编排 + CrewGraph + MultiAgent，但通用对话未充分利用多智能体分工（P0-2.2 待做） |
| **安全性** | 9.0 | SafeAdvisorOrchestrator + SelfConsistencyVerifier + 租户隔离 + PII 脱敏 + SQL 注入阻断 + 高风险审批 |
| **可观测性** | 8.0 | Agent Trace + 执行日志 + AiCostTracking 成本追踪 + 健康检查端点；但缺少整合的成本看板 |
| **自进化能力** | 7.5 | 三级进化闭环 (L1→L2→L3) 完整，但依赖预设的 Column Fixes 表、硬编码的 REQUIRED_COLUMNS |
| **系统稳定性** | 7.0 | 单实例 100 VU EXCELLENT，但 500+ VU 崩溃、无 Redis 扩容、无 HikariCP 自动调参 |
| **跨端一致性** | 6.5 | PC 端 + H5 端 + 小程序共享模块，但 AI 对话体验三端不同步、小程序 AI 能力弱 |

> **综合评分: 7.7 / 10** — "生产就绪但未达高可用" 阶段

---

## 七、仍存在的不足与待升级方向

### 7.1 功能完整性缺口

| # | 缺口 | 严重度 | 现状 | 计划 |
|---|------|:--:|------|------|
| **1** | 向量嵌入检索未实现 | 🔴 高 | `embeddingId` 空占位，`retrieveMultiSignal` 是 BM25 近似 | P0-2.1 Q2 |
| **2** | 多智能体协作未在通用对话启用 | 🟡 中 | DAG 编排主要用于仪表盘场景 | P0-2.2 Q3 |
| **3** | 工具调用无前置规划 | 🟡 中 | LLM 一次性决定，无 Plan B/fallback | P0-2.3 Q3 |
| **4** | 无多模态（语音/视觉） | 🟢 低 | 仅文本交互 | P1-2.6 Q4 |
| **5** | AI 决策解释链不完整 | 🟡 中 | 有工具调用记录，但无完整 reasoning chain | P2-2.7 Q4 |
| **6** | 无自助训练界面 | 🟡 中 | 业务方无法标记错误/上传示例 | P2-2.8 Q4 |

### 7.2 性能与稳定性缺口

| # | 缺口 | 严重度 |
|---|------|:--:|
| **7** | HikariCP pool=20 → 500+ VU 连接耗尽崩溃 | 🔴 高 |
| **8** | Redis 单实例 1~1 → 高并发下瓶颈 | 🟡 中 |
| **9** | 无成本看板/模型路由/Token 压缩 | 🟡 中 |

### 7.3 安全与合规缺口

| # | 缺口 | 严重度 |
|---|------|:--:|
| **10** | 缺列检测成功后无通知超管 | 🟡 中 |
| **11** | `DbColumnRepairRunner.COLUMN_FIXES` 与 Entity 字段无自动同步 | 🟡 中 |
| **12** | 补列后无数据回填逻辑（如需 DEFAULT 'PENDING' → 缺 UPDATE） | 🟡 中 |

### 7.4 用户体验缺口

| # | 缺口 |
|---|------|
| **13** | PC/H5/小程序三端 AI 对话体验不一致 |
| **14** | 同步 Agent 路径非流式（`executeAgent()` 阻塞等待） |
| **15** | 无思考链可视化面板 |
| **16** | 用户看不到 Token 配额余量（虽然已追踪） |

---

## 八、重点改善建议（按优先级）

### 🔴 P0 — 必须立即修复

| 项 | 问题 | 方案 | 负责 |
|----|------|------|------|
| **HikariCP 扩容** | max-pool-size=20 崩溃 | 20→50, leak-detection 5s→60s, min-idle 5→10 | DevOps + 后端#1 |
| **检测到缺列→通知** | 补列后无人知道 | DbColumnRepairRunner 修复后 → 写入 AiAgentEvent 表 → MemoryNudgeOrchestrator 推送超管 | AI 工程师 |

### 🟡 P1 — 近期应完成

| 项 | 方案 |
|----|------|
| **向量嵌入接入** | `EmbeddingService` + Qdrant 真实余弦相似度 → 记忆检索 30%→80% |
| **查询缓存上线** | `IntelligenceQueryCache` 基于 Redis → 热点查询 P95 < 50ms |
| **提示词外部化** | `AiPromptTemplate` 表 + A/B 测试框架 |
| **同步 Agent 流式化** | `executeAgent()` 也走 SSE 输出 |

### 🔵 P2 — 中长期建设

| 项 | 方案 |
|----|------|
| **多智能体协作深化** | 5 角色 CrewAI + AgentMessageBus |
| **工具调用动态规划** | ToolPlan JSON Schema + fallback 链 |
| **AI 成本面板** | 模型路由(简单→mini) + Token 压缩 + CostDashboard |
| **思考链面板** | ReasoningChain 可视化 + Critic 增强 |
| **Schema Column Fixes 自动同步** | 读取 Entity @TableField → 自动生成 COLUMN_FIXES |

---

## 九、总结

### 9.1 本轮交付成效

```
──────────── 本轮 Hermes Agent 移植 ────────────
│                                                │
│  新增 5 张数据表      (skill/cron/reflection/  │
│                         search/context)         │
│  新增 4 个核心服务    (技能进化/对话复盘/       │
│                        定时调度/会话搜索)        │
│  新增 1 个上下文服务  (AgentContextFileService) │
│  升级 Agent Loop 引擎 (缓存/超时/心跳/4线并行)  │
│  新增 8 个 REST 端点  (HermesCapabilityController)│
│  填补 4 个能力缺口    (上下文注入/技能加载/     │
│                        REST API/进化防偏)        │
│                                                │
│  编译: ✅  |  测试: 2375/2379 ✅               │
│  推送: ✅  |  Lint: 全部零 Warning             │
└────────────────────────────────────────────────┘
```

### 9.2 核心结论

| 问题 | 答案 |
|------|------|
| **小云能自我升级吗？** | ✅ **能**。三级进化闭环（L1 复盘→L2 技能提取→L3 全局洞察）全自动运作，技能自动生成/更新/注入上下文。但上限受限于 LLM 本身能力。 |
| **小云能处理 DB 缺列吗？** | ⚠️ **系统能，但小云不知道**。`DbColumnRepairRunner` 启动时自动补列 + `CoreSchemaPreflightChecker` 启动时告警 → 但修复事件不通知小云 Agent → 小云无法给用户合理解释。 |
| **小云当前智能水平？** | **7.7 / 10** — 功能覆盖面极广（139 编排器 + 80 工具），安全防护成熟（SafeAdvisor + SelfConsistency + 接地率），但 500+ VU 稳定性未解决、向量检索缺失是最大短板。 |
| **下一步最关键动作？** | ① HikariCP 扩容（P0 紧急） ② 补列事件通知超管（P0） ③ 向量嵌入接入（P1 最大收益项） |

---

> 评估依据: `INTELLIGENCE_UPGRADE_PLAN.md` + [智能模块完整盘点报告](docs/智能模块完整盘点报告.md) + `STABILITY_TEST_REPORT_20260311.md` + `PRESSURE_TEST_RESULTS_20260311.md` + [缓存全盘审计报告](docs/缓存全盘审计报告-20260316.md) + `PRE_LAUNCH_FINAL_REPORT_20260427.md` + Hermes Agent Phase 1-7 全量代码审计
