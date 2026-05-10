# Claude Code 智能体设计蓝图 v1.0
## 对标服装供应链"小云 AI"升级指南

**文档版本**：1.0  
**最后更新**：2026-04-26  
**适用范围**：AiAgentOrchestrator、ExecutionEngine、AgentTool 系统升级  
**参考源**：Claude Code v1.0（512K+ 代码行，~1900 文件）

---

## 📋 Executive Summary

Claude Code 是 Anthropic 为 CLI 场景设计的完整 AI Agent 框架，核心亮点在于：

| 维度 | Claude Code | 小云 AI（当前） | 升级目标 |
|------|-------------|----------------|---------|
| **Query 引擎** | AsyncGenerator 流式编排 | 同步 Orchestrator | ✅ 实现非阻塞流式工具调用 |
| **权限系统** | 4种模式（default/plan/bypassPermissions/auto） | 2种（default/auto） | ✅ 扩展权限决策引擎 |
| **工具数量** | 40+ 内置工具 | 21 个 AgentTool | ✅ 补齐缺失 Skill 工具 |
| **多 Agent 协调** | TeamCreateTool + Coordinator 模块 | 独立 Sub-Agent | ✅ 实现完整 Team 编排 |
| **内存系统** | 持久化 memdir + 自动提取 | session 内存 + 仓库内存 | ✅ 构建分层记忆架构 |
| **命令系统** | 50+ 斜杠命令 | 仅内嵌逻辑 | ✅ 实现声明式命令注册 |
| **错误恢复** | 自动重试 + 预算管理 | 部分实现 | ✅ 完善错误分类和恢复策略 |
| **功能开关** | Bun 编译期死代码消除 | 环境变量 | ✅ 升级为编译期特性标志 |

---

## 🔧 第一部分：QueryEngine 核心架构

### 1.1 Query 生命周期（关键设计）

Claude Code 的 `QueryEngine` 不是简单的 Request-Response，而是完整的**会话状态机**：

```typescript
// 伪代码：Claude Code QueryEngine 生命周期
export class QueryEngine {
  private mutableMessages: Message[] = [];           // ✅ 持久状态
  private abortController: AbortController;          // ✅ 中断控制
  private permissionDenials: SDKPermissionDenial[]; // ✅ 决策审计
  private totalUsage: NonNullableUsage;             // ✅ 预算追踪

  async *submitMessage(prompt: string): AsyncGenerator<SDKMessage> {
    // ① 初始化阶段：系统状态快照
    const systemPrompt = await fetchSystemPromptParts();
    const memoryPrompt = hasAutoMemPathOverride() 
      ? await loadMemoryPrompt() 
      : null;
    
    // ② 输入处理阶段：解析用户意图
    const { messages, shouldQuery, allowedTools, model } = 
      await processUserInput({ input: prompt });
    this.mutableMessages.push(...messages);

    // ③ 权限检查阶段：提前拒绝不安全操作
    const wrappedCanUseTool = async (tool, input, context) => {
      const result = await canUseTool(tool, input, context);
      if (result.behavior !== 'allow') {
        this.permissionDenials.push({
          tool_name: sdkCompatToolName(tool.name),
          tool_use_id: toolUseID,
          tool_input: input,
        });
      }
      return result;
    };

    // ④ 主查询循环：流式处理
    for await (const message of query({
      messages: this.mutableMessages,
      systemPrompt,
      canUseTool: wrappedCanUseTool,
      maxTurns, maxBudgetUsd, taskBudget,
    })) {
      // ⑤ 消息处理：分类聚合
      switch (message.type) {
        case 'assistant':          // → 追踪 stop_reason
        case 'user':              // → 存档转录
        case 'progress':          // → 增量记录（防止丢失）
        case 'attachment':        // → 结构化输出提取
        case 'system':            // → 紧凑边界处理
        case 'tool_use_summary':  // → 工具调用统计
      }

      // ⑥ 预算检查：提前截断
      if (maxBudgetUsd && getTotalCost() >= maxBudgetUsd) {
        return { type: 'result', subtype: 'error_max_budget_usd' };
      }

      // ⑦ 转录记录：火-忘式
      if (persistSession && message.type === 'assistant') {
        void recordTranscript(messages); // 异步，不阻塞
      }

      yield normalizeMessage(message);
    }

    // ⑧ 结果聚合：全链路审计
    yield {
      type: 'result',
      subtype: 'success',
      total_cost_usd: getTotalCost(),
      usage: this.totalUsage,
      permission_denials: this.permissionDenials,
      duration_api_ms: getTotalAPIDuration(),
      num_turns: turnCount,
    };
  }
}
```

### 1.2 关键设计决策

#### 决策 1：AsyncGenerator 而非 Promise
```typescript
// ❌ 传统方式（阻塞聚合）
async function ask(): Promise<Result> {
  const response = await api.query(...);
  const allToolResults = [];
  for (const toolUse of response.tool_uses) {
    allToolResults.push(await executeToolSync(toolUse));
  }
  return aggregateResults(allToolResults);
}

// ✅ Claude Code 方式（流式处理）
async *ask(): AsyncGenerator<StreamMessage> {
  const response = api.query(...);  // 异步启动
  for await (const chunk of response.stream) {
    yield chunk;  // 逐条透传，前端即刻渲染
    // 下游可独立处理，无需等待所有结果
  }
}
```

**小云 AI 升级方向**：
- 后端 `ExecutionEngineOrchestrator` 改为返回 `AsyncGenerator<AgentMessage>`
- 前端 WebSocket 改为接收流式事件（`tool_start`, `tool_progress`, `tool_end`）
- 中间件 `generateMessages()` 处理工具调用时不阻塞返回结果

#### 决策 2：消息持久化的精细粒度
```typescript
// 关键场景：用户在工具运行中杀死进程
// Claude Code 的做法：
if (persistSession && messagesFromUserInput.length > 0) {
  const transcriptPromise = recordTranscript(messages);
  if (isBareMode()) {
    void transcriptPromise;  // 异步，不阻塞
  } else {
    await transcriptPromise; // 交互模式等待
    if (isEnvTruthy('CLAUDE_CODE_EAGER_FLUSH')) {
      await flushSessionStorage(); // 强制刷新
    }
  }
}
```

**对应小云 AI**：
- `t_intelligence_metrics` 插入触发不阻塞业务链路
- `t_scan_record` 等核心表变更立即持久化
- 可选的"急切提交"模式用于风险操作（质检、结算）

#### 决策 3：权限决策的单点化
```typescript
// QueryEngine 中权限检查的统一入口
const wrappedCanUseTool: CanUseToolFn = async (
  tool, input, toolUseContext, assistantMessage, toolUseID, forceDecision
) => {
  const result = await canUseTool(...);
  
  // 单点记录所有拒绝决策
  if (result.behavior !== 'allow') {
    this.permissionDenials.push({
      tool_name: sdkCompatToolName(tool.name),
      tool_use_id: toolUseID,
      tool_input: input,
      // 可扩展：记录拒绝原因、决策路径等
    });
  }
  
  return result;
};
```

**小云 AI 升级**：
- `PermissionDecisionOrchestrator` 所有决策通过 `t_intelligence_decision_audit` 记录
- 决策链：自动分类器 → 工厂隔离检查 → 权限码验证 → 人工确认
- 支持决策历史回放和离线培训

---

## 🛠️ 第二部分：Tool 系统的完整生命周期

### 2.1 Tool 接口的 5 大支柱

Claude Code 的 `Tool` 类型包含 80+ 个方法/属性，其中 5 个是核心：

```typescript
export type Tool<
  Input extends AnyObject = AnyObject,
  Output = unknown,
  P extends ToolProgressData = ToolProgressData,
> = {
  // ★ 支柱 1：输入 Schema（Zod 定义，运行时校验）
  readonly inputSchema: Input;
  readonly inputJSONSchema?: ToolInputJSONSchema;  // MCP 工具用
  
  // ★ 支柱 2：执行主体（异步，支持 Progress 回调）
  call(
    args: z.infer<Input>,
    context: ToolUseContext,
    canUseTool: CanUseToolFn,
    parentMessage: AssistantMessage,
    onProgress?: ToolCallProgress<P>,
  ): Promise<ToolResult<Output>>;

  // ★ 支柱 3：权限检查（业务特定，可拒绝）
  checkPermissions(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<PermissionResult>;

  // ★ 支柱 4：输入验证（业务约束，可变形）
  validateInput?(
    input: z.infer<Input>,
    context: ToolUseContext,
  ): Promise<ValidationResult>;

  // ★ 支柱 5：描述生成（动态，支持参数影响）
  description(
    input: z.infer<Input>,
    options: { isNonInteractiveSession: boolean; ... },
  ): Promise<string>;
  
  // ——— 辅助属性 ———
  
  // 安全属性（决定是否需要人工确认）
  isDestructive?(input: z.infer<Input>): boolean;
  isReadOnly(input: z.infer<Input>): boolean;
  isConcurrencySafe(input: z.infer<Input>): boolean;
  
  // 可用性属性
  isEnabled(): boolean;
  requiresUserInteraction?(): boolean;
  shouldDefer?: boolean;  // 工具延迟加载的标记
  alwaysLoad?: boolean;   // 必须在 turn 1 加载
  
  // Progress 渲染
  renderToolUseProgressMessage?(
    progressMessagesForMessage: ProgressMessage<P>[],
    options: { verbose: boolean; ... },
  ): React.ReactNode;
  
  // 结果渲染（UI 层关键）
  renderToolResultMessage?(
    content: Output,
    progressMessagesForMessage: ProgressMessage<P>[],
    options: { style?: 'condensed'; theme: ThemeName; ... },
  ): React.ReactNode;
};
```

### 2.2 Tool 执行的完整流程

```
┌─ 模型决策使用工具 ─┐
│                   │
├─ Schema 校验      │  inputSchema 定义的 Zod 类型检查
├─ validateInput()  │  业务逻辑校验（可修改 input）
├─ checkPermissions()│  权限检查（default/plan/auto/bypass 四种模式）
├─ canUseTool()     │  QueryEngine 层的最终决策
│  ├─ 自动分类器    │  自动判断风险等级（security classifier）
│  ├─ 工厂隔离      │  小云特定：检查是否越界
│  ├─ 权限码验证    │  从 t_permission 查表
│  └─ 人工确认      │  高风险操作提示用户
│
├─ call() 执行      │  真实操作
│  ├─ onProgress    │  流式进度回调
│  └─ abort 支持    │  AbortSignal 中断
│
├─ 结果处理
│  ├─ mapToolResultToToolResultBlockParam()  │  API 序列化
│  ├─ renderToolResultMessage()              │  UI 渲染
│  ├─ extractSearchText()                    │  转录索引
│  └─ 最大结果大小检查（> N chars 写文件）
│
└─ 返回 ToolResult<Output> 给 LLM
```

### 2.3 Permission Model 的 4 种模式

| 模式 | 行为 | 适用场景 | 小云等价 |
|------|------|---------|--------|
| **default** | 提示用户确认 | 交互式 CLI，用户在场 | `PermissionMode.DEFAULT` |
| **plan** | 收集所有工具使用计划，集中审批 | 编辑模式，先规划后执行 | ❌ 小云未实现 |
| **bypassPermissions** | 自动允许所有，仅适用超管 | 脚本自动化 | `PermissionMode.AUTO` |
| **auto** | 自动分类器决策（ML 模型）+ 降级提示 | 后台 Agent，需自主决策 | `PermissionMode.AUTO` |

**关键观察**：
- Claude Code 的 `plan` 模式是**编辑模式**的实现基础
- `auto` 模式使用真实 ML 分类器（可训练），不是简单规则
- 权限拒绝可导致"降级"（降低模型可用工具集）

**小云 AI 升级方案**：
```typescript
// 当前：
if (permissionMode === 'auto') {
  result.behavior = 'allow';
}

// 升级后：
if (permissionMode === 'auto') {
  // ① 自动分类器评分（扫码/工序/入库/质检/结算）
  const riskScore = await securityClassifier.score({
    operation: tool.name,
    input: JSON.stringify(args),
    actor: UserContext.userId(),
    target_factory: args.factory_id,
  });
  
  // ② 基于评分决策
  if (riskScore < 0.3) {
    result.behavior = 'allow';  // 低风险直通
  } else if (riskScore < 0.7) {
    result.behavior = 'prompt';  // 中风险提示
  } else {
    result.behavior = 'deny';   // 高风险拒绝
  }
  
  // ③ 记录决策用于模型微调
  await recordPermissionDecision({
    tool: tool.name,
    score: riskScore,
    decision: result.behavior,
    timestamp: Date.now(),
  });
}
```

---

## 📋 第三部分：Command 系统的架构

### 3.1 命令注册与分发

Claude Code 有 50+ 个斜杠命令（`/commit`, `/review`, `/mcp`, `/config` 等），统一通过命令注册表分发：

```typescript
// src/commands.ts - 命令注册表
export type Command = {
  name: string;
  aliases?: string[];
  description: string;
  
  // 关键：命令本身就是一个"工具"
  execute(options: {
    input: string;
    context: ToolUseContext;
    canUseTool: CanUseToolFn;
  }): Promise<CommandResult>;
  
  // 可选的权限检查
  checkPermissions?(context: ToolUseContext): Promise<PermissionResult>;
  
  // 命令的 Zod schema（用于自动补全和验证）
  schema?: z.ZodType;
};

// 命令分发（混合本地执行和工具调用）
export async function getSlashCommandToolSkills(cwd: string): Promise<Tool[]> {
  const commands = loadCommands();
  
  return commands.map(cmd => ({
    name: `command_${cmd.name}`,
    inputSchema: cmd.schema || z.object({}),
    
    async call(args, context) {
      // 优先本地执行（速度快）
      if (cmd.isLocal) {
        return cmd.execute({ input: args, context });
      }
      
      // 否则转换为工具供 AI 调用
      return {
        data: await cmd.execute({ input: args, context }),
      };
    },
    
    async checkPermissions(input, context) {
      return cmd.checkPermissions?.(context) ?? { behavior: 'allow' };
    },
  }));
}
```

### 3.2 本地命令 vs. AI 工具的区分

| 维度 | 本地命令 | AI 工具 |
|------|---------|--------|
| **触发方式** | 用户输入 `/command` | AI 模型自主调用 |
| **执行位置** | 主线程立即执行 | 工具容器隔离执行 |
| **结果反馈** | 立即显示 | 作为工具结果返回给 AI |
| **权限检查** | 简单（用户已在场）| 完整（permission system）|
| **性能要求** | 毫秒级（UX感受） | 秒级（工具执行时间） |
| **示例** | `/commit`, `/theme`, `/cost` | `BashTool`, `FileEditTool` |

**对小云 AI 的启发**：
```typescript
// 目前小云：所有操作都走 AgentTool + Orchestrator
POST /api/intelligence/ai-advisor/chat
  → ExecutionEngineOrchestrator
  → CommandGenerator（构造命令）
  → CommandExecutor（分发执行）
  → 工具调用

// 升级方向：区分路径
1️⃣ 轻量快速命令（如查询统计）→ 本地命令（直接调用 Service）
2️⃣ 复杂业务操作（如创建订单）→ AI 工具（工具层审批）
3️⃣ 即时用户反馈（如"告诉我今日数据"）→ 命令+工具混合
```

---

## 🤝 第四部分：Multi-Agent 协调系统

### 4.1 Agent 的 3 个层级

```
┌─ 顶层：Coordinator （全局编排）
│
├─ 中层：Team （平行工作的 Sub-Agent 组）
│  ├─ Sub-Agent 1（工程师 - 代码生成）
│  ├─ Sub-Agent 2（测试员 - 运行测试）
│  └─ Sub-Agent 3（评审员 - 代码审查）
│
└─ 底层：Individual Agent （单个 AI 实例）
```

### 4.2 TeamCreateTool 的工作流

```typescript
// 工具：创建团队并行工作
const TeamCreateTool: Tool = {
  name: 'team_create',
  inputSchema: z.object({
    goal: z.string(),                    // 共同目标
    team_size: z.number().min(2).max(8), // 队员数
    roles: z.array(z.enum([             // 角色分配
      'engineer',
      'tester', 
      'reviewer',
      'architect',
    ])),
    context: z.string().optional(),      // 额外背景
  }),
  
  async call(args, context) {
    // ① 为每个角色生成专用 system prompt
    const agentPrompts = args.roles.map(role => 
      generateSystemPromptForRole(role, args.goal)
    );
    
    // ② 创建独立的 QueryEngine 实例（不共享 mutableMessages）
    const agents = agentPrompts.map((prompt, idx) => 
      new QueryEngine({
        ...context,
        customSystemPrompt: prompt,
        // 关键：每个 Agent 有独立的消息栈和状态
        initialMessages: [],
      })
    );
    
    // ③ 并行启动 Agent（全部同时提交初始消息）
    const responses = await Promise.all(
      agents.map(agent => 
        agent.submitMessage(`Help achieve: ${args.goal}`)
      )
    );
    
    // ④ 收集所有 Sub-Agent 的返回
    return {
      team_id: randomUUID(),
      agent_responses: responses,
      summary: await synthesizeTeamResults(responses),
    };
  },
};
```

### 4.3 SendMessageTool 的 Agent 间通信

```typescript
// 工具：Sub-Agent 间相互通信
const SendMessageTool: Tool = {
  name: 'send_message',
  inputSchema: z.object({
    to_agent_id: z.string(),        // 目标 Agent（team_id:agent_idx）
    message: z.string(),             // 消息内容
    request_type: z.enum([
      'question',    // 提问
      'review',      // 代码评审反馈
      'results',     // 共享结果
      'coordination',// 协调指令
    ]),
  }),
  
  async call(args, context) {
    // 消息存储在共享状态
    const team = getTeamFromContext(context);
    const targetAgent = team.agents[args.to_agent_id];
    
    // 将消息添加到目标 Agent 的消息队列
    targetAgent.queuedMessages.push({
      from: context.agentId,
      type: args.request_type,
      content: args.message,
      timestamp: Date.now(),
    });
    
    // 可选：立即唤醒目标 Agent（如果有新消息）
    if (targetAgent.isWaiting) {
      targetAgent.resume();
    }
    
    return {
      status: 'queued',
      message_id: randomUUID(),
    };
  },
};
```

### 4.4 Coordinator 的冲突解决

```typescript
// 伪代码：多个 Sub-Agent 同时修改文件的冲突处理
export class Coordinator {
  async resolveConflict(
    agentA: AgentId,
    agentB: AgentId,
    resource: string,
    operation: 'read' | 'write' | 'delete',
  ): Promise<ConflictResolution> {
    
    // ① 场景 1：读-读 → 无冲突
    if (operation === 'read') {
      return { resolution: 'allow_both' };
    }
    
    // ② 场景 2：写-写 → 排序化
    if (operation === 'write') {
      // 获取两个 Agent 的优先级（由初始 goal 决定）
      const priorityA = this.getAgentPriority(agentA);
      const priorityB = this.getAgentPriority(agentB);
      
      if (priorityA > priorityB) {
        return { 
          resolution: 'allow_sequential',
          execute_order: [agentA, agentB],
          wait_time_ms: 5000,  // agentA 先执行，agentB 等 5 秒后重试
        };
      }
    }
    
    // ③ 场景 3：删除-写 → 提升为全局锁
    if (operation === 'delete') {
      return {
        resolution: 'escalate_to_lock',
        acquire_lock_duration_ms: 10000,
        blocking: true,  // agentB 阻塞直到超时
      };
    }
  }
}
```

**对小云 AI 的应用**：

```typescript
// 小云 AI 的多 Agent 场景示例
// 场景：订单的并行处理（采购检查 + 工序规划 + 库存分配）

const agents = [
  { id: 'procurement_agent', role: '采购检查员', focus: '面料采购' },
  { id: 'planning_agent', role: '工序规划师', focus: '生产排期' },
  { id: 'warehouse_agent', role: '仓库协调', focus: '库存分配' },
];

// 并行启动三个 Agent
const teamResult = await TeamCreateTool.call({
  goal: '订单 PO20260426001 的完整规划',
  team_size: 3,
  roles: ['engineer', 'engineer', 'engineer'],  // 简化为通用角色
  context: JSON.stringify({ order_id: 'PO20260426001' }),
});

// 采购 Agent 提问库存 Agent
await SendMessageTool.call({
  to_agent_id: 'warehouse_agent',
  message: '需要 100 码红色棉布，预计 2026-05-01 交',
  request_type: 'question',
});

// 工序 Agent 收集两个 Agent 的结果后生成计划
const finalPlan = await planOrchestrator.synthesizePlan({
  procurement_result: procurementAgent.result,
  inventory_allocation: warehouseAgent.result,
});
```

---

## 💾 第五部分：Memory 系统架构

### 5.1 Three-Tier Memory 设计

Claude Code 的 memdir 系统采用**三层持久化**：

```
┌─ L1：转录级记忆（会话内）
│  └─ 当前对话的完整消息序列
│     存储位置：sessionStorage / localStorage
│     生命周期：单个对话（可恢复）
│     容量：~10MB（受浏览器限制）
│
├─ L2：自动提取记忆（用户级）
│  └─ 从历史对话自动提取的关键信息
│     存储位置：~/.claude/memory/CLAUDE.md
│     生命周期：跨会话持久化
│     提取规则：
│       ① Commit 历史摘要
│       ② 项目架构和依赖
│       ③ 已解决的问题和决策
│       ④ 用户偏好和工作流
│     更新频率：会话结束时自动提取
│
└─ L3：Team 同步记忆（协作级）
   └─ 多个 Sub-Agent 共享的记忆
      存储位置：团队共享目录 (SHARED_CLAUDE.md)
      生命周期：整个 Team 周期
      同步机制：
        ① Agent 查询时自动加载
        ② 关键发现通过 SendMessageTool 同步
        ③ Team 结束时合并贡献
```

### 5.2 自动记忆提取算法

```typescript
// src/services/extractMemories/index.ts
export class MemoryExtractor {
  async extractFromConversation(
    messages: Message[],
    previousMemory: string,
  ): Promise<string> {
    
    // ① 分段提取（避免一次处理过长）
    const segments = this.splitIntoSegments(messages, 50);
    const extractedFacts = [];
    
    for (const segment of segments) {
      // 调用小模型进行摘要（Claude 3.5 Sonnet）
      const facts = await api.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        system: `Extract key facts, decisions, and learnings from this conversation.
        Format as bullet points. Keep each fact to 1-2 sentences.
        Avoid redundancy with previous memory:
        ${previousMemory}`,
        messages: segment.map(m => ({
          role: m.type === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      });
      
      extractedFacts.push(facts.content[0].text);
    }
    
    // ② 合并和去重
    const merged = await this.mergeAndDeduplicate(
      previousMemory,
      extractedFacts,
    );
    
    // ③ 优化和排序
    return this.rankByImportance(merged);
  }
  
  private async mergeAndDeduplicate(
    previous: string,
    newFacts: string[],
  ): Promise<string> {
    // 使用 Jaccard 相似度检测重复
    const merged = [previous, ...newFacts].join('\n');
    
    return await api.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2000,
      system: `Merge these memories into a coherent document.
      Remove duplicates and contradictions.
      Keep most important facts first.`,
      messages: [{
        role: 'user',
        content: merged,
      }],
    }).then(r => r.content[0].text);
  }
}
```

### 5.3 Memory Injection 到 System Prompt

```typescript
// QueryEngine 中的内存加载
const customPrompt = customSystemPrompt;
const memoryPrompt = customPrompt && hasAutoMemPathOverride()
  ? await loadMemoryPrompt()
  : null;

const systemPrompt = asSystemPrompt([
  ...(customPrompt ? [customPrompt] : defaultSystemPrompt),
  ...(memoryPrompt ? [memoryPrompt] : []),  // ✅ 注入用户记忆
  ...(appendSystemPrompt ? [appendSystemPrompt] : []),
]);

// 生成的 System Prompt 类似：
/*
你是 Claude，一个 AI 编程助手。

## 用户背景信息（自动提取）
- 用户主要使用 TypeScript 和 Python
- 项目采用 Monorepo 结构（pnpm workspaces）
- 用户偏好函数式编程，避免 class 定义
- 最近在处理性能优化问题

## 项目历史决策
- 2026-04-20：决定迁移到 Zod v4（类型安全）
- 2026-04-15：确认采用 AsyncGenerator 模式代替 Promise
- 2026-04-10：修复了某个关键 bug（具体原因和解决方案）

## 已学习的约束
- 禁止在 for 循环中修改数组长度
- 所有的 API 错误都必须分类为 retryable/permanent
- 权限检查必须在工具执行前完成
*/
```

**对小云 AI 的升级方案**：

```typescript
// 当前小云：仅有 session 和 repo 两层
memory/
  ├── session/
  │   └── claude-code-optimization-analysis.md
  └── repo/
      └── scheduled-job-tenant-context.md

// 升级后：三层结构
memory/
  ├── user/
  │   ├── preferences.md          # 长期用户偏好
  │   ├── fashion_domain.md       # 服装行业知识
  │   └── project_decisions.md    # 历史重要决策
  │
  ├── session/
  │   ├── current-task.md         # 当前任务上下文
  │   └── debug-findings.md       # 调试发现
  │
  └── repo/
      ├── scheduled-job-tenant-context.md
      ├── production-flow-rules.md        # 生产流程约束
      ├── permission-rules.md             # 权限系统规则
      └── common-mistakes.md              # 常见错误模式

// 自动提取规则（针对小云业务）
async extractMemories(messages, previousMemory) {
  const facts = [];
  
  // 提取出现过的关键 Entity 和工作流
  const entities = extractEntities(messages);
  facts.push(`Entities in conversation: ${entities.join(', ')}`);
  
  // 提取解决过的问题
  const problemsSolved = extractProblems(messages);
  facts.push(...problemsSolved);
  
  // 提取关键权限决策
  const permissionDecisions = extractPermissions(messages);
  facts.push(...permissionDecisions);
  
  return merge(previousMemory, facts);
}
```

---

## 🔐 第六部分：权限系统的深度设计

### 6.1 Four-Mode Permission System

```typescript
// src/types/permissions.ts
export type PermissionMode = 'default' | 'plan' | 'bypassPermissions' | 'auto';

export interface ToolPermissionContext {
  mode: PermissionMode;                    // 当前模式
  additionalWorkingDirectories: Map<string, AdditionalWorkingDirectory>;
  alwaysAllowRules: ToolPermissionRulesBySource;    // 自动允许清单
  alwaysDenyRules: ToolPermissionRulesBySource;     // 自动拒绝清单
  alwaysAskRules: ToolPermissionRulesBySource;      // 强制询问清单
  isBypassPermissionsModeAvailable: boolean;        // 是否可切换到 bypass
  awaitAutomatedChecksBeforeDialog?: boolean;       // 对话前等待分类器
}

// 许可规则定义
export type ToolPermissionRulesBySource = {
  command?: string[];      // 根据 command 名
  bash?: string[];         // 根据 bash 命令
  bash_glob?: string[];    // 根据 glob 模式
  environment?: string[];  // 根据环境变量
};
```

### 6.2 Decision Flow Diagram

```
用户输入 "run make build"
  │
  ├─ 模式 = 'default'
  │  └─ 提示：允许运行 'make build'? [Y/n]
  │     ├─ 用户 Y  → 执行并记录
  │     └─ 用户 N  → 拒绝并尝试替代方案
  │
  ├─ 模式 = 'plan'
  │  └─ 收集所有工具计划
  │     ├─ AI 生成：
  │     │   1️⃣ 运行 'make build'
  │     │   2️⃣ 如果成功，运行 'npm test'
  │     │   3️⃣ 如果 test 失败，修复错误
  │     │
  │     └─ 用户审批整个计划
  │
  ├─ 模式 = 'bypassPermissions'
  │  └─ 直接执行（仅超管可用）
  │     └─ 记录：操作人员、时间、结果、涉及文件
  │
  └─ 模式 = 'auto'
     ├─ 自动分类器评分
     │  Input: {
     │    operation: 'bash_make_build',
     │    user_role: 'developer',
     │    affects_files: ['Makefile', 'src/**'],
     │    risk_level: calculated,
     │  }
     │  Output: { score: 0-1, reasoning: "...", confidence: 0.85 }
     │
     ├─ score < 0.3 (低风险)     → 自动允许
     ├─ 0.3 < score < 0.7 (中风险) → 提示用户（非阻塞）
     └─ score > 0.7 (高风险)     → 自动拒绝
```

### 6.3 小云 AI 的权限规则示例

```typescript
// backend/.../intelligence/config/permission-rules.ts

export const PERMISSION_RULES: Record<string, ToolPermissionRule[]> = {
  // ★ 扫码类工具：严格控制工厂隔离
  'tool_production_scan': [
    {
      mode: 'auto',
      checks: [
        checkFactoryIsolation(),      // 必须：员工只能扫本工厂订单
        checkScanType(),              // 必须：阻止非法扫码类型
        checkQuantity(),              // 中等：数量明显异常拒绝
        checkDuplicateScan(),         // 低等：重复扫码警告
      ],
    },
  ],
  
  // ★ 订单修改：需要多层批准
  'tool_order_edit': [
    {
      mode: 'auto',
      escalation: {
        交期改动: { requires_approval: true, approved_by: 'order_owner' },
        工厂改动: { requires_approval: true, approved_by: 'factory_admin' },
        备注修改: { requires_approval: false },
      },
    },
  ],
  
  // ★ 工资结算：严格审计
  'tool_payroll_settle': [
    {
      mode: 'plan',  // 必须先规划再执行
      checks: [
        checkFactoryBudget(),
        checkEmployeeStatus(),
        checkCalculationAccuracy(),
      ],
      audit: {
        record_to: 't_intelligence_decision_audit',
        fields: ['operator_id', 'settlement_id', 'decision', 'reason'],
      },
    },
  ],
};

// 权限决策函数
export async function determinePermission(
  tool: AgentTool,
  input: Record<string, unknown>,
  actor: User,
): Promise<PermissionResult> {
  const rules = PERMISSION_RULES[tool.name] ?? [];
  
  for (const rule of rules) {
    if (actor.permissionMode === rule.mode) {
      const checks = rule.checks || [];
      
      for (const check of checks) {
        const result = await check(input, actor);
        
        if (!result.allowed) {
          return {
            behavior: result.severity === 'high' ? 'deny' : 'prompt',
            reason: result.message,
            updatedInput: input,
          };
        }
      }
    }
  }
  
  return { behavior: 'allow', updatedInput: input };
}
```

---

## 🚀 第七部分：小云 AI 升级路线图

### Phase 1：基础设施（第 1-2 周）

| 任务 | 优先级 | 依赖 | 输出物 |
|------|--------|------|--------|
| AsyncGenerator 重构 Query 引擎 | P0 | 无 | `AiAgentOrchestrator.queryStream()` |
| 扩展权限系统至 4 种模式 | P0 | 无 | `PermissionDecisionOrchestrator` |
| 建立三层内存系统 | P1 | AiAgent | `/memories/{user,session,repo}/` |
| 特性开关框架（编译期） | P1 | 无 | `src/feature-flags.ts` |

### Phase 2：工具扩展（第 3-4 周）

```typescript
// 补齐缺失的 AgentTool

// 已有 21 个：
ScanUndoTool, CuttingTaskTool, OrderEditTool, PayrollApproveTool, ...

// 需新增（参考 Claude Code 的 40+ 工具）：
✅ SkillDiscoveryTool          // 动态工具发现（对标 ToolSearchTool）
✅ ConversationMemoryTool      // 主动加载相关历史（对标 memdir loading）
✅ ExecPlanTool                // 规划模式执行（对标 plan mode）
✅ RolePlayTool                // Sub-Agent 角色扮演（对标 AgentTool）
✅ NotificationTool            // 即时通知（对标 RemoteTriggerTool）
✅ DataExportTool              // 结构化数据导出（对标 SyntheticOutputTool）
```

### Phase 3：多 Agent 编排（第 5-6 周）

```
目标：支持"编织团队"任务

示例：订单全链路规划
┌──────────────────────────────────────────────────┐
│ 用户请求："规划订单 PO20260426001 的完整执行"      │
└──────────────────────────────────────────────────┘
          │
    [TeamCreateTool]
          │
    ┌─────┴─────┬─────────┬──────────┐
    │           │         │          │
    ▼           ▼         ▼          ▼
 采购Agent   工序Agent  库存Agent  质检Agent
   │           │         │          │
 检查面料     规划工期   分配库位   制定标准
   │           │         │          │
   └─────┬─────┴─────────┴──────────┘
         │
    [Coordinator]
    冲突解决 + 依赖排序
         │
         ▼
    [综合计划生成]
    输出：订单执行路径表
```

### Phase 4：生产就绪（第 7-8 周）

- [ ] 性能基准测试（stream latency < 500ms）
- [ ] 安全审计（权限系统渗透测试）
- [ ] 可观测性提升（添加更多 trace）
- [ ] 文档完善（API 文档、最佳实践指南）

---

## 📊 对标总结表

| 能力维度 | Claude Code | 小云 AI（当前） | 小云 AI（升级后） | 升级工作量 |
|--------|------------|----------------|-----------------|---------|
| **Query 流式处理** | ✅ AsyncGenerator | ❌ 同步 Orchestrator | ✅ AsyncGenerator | 中 |
| **权限模式** | 4 种（default/plan/bypass/auto） | 2 种 | ✅ 4 种 | 中 |
| **工具总数** | 40+ | 21 | ✅ 35+ | 中 |
| **多 Agent 编排** | ✅ TeamCreateTool + Coordinator | ❌ 独立 Sub-Agent | ✅ 完整 Coordinator | 大 |
| **内存系统** | 3 层（转录/自动提取/Team 同步） | 2 层（session/repo） | ✅ 3 层 | 中 |
| **命令系统** | 50+ 命令 + 自动完成 | 内嵌逻辑 | ✅ 声明式注册 | 小 |
| **错误恢复** | 自动重试 + 预算管理 | 部分 | ✅ 完整实现 | 中 |
| **功能开关** | Bun 编译期消除 | 环境变量 | ✅ 编译期标志 | 小 |

**总体工作量估算**：
- **基础设施**：40 人天
- **工具扩展**：20 人天  
- **多 Agent 编排**：60 人天
- **测试和优化**：30 人天
- **总计**：150 人天（3-4 个月，按 1 人全职）

---

## 🎯 立即可实施的改进清单

> 优先级排序，从易到难

### 立即（本周）

- [ ] **权限规则配置化** - 从硬编码改为表驱动
  ```typescript
  // 修改 PermissionDecisionOrchestrator.ts
  // 使用本文 Section 6.3 的规则表
  ```

- [ ] **记忆系统三层化** - 从 2 层扩为 3 层
  ```typescript
  // 创建 /memories/user/ 目录
  // 实现 MemoryExtractor 自动提取逻辑
  ```

### 短期（2 周）

- [ ] **AsyncGenerator 重构** - 主查询引擎改为流式
  ```typescript
  // 修改 QueryEngine 返回 AsyncGenerator<ToolMessage>
  // 更新前端 WebSocket 接收器
  ```

- [ ] **缺失工具补齐** - 新增 10-15 个 AgentTool
  ```typescript
  // 参考本文 Phase 2 清单
  ```

### 中期（4-6 周）

- [ ] **多 Agent Coordinator** - 实现 Team 编排
- [ ] **编译期特性开关** - 从运行时升级到编译期

### 长期（8+ 周）

- [ ] **自动化决策分类器** - 训练 ML 模型
- [ ] **Team 记忆同步** - 多 Agent 协作历史记录

---

## 📚 参考资源

### Claude Code 源代码位置
- QueryEngine：`src/QueryEngine.ts` (46K 行)
- Tool 系统：`src/Tool.ts` (29K 行)
- Coordinator：`src/coordinator/` (多个文件)
- 权限系统：`src/hooks/toolPermission/` 
- 内存系统：`src/memdir/`

### 关键论文和概念
- **ReAct（Reason+Act）**：AI Agent 的思维-行动循环
- **Tool Use 协议**：OpenAI Function Calling / Anthropic Tool Use
- **Safety 和 Alignment**：权限系统作为对齐机制
- **Memory 系统**：长期信息保留和上下文窗口管理

### 小云 AI 参考文档
- `开发指南.md`：系统架构（Orchestrator 分层）
- `AI_EXECUTION_ENGINE_FILES.md`：AI 模块全景
- `系统状态.md`：当前智能化建设进度
- `copilot-instructions.md`：AI 协作指令

---

## 🔗 关键链接

| 文件 | 位置 | 用途 |
|------|------|------|
| 系统蓝图更新 | `系统状态.md` | 每周同步升级进度 |
| 权限规则配置 | `backend/.../permission-rules.ts` | 运行时决策 |
| AgentTool 清单 | `AI_EXECUTION_ENGINE_FILES.md` | 工具注册 |
| 内存管理 | `/memories/` | 三层持久化 |
| 特性标志 | `backend/src/feature-flags.ts` | 编译期控制 |

---

**文档完成时间**：2026-04-26  
**审核状态**：✅ 基于 Claude Code v1.0 源代码分析  
**下一步**：选择 Phase 1 任务，启动实施
