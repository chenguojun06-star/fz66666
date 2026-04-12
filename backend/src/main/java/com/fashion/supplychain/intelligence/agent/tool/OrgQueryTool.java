package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.orchestration.OrganizationUnitOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 组织架构查询工具 — AI 可通过此工具查询部门树、部门列表及各部门成员
 */
@Slf4j
@Component
public class OrgQueryTool extends AbstractAgentTool {

    @Autowired
    private OrganizationUnitOrchestrator orgOrchestrator;

    @Override
    public String getName() {
        return "tool_org_query";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp(
                "操作类型：tree=查询组织架构树 / departments=查询部门/工厂列表 / members=查询各部门成员分布"));
        return buildToolDef(
                "查询组织架构信息，包括部门树、部门/工厂列表及各部门成员分布",
                properties,
                List.of("action"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = requireString(args, "action");

        return switch (action) {
            case "tree" -> {
                List<OrganizationUnit> tree = orgOrchestrator.tree();
                Long tenantId = UserContext.tenantId();
                if (tenantId != null && !UserContext.isSuperAdmin()) {
                    tree = tree.stream().filter(u -> tenantId.equals(u.getTenantId())).toList();
                }
                yield successJson("获取组织架构树成功", Map.of("tree", tree, "total", tree.size()));
            }
            case "departments" -> {
                List<OrganizationUnit> depts = orgOrchestrator.departmentOptions();
                Long tenantId = UserContext.tenantId();
                if (tenantId != null && !UserContext.isSuperAdmin()) {
                    depts = depts.stream().filter(u -> tenantId.equals(u.getTenantId())).toList();
                }
                yield successJson("获取部门列表成功", Map.of("departments", depts, "total", depts.size()));
            }
            case "members" -> {
                Map<String, List<User>> members = orgOrchestrator.membersByOrgUnit();
                yield successJson("获取成员分布成功", Map.of("membersByDept", members, "deptCount", members.size()));
            }
            default -> errorJson("不支持的 action：" + action + "，可用：tree / departments / members");
        };
    }
}
