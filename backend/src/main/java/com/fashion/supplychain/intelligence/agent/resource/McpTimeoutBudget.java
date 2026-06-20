package com.fashion.supplychain.intelligence.agent.resource;

import java.util.Map;

/**
 * MCP 工具自适应超时预算（ATBA — Adaptive Timeout Budget Allocation）。
 *
 * <p>背景：原工具调用统一超时，查询类和报表类应不同。
 * 按工具类型分配预算，避免长查询被误杀、短查询占用线程过久。
 *
 * <p>预算表：
 * <ul>
 *   <li>{@code QUERY}（查询类，如 memory/knowledge/factory 读取）：5 秒</li>
 *   <li>{@code REPORT}（报表类，如产能报表/工资汇总）：30 秒</li>
 *   <li>{@code COMPUTATION}（排产/分析类，如智能排产/GraphRAG 分析）：120 秒</li>
 *   <li>{@code DEFAULT}（默认）：15 秒</li>
 * </ul>
 *
 * <p>调用点：{@link com.fashion.supplychain.intelligence.service.McpProtocolService#readResource}
 * 通过 {@link McpResourceProvider#toolType()} 获取类型，再用本类计算预算，
 * 最后用 {@link java.util.concurrent.CompletableFuture#orTimeout} 应用。
 */
public final class McpTimeoutBudget {

    // ─────────────────────────────────────────────────────────────────────
    // 工具类型常量
    // ─────────────────────────────────────────────────────────────────────

    /** 查询类（5s）— 快速读取，如 memory/knowledge/factory */
    public static final String QUERY = "QUERY";

    /** 报表类（30s）— 聚合统计，如产能报表/工资汇总 */
    public static final String REPORT = "REPORT";

    /** 计算类（120s）— 重计算，如智能排产/GraphRAG 分析 */
    public static final String COMPUTATION = "COMPUTATION";

    /** 默认（15s） */
    public static final String DEFAULT = "DEFAULT";

    // ─────────────────────────────────────────────────────────────────────
    // 预算表（秒）
    // ─────────────────────────────────────────────────────────────────────

    private static final Map<String, Long> BUDGET_SECONDS = Map.of(
            QUERY, 5L,
            REPORT, 30L,
            COMPUTATION, 120L,
            DEFAULT, 15L
    );

    private McpTimeoutBudget() {
        // 工具类，禁止实例化
    }

    /**
     * 按工具类型返回超时预算（秒）。
     *
     * @param toolType 工具类型（QUERY/REPORT/COMPUTATION/DEFAULT）
     * @return 超时秒数；未知类型返回 DEFAULT 预算
     */
    public static long forToolType(String toolType) {
        if (toolType == null || toolType.isBlank()) {
            return BUDGET_SECONDS.get(DEFAULT);
        }
        String upper = toolType.trim().toUpperCase();
        return BUDGET_SECONDS.getOrDefault(upper, BUDGET_SECONDS.get(DEFAULT));
    }
}
