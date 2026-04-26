package com.fashion.supplychain.intelligence.agent.dag;

import com.fashion.supplychain.intelligence.dto.AgentState;

import java.util.Map;

public interface DagNodeExecutor {

    String getNodeId();

    Object execute(AgentState state, Map<String, Object> dependencyResults, Map<String, Object> config) throws Exception;
}
