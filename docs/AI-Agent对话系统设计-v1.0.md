# AI Agent 对话系统设计

> **版本**：v1.0  
> **日期**：2026-03-29  
> **关联文档**：智能化升级设计方案-v1.0.md

---

## 目录

1. [系统概述](#1-系统概述)
2. [架构设计](#2-架构设计)
3. [工具系统](#3-工具系统)
4. [对话流程](#4-对话流程)
5. [上下文管理](#5-上下文管理)
6. [前端实现](#6-前端实现)
7. [后端实现](#7-后端实现)

---

## 1. 系统概述

### 1.1 定位

小云智能助手是服装供应链系统的 AI 对话入口，用户可以通过自然语言与系统交互，完成：

- **数据查询**：查询订单、库存、生产进度等
- **智能分析**：订单健康度、交付风险、成本偏差分析
- **操作执行**：催办、派单、采购、审批等
- **知识问答**：工艺知识、操作指南、最佳实践

### 1.2 核心能力

```
┌─────────────────────────────────────────────────────────────────┐
│                    小云智能助手核心能力                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   🎯 意图识别                                                   │
│   ├── 22 种业务意图识别                                         │
│   ├── 多轮对话上下文理解                                        │
│   └── 模糊查询智能补全                                          │
│                                                                 │
│   🔧 工具调用                                                   │
│   ├── 65+ AI 工具集成                                           │
│   ├── 自动工具选择与执行                                        │
│   └── 工具结果智能解析                                          │
│                                                                 │
│   📚 知识增强                                                   │
│   ├── RAG 知识检索（50 条知识库）                               │
│   ├── 向量相似度召回                                            │
│   └── Cohere Reranker 精排                                     │
│                                                                 │
│   💬 对话管理                                                   │
│   ├── 多轮对话记忆                                              │
│   ├── 会话状态管理                                              │
│   └── 历史记录追溯                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 用户体验目标

| 指标 | 目标值 | 说明 |
|------|--------|------|
| 首次响应时间 | < 2s | 首字节响应时间 |
| 工具调用成功率 | > 95% | 工具执行成功率 |
| 意图识别准确率 | > 90% | 正确识别用户意图 |
| 用户满意度 | > 4.5/5 | 用户评分 |

---

## 2. 架构设计

### 2.1 整体架构

```
┌────────────────────────────────────────────────────────────────────────┐
│                           用户界面层                                    │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │
│   │   PC 端对话     │  │  小程序对话     │  │   API 调用      │       │
│   └─────────────────┘  └─────────────────┘  └─────────────────┘       │
├────────────────────────────────────────────────────────────────────────┤
│                           对话网关层                                    │
│   ┌─────────────────────────────────────────────────────────────┐     │
│   │              AiAgentOrchestrator                             │     │
│   │         会话管理 / 限流 / 路由 / 日志                         │     │
│   └─────────────────────────────────────────────────────────────┘     │
├────────────────────────────────────────────────────────────────────────┤
│                           核心处理层                                    │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐   │
│   │ 意图识别    │  │ 工具选择    │  │ 知识检索    │  │ 响应生成  │   │
│   │ NlQuery     │  │ ToolRouter  │  │ RAG         │  │ LLM       │   │
│   └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘   │
├────────────────────────────────────────────────────────────────────────┤
│                           工具执行层                                    │
│   ┌─────────────────────────────────────────────────────────────┐     │
│   │                    ExecutionEngineOrchestrator               │     │
│   │                                                              │     │
│   │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │     │
│   │  │订单工具 │ │生产工具 │ │财务工具 │ │仓库工具 │ │派单工具│ │     │
│   │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └───────┘ │     │
│   └─────────────────────────────────────────────────────────────┘     │
├────────────────────────────────────────────────────────────────────────┤
│                           数据存储层                                    │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────┐   │
│   │ PostgreSQL  │  │   Redis     │  │  Qdrant     │  │  LiteLLM  │   │
│   │ 对话记忆    │  │  会话缓存   │  │  向量检索   │  │  模型网关 │   │
│   └─────────────┘  └─────────────┘  └─────────────┘  └───────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
用户输入
    │
    ▼
┌─────────────────┐
│  1. 意图识别    │ ──── NlQueryOrchestrator
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  2. 上下文构建  │ ──── AiContextBuilderService
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  3. 知识检索    │ ──── KnowledgeSearchTool + Qdrant
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  4. 工具选择    │ ──── ToolRouter
└─────────────────┘
    │
    ├─── 无需工具 ───→ 直接生成响应
    │
    ▼
┌─────────────────┐
│  5. 工具执行    │ ──── ExecutionEngineOrchestrator
└─────────────────┘
    │
    ▼
┌─────────────────┐
│  6. 响应生成    │ ──── LiteLLM / OpenAI
└─────────────────┘
    │
    ▼
用户输出
```

---

## 3. 工具系统

### 3.1 工具分类

```
AI 工具库（65+ 工具）
│
├── 📦 订单管理工具
│   ├── OrderEditTool              # 订单编辑
│   ├── OrderQueryTool             # 订单查询
│   ├── OrderLearningTool          # 订单学习
│   ├── NewOrderSimulationTool     # 新订单模拟
│   └── ProductionOrderCreationTool # 生产订单创建
│
├── 🏭 生产管理工具
│   ├── CuttingTaskTool            # 裁剪任务
│   ├── ProductionProgressTool     # 生产进度
│   ├── BundleSplitTransferTool    # 拆菲转派
│   ├── QualityScanTool            # 质检扫描
│   └── FactoryCapacityTool        # 工厂产能
│
├── 💰 财务管理工具
│   ├── FinanceWorkflowTool        # 财务工作流
│   ├── FinancialPayrollTool       # 工资处理
│   ├── TaxExportTool              # 税务导出
│   ├── InvoiceTool                # 发票管理
│   └── SettlementTool             # 结算管理
│
├── 📦 仓库管理工具
│   ├── MaterialReceiveTool        # 物料接收
│   ├── FinishedOutboundTool       # 成品出库
│   ├── WarehouseOpLogTool         # 仓库日志
│   ├── SampleLoanTool             # 样衣借调
│   └── StockQueryTool             # 库存查询
│
├── 👥 派单管理工具
│   ├── TeamDispatchTool           # 团队派单
│   ├── SmartAssignmentTool        # 智能派工
│   ├── TaskStatusTool             # 任务状态
│   └── WorkerProfileTool          # 工人画像
│
├── 📊 分析工具
│   ├── DeepAnalysisTool           # 深度分析
│   ├── PatternDiscoveryTool       # 模式发现
│   ├── KnowledgeSearchTool        # 知识检索
│   ├── BomCostCalculator          # BOM 成本计算
│   └── QuickOrderBuilder          # 快速建单
│
└── 🔧 系统工具
    ├── SmartReportTool            # 智能报告
    ├── ChangeApprovalTool         # 变更审批
    ├── ActionExecutorTool         # 动作执行
    └── SampleWorkflowTool         # 样衣工作流
```

### 3.2 工具定义规范

```java
/**
 * AI 工具基类
 */
public abstract class AiTool {
    
    protected final String name;
    protected final String description;
    protected final Map<String, ParameterSchema> parameters;
    
    public abstract ToolResult execute(ToolExecutionContext context);
    
    public ToolDefinition toDefinition() {
        return ToolDefinition.builder()
            .name(name)
            .description(description)
            .parameters(parameters)
            .build();
    }
}

/**
 * 订单查询工具示例
 */
@Component
public class OrderQueryTool extends AiTool {
    
    @Autowired
    private ProductionOrderService orderService;
    
    public OrderQueryTool() {
        this.name = "query_orders";
        this.description = "查询生产订单列表，支持按订单号、款号、状态、工厂等条件筛选";
        this.parameters = Map.of(
            "orderNo", ParameterSchema.builder()
                .type("string")
                .description("订单号，支持模糊匹配")
                .required(false)
                .build(),
            "styleNo", ParameterSchema.builder()
                .type("string")
                .description("款号")
                .required(false)
                .build(),
            "status", ParameterSchema.builder()
                .type("string")
                .enumValues(List.of("PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"))
                .description("订单状态")
                .required(false)
                .build(),
            "factoryId", ParameterSchema.builder()
                .type("integer")
                .description("工厂ID")
                .required(false)
                .build(),
            "riskLevel", ParameterSchema.builder()
                .type("string")
                .enumValues(List.of("LOW", "MEDIUM", "HIGH", "CRITICAL"))
                .description("风险级别")
                .required(false)
                .build()
        );
    }
    
    @Override
    public ToolResult execute(ToolExecutionContext context) {
        Map<String, Object> args = context.getArguments();
        
        LambdaQueryWrapper<ProductionOrder> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ProductionOrder::getTenantId, context.getTenantId());
        
        if (args.containsKey("orderNo")) {
            wrapper.like(ProductionOrder::getOrderNo, args.get("orderNo"));
        }
        if (args.containsKey("styleNo")) {
            wrapper.like(ProductionOrder::getStyleNo, args.get("styleNo"));
        }
        if (args.containsKey("status")) {
            wrapper.eq(ProductionOrder::getStatus, args.get("status"));
        }
        if (args.containsKey("factoryId")) {
            wrapper.eq(ProductionOrder::getFactoryId, args.get("factoryId"));
        }
        
        List<ProductionOrder> orders = orderService.list(wrapper);
        
        return ToolResult.builder()
            .success(true)
            .data(Map.of(
                "orders", orders,
                "total", orders.size()
            ))
            .message(String.format("查询到 %d 条订单记录", orders.size()))
            .build();
    }
}
```

### 3.3 工具注册与发现

```java
/**
 * 工具注册中心
 */
@Service
public class ToolRegistry {
    
    private final Map<String, AiTool> tools = new ConcurrentHashMap<>();
    
    @Autowired
    public ToolRegistry(List<AiTool> toolList) {
        toolList.forEach(tool -> tools.put(tool.getName(), tool));
    }
    
    public AiTool getTool(String name) {
        return tools.get(name);
    }
    
    public List<ToolDefinition> getAllDefinitions() {
        return tools.values().stream()
            .map(AiTool::toDefinition)
            .collect(Collectors.toList());
    }
    
    public List<ToolDefinition> getRelevantTools(String intent) {
        return switch (intent) {
            case "QUERY_ORDER" -> filterTools("query_orders", "order_edit", "order_learning");
            case "QUERY_PRODUCTION" -> filterTools("production_progress", "cutting_task", "quality_scan");
            case "QUERY_FINANCE" -> filterTools("finance_workflow", "financial_payroll", "settlement");
            case "QUERY_WAREHOUSE" -> filterTools("material_receive", "finished_outbound", "stock_query");
            case "DISPATCH" -> filterTools("team_dispatch", "smart_assignment", "task_status");
            default -> getAllDefinitions();
        };
    }
    
    private List<ToolDefinition> filterTools(String... names) {
        return Arrays.stream(names)
            .map(tools::get)
            .filter(Objects::nonNull)
            .map(AiTool::toDefinition)
            .collect(Collectors.toList());
    }
}
```

---

## 4. 对话流程

### 4.1 意图识别

```java
/**
 * 意图识别编排器
 */
@Service
public class NlQueryOrchestrator {
    
    private static final Map<String, List<String>> INTENT_PATTERNS = Map.of(
        "QUERY_ORDER", List.of("订单", "查订单", "订单列表", "订单状态"),
        "QUERY_PRODUCTION", List.of("生产", "进度", "扫码", "工序"),
        "QUERY_FINANCE", List.of("财务", "结算", "工资", "对账"),
        "QUERY_WAREHOUSE", List.of("库存", "仓库", "入库", "出库"),
        "DISPATCH", List.of("派单", "派工", "分配", "安排"),
        "ANALYZE_RISK", List.of("风险", "健康度", "预警", "异常"),
        "EXECUTE_ACTION", List.of("催办", "审批", "创建", "删除", "修改"),
        "KNOWLEDGE_QA", List.of("怎么", "如何", "什么是", "帮助")
    );
    
    public IntentResult recognize(String query) {
        // 1. 关键词匹配
        String intent = matchIntent(query);
        
        // 2. 提取实体
        Map<String, Object> entities = extractEntities(query, intent);
        
        // 3. 计算置信度
        double confidence = calculateConfidence(query, intent, entities);
        
        return IntentResult.builder()
            .intent(intent)
            .entities(entities)
            .confidence(confidence)
            .originalQuery(query)
            .build();
    }
    
    private String matchIntent(String query) {
        for (Map.Entry<String, List<String>> entry : INTENT_PATTERNS.entrySet()) {
            for (String pattern : entry.getValue()) {
                if (query.contains(pattern)) {
                    return entry.getKey();
                }
            }
        }
        return "UNKNOWN";
    }
    
    private Map<String, Object> extractEntities(String query, String intent) {
        Map<String, Object> entities = new HashMap<>();
        
        // 提取订单号
        Pattern orderNoPattern = Pattern.compile("PO\\d{10,}");
        Matcher orderNoMatcher = orderNoPattern.matcher(query);
        if (orderNoMatcher.find()) {
            entities.put("orderNo", orderNoMatcher.group());
        }
        
        // 提取款号
        Pattern styleNoPattern = Pattern.compile("[A-Z]{2}\\d{6,}");
        Matcher styleNoMatcher = styleNoPattern.matcher(query);
        if (styleNoMatcher.find()) {
            entities.put("styleNo", styleNoMatcher.group());
        }
        
        // 提取数量
        Pattern numberPattern = Pattern.compile("(\\d+)\\s*(件|个|条|米)");
        Matcher numberMatcher = numberPattern.matcher(query);
        if (numberMatcher.find()) {
            entities.put("quantity", Integer.parseInt(numberMatcher.group(1)));
        }
        
        return entities;
    }
    
    private double calculateConfidence(String query, String intent, Map<String, Object> entities) {
        double baseConfidence = "UNKNOWN".equals(intent) ? 0.3 : 0.7;
        
        // 有实体提取则增加置信度
        if (!entities.isEmpty()) {
            baseConfidence += 0.1 * entities.size();
        }
        
        return Math.min(1.0, baseConfidence);
    }
}
```

### 4.2 工具选择

```java
/**
 * 工具路由器
 */
@Service
public class ToolRouter {
    
    @Autowired
    private ToolRegistry toolRegistry;
    
    @Autowired
    private LiteLLMClient llmClient;
    
    public List<ToolCall> selectTools(IntentResult intent, String query) {
        // 1. 获取相关工具
        List<ToolDefinition> relevantTools = toolRegistry.getRelevantTools(intent.getIntent());
        
        // 2. 构建提示词
        String prompt = buildToolSelectionPrompt(query, intent, relevantTools);
        
        // 3. 调用 LLM 选择工具
        ToolSelectionResponse response = llmClient.chat(ToolSelectionRequest.builder()
            .model("gpt-4-turbo")
            .messages(List.of(
                ChatMessage.system("你是一个工具选择专家，根据用户意图选择最合适的工具。"),
                ChatMessage.user(prompt)
            ))
            .tools(relevantTools)
            .toolChoice("auto")
            .build());
        
        // 4. 解析工具调用
        return response.getToolCalls();
    }
    
    private String buildToolSelectionPrompt(String query, IntentResult intent, List<ToolDefinition> tools) {
        return String.format("""
            用户问题：%s
            
            识别到的意图：%s
            提取的实体：%s
            
            可用工具列表：
            %s
            
            请选择最合适的工具来回答用户问题。
            """,
            query,
            intent.getIntent(),
            intent.getEntities(),
            tools.stream()
                .map(t -> String.format("- %s: %s", t.getName(), t.getDescription()))
                .collect(Collectors.joining("\n"))
        );
    }
}
```

### 4.3 响应生成

```java
/**
 * 响应生成器
 */
@Service
public class ResponseGenerator {
    
    @Autowired
    private LiteLLMClient llmClient;
    
    @Autowired
    private IntelligenceMemoryOrchestrator memoryOrchestrator;
    
    public String generate(GenerationContext context) {
        // 1. 构建系统提示词
        String systemPrompt = buildSystemPrompt(context);
        
        // 2. 检索相关记忆
        List<SimilarCase> similarCases = memoryOrchestrator.recallSimilarCases(
            context.getQuery()
        );
        
        // 3. 构建消息列表
        List<ChatMessage> messages = new ArrayList<>();
        messages.add(ChatMessage.system(systemPrompt));
        
        // 添加历史对话
        if (context.getHistory() != null) {
            messages.addAll(context.getHistory());
        }
        
        // 添加当前问题
        messages.add(ChatMessage.user(context.getQuery()));
        
        // 添加工具执行结果
        if (context.getToolResults() != null && !context.getToolResults().isEmpty()) {
            StringBuilder toolResultBuilder = new StringBuilder("工具执行结果：\n");
            for (ToolResult result : context.getToolResults()) {
                toolResultBuilder.append(String.format("- %s: %s\n", 
                    result.getToolName(), 
                    result.getMessage()));
                if (result.getData() != null) {
                    toolResultBuilder.append(String.format("  数据: %s\n", 
                        JsonUtils.toJson(result.getData())));
                }
            }
            messages.add(ChatMessage.assistant(toolResultBuilder.toString()));
        }
        
        // 添加相似案例
        if (!similarCases.isEmpty()) {
            StringBuilder caseBuilder = new StringBuilder("参考历史案例：\n");
            for (SimilarCase c : similarCases) {
                caseBuilder.append(String.format("- %s: %s\n", 
                    c.getTitle(), c.getSummary()));
            }
            messages.add(ChatMessage.system(caseBuilder.toString()));
        }
        
        // 4. 调用 LLM 生成响应
        ChatResponse response = llmClient.chat(ChatRequest.builder()
            .model("gpt-4-turbo")
            .messages(messages)
            .temperature(0.7)
            .maxTokens(2000)
            .build());
        
        return response.getContent();
    }
    
    private String buildSystemPrompt(GenerationContext context) {
        return String.format("""
            你是服装供应链智能助手小云。
            
            当前时间：%s
            当前租户：%s
            当前用户：%s
            
            回答要求：
            1. 简洁明了，重点突出
            2. 提供具体数据和原因
            3. 给出可执行的建议
            4. 使用 Markdown 格式
            5. 如果涉及操作，提供操作按钮
            
            回答风格：
            - 专业但不生硬
            - 友好但不啰嗦
            - 准确但不绝对
            """,
            LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")),
            context.getTenantName(),
            context.getUserName()
        );
    }
}
```

---

## 5. 上下文管理

### 5.1 会话管理

```java
/**
 * 会话管理器
 */
@Service
public class ConversationManager {
    
    @Autowired
    private RedisService redisService;
    
    private static final String CONVERSATION_KEY_PREFIX = "conversation:";
    private static final int MAX_HISTORY_TURNS = 10;
    private static final int SESSION_TIMEOUT_HOURS = 24;
    
    public ConversationSession getOrCreateSession(String sessionId, Long tenantId, String userId) {
        String key = CONVERSATION_KEY_PREFIX + sessionId;
        
        ConversationSession session = redisService.get(key, ConversationSession.class);
        
        if (session == null) {
            session = ConversationSession.builder()
                .sessionId(sessionId)
                .tenantId(tenantId)
                .userId(userId)
                .createdAt(LocalDateTime.now())
                .messages(new ArrayList<>())
                .context(new HashMap<>())
                .build();
        }
        
        return session;
    }
    
    public void addMessage(String sessionId, ChatMessage message) {
        String key = CONVERSATION_KEY_PREFIX + sessionId;
        ConversationSession session = redisService.get(key, ConversationSession.class);
        
        if (session != null) {
            session.getMessages().add(message);
            
            // 限制历史消息数量
            if (session.getMessages().size() > MAX_HISTORY_TURNS * 2) {
                session.setMessages(session.getMessages().subList(
                    session.getMessages().size() - MAX_HISTORY_TURNS * 2,
                    session.getMessages().size()
                ));
            }
            
            redisService.set(key, session, SESSION_TIMEOUT_HOURS, TimeUnit.HOURS);
        }
    }
    
    public List<ChatMessage> getHistory(String sessionId) {
        String key = CONVERSATION_KEY_PREFIX + sessionId;
        ConversationSession session = redisService.get(key, ConversationSession.class);
        
        return session != null ? session.getMessages() : Collections.emptyList();
    }
    
    public void setContext(String sessionId, String key, Object value) {
        String redisKey = CONVERSATION_KEY_PREFIX + sessionId;
        ConversationSession session = redisService.get(redisKey, ConversationSession.class);
        
        if (session != null) {
            session.getContext().put(key, value);
            redisService.set(redisKey, session, SESSION_TIMEOUT_HOURS, TimeUnit.HOURS);
        }
    }
    
    public Object getContext(String sessionId, String key) {
        String redisKey = CONVERSATION_KEY_PREFIX + sessionId;
        ConversationSession session = redisService.get(redisKey, ConversationSession.class);
        
        return session != null ? session.getContext().get(key) : null;
    }
}

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
class ConversationSession {
    private String sessionId;
    private Long tenantId;
    private String userId;
    private LocalDateTime createdAt;
    private List<ChatMessage> messages;
    private Map<String, Object> context;
}
```

### 5.2 上下文构建

```java
/**
 * 上下文构建器
 */
@Service
public class AiContextBuilderService {
    
    @Autowired
    private ConversationManager conversationManager;
    
    @Autowired
    private UserService userService;
    
    @Autowired
    private TenantService tenantService;
    
    public AiContext buildContext(String sessionId, String query) {
        ConversationSession session = conversationManager.getOrCreateSession(
            sessionId, 
            UserContext.tenantId(), 
            UserContext.userId()
        );
        
        // 用户信息
        User user = userService.getById(UserContext.userId());
        Tenant tenant = tenantService.getById(UserContext.tenantId());
        
        // 历史对话
        List<ChatMessage> history = conversationManager.getHistory(sessionId);
        
        // 上下文变量
        Map<String, Object> contextVars = session.getContext();
        
        return AiContext.builder()
            .sessionId(sessionId)
            .tenantId(session.getTenantId())
            .tenantName(tenant.getName())
            .userId(session.getUserId())
            .userName(user.getRealName())
            .userRole(user.getRoleName())
            .query(query)
            .history(history)
            .contextVars(contextVars)
            .timestamp(LocalDateTime.now())
            .build();
    }
    
    public void updateContext(String sessionId, Map<String, Object> updates) {
        updates.forEach((key, value) -> {
            conversationManager.setContext(sessionId, key, value);
        });
    }
}

@Data
@Builder
class AiContext {
    private String sessionId;
    private Long tenantId;
    private String tenantName;
    private String userId;
    private String userName;
    private String userRole;
    private String query;
    private List<ChatMessage> history;
    private Map<String, Object> contextVars;
    private LocalDateTime timestamp;
}
```

---

## 6. 前端实现

### 6.1 对话组件

```tsx
// components/intelligence/AiAssistant.tsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  Drawer, 
  Input, 
  Button, 
  Avatar, 
  Spin, 
  Space, 
  Tooltip,
  message 
} from 'antd';
import {
  SendOutlined,
  AudioOutlined,
  PaperClipOutlined,
  CloseOutlined,
  ReloadOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { useIntelligenceChat } from '@/hooks/useIntelligenceChat';
import type { IntelligenceInsight, NextAction } from './IntelligenceCard';
import { IntelligenceCard } from './IntelligenceCard';
import './AiAssistant.css';

interface AiAssistantProps {
  open: boolean;
  onClose: () => void;
  onAction?: (action: NextAction) => void;
}

export const AiAssistant: React.FC<AiAssistantProps> = ({
  open,
  onClose,
  onAction,
}) => {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const {
    messages,
    isLoading,
    append,
    reload,
    stop,
    sendQuickCommand,
    quickCommands,
  } = useIntelligenceChat({
    onError: (error) => {
      message.error(`对话出错: ${error.message}`);
    },
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    await append({
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
    });
    
    setInput('');
  };

  const handleCopy = (content: string) => {
    navigator.clipboard.writeText(content);
    message.success('已复制到剪贴板');
  };

  return (
    <Drawer
      title={
        <div className="assistant-header">
          <Avatar style={{ background: '#1890ff' }}>云</Avatar>
          <span className="assistant-title">小云智能助手</span>
        </div>
      }
      placement="right"
      width={480}
      onClose={onClose}
      open={open}
      className="ai-assistant-drawer"
      extra={
        <Space>
          {isLoading && (
            <Button icon={<CloseOutlined />} onClick={stop}>
              停止
            </Button>
          )}
          <Button icon={<ReloadOutlined />} onClick={reload}>
            重试
          </Button>
        </Space>
      }
    >
      <div className="assistant-content">
        {/* 消息列表 */}
        <div className="messages-container">
          {messages
            .filter((m) => m.role !== 'system')
            .map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                onCopy={handleCopy}
                onAction={onAction}
              />
            ))}
          
          {isLoading && (
            <div className="loading-indicator">
              <Spin size="small" />
              <span>小云正在思考...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        {/* 快捷命令 */}
        <div className="quick-commands">
          {quickCommands.map((cmd) => (
            <Button
              key={cmd.label}
              size="small"
              onClick={() => sendQuickCommand(cmd.command)}
            >
              {cmd.icon} {cmd.label}
            </Button>
          ))}
        </div>

        {/* 输入区域 */}
        <div className="input-area">
          <Input.TextArea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="问我任何问题..."
            autoSize={{ minRows: 1, maxRows: 4 }}
            onPressEnter={(e) => {
              if (!e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Space>
            <Tooltip title="语音输入">
              <Button icon={<AudioOutlined />} />
            </Tooltip>
            <Tooltip title="上传文件">
              <Button icon={<PaperClipOutlined />} />
            </Tooltip>
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleSend}
              loading={isLoading}
            >
              发送
            </Button>
          </Space>
        </div>
      </div>
    </Drawer>
  );
};

// 消息气泡组件
interface MessageBubbleProps {
  message: any;
  onCopy: (content: string) => void;
  onAction?: (action: NextAction) => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  onCopy,
  onAction,
}) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={`message-bubble ${isUser ? 'user' : 'assistant'}`}>
      {!isUser && (
        <Avatar className="avatar" style={{ background: '#1890ff' }}>
          云
        </Avatar>
      )}
      
      <div className="content">
        <div className="text">
          {isUser ? (
            message.content
          ) : (
            <ReactMarkdown>{message.content}</ReactMarkdown>
          )}
        </div>
        
        {/* 工具调用结果 */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="tool-results">
            {message.toolCalls.map((tool: any, index: number) => (
              <ToolResultCard key={index} tool={tool} />
            ))}
          </div>
        )}
        
        {/* 智能建议卡片 */}
        {message.insights && message.insights.length > 0 && (
          <div className="insights">
            {message.insights.map((insight: IntelligenceInsight) => (
              <IntelligenceCard
                key={insight.id}
                insight={insight}
                onAction={onAction}
                compact
              />
            ))}
          </div>
        )}
        
        <div className="message-footer">
          <span className="timestamp">
            {new Date(message.createdAt || Date.now()).toLocaleTimeString()}
          </span>
          {!isUser && (
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => onCopy(message.content)}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// 工具结果卡片
const ToolResultCard: React.FC<{ tool: any }> = ({ tool }) => {
  const success = tool.result?.success;
  
  return (
    <div className={`tool-result-card ${success ? 'success' : 'error'}`}>
      <div className="tool-name">
        🔧 {tool.name}
      </div>
      <div className="tool-message">
        {tool.result?.message || '执行完成'}
      </div>
    </div>
  );
};
```

### 6.2 样式文件

```css
/* AiAssistant.css */

.ai-assistant-drawer .ant-drawer-body {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.assistant-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.assistant-title {
  font-size: 16px;
  font-weight: 600;
}

.assistant-content {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.message-bubble {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.message-bubble.user {
  flex-direction: row-reverse;
}

.message-bubble .avatar {
  flex-shrink: 0;
}

.message-bubble .content {
  max-width: 80%;
  padding: 12px 16px;
  border-radius: 12px;
  background: #f5f5f5;
}

.message-bubble.user .content {
  background: #1890ff;
  color: #fff;
}

.message-bubble .text {
  line-height: 1.6;
}

.message-bubble .text p {
  margin: 0 0 8px 0;
}

.message-bubble .text p:last-child {
  margin-bottom: 0;
}

.message-bubble .text ul, 
.message-bubble .text ol {
  margin: 8px 0;
  padding-left: 20px;
}

.message-bubble .text code {
  background: rgba(0, 0, 0, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
}

.message-bubble .text pre {
  background: rgba(0, 0, 0, 0.05);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
}

.message-bubble .tool-results {
  margin-top: 12px;
}

.tool-result-card {
  background: rgba(0, 0, 0, 0.03);
  padding: 10px 12px;
  border-radius: 6px;
  margin-bottom: 8px;
  border-left: 3px solid #1890ff;
}

.tool-result-card.error {
  border-left-color: #f5222d;
  background: #fff1f0;
}

.tool-result-card .tool-name {
  font-size: 12px;
  color: #8c8c8c;
  margin-bottom: 4px;
}

.tool-result-card .tool-message {
  font-size: 13px;
}

.message-bubble .insights {
  margin-top: 12px;
}

.message-bubble .insights .intelligence-card {
  margin-bottom: 8px;
}

.message-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
}

.timestamp {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.45);
}

.loading-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  color: #8c8c8c;
}

.quick-commands {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid #f0f0f0;
  overflow-x: auto;
  flex-wrap: wrap;
}

.input-area {
  display: flex;
  gap: 12px;
  padding: 16px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}

.input-area .ant-input-textarea {
  flex: 1;
}
```

---

## 7. 后端实现

### 7.1 控制器

```java
/**
 * AI Agent 控制器
 */
@RestController
@RequestMapping("/api/intelligence/agent")
@PreAuthorize("isAuthenticated()")
public class AiAgentController {

    @Autowired
    private AiAgentOrchestrator agentOrchestrator;

    @PostMapping("/chat")
    public SseEmitter chat(@RequestBody ChatRequest request) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        
        SseEmitter emitter = new SseEmitter(60000L); // 60秒超时
        
        agentOrchestrator.chatStreaming(
            request.getSessionId(),
            request.getMessage(),
            tenantId,
            userId,
            new StreamingCallback() {
                @Override
                public void onToken(String token) {
                    try {
                        emitter.send(SseEmitter.event()
                            .name("token")
                            .data(token));
                    } catch (IOException e) {
                        emitter.completeWithError(e);
                    }
                }
                
                @Override
                public void onToolCall(ToolCallInfo toolCall) {
                    try {
                        emitter.send(SseEmitter.event()
                            .name("tool_call")
                            .data(JsonUtils.toJson(toolCall)));
                    } catch (IOException e) {
                        emitter.completeWithError(e);
                    }
                }
                
                @Override
                public void onComplete(ChatResponse response) {
                    try {
                        emitter.send(SseEmitter.event()
                            .name("complete")
                            .data(JsonUtils.toJson(response)));
                        emitter.complete();
                    } catch (IOException e) {
                        emitter.completeWithError(e);
                    }
                }
                
                @Override
                public void onError(Exception e) {
                    emitter.completeWithError(e);
                }
            }
        );
        
        return emitter;
    }

    @PostMapping("/chat/sync")
    public Result<ChatResponse> chatSync(@RequestBody ChatRequest request) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        
        ChatResponse response = agentOrchestrator.chat(
            request.getSessionId(),
            request.getMessage(),
            tenantId,
            userId
        );
        
        return Result.success(response);
    }

    @GetMapping("/sessions/{sessionId}/history")
    public Result<List<ChatMessage>> getHistory(@PathVariable String sessionId) {
        List<ChatMessage> history = agentOrchestrator.getHistory(sessionId);
        return Result.success(history);
    }

    @DeleteMapping("/sessions/{sessionId}")
    public Result<Void> clearSession(@PathVariable String sessionId) {
        agentOrchestrator.clearSession(sessionId);
        return Result.success();
    }

    @GetMapping("/tools")
    public Result<List<ToolDefinition>> getAvailableTools() {
        List<ToolDefinition> tools = agentOrchestrator.getAvailableTools();
        return Result.success(tools);
    }
}
```

### 7.2 编排器

```java
/**
 * AI Agent 编排器
 */
@Slf4j
@Service
public class AiAgentOrchestrator {

    @Autowired
    private NlQueryOrchestrator nlQueryOrchestrator;

    @Autowired
    private ToolRouter toolRouter;

    @Autowired
    private ExecutionEngineOrchestrator executionEngine;

    @Autowired
    private ResponseGenerator responseGenerator;

    @Autowired
    private ConversationManager conversationManager;

    @Autowired
    private AiContextBuilderService contextBuilder;

    @Autowired
    private IntelligenceObservabilityOrchestrator observability;

    @Autowired
    private ToolRegistry toolRegistry;

    public ChatResponse chat(String sessionId, String message, Long tenantId, String userId) {
        long startTime = System.currentTimeMillis();
        String traceId = UUID.randomUUID().toString();
        
        try {
            // 1. 构建上下文
            AiContext context = contextBuilder.buildContext(sessionId, message);
            
            // 2. 意图识别
            IntentResult intent = nlQueryOrchestrator.recognize(message);
            
            // 3. 工具选择
            List<ToolCall> toolCalls = toolRouter.selectTools(intent, message);
            
            // 4. 工具执行
            List<ToolResult> toolResults = new ArrayList<>();
            for (ToolCall toolCall : toolCalls) {
                ToolResult result = executionEngine.execute(toolCall, context);
                toolResults.add(result);
            }
            
            // 5. 响应生成
            String response = responseGenerator.generate(GenerationContext.builder()
                .query(message)
                .intent(intent)
                .toolResults(toolResults)
                .history(context.getHistory())
                .tenantName(context.getTenantName())
                .userName(context.getUserName())
                .build());
            
            // 6. 保存对话
            conversationManager.addMessage(sessionId, ChatMessage.user(message));
            conversationManager.addMessage(sessionId, ChatMessage.assistant(response));
            
            // 7. 记录观测
            observability.recordInvocation(IntelligenceInvocationRecord.builder()
                .traceId(traceId)
                .tenantId(tenantId)
                .userId(userId)
                .query(message)
                .intent(intent.getIntent())
                .toolCalls(toolCalls)
                .toolResults(toolResults)
                .response(response)
                .latencyMs(System.currentTimeMillis() - startTime)
                .build());
            
            return ChatResponse.builder()
                .content(response)
                .toolCalls(toolCalls)
                .toolResults(toolResults)
                .traceId(traceId)
                .build();
            
        } catch (Exception e) {
            log.error("Chat failed: sessionId={}, message={}", sessionId, message, e);
            
            observability.recordError(traceId, e);
            
            return ChatResponse.builder()
                .content("抱歉，处理您的请求时出现错误。请稍后重试。")
                .error(e.getMessage())
                .traceId(traceId)
                .build();
        }
    }

    public void chatStreaming(String sessionId, String message, Long tenantId, String userId, 
                              StreamingCallback callback) {
        CompletableFuture.runAsync(() -> {
            try {
                ChatResponse response = chat(sessionId, message, tenantId, userId);
                
                // 模拟流式输出
                String content = response.getContent();
                int chunkSize = 10;
                for (int i = 0; i < content.length(); i += chunkSize) {
                    int end = Math.min(i + chunkSize, content.length());
                    callback.onToken(content.substring(i, end));
                    Thread.sleep(50);
                }
                
                // 发送工具调用信息
                if (response.getToolCalls() != null) {
                    for (ToolCall toolCall : response.getToolCalls()) {
                        callback.onToolCall(new ToolCallInfo(toolCall));
                    }
                }
                
                callback.onComplete(response);
                
            } catch (Exception e) {
                callback.onError(e);
            }
        });
    }

    public List<ChatMessage> getHistory(String sessionId) {
        return conversationManager.getHistory(sessionId);
    }

    public void clearSession(String sessionId) {
        conversationManager.clearSession(sessionId);
    }

    public List<ToolDefinition> getAvailableTools() {
        return toolRegistry.getAllDefinitions();
    }
}
```

---

## 附录

### A. 配置示例

```yaml
# application-ai.yml
ai:
  agent:
    enabled: true
    model: gpt-4-turbo
    temperature: 0.7
    max-tokens: 2000
    timeout-seconds: 60
    
  tools:
    auto-execute: true
    max-concurrent: 5
    
  memory:
    max-history-turns: 10
    session-timeout-hours: 24
    
  observability:
    enabled: true
    record-latency: true
    record-tool-calls: true
```

### B. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v1.0 | 2026-03-29 | 初始版本 |
