package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.service.SysNoticeService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.*;

/**
 * AI工具：查询订单跟单员和工厂联系人，并自动发催单站内通知。
 * 触发场景：用户说"催一下这单"、"催催跟单和工厂"、"通知这单负责人跟进"。
 */
@Slf4j
@Component
public class OrderContactUrgeTool implements AgentTool {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private SysNoticeService sysNoticeService;

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_order_contact_urge";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();

        Map<String, Object> orderNo = new LinkedHashMap<>();
        orderNo.put("type", "string");
        orderNo.put("description", "订单号（必填），用于查找订单的跟单员和工厂联系人");
        properties.put("orderNo", orderNo);

        Map<String, Object> message = new LinkedHashMap<>();
        message.put("type", "string");
        message.put("description", "催单消息内容（可选），默认为：请跟进该订单进度，及时反馈");
        properties.put("message", message);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription(
            "查询订单的跟单员和工厂联系人，并自动向两者发送催单站内通知。" +
            "当用户说【催一下这单】【催催跟单和工厂】【通知这单负责人跟进】时调用。" +
            "会自动读取订单的跟单员(merchandiser)和工厂联系人(factoryContactPerson)并各发一条通知。"
        );

        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("orderNo"));
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) throws Exception {
        log.info("[OrderContactUrge] called with args: {}", argumentsJson);

        Map<String, Object> args = new HashMap<>();
        if (argumentsJson != null && !argumentsJson.isBlank()) {
            args = MAPPER.readValue(argumentsJson, new TypeReference<>() {});
        }

        String orderNo = (String) args.get("orderNo");
        if (orderNo == null || orderNo.isBlank()) {
            return MAPPER.writeValueAsString(Map.of("success", false, "error", "缺少 orderNo 参数"));
        }

        String customMessage = (String) args.getOrDefault("message", "请跟进该订单进度，及时反馈。");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        // 查询订单（含工厂隔离）
        ProductionOrder order = findOrder(tenantId, orderNo);
        if (order == null) {
            return MAPPER.writeValueAsString(Map.of("success", false, "error", "未找到订单：" + orderNo));
        }

        String merchandiser = order.getMerchandiser();
        String factoryContact = order.getFactoryContactPerson();
        String factoryName = order.getFactoryName();

        String title = "【催单】" + orderNo + " 请及时跟进";
        List<Map<String, Object>> urgedList = new ArrayList<>();

        // 发通知给跟单员
        if (merchandiser != null && !merchandiser.isBlank()) {
            String content = "订单 " + orderNo + " 需要您（跟单员）跟进处理。" + customMessage;
            sendNotice(tenantId, merchandiser, title, content, orderNo);
            urgedList.add(Map.of("role", "跟单员", "name", merchandiser));
        }

        // 发通知给工厂联系人
        if (factoryContact != null && !factoryContact.isBlank()) {
            String factory = (factoryName != null && !factoryName.isBlank()) ? factoryName : "";
            String content = "订单 " + orderNo + (factory.isBlank() ? "" : "（工厂：" + factory + "）") +
                " 需要您（工厂联系人）跟进处理。" + customMessage;
            sendNotice(tenantId, factoryContact, title, content, orderNo);
            urgedList.add(Map.of("role", "工厂联系人", "name", factoryContact));
        }

        if (urgedList.isEmpty()) {
            return MAPPER.writeValueAsString(Map.of(
                "success", false,
                "error", "订单 " + orderNo + " 未配置跟单员和工厂联系人，无法自动催单"
            ));
        }

        String urgedSummary = urgedList.stream()
            .map(p -> p.get("role") + " " + p.get("name"))
            .reduce((a, b) -> a + "、" + b)
            .orElse("");

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("orderNo", orderNo);
        result.put("urgedPersons", urgedList);
        result.put("message", "已向 " + urgedSummary + " 发送催单通知");
        log.info("[OrderContactUrge] 催单完成 orderNo={} urged={}", orderNo, urgedSummary);
        return MAPPER.writeValueAsString(result);
    }

    private ProductionOrder findOrder(Long tenantId, String orderNo) {
        QueryWrapper<ProductionOrder> q = new QueryWrapper<>();
        q.eq("order_no", orderNo).eq("delete_flag", 0);
        if (tenantId != null) q.eq("tenant_id", tenantId);
        // 工厂账号隔离：外发工厂账号只能操作自己工厂的订单
        String factoryId = UserContext.factoryId();
        if (factoryId != null && !factoryId.isBlank()) {
            q.eq("factory_id", factoryId);
        }
        return productionOrderService.getOne(q, false);
    }

    private void sendNotice(Long tenantId, String toName, String title, String content, String orderNo) {
        SysNotice notice = new SysNotice();
        notice.setTenantId(tenantId);
        notice.setToName(toName);
        notice.setFromName("小云AI助手");
        notice.setOrderNo(orderNo);
        notice.setTitle(title);
        notice.setContent(content);
        notice.setNoticeType("manual");
        notice.setIsRead(0);
        notice.setCreatedAt(LocalDateTime.now());
        sysNoticeService.save(notice);
        log.info("[OrderContactUrge] 通知已发 → {} | {}", toName, title);
    }
}
