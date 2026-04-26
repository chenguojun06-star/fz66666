package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.EcSalesRevenue;
import com.fashion.supplychain.finance.service.EcSalesRevenueService;
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
public class EcSalesRevenueTool extends AbstractAgentTool {

    @Autowired
    private EcSalesRevenueService ecSalesRevenueService;

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_revenue | stats_revenue"));
        properties.put("keyword", stringProp("按订单号/平台/商品名模糊过滤"));
        properties.put("platform", stringProp("平台过滤: taobao / jd / pdd / douyin"));
        properties.put("status", stringProp("状态过滤: pending / confirmed / completed"));
        properties.put("limit", intProp("列表条数，默认10"));
        return buildToolDef(
                "电商营收查询：查看电商渠道营收记录、营收统计汇总。用户说「电商营收」「线上销售」「淘宝营收」「电商数据」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_ec_sales_revenue";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.FINANCE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (UserContext.factoryId() != null) {
            return errorJson("外发工厂账号无权访问电商营收数据");
        }
        return switch (action) {
            case "list_revenue" -> listRevenue(args);
            case "stats_revenue" -> statsRevenue();
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listRevenue(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String keyword = optionalString(args, "keyword");
        String platform = optionalString(args, "platform");
        String status = optionalString(args, "status");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        LambdaQueryWrapper<EcSalesRevenue> query = new LambdaQueryWrapper<EcSalesRevenue>()
                .eq(EcSalesRevenue::getTenantId, tenantId)
                .eq(StringUtils.hasText(platform), EcSalesRevenue::getPlatform, platform)
                .eq(StringUtils.hasText(status), EcSalesRevenue::getStatus, status)
                .and(StringUtils.hasText(keyword), q -> q
                        .like(EcSalesRevenue::getEcOrderNo, keyword)
                        .or().like(EcSalesRevenue::getPlatformOrderNo, keyword)
                        .or().like(EcSalesRevenue::getProductName, keyword)
                        .or().like(EcSalesRevenue::getShopName, keyword))
                .orderByDesc(EcSalesRevenue::getCreateTime)
                .last("LIMIT " + limit);

        List<EcSalesRevenue> items = ecSalesRevenueService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "电商营收共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toListDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String statsRevenue() throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<EcSalesRevenue> all = ecSalesRevenueService.lambdaQuery()
                .eq(EcSalesRevenue::getTenantId, tenantId)
                .last("LIMIT 5000")
                .list();
        long total = all.size();
        BigDecimal totalAmount = all.stream().map(EcSalesRevenue::getTotalAmount).filter(a -> a != null).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal payAmount = all.stream().map(EcSalesRevenue::getPayAmount).filter(a -> a != null).reduce(BigDecimal.ZERO, BigDecimal::add);
        Map<String, Long> byPlatform = all.stream().filter(r -> r.getPlatform() != null)
                .collect(java.util.stream.Collectors.groupingBy(EcSalesRevenue::getPlatform, java.util.stream.Collectors.counting()));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "电商营收统计: 共" + total + "笔, 总金额" + totalAmount + ", 实付" + payAmount);
        result.put("totalOrders", total);
        result.put("totalAmount", totalAmount);
        result.put("payAmount", payAmount);
        result.put("byPlatform", byPlatform);
        return MAPPER.writeValueAsString(result);
    }

    private Map<String, Object> toListDto(EcSalesRevenue r) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", r.getId());
        dto.put("revenueNo", r.getRevenueNo());
        dto.put("ecOrderNo", r.getEcOrderNo());
        dto.put("platformOrderNo", r.getPlatformOrderNo());
        dto.put("platform", r.getPlatform());
        dto.put("shopName", r.getShopName());
        dto.put("productName", r.getProductName());
        dto.put("skuCode", r.getSkuCode());
        dto.put("quantity", r.getQuantity());
        dto.put("unitPrice", r.getUnitPrice());
        dto.put("totalAmount", r.getTotalAmount());
        dto.put("payAmount", r.getPayAmount());
        dto.put("status", r.getStatus());
        dto.put("productionOrderNo", r.getProductionOrderNo());
        dto.put("createTime", r.getCreateTime());
        return dto;
    }
}
