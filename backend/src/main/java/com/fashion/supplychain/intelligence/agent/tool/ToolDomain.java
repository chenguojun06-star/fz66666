package com.fashion.supplychain.intelligence.agent.tool;

/**
 * 工具领域枚举 — 将 Agent 工具划分为业务领域，
 * 支持领域路由器按用户意图动态筛选工具子集，降低 LLM token 消耗与选择噪声。
 */
public enum ToolDomain {

    PRODUCTION("生产管理"),
    FINANCE("财务结算"),
    WAREHOUSE("仓储物料"),
    STYLE("款式样衣"),
    ANALYSIS("分析决策"),
    SYSTEM("系统通用"),
    GENERAL("通用能力");

    private final String label;

    ToolDomain(String label) {
        this.label = label;
    }

    public String getLabel() {
        return label;
    }
}
