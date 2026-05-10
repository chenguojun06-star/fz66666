
# 小云 AI 智能体升级路线图
&gt; 版本 v1.0 | 生成时间 2026-05-02 | 基于代码库审计结果
---

## 一、现状评估

### 1.1 当前核心能力

小云 AI 已具备相当完整的智能体架构，主要包括：

| 模块 | 功能说明 | 文件位置 |
|------|---------|---------|
| **Agent Loop 引擎** | 多轮对话、工具调用、Stuck 检测、检查点保存 | [AgentLoopEngine.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/agent/loop/AgentLoopEngine.java) |
| **DAG 编排引擎** | 多智能体协作、分层并行执行、流式输出 | [DagExecutionEngine.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/agent/dag/DagExecutionEngine.java) |
| **长期记忆系统** | 三层架构（Fact/Episodic/Reflective）、时间衰减、多信号检索 | [LongTermMemoryOrchestrator.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/LongTermMemoryOrchestrator.java) |
| **语义路由器** | 领域识别（生产/财务/仓库/款式）、复杂度分级、缓存 | [SemanticDomainRouter.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/agent/router/SemanticDomainRouter.java) |
| **MCP 协议支持** | Model Context Protocol、工具发现/调用、初始化握手 | [McpProtocolController.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/controller/McpProtocolController.java) |
| **Critic 自审层** | 结果审查与修订、简单场景跳过优化 | [AgentLoopEngine.java#L206-L214](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/agent/loop/AgentLoopEngine.java#L206-L214) |
| **数据安全层** | 数据真实性校验、实体验证、接地率检查 | [AgentLoopEngine.java#L262-L287](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/agent/loop/AgentLoopEngine.java#L262-L287) |
| **高风险一致性校验** | Self-Consistency 多路径验证、置信度预警 | [SelfConsistencyVerifier.java](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/service/SelfConsistencyVerifier.java) |
| **工具生态** | 70+ 业务工具（生产/财务/仓库/款式/分析） | [agent/tool/](file:///Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/java/com/fashion/supplychain/intelligence/agent/tool) |

### 1.2 架构优点

- ✅ **分层清晰**：Controller → Orchestrator → Service → Mapper
- ✅ **安全优先**：高风险操作审核、数据真实校验、接地率检查
- ✅ **可观测性**：Agent Trace、执行日志、成本追踪
- ✅ **多租户隔离**：租户级记忆、工具权限隔离
- ✅ **流式输出**：SSE 实时输出、进度提示

---

## 二、升级方向（按优先级 P0-P2）

### P0：能力增强（高价值低风险）

#### 2.1 向量嵌入正式接入
**现状**：`LongTermMemoryOrchestrator` 已预留 `embeddingId` 字段，但当前未实现真实向量检索。

**问题**：
- 仅依赖时间衰减 + 关键词 + 实体匹配，语义检索能力缺失
- `retrieveMultiSignal` 是 BM25 近似，不是真实向量相似度

**方案**：
1. 接入向量数据库（Milvus 或 PGVector）
2. 新增 `EmbeddingService`，支持 OpenAI text-embedding-3-small / 阿里通义千问
3. 增强 `retrieveMultiSignal`，加入真实余弦相似度得分
4. 记忆写入时自动生成嵌入并异步存入向量库

**预期收益**：记忆检索精准度提升 60-80%，"帮我找上次那个红色款式"类问题直接命中。

---

#### 2.2 多智能体协作深化
**现状**：已有 DAG 编排引擎和 AgentGraph，但多智能体主要用于仪表盘场景，通用对话未充分利用。

**问题**：
- 复杂任务（如"帮我做一个月度经营分析报告"）由单 Agent 完成，无专业分工
- 缺少角色定义（分析师/财务/生产专家/报告撰写人）
- 缺少 Agent 间消息总线

**方案**：
1. 新增 `MultiAgentOrchestrator`，实现 CrewAI 风格的角色分工
2. 预定义服装 MES 专用角色：
   - `ProductionExpert`: 生产进度、瓶颈、异常分析
   - `FinanceExpert`: 成本、工资、对账、利润
   - `WarehouseExpert`: 库存、物料、供应链
   - `StyleExpert`: 款式、报价、样衣
   - `ReportWriter`: 报告撰写、数据可视化
3. 新增 `AgentMessageBus`，支持 Agent 间点对点通信
4. 对话时根据语义路由自动选择协作模式

**预期收益**：复杂任务完成质量提升 40-50%，深度分析报告可用性大幅提升。

---

#### 2.3 工具调用动态规划（结构化思考）
**现状**：工具调用由 LLM 一次性决定，无前置思考、无备选方案、无失败回退。

**问题**：
- 复杂查询易调用错误工具
- 工具调用失败后无 Plan B
- 缺少显式的"思考链"可见性

**方案**：
1. 新增 `ToolPlanningOrchestrator`，在首次推理时生成结构化计划
2. 计划格式：
   ```json
   {
     "plan": [
       { "step": 1, "tool": "queryOrders", "reason": "先获取上月订单列表", "fallback": "queryOrdersByDate" },
       { "step": 2, "tool": "calculateCost", "reason": "计算订单成本", "dependsOn": [1] },
       { "step": 3, "tool": "generateReport", "reason": "生成分析报告", "dependsOn": [2] }
     ]
   }
   ```
3. 工具执行前先验证输入参数（Schema Validation）
4. 执行失败时自动重试或切换 fallback 工具
5. 将计划过程展示给用户，增强透明度

**预期收益**：工具调用正确率提升 30%，用户对 AI 决策过程更信任。

---

### P1：体验与性能优化

#### 2.4 响应缓存与热点查询优化
**现状**：常见查询（如"今日生产进度"）每次重新计算，无缓存。

**问题**：
- 相同查询重复消耗 Token
- 热点查询响应时间长
- 缺少 Query Cache 层

**方案**：
1. 新增 `IntelligenceQueryCache`，基于查询语义哈希缓存结果
2. 缓存维度：
   - 用户级别：个性化查询
   - 租户级别：公共数据查询
   - 平台级别：通用知识
3. TTL 策略：
   - 实时数据（生产进度）：5 分钟
   - 汇总数据（日报）：1 小时
   - 静态知识（SOP）：24 小时
4. 缓存失效：相关数据变更时自动失效（如订单状态变更时清空该订单查询缓存）

**预期收益**：热点查询响应速度提升 10-20 倍，Token 成本降低 40%。

---

#### 2.5 智能提示工程（Prompt Optimization）
**现状**：提示词分散在代码中，无版本管理、无 A/B 测试、无效果追踪。

**问题**：
- 提示词改动风险高
- 无法量化效果
- 不同租户场景无法定制

**方案**：
1. 提示词外部化，存入配置表 `AiPromptTemplate`
2. 支持版本管理、灰度发布、A/B 测试
3. 新增 `PromptOptimizationService`，基于反馈自动优化
4. 租户级自定义提示词，支持行业专属增强（羽绒服厂 vs 西装厂）
5. 提示词效果指标：工具调用正确率、任务完成率、用户满意度

**预期收益**：提示词质量可迭代，不同租户场景适配度提升。

---

#### 2.6 语音/视觉多模态能力
**现状**：无语音/视觉能力，仅文本交互。

**问题**：
- 无法处理图片（如"帮我看看这张样衣照片的版型问题"）
- 车间场景语音交互需求无法满足
- 视觉质量检查数据无法接入

**方案**：
1. 新增 `MultimediaService`，封装 OpenAI GPT-4o / 通义千问 VL
2. 新增工具集：
   - `analyzeImage`: 分析样衣/缺陷图片
   - `voiceCommand`: 语音转文字并执行
   - `generateVoice`: 文字转语音播报
3. 前端集成：
   - 上传图片到对话
   - 语音录制按钮
   - 语音播报功能
4. 与视觉 AI 质检模块集成

**预期收益**：交互方式多样化，车间语音助手成为可能。

---

### P2：治理与运营

#### 2.7 AI 决策可解释性增强
**现状**：已有部分解释（工具调用记录），但决策链不完整。

**问题**：
- 用户问"为什么 AI 给我这个结论"时，无法给出完整逻辑链
- 缺少"为什么调用这个工具"的解释
- 缺少"为什么选择这个数据"的解释

**方案**：
1. 增强 `Critic` 层，生成决策解释卡片
2. 解释格式：
   ```json
   {
     "reasoningChain": [
       { "step": 1, "action": "理解需求", "content": "用户想知道 PO202601001 的交期风险" },
       { "step": 2, "action": "调用工具", "tool": "queryOrderProgress", "reason": "需要该订单的当前进度" },
       { "step": 3, "action": "分析数据", "content": "发现裁剪工序滞后 2 天，后道无缓冲" },
       { "step": 4, "action": "得出结论", "content": "交期风险高，建议增加 1 天缓冲" }
     ]
   }
   ```
3. 前端展示可展开的"思考链"面板

**预期收益**：AI 信任度提升，问题排查更容易。

---

#### 2.8 自助化 Agent 训练与微调
**现状**：Agent 能力提升依赖研发迭代，业务方无法自助优化。

**问题**：
- 业务反馈无法闭环到 Agent 能力
- 新工具上线流程重
- 缺少"错误反馈 → 纠正 → 下次不犯"的学习闭环

**方案**：
1. 新增 `AgentTrainingCenter`，业务方可：
   - 标记 AI 错误回复，给出正确示例
   - 上传行业知识库文档
   - 定义新工具的使用示例
2. 新增 `FeedbackLoopOrchestrator`，将高质量反馈写入长期记忆（Reflective 层）
3. 新增 `ToolExampleStore`，工具调用示例库
4. 每月生成 Agent 能力提升报告

**预期收益**：业务可自助优化，Agent 持续进化。

---

#### 2.9 AI 成本精细化管理与优化
**现状**：已有成本追踪，但无自动优化策略。

**问题**：
- Token 成本不可控
- 大模型滥用（简单问题也用大模型）
- 无成本归因（哪个功能/哪个用户最花钱）

**方案**：
1. 新增 `CostOptimizationService`，实现：
   - **模型路由**：简单问题用小模型（如 GPT-4o mini），复杂问题用大模型
   - **Token 压缩**：上下文过长时自动压缩历史
   - **缓存优先**：相同查询直接返回缓存
2. 新增 `CostDashboard`，展示：
   - 总体成本趋势
   - 各功能成本占比
   - 各用户成本排名
   - 优化建议（如"这个查询可缓存，每月省 ¥500"）
3. 成本告警：超过预算阈值自动通知

**预期收益**：AI 成本降低 30-50%，ROI 更清晰。

---

## 三、实施路线图（按季度）

| 季度 | 里程碑 | 核心交付 |
|------|--------|---------|
| **Q2 2026** | 向量检索 + 提示词治理 | 向量嵌入接入、提示词配置化、P0 项 2.1 + 2.5 |
| **Q3 2026** | 多智能体协作 | MultiAgentOrchestrator、角色分工、Agent 消息总线、P0 项 2.2 |
| **Q4 2026** | 多模态 + 自助训练 | 语音/视觉能力、AgentTrainingCenter、P1/P2 项 |

---

## 四、关键依赖与风险

### 4.1 依赖项

| 依赖 | 用途 | 可选方案 |
|------|------|---------|
| 向量数据库 | 语义检索 | Milvus / PGVector / Weaviate |
| 多模态 API | 语音/视觉 | OpenAI GPT-4o / 通义千问 VL |
| 消息队列 | 异步任务 | Redis Stream / RabbitMQ |

### 4.2 风险缓解

| 风险 | 影响 | 缓解方案 |
|------|------|---------|
| 向量检索效果不及预期 | 高 | 先做 AB 测试，保留原有关键词检索作为 fallback |
| 多智能体协作响应变慢 | 中 | 引入并行执行优化，关键路径加速 |
| 多模态成本过高 | 中 | 引入成本控制，默认关闭，按需启用 |

---

## 五、成功指标

| 指标 | 当前值（预估） | 目标值（Q4 2026） |
|------|--------------|-----------------|
| 记忆检索准确率 | 30-40% | 80-90% |
| 复杂任务完成率 | 50-60% | 80-85% |
| 用户满意度评分 | 3.5/5.0 | 4.3/5.0 |
| Token 成本（日均） | 基准 | -40% |
| 响应速度（平均） | 基准 | -60%（热点查询） |

---

## 六、下一步行动

1. **本周**：确认向量数据库选型（Milvus vs PGVector）
2. **下周**：启动 P0 项 2.1（向量嵌入接入）的设计
3. **本月**：完成提示词外部化的第一个版本

&gt; 本文档基于代码库审计生成，可随时更新。
