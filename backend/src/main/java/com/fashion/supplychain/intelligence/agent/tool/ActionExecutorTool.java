package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SysNoticeService;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 行动执行器 — 让 AI 真正"有手"
 * 支持操作：标记紧急、添加备注、发送通知
 * 所有写操作均记录审计日志
 */
@Slf4j
@Component
public class ActionExecutorTool implements AgentTool {

    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private SysNoticeService sysNoticeService;
    @Autowired
    private OperationLogService operationLogService;

    private static final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_action_executor";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> action = new LinkedHashMap<>();
        action.put("type", "string");
        action.put("description", "执行的操作类型：mark_urgent(标记订单为紧急), " +
                "remove_urgent(取消紧急标记), add_remark(给订单添加备注), " +
                "send_notification(发送站内通知给指定人)");
        properties.put("action", action);

        Map<String, Object> orderNo = new LinkedHashMap<>();
        orderNo.put("type", "string");
        orderNo.put("description", "目标订单号（mark_urgent/remove_urgent/add_remark 必填）");
        properties.put("orderNo", orderNo);

        Map<String, Object> remark = new LinkedHashMap<>();
        remark.put("type", "string");
        remark.put("description", "备注内容（add_remark 必填）或通知正文（send_notification 必填）");
        properties.put("content", remark);

        Map<String, Object> toUser = new LinkedHashMap<>();
        toUser.put("type", "string");
        toUser.put("description", "通知收件人姓名（send_notification 必填）");
        properties.put("toUser", toUser);

        Map<String, Object> title = new LinkedHashMap<>();
        title.put("type", "string");
        title.put("description", "通知标题（send_notification 使用，默认'小云智能提醒'）");
        properties.put("title", title);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("执行实际操作的工具, AI的手。" +
                "可以标记订单为紧急、添加备注、发送站内通知给跟单员/管理员。" +
                "当用户说'把这个订单标为紧急'、'给XX发个提醒'、'加个备注'时调用。" +
                "所有操作都会记录审计日志，可追溯。");

        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("action"));
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        log.info("Tool: {} called with args: {}", getName(), argumentsJson);
        Map<String, Object> args = new HashMap<>();
        if (argumentsJson != null && !argumentsJson.isBlank()) {
            args = mapper.readValue(argumentsJson, new TypeReference<>() {});
        }

        String action = (String) args.get("action");
        if (action == null || action.isBlank()) {
            return "{\"success\":false,\"error\":\"缺少 action 参数\"}";
        }

        Long tenantId = UserContext.tenantId();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("action", action);

        switch (action) {
            case "mark_urgent" -> executeMarkUrgent(args, tenantId, result, true);
            case "remove_urgent" -> executeMarkUrgent(args, tenantId, result, false);
            case "add_remark" -> executeAddRemark(args, tenantId, result);
            case "send_notification" -> executeSendNotification(args, tenantId, result);
            default -> {
                result.put("success", false);
                result.put("error", "不支持的操作类型: " + action);
            }
        }

        return mapper.writeValueAsString(result);
    }

    private void executeMarkUrgent(Map<String, Object> args, Long tenantId,
                                    Map<String, Object> result, boolean urgent) {
        String orderNo = (String) args.get("orderNo");
        if (orderNo == null || orderNo.isBlank()) {
            result.put("success", false);
            result.put("error", "缺少 orderNo 参数");
            return;
        }

        ProductionOrder order = findOrder(tenantId, orderNo);
        if (order == null) {
            result.put("success", false);
            result.put("error", "未找到订单: " + orderNo);
            return;
        }

        String oldLevel = order.getUrgencyLevel();
        String newLevel = urgent ? "urgent" : "normal";
        order.setUrgencyLevel(newLevel);
        productionOrderService.saveOrUpdateOrder(order);

        logAction("production", urgent ? "mark_urgent" : "remove_urgent",
                "ProductionOrder", order.getId(), orderNo,
                "AI助手将紧急级别从[" + oldLevel + "]改为[" + newLevel + "]");

        result.put("success", true);
        result.put("orderNo", orderNo);
        result.put("previousLevel", oldLevel);
        result.put("currentLevel", newLevel);
        result.put("message", urgent ? "已标记为紧急订单" : "已取消紧急标记");
    }

    private void executeAddRemark(Map<String, Object> args, Long tenantId, Map<String, Object> result) {
        String orderNo = (String) args.get("orderNo");
        String content = (String) args.get("content");
        if (orderNo == null || orderNo.isBlank()) {
            result.put("success", false);
            result.put("error", "缺少 orderNo 参数");
            return;
        }
        if (content == null || content.isBlank()) {
            result.put("success", false);
            result.put("error", "缺少 content 参数");
            return;
        }

        ProductionOrder order = findOrder(tenantId, orderNo);
        if (order == null) {
            result.put("success", false);
            result.put("error", "未找到订单: " + orderNo);
            return;
        }

        // 追加备注（不覆盖原有）
        String existingRemarks = order.getRemarks() != null ? order.getRemarks() : "";
        String timestamp = LocalDateTime.now().toString().substring(0, 16).replace("T", " ");
        String newRemarks = existingRemarks +
                (existingRemarks.isEmpty() ? "" : "\n") +
                "[小云AI " + timestamp + "] " + content;
        order.setRemarks(newRemarks);
        productionOrderService.saveOrUpdateOrder(order);

        logAction("production", "add_remark", "ProductionOrder", order.getId(), orderNo,
                "AI助手添加备注: " + content);

        result.put("success", true);
        result.put("orderNo", orderNo);
        result.put("message", "备注已添加");
    }

    private void executeSendNotification(Map<String, Object> args, Long tenantId, Map<String, Object> result) {
        String toUser = (String) args.get("toUser");
        String content = (String) args.get("content");
        String title = (String) args.getOrDefault("title", "小云智能提醒");
        String orderNo = (String) args.get("orderNo");

        if (toUser == null || toUser.isBlank()) {
            result.put("success", false);
            result.put("error", "缺少 toUser 参数");
            return;
        }
        if (content == null || content.isBlank()) {
            result.put("success", false);
            result.put("error", "缺少 content 参数");
            return;
        }

        SysNotice notice = new SysNotice();
        notice.setTenantId(tenantId);
        notice.setToName(toUser);
        notice.setFromName("小云AI助手");
        notice.setOrderNo(orderNo);
        notice.setTitle(title);
        notice.setContent(content);
        notice.setNoticeType("manual");
        notice.setIsRead(0);
        notice.setCreatedAt(LocalDateTime.now());
        sysNoticeService.save(notice);

        logAction("system", "send_notification", "SysNotice", String.valueOf(notice.getId()), toUser,
                "AI助手发送通知: " + title);

        result.put("success", true);
        result.put("toUser", toUser);
        result.put("title", title);
        result.put("message", "通知已发送给 " + toUser);
    }

    // ---- helpers ----
    private ProductionOrder findOrder(Long tenantId, String orderNo) {
        QueryWrapper<ProductionOrder> q = new QueryWrapper<>();
        q.eq("order_no", orderNo).eq("delete_flag", 0);
        if (tenantId != null) q.eq("tenant_id", tenantId);
        return productionOrderService.getOne(q, false);
    }

    private void logAction(String module, String operation, String targetType,
                           String targetId, String targetName, String reason) {
        try {
            OperationLog opLog = new OperationLog();
            opLog.setModule(module);
            opLog.setOperation(operation);
            opLog.setOperatorId(null); // AI 操作
            opLog.setOperatorName("小云AI助手");
            opLog.setTargetType(targetType);
            opLog.setTargetId(targetId);
            opLog.setTargetName(targetName);
            opLog.setReason(reason);
            operationLogService.createOperationLog(opLog);
        } catch (Exception e) {
            log.warn("记录操作日志失败: {}", e.getMessage());
        }
    }
}
