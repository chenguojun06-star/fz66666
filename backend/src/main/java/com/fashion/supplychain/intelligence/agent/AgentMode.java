package com.fashion.supplychain.intelligence.agent;

/**
 * AI Agent 执行模式
 *
 * <p>mode 通过请求体字段 {@code "mode"} 传入，决定高风险工具调用的拦截策略：
 * <ul>
 *   <li>{@link #DEFAULT}：默认模式 — 高风险工具需用户二次确认后方可执行（现有行为）</li>
 *   <li>{@link #YOLO}：免确认模式 — 跳过高风险 Hook，适用于月底批量审批/大量重复操作场景，
 *       需谨慎使用（所有写操作仍走幂等保护）</li>
 *   <li>{@link #PLAN}：仅计划模式 — 不实际执行任何工具调用，仅输出拟执行方案供用户确认，
 *       适合在正式操作前做 "演练" 或批量变更的风险预览</li>
 * </ul>
 *
 * <p><b>供应链价值</b>：
 * <ul>
 *   <li>YOLO：月底 50+ 工资结算一键批量审批，无需每条点确认</li>
 *   <li>PLAN：修改多张裁剪单前先预览影响，确认无误再执行</li>
 * </ul>
 */
public enum AgentMode {

    DEFAULT,

    /**
     * 免确认（you only live once）模式 — 跳过高风险二次确认 Hook。
     * 写操作幂等保护仍然生效。
     */
    YOLO,

    /**
     * 仅计划模式 — 不调用任何工具，只返回 AI 拟执行的操作方案。
     */
    PLAN;

    public static AgentMode fromString(String value) {
        if (value == null || value.isBlank()) return DEFAULT;
        return switch (value.toLowerCase().trim()) {
            case "yolo" -> YOLO;
            case "plan" -> PLAN;
            default -> DEFAULT;
        };
    }
}
