package com.fashion.supplychain.intelligence.agent.tool;

import java.lang.annotation.*;

/**
 * MCP 工具注解 — 替代手写 getToolDefinition()。
 * <p>
 * 标注在 {@link AgentTool} 实现类上，框架自动扫描并生成 JSON Schema，
 * 同时注册到 MCP 协议端点，外部 AI 客户端可直接发现和调用。
 * </p>
 *
 * <pre>
 * &#064;McpTool(
 *     name = "query_order_progress",
 *     description = "查询订单生产进度，返回各工序完成率",
 *     domain = ToolDomain.PRODUCTION
 * )
 * public class ProductionProgressTool extends AbstractAgentTool { ... }
 * </pre>
 *
 * @see AgentTool
 * @see McpToolScanner
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface McpToolAnnotation {

    /** 工具名称（唯一标识，LLM 用来选择工具） */
    String name();

    /** 工具描述（决定 LLM 何时调用，必须包含：返回什么 + 何时使用） */
    String description();

    /** 业务域 */
    ToolDomain domain() default ToolDomain.GENERAL;

    /** 是否只读（只读工具可并发执行） */
    boolean readOnly() default true;

    /** 超时秒数（默认 30） */
    int timeoutSeconds() default 30;

    /** 是否需要用户确认（写操作默认 true） */
    boolean requiresConfirmation() default false;

    /** 工具版本，用于追踪变更 */
    String version() default "1.0";

    /** 标签，用于工具发现 RAG 检索 */
    String[] tags() default {};
}
