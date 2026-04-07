package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.intelligence.agent.AiTool;

public interface AgentTool {

    AiTool getToolDefinition();

    String execute(String argumentsJson) throws Exception;

    String getName();

    /** 工具所属业务领域，路由器据此筛选工具子集 */
    default ToolDomain getDomain() { return ToolDomain.GENERAL; }
}
