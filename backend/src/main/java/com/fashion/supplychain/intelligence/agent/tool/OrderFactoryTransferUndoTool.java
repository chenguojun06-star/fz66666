package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.orchestration.OrderFactoryTransferOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 小云撤回转厂工具 — tool_order_factory_transfer_undo
 *
 * <p>找到该订单最近一次 status="active" 的转厂日志条目：
 * <ul>
 *   <li>若是整单转：将订单 factoryId/Name 还原为转厂前的原工厂</li>
 *   <li>若是部分转：仅将日志标记为 undone，备注更新，订单绑定工厂不变</li>
 * </ul>
 * 执行后自动通知相关工厂人员。
 *
 * <p>权限：hasManagerAccess()（跟单员及以上）。
 */
@Slf4j
@Component
public class OrderFactoryTransferUndoTool implements AgentTool {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Autowired
    private OrderFactoryTransferOrchestrator transferOrchestrator;

    @Autowired
    private AiAgentToolAccessService aiAgentToolAccessService;

    @Override
    public String getName() {
        return "tool_order_factory_transfer_undo";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> props = new LinkedHashMap<>();
        props.put("orderNo", schema("string", "要撤回转厂的订单号，例如 PO2026001"));
        props.put("reason", schema("string", "撤回原因，例如：转单有误、工厂沟通有误（可选）"));

        AiTool tool = new AiTool();
        AiTool.AiFunction fn = new AiTool.AiFunction();
        fn.setName(getName());
        fn.setDescription("撤回订单最近一次转厂操作。" +
                "将整单转厂订单的绑定工厂恢复为转厂前的原工厂，" +
                "并标记对应转厂日志为已撤回状态，自动通知原工厂与目标工厂相关人员。");
        AiTool.AiParameters params = new AiTool.AiParameters();
        params.setProperties(props);
        params.setRequired(List.of("orderNo"));
        fn.setParameters(params);
        tool.setFunction(fn);
        return tool;
    }

    @Override
    public String execute(String arguments) {
        try {
            if (!aiAgentToolAccessService.hasManagerAccess()) {
                return "{\"success\":false,\"error\":\"当前角色无权执行撤回转厂操作，需要跟单员或以上权限\"}";
            }

            Map<String, Object> args = MAPPER.readValue(arguments, Map.class);
            String orderNo = asString(args.get("orderNo"));
            String reason  = asString(args.get("reason"));

            if (orderNo == null || orderNo.isBlank()) {
                return "{\"success\":false,\"error\":\"orderNo 不能为空\"}";
            }

            Map<String, Object> result = transferOrchestrator.undo(orderNo, reason);
            return MAPPER.writeValueAsString(result);

        } catch (IllegalArgumentException e) {
            return "{\"success\":false,\"error\":\"" + e.getMessage().replace("\"", "'") + "\"}";
        } catch (Exception e) {
            log.error("[OrderFactoryTransferUndoTool] 执行失败 arguments={}", arguments, e);
            return "{\"success\":false,\"error\":\"撤回转厂操作异常，请检查订单号或联系管理员\"}";
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 辅助
    // ─────────────────────────────────────────────────────────────────────────

    private String asString(Object val) {
        return val == null ? null : val.toString().trim();
    }

    private Map<String, Object> schema(String type, String desc) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", type);
        m.put("description", desc);
        return m;
    }
}
