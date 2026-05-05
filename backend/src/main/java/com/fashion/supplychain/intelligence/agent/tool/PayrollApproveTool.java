package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.orchestration.PayrollSettlementOrchestrator;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 工资结算审批工具 — 让管理者通过小云AI对话审核工资结算单
 * 支持操作：approve(审核通过)、cancel(取消/驳回)
 * 前置条件：结算单必须是 pending 状态
 */
@Slf4j
@Component
public class PayrollApproveTool extends AbstractAgentTool {

    @Autowired
    private PayrollSettlementOrchestrator payrollSettlementOrchestrator;

    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_payroll_approve";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("enum", List.of("approve", "cancel"));
        action.put("description", "操作类型：approve(审核通过) 或 cancel(取消/驳回)");
        properties.put("action", action);

        Map<String, Object> settlementId = new LinkedHashMap<>();
        settlementId.put("type", "string");
        settlementId.put("description", "工资结算单ID（必填）");
        properties.put("settlementId", settlementId);

        Map<String, Object> remark = new LinkedHashMap<>();
        remark.put("type", "string");
        remark.put("description", "审核备注或取消原因（可选）");
        properties.put("remark", remark);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("工资结算审批工具。当用户说'审核工资结算单'、'通过工资结算'、'取消结算单'、'驳回工资单'时调用。" +
                "审核通过后扫码记录会被锁定，无法再撤回。");

        AiTool.AiParameters parameters = new AiTool.AiParameters();
        parameters.setProperties(properties);
        parameters.setRequired(List.of("action", "settlementId"));
        function.setParameters(parameters);
        tool.setFunction(function);
        return tool;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        if (!aiAgentToolAccessService.hasManagerAccess()) {
            return MAPPER.writeValueAsString(Map.of("error", "当前角色无权执行该操作"));
        }
        Map<String, Object> args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});

        String action = (String) args.get("action");
        String settlementId = (String) args.get("settlementId");
        String remark = (String) args.get("remark");

        if (settlementId == null || settlementId.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("error", "请提供工资结算单ID（settlementId）"));
        }

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            log.warn("[PayrollApproveTool] 租户上下文丢失，拒绝执行");
            return MAPPER.writeValueAsString(Map.of("error", "租户上下文丢失，请重新登录"));
        }

        try {
            return switch (action) {
                case "approve" -> {
                    payrollSettlementOrchestrator.approve(settlementId.trim(), remark);
                    log.info("[PayrollApproveTool] 工资结算单审核通过: {}", settlementId);
                    yield MAPPER.writeValueAsString(Map.of(
                            "success", true,
                            "message", "工资结算单审核通过，关联扫码记录已锁定",
                            "settlementId", settlementId.trim()));
                }
                case "cancel" -> {
                    payrollSettlementOrchestrator.cancel(settlementId.trim(), remark);
                    log.info("[PayrollApproveTool] 工资结算单已取消: {}", settlementId);
                    yield MAPPER.writeValueAsString(Map.of(
                            "success", true,
                            "message", "工资结算单已取消，关联扫码记录已释放",
                            "settlementId", settlementId.trim()));
                }
                default -> MAPPER.writeValueAsString(Map.of(
                        "error", "不支持的操作：" + action + "，请使用 approve 或 cancel"));
            };
        } catch (IllegalArgumentException e) {
            return MAPPER.writeValueAsString(Map.of("error", "参数错误：" + e.getMessage()));
        } catch (IllegalStateException e) {
            return MAPPER.writeValueAsString(Map.of(
                    "success", false,
                    "message", e.getMessage()));
        } catch (NoSuchElementException e) {
            return MAPPER.writeValueAsString(Map.of(
                    "success", false,
                    "message", "结算单不存在：" + e.getMessage()));
        }
    }
}
