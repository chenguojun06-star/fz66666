package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;

public interface AgentTool {

    AiTool getToolDefinition();

    String execute(String argumentsJson) throws Exception;

    String getName();
}
