package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 标准动作工具 — 触发前端弹窗或跳转
 * <p>
 * 当用户说"下单""借样衣"等标准动作时，返回前端可识别的动作卡片，
 * 前端根据动作类型打开对应弹窗或跳转到对应页面。
 * <p>
 * <b>支持的动作类型：</b>
 * <ul>
 *   <li>open_order_create - 打开下单弹窗（跳转到订单管理页并打开弹窗）</li>
 *   <li>open_sample_loan - 打开样衣借调弹窗</li>
 * </ul>
 */
@Slf4j
@Component
@Lazy
public class StandardActionTool extends AbstractAgentTool {

    @Override
    public String getName() {
        return "tool_standard_action";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        properties.put("actionType", Map.of(
                "type", "string",
                "description",
                "标准动作类型，可选值：\n" +
                "- open_order_create: 打开下单界面\n" +
                "- open_sample_loan: 打开样衣借调弹窗"
        ));

        properties.put("prefillData", Map.of(
                "type", "object",
                "description",
                "预填数据（可选），根据不同动作类型传入不同参数：\n" +
                "- open_order_create: { styleNo?, factoryId? }\n" +
                "- open_sample_loan: { sampleStyleNo?, factoryId? }"
        ));

        properties.put("displayTitle", Map.of(
                "type", "string",
                "description",
                "卡片显示的标题（可选，不传则用默认标题）"
        ));

        properties.put("displayDesc", Map.of(
                "type", "string",
                "description",
                "卡片显示的描述（可选）"
        ));

        return buildToolDef(
                "标准动作工具 - 触发前端弹窗或页面跳转。" +
                "当用户要求执行下单、样衣借调等标准操作时调用此工具。" +
                "调用后前端会弹出对应的操作界面，用户填写信息后完成操作。" +
                "适用场景：用户说'我要下单''帮我开个下单界面''借样衣''样衣借调'等。",
                properties,
                List.of("actionType")
        );
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String actionType = requireString(args, "actionType");
        Map<String, Object> prefillData = args.containsKey("prefillData") && args.get("prefillData") instanceof Map
                ? (Map<String, Object>) args.get("prefillData")
                : new LinkedHashMap<>();
        String displayTitle = optionalString(args, "displayTitle");
        String displayDesc = optionalString(args, "displayDesc");

        Long tenantId = UserContext.tenantId();
        Long userId = UserContext.userId() != null ? Long.parseLong(UserContext.userId()) : null;

        log.info("[StandardAction] 触发标准动作: tenant={}, user={}, actionType={}, prefill={}",
                tenantId, userId, actionType, prefillData);

        Map<String, Object> actionCard = buildActionCard(actionType, prefillData, displayTitle, displayDesc);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("actionType", actionType);
        result.put("actionCard", actionCard);
        result.put("operatorId", userId);
        result.put("message", getSuccessMessage(actionType));

        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> buildActionCard(String actionType,
                                                 Map<String, Object> prefillData,
                                                 String customTitle,
                                                 String customDesc) {
        Map<String, Object> card = new LinkedHashMap<>();

        String title = customTitle != null ? customTitle : getDefaultTitle(actionType);
        String desc = customDesc != null ? customDesc : getDefaultDesc(actionType);

        card.put("title", title);
        card.put("desc", desc);
        card.put("actionType", actionType);
        card.put("prefillData", prefillData);

        List<Map<String, Object>> actions = new ArrayList<>();
        Map<String, Object> primaryAction = new LinkedHashMap<>();
        primaryAction.put("label", getActionLabel(actionType));
        primaryAction.put("type", "open_modal");
        primaryAction.put("modalType", actionType);
        primaryAction.put("prefillData", prefillData);
        actions.add(primaryAction);

        card.put("actions", actions);

        return card;
    }

    private String getDefaultTitle(String actionType) {
        return switch (actionType) {
            case "open_order_create" -> "快速下单";
            case "open_sample_loan" -> "样衣借调";
            default -> "操作";
        };
    }

    private String getDefaultDesc(String actionType) {
        return switch (actionType) {
            case "open_order_create" -> "点击下方按钮打开下单界面，搜索款式、填写数量、选择工厂后即可下单。";
            case "open_sample_loan" -> "点击下方按钮打开样衣借调弹窗，选择样衣和借入工厂即可。";
            default -> "";
        };
    }

    private String getActionLabel(String actionType) {
        return switch (actionType) {
            case "open_order_create" -> "去下单";
            case "open_sample_loan" -> "去借样衣";
            default -> "去操作";
        };
    }

    private String getSuccessMessage(String actionType) {
        return switch (actionType) {
            case "open_order_create" -> "已为你准备好下单界面，点击下方按钮开始下单吧～";
            case "open_sample_loan" -> "已为你准备好样衣借调界面，点击下方按钮开始借调吧～";
            default -> "操作已就绪";
        };
    }
}
