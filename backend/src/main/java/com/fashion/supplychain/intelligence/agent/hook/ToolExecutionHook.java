package com.fashion.supplychain.intelligence.agent.hook;

/**
 * AI Agent 工具执行钩子接口。
 * 实现此接口并注册为 @Component 即可拦截所有 Agent 工具调用。
 *
 * 典型用途：安全审计、速率限制、敏感操作二次确认、工具调用链分析。
 */
public interface ToolExecutionHook {

    /**
     * 工具执行前回调。返回 false 可阻止工具执行。
     *
     * @param toolName  工具名称
     * @param arguments 工具参数 JSON 字符串
     * @return true=允许执行, false=拦截
     */
    default boolean preToolUse(String toolName, String arguments) {
        return true;
    }

    /**
     * 工具执行后回调。
     *
     * @param toolName  工具名称
     * @param arguments 工具参数 JSON 字符串
     * @param result    执行结果
     * @param elapsedMs 执行耗时（毫秒）
     * @param success   是否成功
     */
    default void postToolUse(String toolName, String arguments, String result, long elapsedMs, boolean success) {
    }
}
