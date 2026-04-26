package com.fashion.supplychain.intelligence.agent;

/**
 * 当前请求 Agent 执行模式的 ThreadLocal 上下文。
 *
 * <p>生命周期：在 AiAgentOrchestrator.executeAgent() 开始时 set，
 * 方法结束的 finally 块中 clear，确保不跨请求污染。
 *
 * <p>供 HighRiskAuditHook 等拦截器读取，判断是否跳过确认逻辑。
 */
public final class AgentModeContext {

    private static final ThreadLocal<AgentMode> HOLDER = new ThreadLocal<>();

    private AgentModeContext() {}

    public static void set(AgentMode mode) {
        HOLDER.set(mode != null ? mode : AgentMode.DEFAULT);
    }

    /** 若未 set 则默认 DEFAULT，永远不返回 null。 */
    public static AgentMode get() {
        AgentMode mode = HOLDER.get();
        return mode != null ? mode : AgentMode.DEFAULT;
    }

    public static void clear() {
        HOLDER.remove();
    }

    /** 是否处于免确认模式（高风险 Hook 直接放行）。 */
    public static boolean isYolo() {
        return get() == AgentMode.YOLO;
    }

    /** 是否处于仅计划模式（工具调用不实际执行）。 */
    public static boolean isPlan() {
        return get() == AgentMode.PLAN;
    }
}
