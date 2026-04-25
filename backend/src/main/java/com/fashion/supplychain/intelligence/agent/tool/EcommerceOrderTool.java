package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.intelligence.agent.AiTool;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class EcommerceOrderTool extends AbstractAgentTool {

    @Autowired
    private EcommerceOrderService ecommerceOrderService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_order | get_order | stats_order"));
        properties.put("keyword", stringProp("按订单号/平台单号/商品名/买家昵称模糊过滤"));
        properties.put("platform", stringProp("平台过滤: taobao / jd / pdd / douyin"));
        properties.put("status", stringProp("状态过滤(整数): 0待付款 1待发货 2已发货 3已完成 4已取消"));
        properties.put("limit", intProp("列表条数，默认10"));
        properties.put("orderId", stringProp("电商订单ID"));
        return buildToolDef(
                "电商订单查询：查看电商渠道订单列表、订单详情、订单统计。用户说「电商订单」「线上订单」「淘宝订单」「网店订单」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_ecommerce_order";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.PRODUCTION;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (UserContext.factoryId() != null) {
            return errorJson("外发工厂账号无权访问电商订单数据");
        }
        return switch (action) {
            case "list_order" -> listOrders(args);
            case "get_order" -> getOrder(args);
            case "stats_order" -> statsOrders();
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listOrders(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String keyword = optionalString(args, "keyword");
        String platform = optionalString(args, "platform");
        Integer status = optionalInt(args, "status");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<EcommerceOrder> query = new LambdaQueryWrapper<EcommerceOrder>()
                .eq(EcommerceOrder::getTenantId, tenantId)
                .eq(platform != null, EcommerceOrder::getPlatform, platform)
                .eq(status != null, EcommerceOrder::getStatus, status)
                .and(StringUtils.hasText(keyword), q -> q
                        .like(EcommerceOrder::getOrderNo, keyword)
                        .or().like(EcommerceOrder::getPlatformOrderNo, keyword)
                        .or().like(EcommerceOrder::getProductName, keyword)
                        .or().like(EcommerceOrder::getBuyerNick, keyword))
                .orderByDesc(EcommerceOrder::getCreateTime)
                .last("LIMIT " + limit);

        List<EcommerceOrder> items = ecommerceOrderService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "电商订单共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toListDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String getOrder(Map<String, Object> args) throws Exception {
        String orderId = requireString(args, "orderId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        EcommerceOrder order = ecommerceOrderService.lambdaQuery()
                .eq(EcommerceOrder::getId, orderId)
                .eq(EcommerceOrder::getTenantId, tenantId)
                .one();
        if (order == null) return errorJson("电商订单不存在或无权访问");
        return successJson("查询成功", Map.of("order", toDetailDto(order)));
    }

    private String statsOrders() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<EcommerceOrder> all = ecommerceOrderService.lambdaQuery()
                .eq(EcommerceOrder::getTenantId, tenantId)
                .list();
        long total = all.size();
        BigDecimal totalAmount = all.stream().map(EcommerceOrder::getTotalAmount).filter(a -> a != null).reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<Integer, Long> byStatus = all.stream().filter(o -> o.getStatus() != null)
                .collect(java.util.stream.Collectors.groupingBy(EcommerceOrder::getStatus, java.util.stream.Collectors.counting()));
        Map<String, Long> byPlatform = all.stream().filter(o -> o.getPlatform() != null)
                .collect(java.util.stream.Collectors.groupingBy(EcommerceOrder::getPlatform, java.util.stream.Collectors.counting()));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "电商订单统计: 共" + total + "笔, 总金额" + totalAmount);
        result.put("totalOrders", total);
        result.put("totalAmount", totalAmount);
        result.put("byStatus", byStatus);
        result.put("byPlatform", byPlatform);
        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> toListDto(EcommerceOrder o) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", o.getId());
        dto.put("orderNo", o.getOrderNo());
        dto.put("platform", o.getPlatform());
        dto.put("platformOrderNo", o.getPlatformOrderNo());
        dto.put("shopName", o.getShopName());
        dto.put("buyerNick", o.getBuyerNick());
        dto.put("status", o.getStatus());
        dto.put("productName", o.getProductName());
        dto.put("skuCode", o.getSkuCode());
        dto.put("quantity", o.getQuantity());
        dto.put("totalAmount", o.getTotalAmount());
        dto.put("productionOrderNo", o.getProductionOrderNo());
        dto.put("createTime", o.getCreateTime());
        return dto;
    }

    private Map<String, Object> toDetailDto(EcommerceOrder o) {
        Map<String, Object> dto = toListDto(o);
        dto.put("unitPrice", o.getUnitPrice());
        dto.put("payAmount", o.getPayAmount());
        dto.put("freight", o.getFreight());
        dto.put("discount", o.getDiscount());
        dto.put("payType", o.getPayType());
        dto.put("payTime", o.getPayTime());
        dto.put("shipTime", o.getShipTime());
        dto.put("completeTime", o.getCompleteTime());
        dto.put("receiverName", o.getReceiverName());
        dto.put("receiverPhone", o.getReceiverPhone());
        dto.put("receiverAddress", o.getReceiverAddress());
        dto.put("trackingNo", o.getTrackingNo());
        dto.put("expressCompany", o.getExpressCompany());
        dto.put("buyerRemark", o.getBuyerRemark());
        dto.put("sellerRemark", o.getSellerRemark());
        return dto;
    }
}
