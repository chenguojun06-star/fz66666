package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.OrderTransfer;
import com.fashion.supplychain.production.service.OrderTransferService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class OrderTransferTool extends AbstractAgentTool {

    @Autowired
    private OrderTransferService orderTransferService;
    @Autowired
    private AiAgentToolAccessService toolAccessService;

    private static final java.util.Set<String> WRITE_ACTIONS = java.util.Set.of(
            "create_transfer", "accept_transfer", "reject_transfer");

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_transfer | create_transfer | accept_transfer | reject_transfer | pending_count"));
        properties.put("transferId", stringProp("转单ID"));
        properties.put("orderId", stringProp("订单ID(create时)"));
        properties.put("toUserId", stringProp("目标用户ID(转给内部人员)"));
        properties.put("toFactoryId", stringProp("目标工厂ID(转给外发工厂)"));
        properties.put("message", stringProp("转单说明"));
        properties.put("rejectReason", stringProp("拒绝原因"));
        properties.put("status", stringProp("状态过滤: pending / accepted / rejected"));
        properties.put("limit", intProp("列表条数，默认10"));
        return buildToolDef(
                "订单转单管理：查看转单列表、创建转单、接受/拒绝转单、待处理数量。用户说「转单」「转给别人」「外发转厂」「待处理转单」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_order_transfer";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.PRODUCTION;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (WRITE_ACTIONS.contains(action) && !toolAccessService.hasManagerAccess()) {
            return errorJson("转单写操作需要管理员权限");
        }
        return switch (action) {
            case "list_transfer" -> listTransfers(args);
            case "create_transfer" -> createTransfer(args);
            case "accept_transfer" -> acceptTransfer(args);
            case "reject_transfer" -> rejectTransfer(args);
            case "pending_count" -> pendingCount();
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listTransfers(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String status = optionalString(args, "status");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<OrderTransfer> query = new LambdaQueryWrapper<OrderTransfer>()
                .eq(OrderTransfer::getTenantId, tenantId)
                .eq(StringUtils.hasText(status), OrderTransfer::getStatus, status)
                .orderByDesc(OrderTransfer::getCreatedTime)
                .last("LIMIT " + limit);

        List<OrderTransfer> items = orderTransferService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "转单共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toListDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String createTransfer(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        String orderId = requireString(args, "orderId");
        String message = optionalString(args, "message");
        String toUserId = optionalString(args, "toUserId");
        String toFactoryId = optionalString(args, "toFactoryId");

        OrderTransfer transfer;
        if (StringUtils.hasText(toFactoryId)) {
            transfer = orderTransferService.createTransferToFactory(orderId, toFactoryId, message, null, null);
        } else if (StringUtils.hasText(toUserId)) {
            transfer = orderTransferService.createTransfer(orderId, Long.valueOf(toUserId), message, null, null);
        } else {
            return errorJson("必须指定 toUserId 或 toFactoryId");
        }
        return successJson("转单创建成功", Map.of("transferId", transfer.getId()));
    }

    private String acceptTransfer(Map<String, Object> args) throws Exception {
        String transferId = requireString(args, "transferId");
        TenantAssert.assertTenantContext();
        boolean ok = orderTransferService.acceptTransfer(Long.valueOf(transferId));
        return ok ? successJson("转单已接受", Map.of("transferId", transferId)) : errorJson("接受转单失败");
    }

    private String rejectTransfer(Map<String, Object> args) throws Exception {
        String transferId = requireString(args, "transferId");
        String rejectReason = optionalString(args, "rejectReason");
        TenantAssert.assertTenantContext();
        boolean ok = orderTransferService.rejectTransfer(Long.valueOf(transferId), rejectReason);
        return ok ? successJson("转单已拒绝", Map.of("transferId", transferId)) : errorJson("拒绝转单失败");
    }

    private String pendingCount() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        long count = orderTransferService.lambdaQuery()
                .eq(OrderTransfer::getTenantId, tenantId)
                .eq(OrderTransfer::getStatus, "pending")
                .count();
        return successJson("查询成功", Map.of("pendingCount", count));
    }

    private Map<String, Object> toListDto(OrderTransfer t) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", t.getId());
        dto.put("orderId", t.getOrderId());
        dto.put("transferType", t.getTransferType());
        dto.put("toFactoryName", t.getToFactoryName());
        dto.put("status", t.getStatus());
        dto.put("message", t.getMessage());
        dto.put("rejectReason", t.getRejectReason());
        dto.put("createdTime", t.getCreatedTime());
        dto.put("handledTime", t.getHandledTime());
        return dto;
    }
}
