# 小云 Hermes Agent 架构设计

> **版本**：v1.0  
> **日期**：2026-05-07  
> **定位**：工具链 / 工作流自动化引擎，聚焦 API 调用与终端命令  
> **对比范式**：Agent-S（simular-ai/Agent-S）— GUI / 全系统自动化智能体

---

## 一、为什么选择 Hermes 而非 Agent-S

| 维度 | Agent-S（GUI 自动化） | Hermes Agent（工具链自动化）← 我们的路线 |
|------|----------------------|----------------------------------------|
| 核心定位 | 模拟人类操作电脑，截图+视觉识别 | 通过 API / 工具调用 / 代码执行完成任务 |
| 自动化方式 | 屏幕截图 → 视觉识别 → 鼠标键盘操作 | 终端命令、API 调用、工具链编排 |
| 典型场景 | 办公软件操作、网页表单填写、RPA 替代 | 定时任务调度、数据处理、API 工作流、业务编排 |
| 上手门槛 | 低，自然语言即可 | 中，需理解工具调用与技能机制 |
| 稳定性 | 依赖界面识别，页面结构变化即崩 | 依赖 API / 命令行，接口不变则稳如磐石 |
| 可扩展性 | 受限于界面识别能力 | MCP 协议 + 子 Agent + 自定义技能库，扩展性极强 |
| 记忆与迭代 | 记录操作轨迹，优化界面操作步骤 | 自动提炼任务为可复用技能，跨会话持续迭代 |

**选择 Hermes 的核心理由**：

1. **服装供应链是结构化业务**——订单、工序、物料、财务全部有 API 和数据库，不需要"看屏幕"
2. **稳定性是生命线**——工厂工人扫码、财务审批、仓库入库，界面识别方案一个像素偏移就崩
3. **技能可复用**——"查询逾期订单并催办"这个技能，提炼一次，所有租户永久受益
4. **跨会话进化**——每次对话都在积累经验，技能 confidence 逐步收敛，而非每次从零开始

---

## 二、Hermes Agent 架构全景

```
┌─────────────────────────────────────────────────────────────────────┐
│                        用户消息入口                                  │
│   PC端 SSE / 小程序 WebSocket / MCP 客户端 / A2A 协议 / 定时触发     │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   AiAgentOrchestrator（总指挥）                       │
│   ┌──────────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
│   │  QuickPath    │  │  QueryCache  │  │  PostTurnHooks          │  │
│   │  快速通道判断  │  │  查询缓存    │  │  自我批评/学习/记忆进化  │  │
│   └──────┬───────┘  └──────────────┘  └─────────────────────────┘  │
└──────────┼──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│               AgentLoopContextBuilder（上下文装配）                    │
│   ┌────────────────┐ ┌───────────────┐ ┌────────────────────────┐  │
│   │ DomainRouter   │ │ ToolAccess    │ │ ToolAdvisor            │  │
│   │ 领域路由裁剪    │ │ 权限过滤      │ │ PRM 排序 + 语义匹配    │  │
│   └────────────────┘ └───────────────┘ └────────────────────────┘  │
│   ┌────────────────┐ ┌───────────────┐ ┌────────────────────────┐  │
│   │ PromptBuilder  │ │ MemoryHelper  │ │ ContextFileService     │  │
│   │ 系统提示词构建  │ │ 对话历史压缩  │ │ 租户级上下文文件注入    │  │
│   └────────────────┘ └───────────────┘ └────────────────────────┘  │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  AgentLoopEngine（ReAct 循环核心）                     │
│                                                                      │
│   while(iteration < maxIterations):                                  │
│     ① LLM 推理 → AiInferenceRouter（多模型路由）                     │
│     ② 解析工具调用 → AiToolCall                                      │
│     ③ 并发执行工具 → AiAgentToolExecHelper                           │
│        ├── 幂等保护（60s 内同租户同工具同参数复用）                    │
│        ├── 超时控制（@AgentToolDef.timeoutMs）                       │
│        ├── 补偿事务记录（CompensatingTransactionManager）             │
│        └── 证据提取（工具返回结果标记为 evidence）                    │
│     ④ Stuck 检测（A-B-A-B 振荡 + 连续相同签名终止）                  │
│     ⑤ 检查点保存（AgentCheckpoint，支持断点恢复）                     │
│     ⑥ Token 预算检查（30000 上限）                                   │
│                                                                      │
│   → 最终答案经过质量保障层后输出                                      │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     质量保障层（零幻觉输出）                           │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐   │
│   │ AiCritic     │ │ DataTruth    │ │ EntityFactChecker        │   │
│   │ 审查修订      │ │ Guard 5级    │ │ 实体事实校验              │   │
│   └──────────────┘ └──────────────┘ └──────────────────────────┘   │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐   │
│   │ Grounded     │ │ SelfConsist  │ │ StatusTranslator         │   │
│   │ 证据守卫      │ │ ency 验证    │ │ 状态码精确翻译            │   │
│   └──────────────┘ └──────────────┘ └──────────────────────────┘   │
└──────────┬──────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│              triggerPostTurnHooks（异步后处理，不阻塞主流程）          │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐   │
│   │ SelfCritic   │ │ RealTime     │ │ DynamicFollowUp          │   │
│   │ 5维度评分     │ │ LearningLoop │ │ Engine 动态跟进建议      │   │
│   └──────────────┘ └──────────────┘ └──────────────────────────┘   │
│   ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐   │
│   │ MemoryNudge  │ │ UserProfile  │ │ ConversationReflection   │   │
│   │ 记忆提醒      │ │ Evolution    │ │ → SkillEvolution 技能进化│   │
│   └──────────────┘ └──────────────┘ └──────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 三、六大核心子系统

### 3.1 工具系统（Tool System）— Hermes 的手

Hermes 不操作界面，它调用工具。82 个 AgentTool 覆盖全部业务域。

#### 工具层次结构

```
AgentTool（接口）
  └── AbstractAgentTool（抽象基类，335行）
        ├── 租户隔离（自动注入 tenantId）
        ├── 权限校验（@PreAuthorize 集成）
        ├── 参数验证（JSON Schema 校验）
        ├── 超时控制（@AgentToolDef.timeoutMs）
        ├── 审计日志（每次执行记录 t_agent_event）
        ├── 幂等保护（60s 内同签名复用）
        └── 补偿事务（CompensableTool 接口）
```

#### 7 大业务领域 × 82 个工具

| 领域 | ToolDomain | 工具数 | 代表工具 |
|------|-----------|--------|---------|
| 生产 | PRODUCTION | 12 | ProductionProgressTool、QualityInboundTool、ScanUndoTool、OrderBatchCloseTool |
| 订单 | PRODUCTION | 10 | OrderEditTool、OrderFactoryTransferTool、ProductionOrderCreationTool、NewOrderSimulationTool |
| 财务 | FINANCE | 8 | FinanceWorkflowTool、FinancialPayrollTool、PayrollApproveTool、ShipmentReconciliationTool |
| 仓储 | WAREHOUSE | 14 | WarehouseStockTool、MaterialReceiveTool、MaterialPickingTool、InventoryCheckTool |
| 款式 | STYLE | 11 | StyleInfoTool、StyleQuotationTool、SampleWorkflowTool、SecondaryProcessTool |
| 分析 | ANALYSIS | 11 | DeepAnalysisTool、DelayTrendTool、SmartReportTool、WhatIfSimulationTool |
| 系统 | SYSTEM | 16 | OrgQueryTool、DictTool、SupplierTool、CrmCustomerTool、EcommerceOrderTool |

#### 工具定义注解

```java
@AgentToolDef(
    name = "query_production_progress",
    description = "查询生产订单的工序进度、扫码记录和完成率",
    domain = ToolDomain.PRODUCTION,
    timeoutMs = 15000,
    readOnly = true
)
public class ProductionProgressTool extends AbstractAgentTool { ... }
```

#### MCP 协议（Model Context Protocol）

Hermes 通过 MCP v2024-11-05 暴露工具能力，支持外部 AI 客户端直接调用：

```
POST /api/intelligence/mcp/initialize   → 能力声明
POST /api/intelligence/mcp/tools/list   → 工具列表 + JSON Schema
POST /api/intelligence/mcp/tools/call   → 工具调用执行
```

MCP 工具自动扫描：`@McpToolAnnotation` 标注的工具自动注册到 MCP 端点，无需手写 `getToolDefinition()`。

#### A2A 协议（Agent-to-Agent）

Hermes 支持 Agent 间任务委托：

```
GET  /.well-known/agent.json        → AgentCard 发现
POST /api/intelligence/a2a/tasks/send  → 任务委托（JSON-RPC 2.0）
POST /api/intelligence/a2a/tasks/get   → 任务追踪
```

内置 Agent 注册（启动时自动注册）：
- xiaoyun-main（主 Agent）
- specialist-sourcing / compliance / logistics / delivery（专家 Agent）
- knowledge-graph（知识图谱 Agent）

---

### 3.2 技能系统（Skill System）— Hermes 的记忆

Hermes 不只是执行工具，它从成功经验中提炼可复用技能。

#### 技能进化闭环

```
对话成功完成
  │
  ▼
ConversationReflectionOrchestrator（对话反思）
  │  LLM 评估对话质量，生成 PromptSuggestion
  │
  ▼
SkillEvolutionOrchestrator（技能进化）
  │  从反思结果中提取技能模板
  │  ├── 新技能 → 创建 SkillTemplate（confidence=0.5）
  │  └── 已有技能 → 更新 successCount/failureCount，调整 confidence
  │
  ▼
SkillTreeOrchestrator（技能树自生长）
  │  从成功工具链自动提取 AiSkillNode
  │  ├── 技能复用：相似问题匹配已有技能
  │  ├── 质量演化：confidence 逐步收敛
  │  └── 淘汰剪枝：长期低分技能自动降级
  │
  ▼
SkillExecutionTool（技能执行入口）
  │  Agent 通过此工具调用已注册的技能链
  │  SkillChainDef 定义多步工具工作流模板
  │
  ▼
下次对话：相似问题直接命中技能，跳过探索阶段
```

#### 技能模板数据结构

| 字段 | 说明 |
|------|------|
| skillName | 技能名称（如"逾期订单催办"） |
| skillGroup | 技能分组（如"production"） |
| triggerPhrases | 触发短语（JSON 数组） |
| stepsJson | 工具链步骤定义 |
| preConditions | 前置条件 |
| postCheck | 后置校验 |
| confidence | 置信度（0~1，逐步收敛） |
| version | 版本号（技能迭代时递增） |

---

### 3.3 记忆系统（Memory System）— Hermes 的大脑

三层记忆架构，模拟人类记忆机制：

```
┌─────────────────────────────────────────────────────────────┐
│                    Core Memory（核心记忆）                     │
│  存储：MySQL（t_agent_memory_core）                           │
│  内容：关键事实、用户偏好、业务规则                            │
│  特点：永久存储，高优先级注入                                  │
│  示例："租户106使用二次工艺外包模式"                           │
├─────────────────────────────────────────────────────────────┤
│                   Working Memory（工作记忆）                   │
│  存储：Redis（24h TTL）                                       │
│  内容：当前会话上下文、临时计算结果                            │
│  特点：快速访问，自动过期                                      │
│  示例："本次对话已查询3次订单OP-20260507-001"                  │
├─────────────────────────────────────────────────────────────┤
│                  Archival Memory（归档记忆）                   │
│  存储：MySQL（t_agent_memory_archival）                       │
│  内容：历史对话摘要、经验教训                                  │
│  特点：记忆衰减（180天半衰期），低优先级注入                    │
│  示例："2026-04-15 逾期订单处理经验：先查原因再催办"           │
└─────────────────────────────────────────────────────────────┘
```

#### 长期记忆三层分类

| 层级 | 类型 | 说明 | 过期策略 |
|------|------|------|---------|
| FACT | 事实 | "工厂A的裁剪产能是500件/天" | 永久 |
| EPISODIC | 过程 | "上次处理类似订单用了3步" | 180天半衰期 |
| REFLECTIVE | 反思 | "催办前先确认原因效果更好" | 90天 |

记忆隔离：租户层仅自身可见，平台层由超管沉淀跨租户匿名经验。

#### 记忆触发机制

| 触发器 | 时机 | 动作 |
|--------|------|------|
| MemoryNudgeOrchestrator | 对话结束后 | 分析是否有值得保存的知识，生成 MemoryNudge |
| UserProfileEvolution | 对话结束后 | 提取用户偏好/习惯/关注点，BEHAVIOR→PREFERENCE→EXPERTISE 三层 |
| ConversationReflection | 对话结束后 | LLM 评估对话质量，生成摘要写入 t_ai_conversation_memory |
| LongTermMemoryOrchestrator | 重要性分级时 | 高/中/低 → 90/60/30天过期 |

---

### 3.4 编排系统（Orchestration System）— Hermes 的神经

#### 单 Agent 路径（日常对话）

```
用户消息 → AiAgentOrchestrator
  ├── 简短问候/简单问题 → QuickPath（直接调用模型）
  │   └── QuickPathQualityGate 审查 → 不合格降级到 Agent 循环
  └── 复杂问题 → AgentLoopEngine（ReAct 循环）
        ├── 最多 10 轮迭代
        ├── 每轮：推理 → 工具调用 → 结果处理
        └── Stuck 检测 + 补偿事务 + 检查点保存
```

#### 多 Agent 路径（复杂分析场景）

```
MultiAgentGraphOrchestrator（Hybrid Graph MAS v4.1）
  │
  ├── DigitalTwinBuilderOrchestrator
  │   └── 构建数字孪生快照（订单状态+工序进度+物料库存）
  │
  ├── SupervisorAgentOrchestrator
  │   └── LLM 路由决策：delivery_risk / sourcing / compliance /
  │       logistics / production / cost / full
  │
  ├── SpecialistAgent × N（AsyncSubagentOrchestrator 并行调度，最多4并发）
  │   ├── ProductionSpecialistAgent（生产工序专家）
  │   ├── SourcingSpecialistAgent（采购供应商专家）
  │   ├── ComplianceSpecialistAgent（合规质检专家）
  │   ├── LogisticsSpecialistAgent（物流专家）
  │   └── CostSpecialistAgent（成本核算专家）
  │
  ├── ReflectionEngineOrchestrator
  │   └── 批判性分析：多假设验证 + 反事实推理 + 历史类比
  │       + 二阶效应 + 最坏情况 → 置信分 + 优化建议
  │
  └── DecisionChainOrchestrator
      └── 最终决策链：综合所有专家意见输出行动方案
```

#### DAG 执行引擎

```
DagExecutionEngine
  ├── 拓扑分层并行执行
  ├── 依赖失败跳过
  ├── SSE 事件推送
  └── 节点注册中心（DagExecutorRegistry）
      注册节点：DigitalTwin / Supervisor / Reflector /
      DecisionChain / Specialist 等
```

#### Agent 执行模式

| 模式 | 说明 | 适用场景 |
|------|------|---------|
| DEFAULT | 高风险工具需确认 | 日常对话 |
| YOLO | 免确认，直接执行 | 批量操作、定时任务 |
| PLAN | 仅计划不执行 | 预览方案、模拟推演 |

---

### 3.5 自我进化系统（Self-Evolution System）— Hermes 的基因

Hermes 不只是执行，它在持续进化。

#### 进化管线

```
每日凌晨3点 → EvolutionPipeline
  │
  ├── SystemDataMiner（8维度数据挖掘）
  │   ├── 生产订单维度
  │   ├── 扫码记录维度
  │   ├── 物料采购维度
  │   ├── 质量问题维度
  │   ├── 工厂绩效维度
  │   ├── 反思池维度
  │   ├── 自动反馈维度
  │   └── Agent执行日志维度
  │
  ├── 生成测试场景
  │
  ├── 自我对弈验证
  │
  └── 提交进化提案（EvolutionProposal）
      ├── prompt 类：优化提示词
      ├── parameter 类：调整参数
      └── knowledge 类：补充知识
```

#### 进化安全守卫

| 保护机制 | 说明 |
|---------|------|
| 核心表保护 | t_production_order 等 9 张表禁止自动修改 |
| 危险关键词拦截 | DROP / DELETE / TRUNCATE 等自动拦截 |
| 变更版本持久化 | 所有提案 PENDING_REVIEW 状态，需人工审批 |
| 回滚机制 | 部署后异常自动回滚到上一版本 |

#### 自我批评 5 维度评分

| 维度 | 权重 | 说明 |
|------|------|------|
| 数据真实性 | 30% | 比对 AI 回答数字 vs 工具返回数字 |
| 工具效率 | 25% | 快速通道本应查询数据但无工具 → 低分 |
| 完整性 | 20% | 用户问题实体是否被全部回答 |
| 幻觉检测 | 15% | 检测"据我所知""我认为"等无数据支撑表述 |
| 上下文利用 | 10% | 是否使用了页面上下文、历史对话 |

评分低于 75 分 → 触发 RealTimeLearningLoop 实时学习闭环。

---

### 3.6 工作流自动化（Workflow Automation）— Hermes 的肌肉

#### 智能工作流

```
SmartWorkflowOrchestrator
  │  命令执行后的级联工作流
  │
  └── 示例："暂停订单" → 自动触发
      ├── 清点库存
      ├── 通知财务
      └── 更新生产看板
```

#### DAG 工作流引擎

```
WorkflowExecutionOrchestrator
  │  从 DB 加载 WorkflowDefinition（DAG JSON）
  │
  ├── 拓扑排序
  ├── 顺序执行节点
  ├── 变量传递（节点间共享 contextJson）
  └── 执行记录持久化（t_workflow_execution）
```

#### 定时自动化任务

| 任务 | 频率 | 功能 |
|------|------|------|
| AiPatrolOrchestrator | 每30分钟 | 主动巡检全部活跃租户，发现逾期/停滞订单推送通知 |
| AutonomousAgentJob | 每天凌晨3点 | 自动挖掘规律，调用 PatternDiscoveryOrchestrator |
| DataConsistencyPatrolJob | 每天凌晨4点 | 数据一致性巡检，调用 SelfHealingOrchestrator |
| EvolutionPipeline | 每天凌晨3点 | 自我进化管线，8维度数据挖掘+自我对弈 |

#### Agent 活动定义（30 个 Agent 角色）

| 角色 | 工具映射 |
|------|---------|
| 订单管家 | OrderEditTool、OrderFactoryTransferTool |
| 物料采购员 | MaterialReceiveTool、MaterialPickingTool |
| 质检巡检员 | QualityInboundTool、MaterialQualityIssueTool |
| 仓库管理员 | WarehouseStockTool、InventoryCheckTool |
| 财务审计 | FinanceWorkflowTool、PayrollApproveTool |
| 异常检测器 | ProductionExceptionTool、PayrollAnomalyDetectorTool |
| ... | ... |

---

## 四、Hermes vs Agent-S：关键设计差异

### 4.1 工具调用 vs 界面操作

```
Agent-S 路径：
  用户："帮我查一下订单OP-001的进度"
  → 截图识别订单管理页面
  → 识别搜索框位置
  → 模拟鼠标点击搜索框
  → 模拟键盘输入"OP-001"
  → 截图识别搜索结果
  → OCR 提取进度信息
  → 页面改版 → 全部失效 ❌

Hermes 路径：
  用户："帮我查一下订单OP-001的进度"
  → LLM 选择 ProductionProgressTool
  → API 调用：POST /production-order/progress?orderNo=OP-001
  → 返回结构化 JSON
  → 页面改版 → 完全不受影响 ✅
```

### 4.2 技能复用 vs 操作录制

```
Agent-S 路径：
  录制操作步骤 → 回放
  → 步骤是界面坐标序列
  → 换台电脑分辨率不同就失效
  → 无法跨用户共享 ❌

Hermes 路径：
  提炼工具链 → SkillTemplate
  → 步骤是 API 调用序列
  → 任何租户任何设备都能执行
  → confidence 逐步收敛，质量持续提升 ✅
```

### 4.3 记忆进化 vs 操作轨迹

```
Agent-S 路径：
  记录操作轨迹 → 优化界面操作步骤
  → 只能优化"怎么点更快"
  → 无法理解业务语义 ❌

Hermes 路径：
  三层记忆 + 自我批评 + 实时学习
  → 理解"为什么这样做"
  → 提炼业务规则（REFLECTIVE 记忆）
  → 跨会话持续优化（confidence 收敛）
  → 自动进化提示词/参数/知识 ✅
```

---

## 五、数据流全景

### 5.1 一次完整对话的数据流

```
用户输入："最近有哪些订单逾期了？帮我催一下"
  │
  ▼ [1] AiAgentOrchestrator 接收
  │  判断：非简单问题 → 走 Agent 循环
  │
  ▼ [2] AgentLoopContextBuilder 构建上下文
  │  DomainRouter → PRODUCTION + FINANCE
  │  ToolAccess → 过滤无权限工具
  │  ToolAdvisor → ProductionProgressTool 排序靠前
  │  MemoryHelper → 注入最近3条历史摘要
  │
  ▼ [3] AgentLoopEngine 第1轮
  │  LLM 推理 → 选择 ProductionProgressTool
  │  工具执行 → 返回5条逾期订单
  │  证据标记 → toolResult 标记为 evidence
  │
  ▼ [4] AgentLoopEngine 第2轮
  │  LLM 推理 → 选择 OrderContactUrgeTool
  │  工具执行 → 对5条订单发送催办通知
  │  补偿事务记录 → 记录催办操作（可回滚）
  │
  ▼ [5] AgentLoopEngine 第3轮
  │  LLM 推理 → 生成最终答案
  │  无工具调用 → 退出循环
  │
  ▼ [6] 质量保障层
  │  DataTruthGuard L1-L5 → 验证数字一致性
  │  EntityFactChecker → 验证5条订单确实存在
  │  GroundedGenerationGuard → 验证答案有工具结果支撑
  │
  ▼ [7] SSE 推送 answer_chunk + follow_up_actions
  │
  ▼ [8] triggerPostTurnHooks（异步）
  │  SelfCritic → 5维度评分（假设82分，合格）
  │  RealTimeLearningLoop → 检查是否需要学习
  │  DynamicFollowUpEngine → 生成"是否需要查看逾期原因？"
  │  MemoryNudge → 记录"该用户关注逾期订单"
  │  UserProfileEvolution → 更新用户偏好
  │  ConversationReflection → 尝试提取技能
  │  └── SkillEvolution → 提炼"逾期订单查询+催办"技能
```

### 5.2 多 Agent 协作数据流

```
用户输入："分析一下我们工厂的整体运营风险"
  │
  ▼ MultiAgentGraphOrchestrator
  │
  ├── [并行] DigitalTwinBuilder
  │   └── 快照：订单状态 + 工序进度 + 物料库存 + 人员配置
  │
  ├── [并行] SupervisorAgent
  │   └── 路由：full（全维度分析）
  │
  ├── [并行] 4个 SpecialistAgent（AsyncSubagentOrchestrator，120s超时）
  │   ├── ProductionSpecialist → 生产瓶颈分析
  │   ├── SourcingSpecialist → 供应链风险
  │   ├── ComplianceSpecialist → 质量合规风险
  │   └── CostSpecialist → 成本偏差分析
  │
  ├── [串行] ReflectionEngine
  │   └── 批判性分析 → 置信分 0.78
  │   └── 低置信 → 迭代反思（最多3轮）
  │
  └── [串行] DecisionChain
      └── 综合决策 → 输出行动方案
```

---

## 六、关键设计原则

### 6.1 零幻觉原则

Hermes 的每一条输出都必须有据可查：

| 守卫 | 层级 | 机制 |
|------|------|------|
| DataTruthGuard | L1 | 关键词过滤 + 不确定性表述 + 幻觉模式检测 |
| DataTruthGuard | L2 | 数字一致性（容差匹配） |
| DataTruthGuard | L3 | 语义验证（实体一致性 + 状态一致性 + Jaccard 相似度） |
| DataTruthGuard | L4 | 逻辑一致性（时间矛盾 + 状态矛盾 + 过度确定性） |
| DataTruthGuard | L5 | 综合验证（综合信任评分 + 改进建议） |
| EntityFactChecker | DB | 验证 AI 提到的实体（订单号/款号/工厂名）是否真实存在 |
| GroundedGenerationGuard | 规则 | 确保 AI 回答中的数字/事实有工具返回结果支撑 |
| SelfConsistencyVerifier | 采样 | 高风险工具场景下多路径验证一致性 |
| StatusTranslator | 映射 | 状态码精确翻译，禁止 LLM 自行发挥 |

### 6.2 安全边界原则

| 边界 | 实现 |
|------|------|
| 租户隔离 | 所有工具自动注入 tenantId，AbstractAgentTool 强制校验 |
| 权限控制 | AiAgentToolAccessService：超管独占工具 + 工厂用户屏蔽列表 + 角色可见性 |
| 补偿事务 | CompensatingTransactionManager：任一工具失败回滚已执行操作 |
| 进化安全 | EvolutionSafetyGuard：核心表保护 + 危险关键词拦截 + 人工审批 |
| 幂等保护 | 60s 内同租户同工具同参数复用结果，防止重复执行 |

### 6.3 可恢复原则

| 机制 | 说明 |
|------|------|
| AgentCheckpoint | 每轮迭代保存检查点，支持断点恢复 |
| AgentEvent | 每次工具执行记录事件，完整审计链 |
| CompensatingTransaction | 工具执行失败自动回滚已执行操作 |
| AgentSession | 会话状态持久化，重启后可恢复 |

### 6.4 异步不阻塞原则

所有 PostTurnHooks 均异步执行，不阻塞主流程响应：

```
主流程：用户消息 → Agent 循环 → 质量保障 → SSE 推送答案
                                                      │
异步流程：                                             ▼
  SelfCritic ──────┐
  RealTimeLearning ─┤  全部在 aiSelfCriticExecutor 线程池
  DynamicFollowUp ──┤  不影响用户等待时间
  MemoryNudge ──────┤
  UserProfile ──────┤
  Reflection ───────┘
```

---

## 七、扩展机制

### 7.1 新增工具

```java
@AgentToolDef(
    name = "my_new_tool",
    description = "工具描述，LLM 根据此描述决定是否调用",
    domain = ToolDomain.PRODUCTION,
    timeoutMs = 15000,
    readOnly = true
)
public class MyNewTool extends AbstractAgentTool {
    
    @Override
    public ToolDefinition getToolDefinition() {
        return ToolDefinition.builder()
            .name("my_new_tool")
            .description("工具描述")
            .parameter("param1", JsonSchema.STRING, "参数1说明", true)
            .build();
    }
    
    @Override
    protected ToolResult doExecute(Map<String, Object> params) {
        // 业务逻辑
        return ToolResult.success(result);
    }
}
```

注册流程：
1. 创建类继承 `AbstractAgentTool`
2. 添加 `@AgentToolDef` 注解
3. 实现 `getToolDefinition()` 和 `doExecute()`
4. Spring 自动扫描注册 → AgentLoopEngine 自动可用
5. 可选：添加 `@McpToolAnnotation` → MCP 端点自动暴露

### 7.2 新增专家 Agent

```java
@Component
public class MySpecialistAgent implements SpecialistAgent {
    
    @Override
    public String getRoute() {
        return "my_domain";
    }
    
    @Override
    public SpecialistResult analyze(AgentState state) {
        // 专家分析逻辑
        return SpecialistResult.builder()
            .route(getRoute())
            .analysis("分析结果")
            .confidence(0.85)
            .build();
    }
}
```

注册流程：
1. 实现 `SpecialistAgent` 接口
2. 添加 `@Component` 注解
3. 在 `AgentCardAutoRegistrar` 中注册 AgentCard
4. 在 `DagExecutorRegistry` 中注册 DAG 节点

### 7.3 新增技能链

```json
{
  "id": "overdue-order-urge",
  "name": "逾期订单催办",
  "triggers": ["逾期", "催办", "延期"],
  "steps": [
    { "toolName": "query_production_progress", "defaultArgsHint": {"status": "overdue"} },
    { "toolName": "order_contact_urge", "defaultArgsHint": {} }
  ]
}
```

技能通过 `SkillExecutionTool` 被 Agent 调用，也可通过 `SkillEvolutionOrchestrator` 自动从成功对话中提炼。

---

## 八、监控与可观测性

### 8.1 Agent 追踪

```
AiAgentTraceOrchestrator
  ├── startRequest → 记录请求开始
  └── finishRequest → 记录请求结束 + 审计日志
```

### 8.2 Agent 活动看板

```
AgentActivityController
  └── 30 个 AgentDefinition
      每个 Agent 定义：名称、描述、工具映射、状态
```

### 8.3 指标采集

| 指标 | 来源 | 说明 |
|------|------|------|
| AgentExecutionMetrics | AgentLoopEngine | 执行时间、工具调用次数、Token 消耗 |
| SelfCritic 评分 | SelfCriticService | 5维度评分 + 综合分 |
| Skill confidence | AiSkillNode | 技能置信度趋势 |
| Memory hit rate | AgentMemoryService | 记忆命中率 |

---

## 九、与现有系统的集成点

### 9.1 前端集成

```
PC端：useAiChat.ts
  ├── SSE 连接 → StreamingAgentLoopCallback
  ├── 防御式消息创建（有则更新，无则创建）
  └── follow_up_actions 渲染

小程序：WebSocket
  ├── onDone 回调统一创建 AI 消息
  └── 不依赖 thinking 事件前置
```

### 9.2 业务系统集成

```
Hermes Agent
  │
  ├── ProductionOrderOrchestrator（生产订单）
  ├── MaterialPurchaseOrchestrator（物料采购）
  ├── ProductWarehousingOrchestrator（入库）
  ├── FinanceWorkflowOrchestrator（财务审批）
  ├── QualityScanExecutor（质检扫码）
  └── ... 158 个业务编排器
```

### 9.3 定时任务集成

```
Spring @Scheduled
  ├── AiPatrolOrchestrator（巡检）
  ├── AutonomousAgentJob（规律挖掘）
  ├── DataConsistencyPatrolJob（一致性巡检）
  └── EvolutionPipeline（自我进化）
```

---

## 十、未来演进方向

### 10.1 短期（1-2月）

- [ ] 技能市场：租户间共享技能模板（脱敏后）
- [ ] Agent 工作流可视化：DAG 编辑器 + 执行动画
- [ ] 更多 MCP 客户端接入：Cursor / Windsurf / Claude Desktop

### 10.2 中期（3-6月）

- [ ] 多模态输入：图片识别（面料/工艺图）→ 工具调用
- [ ] 跨系统 A2A：与 ERP / WMS 等外部系统 Agent 互操作
- [ ] 自主决策边界：低风险操作自动执行，高风险操作人工审批

### 10.3 长期（6-12月）

- [ ] 全自主 Agent：7×24 小时无人值守运营
- [ ] 数字孪生驱动：实时镜像工厂状态，预测性决策
- [ ] 联邦学习：跨租户匿名经验共享，不泄露商业数据

---

## 附录 A：核心文件索引

| 子系统 | 核心文件 | 行数 |
|--------|---------|------|
| 编排入口 | AiAgentOrchestrator.java | 501 |
| 循环引擎 | AgentLoopEngine.java | 419 |
| 上下文构建 | AgentLoopContextBuilder.java | — |
| 工具基类 | AbstractAgentTool.java | 335 |
| 工具执行 | AiAgentToolExecHelper.java | 338 |
| 工具权限 | AiAgentToolAccessService.java | 430 |
| MCP 协议 | McpProtocolService.java | — |
| A2A 协议 | A2aProtocolService.java | — |
| 技能进化 | SkillEvolutionOrchestrator.java | — |
| 技能树 | SkillTreeOrchestrator.java | — |
| 记忆服务 | AgentMemoryService.java | — |
| 长期记忆 | LongTermMemoryOrchestrator.java | — |
| 自我批评 | SelfCriticService.java | 401 |
| 实时学习 | RealTimeLearningLoop.java | 211 |
| 数据守卫 | DataTruthGuard.java | 619 |
| 动态FollowUp | DynamicFollowUpEngine.java | 271 |
| 进化管线 | EvolutionPipeline.java | 331 |
| 进化安全 | EvolutionSafetyGuard.java | 165 |
| 多Agent图 | MultiAgentGraphOrchestrator.java | 311 |
| 反思引擎 | ReflectionEngineOrchestrator.java | — |
| 补偿事务 | CompensatingTransactionManager.java | — |
| DAG引擎 | DagExecutionEngine.java | — |

## 附录 B：数据库表索引

| 表名 | 用途 |
|------|------|
| t_agent_session | Agent 会话记录 |
| t_agent_checkpoint | 检查点（断点恢复） |
| t_agent_event | 事件审计日志 |
| t_agent_memory_core | 核心记忆（永久） |
| t_agent_memory_archival | 归档记忆（衰减） |
| t_skill_template | 技能模板 |
| t_ai_skill_node | 技能节点（技能树） |
| t_ai_conversation_memory | 对话记忆摘要 |
| t_conversation_reflection | 对话反思记录 |
| t_memory_nudge | 记忆提醒 |
| t_user_profile_evolution | 用户画像进化 |
| t_session_search_index | 会话搜索索引 |
| t_agent_context_file | Agent 上下文文件 |
| t_workflow_definition | 工作流定义（DAG JSON） |
| t_workflow_execution | 工作流执行记录 |
| t_intelligence_metrics | 智能指标采集 |
| t_intelligence_execution_feedback | AI 执行效果反馈 |
| t_intelligence_feedback | 智能反馈分析 |
| t_agent_card | Agent 注册卡片（A2A） |
