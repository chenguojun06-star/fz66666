package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAgentToolAccessServiceTest {

    private final AiAgentToolAccessService service = new AiAgentToolAccessService();

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void shouldRestrictWorkerToolPool() {
        UserContext worker = new UserContext();
        worker.setRole("普通工人");
        UserContext.set(worker);

        // 注意：tool_query_financial_payroll 现已对工人开放（内部自动限定为本人数据）
        List<AgentTool> visibleTools = service.resolveVisibleTools(List.of(
                stubTool("tool_query_production_progress"),
                stubTool("tool_query_financial_payroll"),
                stubTool("tool_knowledge_search"),
                stubTool("tool_system_overview"),
                stubTool("tool_team_dispatch")));

        // 工人可见：生产进度 > 本人工资 > 知识库（按 TOOL_RULES 注册顺序）
        assertEquals(List.of("tool_query_production_progress",
                        "tool_query_financial_payroll",
                        "tool_knowledge_search"),
                visibleTools.stream().map(AgentTool::getName).toList());
        assertFalse(service.canUseTool("tool_system_overview"));
        assertFalse(service.canUseTool("tool_team_dispatch"));
    }

    @Test
    void shouldWorkerSeePayrollTool() {
        UserContext worker = new UserContext();
        worker.setRole("缝纫工");
        UserContext.set(worker);

        // 工人能看到工资查询工具（工具内部限定只返回本人数据）
        assertTrue(service.canUseTool("tool_query_financial_payroll"),
                "工人应能调用工资查询工具（内部限定为本人数据）");
        // 工人不能看到管理工具
        assertFalse(service.canUseTool("tool_payroll_approve"),
                "工人不应调用工资审批工具");
        assertFalse(service.canUseTool("tool_order_edit"),
                "工人不应调用订单编辑工具");
    }

    @Test
    void shouldAllowManagerToUseManagementTools() {
        UserContext manager = new UserContext();
        manager.setRole("merchandiser");
        UserContext.set(manager);

        assertTrue(service.hasManagerAccess());
        assertTrue(service.canUseTool("tool_system_overview"));
        assertTrue(service.canUseTool("tool_team_dispatch"));
    }

    private AgentTool stubTool(String name) {
        return new AgentTool() {
            @Override
            public AiTool getToolDefinition() {
                AiTool tool = new AiTool();
                AiTool.AiFunction function = new AiTool.AiFunction();
                function.setName(name);
                function.setDescription(name + " description");
                tool.setFunction(function);
                return tool;
            }

            @Override
            public String execute(String argumentsJson) {
                return "{}";
            }

            @Override
            public String getName() {
                return name;
            }
        };
    }
}
