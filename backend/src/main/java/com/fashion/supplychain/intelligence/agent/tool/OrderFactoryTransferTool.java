package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.helper.StepWizardBuilder;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.orchestration.OrderFactoryTransferOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 小云转厂工具 — tool_order_factory_transfer
 *
 * <p>支持以下指令类型：
 * <ul>
 *   <li>整单转厂："把 PO2026001 整单转给万和工厂"</li>
 *   <li>部分转厂："把 PO2026001 的 50 件转给万和工厂，产能不足"</li>
 * </ul>
 *
 * <p>执行后自动向原工厂和新工厂所有关联激活用户发送站内通知，
 * 用户可在铃铛通知中心查看。
 *
 * <p>架构：@Component 自动注册到 AiAgentOrchestrator 的 registeredTools 列表，
 * 无需手动配置。权限：hasManagerAccess()（跟单员及以上）。
 */
@Slf4j
@Component
public class OrderFactoryTransferTool extends AbstractAgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private OrderFactoryTransferOrchestrator transferOrchestrator;

    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    @Override
    public String getName() {
        return "tool_order_factory_transfer";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("orderNo", schema("string", "订单号，例如 PO2026001"));
        props.put("targetFactoryName", schema("string", "目标工厂名称（系统中已录入的工厂名称，须完整匹配）"));
        props.put("transferQuantity", schema("integer", "要转出的件数。不填则整单转厂；填写具体数量则为部分转厂"));
        props.put("orderLines", schemaArray(
                "部分转厂时可选传入颜色码数明细，每项含 color/size/quantity，" +
                "例如 [{\"color\":\"红色\",\"size\":\"XL\",\"quantity\":30},{\"color\":\"蓝色\",\"size\":\"M\",\"quantity\":20}]"));
        props.put("reason", schema("string", "转厂原因，例如：产能不足、质量原因、交期紧（可选）"));

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("整单转厂或部分转厂工具。" +
                "整单转时会更新订单绑定工厂；" +
                "部分转时在备注记录转厂信息，由跟单员线下确认拆单。" +
                "执行后自动向原工厂与新工厂相关人员发送站内通知。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(props);
        params.setRequired(List.of("orderNo", "targetFactoryName"));
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    protected String doExecute(String arguments) throws Exception {
        try {
            TenantAssert.assertTenantContext();
            if (!aiAgentToolAccessService.hasManagerAccess()) {
                return "{\"success\":false,\"error\":\"当前角色无权执行转厂操作，需要跟单员或以上权限\"}";
            }

            Map<String, Object> args = MAPPER.readValue(arguments, new TypeReference<Map<String, Object>>() {});
            String orderNo = asString(args.get("orderNo"));
            String targetFactoryName = asString(args.get("targetFactoryName"));
            Integer transferQuantity = asInteger(args.get("transferQuantity"));
            List<Map<String, Object>> orderLines = asOrderLines(args.get("orderLines"));
            String reason = asString(args.get("reason"));

            if (orderNo == null || orderNo.isBlank() || targetFactoryName == null || targetFactoryName.isBlank()) {
                Map<String, Object> wizard = StepWizardBuilder.build("order_factory_transfer", "订单转厂", "将订单转到其他工厂生产", "🔄", "确认转厂", "转厂",
                    StepWizardBuilder.steps(
                        StepWizardBuilder.step("order", "选择订单", "输入要转厂的订单号",
                            StepWizardBuilder.textField("orderNo", "订单号", true, "输入订单号")),
                        StepWizardBuilder.step("factory", "选择目标工厂", "输入要转到的工厂名称",
                            StepWizardBuilder.textField("targetFactoryName", "目标工厂", true, "输入工厂名称搜索"),
                            StepWizardBuilder.textField("reason", "转厂原因", false, "可选，说明转厂原因"))
                    ));
                try { return MAPPER.writeValueAsString(StepWizardBuilder.wrapResult("请提供订单号和目标工厂", true, List.of("orderNo", "targetFactoryName"), "请补充订单号和目标工厂名称", wizard)); } catch (Exception e) { return "{\"success\":false,\"error\":\"参数不完整\"}"; }
            }

            Map<String, Object> result = transferOrchestrator.transfer(
                    orderNo, targetFactoryName, transferQuantity, orderLines, reason);
            return MAPPER.writeValueAsString(result);

        } catch (IllegalArgumentException e) {
            // 业务校验失败（订单不存在、工厂不存在、数量非法等）
            return "{\"success\":false,\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}";
        } catch (Exception e) {
            log.error("[OrderFactoryTransferTool] 执行失败 arguments={}", arguments, e);
            return "{\"success\":false,\"error\":\"转厂操作异常，请检查订单号和工厂名称是否正确\"}";
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 辅助方法
    // ─────────────────────────────────────────────────────────────────────────

    private String asString(Object val) {
        return val == null ? null : val.toString().trim();
    }

    private Integer asInteger(Object val) {
        if (val == null) return null;
        if (val instanceof Integer) return (Integer) val;
        try {
            return Integer.parseInt(val.toString().trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Map<String, Object> schema(String type, String desc) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", type);
        m.put("description", desc);
        return m;
    }

    private Map<String, Object> schemaArray(String desc) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", "array");
        m.put("description", desc);
        Map<String, Object> items = new LinkedHashMap<>();
        items.put("type", "object");
        m.put("items", items);
        return m;
    }

    private List<Map<String, Object>> asOrderLines(Object val) {
        if (!(val instanceof List<?> rawList)) {
            return null;
        }
        List<Map<String, Object>> orderLines = new java.util.ArrayList<>();
        for (Object item : rawList) {
            if (item instanceof Map<?, ?> rawMap) {
                Map<String, Object> line = new LinkedHashMap<>();
                for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                    if (entry.getKey() instanceof String key) {
                        line.put(key, entry.getValue());
                    }
                }
                orderLines.add(line);
            }
        }
        return orderLines.isEmpty() ? null : orderLines;
    }
}
