# 产品上下文 — 服装供应链管理系统

> 本文件由 AI 助手自动维护，记录产品的核心架构与业务模型
> 最后更新：2026-06-19

---

## 一、产品定位

服装行业多租户 SaaS 供应链管理平台，覆盖从款式开发→下单→采购→裁剪→二次工艺→车缝→尾部→入库→发货→财务结算的全链路。

**当前关键指标：**
- 编排器总数：284
- Service 总数：229
- Agent 工具总数：105
- 核心模块：intelligence > production > finance > system

---

## 二、技术栈

| 层 | 技术 |
|----|------|
| 后端 | Spring Boot 3.4.5 + MyBatis-Plus + MySQL 8.0（Docker 3308） |
| 前端 | React 18 + TypeScript + Ant Design 5.22 + Vite |
| 小程序 | 微信原生 + 共享 `miniprogram/shared/` 模块 |
| H5 | React + Vite（供应商/CRM 客户端 |
| 缓存 | Redis（Lettuce） |
| 消息 | SSE 流式（AI 对话） |
| AI | 小云 AI：SSE 流式对话 + 多 Agent 编排 + 105 工具调用 |
| 部署 | 腾讯云 CloudBase + GitHub Actions CI/CD |
| MCP | 内置 mcp-Filesystem / mcp-Sequential_Thinking / mcp-context7 / mcp_docker / integrated_browser |

---

## 三、核心业务模块

| 模块 | 关键实体 | 核心流程 |
|------|---------|---------|
| 款式管理 | StyleInfo, StyleBom | 款式创建→BOM 生成→选品 |
| 生产订单 | ProductionOrder | 下单→工序分配→进度跟踪→完工 |
| 物料管理 | MaterialPurchase, MaterialStock | 采购→入库→领料→退料 |
| 裁剪管理 | CuttingTask, CuttingBundle | 裁剪任务→扎捆→扫码 |
| 扫码系统 | ScanRecord | 生产扫码→质检扫码→入库扫码 |
| 入库管理 | ProductWarehousing | 成品入库→订单联动 |
| 财务管理 | WagePayment, ShipmentReconciliation | 工资结算→发货对账 |
| 智能系统 | AiAgentOrchestrator | 小云 AI→工具调用→巡检→自进化 |
| **AI 对话** | AiConversation, AiMessage, AgentCheckpoint | SSE 流式对话→AgentLoop 循环→工具执行→输出 |
| **AI 记忆** | AiLongMemory, EntityMemory, SystemPatternMemory | 工作中→情景→语义→长期四层记忆 |
| **AI 自进化** | SelfCriticService, EvolutionOrchestrator | 自我评分→上下文优化→组件指标汇总 |
| **MCP 能力** | McpProtocolService, McpSseController | 5 个 MCP Servers + 资源暴露 + 工具调用 |

---

## 四、架构分层（铁律 —— D-001）

```
Controller（纯参数校验 + 调用 Orchestrator）
         ↓
Orchestrator（事务边界 —— @Transactional 唯一位置
         ↓
Service（纯业务逻辑，禁止互调，禁止 @Transactional
         ↓
Mapper / Repository（DB 操作
         ↓
Helper / Resolver（无状态工具类，从厚方法拆薄
```

**核心规则：**
- Orchestrator：唯一事务边界，编排多个 Service
- Service：纯业务逻辑，禁止互调，禁止加 @Transactional
- Controller：参数校验 → 调 Orchestrator → 返回 Result
- Helper/Resolver：无状态工具类，从 Orchestrator/Service 拆薄而来

---

## 五、小云 AI 系统架构（2026-06-18 最新版）

### 5.1 主链路

```
用户消息
   ↓
AiAgentOrchestrator（主编排，QuickPath vs AgentLoop 决策
   ├─ QuickPath（快速通道，≤3 个工具）
   │   └─ SelfCritiqueGate → PASS/SOFT_FAIL/HARD_FAIL
   │
   └─ AgentLoopEngine（完整 Agent 循环
        ├─ AgentPlan → 规划执行
        ├─ 105 Agent Tools（并发 ≤5，含内部工具 > 知识库 > web_search）
        ├─ AgentCheckpointManager（异步 Checkpoint 持久化
        ├─ SelfCriticService（7 维评分：relevance/accuracy/tone/privacy/tenant-isolation/timeliness/format）
        ├─ DataTruthGuard（5 级验证：trustScore 0-100）
        └─ SelfCritiqueGate（输出前硬门控）
            ├─ PASS（score ≥75）→ 原样输出
            ├─ SOFT_FAIL（score ≥60）→ 加免责声明
            └─ HARD_FAIL（score <60）→ 返回 fallback 文本
```

### 5.2 后处理异步链路（PostTurnHooks —— 不阻塞主流程

| Hook | 职责 |
|------|------|
| RealTimeLearningLoop | 实时学习闭环 |
| MemoryBankService | 记忆银行持久化 |
| SkillAutoCreationService | 技能自动生成 |
| SessionSearchService | 会话搜索索引 |
| DynamicFollowUpEngine | 动态 FollowUp 建议（Deprecated，已移除 |
| AiMetricsOrchestrator | 指标汇总快照（需 @Transactional |

### 5.3 SelfCritiqueGate（P0-1 新增

三档决策：PASS / SOFT_FAIL / HARD_FAIL

接入位置：AgentLoopEngine.handleFinalAnswer() 之前（Critic 改写后、DataTruthGuard 之前

### 5.4 Memory Limitations 上下文块（P0-2 新增

AiAgentPromptHelper.assemblePrompt() 加入显式记忆边界声明：
1. 你的记忆仅限于四层记忆系统中存储的内容
2. 如果不确定是否记得，说"我需要查询"而非"我记得"
3. 禁止编造历史对话内容
4. 跨会话记忆可能不完整，重要信息请用户确认

### 5.5 响应延迟优化（P0-3 完成

5 项 PostTurnHooks 改为异步（RealTimeLearningLoop / MemoryBankService / SkillAutoCreationService / SessionSearchService
线程池扩容 4-8 → 8-16，队列 32 → 64
语义缓存阈值 0.92 → 0.86

### 5.6 HIGH_RISK 工具 opt-in + 反例规则（P1-1 完成

- TTL 60L → 300L（5 分钟思考时间
- 结构化 suggest payload
- 7 条反例规则：禁伪造工具输出、禁重复已忽略建议、禁 withholding 答案施压、禁拆分操作绕过确认、禁编造工具能力、禁忽略工具错误、禁在确认环节长篇大论

### 5.7 意图动态优先级（P1-2 完成

IntentBasedPriorityRouter：根据用户意图动态调整低优先级块列表

| 关键词 | 保护块（不缩减 |
|--------|--------------|
| 订单/款号/历史上次 | entityMemory |
| 排产/产能/进度/交期/工厂 | factoryProfile |
| 知识/规则/流程/SOP | ragContext |
| 趋势/分析/预测/对比 | graphRag + masInsight |
| 建议/推荐/下一步 | selfCritique |
| 之前/上次/历史/记住 | longTermMem |

### 5.8 MCP Resources（P2-2 完成

- McpCapabilities.resources=true
- 3 个 ResourceProvider：MemoryBankResourceProvider / KnowledgeBaseResourceProvider / FactoryProfileResourceProvider
- URI 前缀：memory:// / knowledge:// / factory://
- 多租户隔离：每个 list/read 都带 tenantId 校验

---

## 六、部署架构（最新）

- 后端：腾讯云 CloudBase（Docker）
  - cloudbaserc.json 必须显式配置探针：InitialDelaySeconds: 300, PeriodSeconds: 30, TimeoutSeconds: 10, FailureThreshold: 5
  - docker-entrypoint.sh 去掉 socat 代理层（D-016
  - 容器内网络目标地址必须用 `127.0.0.1`，禁止用 `localhost`（D-015
  - Spring Boot 直接监听 PORT 环境变量
- 前端：腾讯云 CDN + nginx SPA
- 数据库：Docker MySQL 8.0（端口 3308
- CI/CD：GitHub Actions → 自动部署 → 部署后冒烟测试（python3 scripts/postdeploy-smoke-test.py）
- 回滚机制：GitHub Actions 手动回滚到上一个 commit

---

## 七、6 大父进度节点

采购 → 裁剪 → 二次工艺 → 车缝 → 尾部 → 入库

子工序映射优先级：模板 `progressStage` > `t_process_parent_mapping` DB > 兜底

---

## 八、多租户隔离（P0 铁律

- 所有查询必须带 tenant_id
- 工厂工人只能看自己工厂数据
- `TenantAssert.requireTenantId()` 关键路径强制调用
- AI 记忆系统（L1-L4）每层都必须带 tenant_id 隔离
- MCP Resources 必须校验资源归属当前租户
- 绝对禁止跨租户数据访问

---

## 九、关键决策引用

| 决策号 | 标题 | 何时生效 |
|--------|------|---------|
| D-001 | 事务边界仅在 Orchestrator 层 | 永久 |
| D-008 | 原子 SQL 替代 read-modify-write | 永久 |
| D-012 | 前端字段名与后端 Entity 完全一致 | 永久 |
| D-013 | Controller 层写操作必须有事务保护（必须走 Orchestrator | 永久 |
| D-014 | 所有读接口必须校验资源租户归属 | 永久 |
| D-015 | 容器内禁止用 localhost（必须用 127.0.0.1 | 永久 |
| D-016 | 去掉不必要的 socat 代理层 | 永久 |
| D-018 | CloudBase 探针配置强制入版本控制 | 永久 |
| D-019 | 禁止 socat 做探针作弊 | 永久 |
| D-020 | MCP resources 多租户隔离 | 永久 |
| D-021 | 自我进化组件统一可观测 | 永久 |

完整决策日志见 `memory-bank/decisionLog.md
