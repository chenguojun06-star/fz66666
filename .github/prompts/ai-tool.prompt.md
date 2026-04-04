---
description: "新增 AI Agent 工具模板：为智能驾驶舱添加新的 AgentTool"
mode: "agent"
tools: ["semantic_search", "grep_search", "file_search", "read_file", "create_file", "replace_string_in_file", "run_in_terminal", "get_errors"]
---
# 新增 AI Agent 工具模板

为 AiAgentOrchestrator 的工具链新增一个 AgentTool。

## 开始前
- 确认工具要做什么：查询数据？执行操作？计算结果？
- 确认工具需要哪些参数（required / optional）。
- 确认工具委托的后端 Service/Orchestrator 是否已存在。

## 第一步：创建 AgentTool 实现类
路径：`backend/src/main/java/com/fashion/supplychain/intelligence/agent/tool/XxxTool.java`

```java
@Component
public class XxxTool implements AgentTool {

    @Autowired
    private XxxService xxxService;  // 委托的业务服务

    @Override
    public String getName() {
        return "tool_xxx";
    }

    @Override
    public AiTool getToolDefinition() {
        AiTool tool = new AiTool();
        tool.setType("function");
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName("tool_xxx");
        fn.setDescription("一行描述工具用途");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setType("object");
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("param1", Map.of("type", "string", "description", "参数说明"));
        params.setProperties(props);
        params.setRequired(List.of("param1"));
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        // 1. 解析参数
        // 2. 调用业务服务
        // 3. 返回结构化结果 JSON
    }
}
```

**CRITICAL**：
- 工具名以 `tool_` 前缀开头。
- `@Component` 注解使其自动注入到 AiAgentOrchestrator 的工具链。
- `execute()` 必须 catch 异常，返回错误 JSON 而非抛出异常。
- 写操作必须做租户隔离校验（`TenantAssert.assertBelongsToCurrentTenant()`）。

## 第二步：注册到 ExecutionEngine（双通道）
如果工具也需要通过通知路径触发（SmartNotification → CommandGenerator → ExecutionEngine）：
1. 在 `ExecutionEngineOrchestrator.java` 添加 case 分支。
2. 在 `CommandExecutorHelper.java` 添加 execute 方法。

## 第三步：验证
```bash
cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home \
  /opt/homebrew/bin/mvn clean compile -q
```
- 确认 `@Component` 被扫描到。
- 确认工具参数定义与 execute 解析一致。
- 确认工具总数更新：当前系统 21 个工具。
