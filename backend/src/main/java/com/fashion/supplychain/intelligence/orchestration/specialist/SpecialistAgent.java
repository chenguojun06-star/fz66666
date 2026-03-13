package com.fashion.supplychain.intelligence.orchestration.specialist;

import com.fashion.supplychain.intelligence.dto.AgentState;

/**
 * 专家代理接口 — 每个 Specialist 负责一个垂直领域的数据查询 + 分析。
 */
public interface SpecialistAgent {

    /** 当前专家负责的路由名称 */
    String getRoute();

    /** 基于 AgentState 执行分析并回写结果到 state */
    AgentState analyze(AgentState state);
}
