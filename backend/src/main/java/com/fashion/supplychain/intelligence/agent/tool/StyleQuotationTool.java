package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.service.AiAgentToolAccessService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleQuotationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
public class StyleQuotationTool extends AbstractAgentTool {

    @Autowired
    private StyleQuotationService styleQuotationService;
    @Autowired
    private ProductionOrderService productionOrderService;
    @Autowired
    private AiAgentToolAccessService toolAccessService;

    private static final java.util.Set<String> WRITE_ACTIONS = java.util.Set.of(
            "create_quotation", "audit_quotation", "unlock_quotation");

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("action", stringProp("动作: list_quotation | get_quotation | create_quotation | audit_quotation | unlock_quotation"));
        properties.put("styleId", stringProp("款式ID"));
        properties.put("styleNo", stringProp("款号(模糊匹配)"));
        properties.put("auditStatus", stringProp("审核状态: 0待审核 1已通过 2已驳回"));
        properties.put("limit", intProp("列表条数，默认10"));
        properties.put("materialCost", stringProp("物料成本(create时)"));
        properties.put("processCost", stringProp("工序成本(create时)"));
        properties.put("otherCost", stringProp("其他成本(create时)"));
        properties.put("profitRate", stringProp("利润率(create时)"));
        properties.put("auditRemark", stringProp("审核备注"));
        return buildToolDef(
                "款式报价管理：查询报价、创建报价、审核报价、解锁报价。用户说「报价」「成本核算」「利润率」「报价审核」时必须调用。",
                properties, List.of("action"));
    }

    @Override
    public String getName() {
        return "tool_style_quotation";
    }

    @Override
    public ToolDomain getDomain() {
        return ToolDomain.STYLE;
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        Map<String, Object> args = parseArgs(argumentsJson);
        String action = optionalString(args, "action");
        if (WRITE_ACTIONS.contains(action) && !toolAccessService.hasManagerAccess()) {
            return errorJson("报价写操作需要管理员权限");
        }
        if (UserContext.factoryId() != null) {
            return errorJson("外发工厂账号无权访问报价数据");
        }
        return switch (action) {
            case "list_quotation" -> listQuotations(args);
            case "get_quotation" -> getQuotation(args);
            case "create_quotation" -> createQuotation(args);
            case "audit_quotation" -> auditQuotation(args);
            case "unlock_quotation" -> unlockQuotation(args);
            default -> errorJson("不支持的 action: " + action);
        };
    }

    private String listQuotations(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Long styleId = optionalLong(args, "styleId");
        Integer auditStatus = optionalInt(args, "auditStatus");
        int limit = optionalInt(args, "limit") != null ? optionalInt(args, "limit") : 10;

        var query = new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<StyleQuotation>()
                .eq(StyleQuotation::getTenantId, tenantId)
            .eq(styleId != null, StyleQuotation::getStyleId, styleId)
                .eq(auditStatus != null, StyleQuotation::getAuditStatus, auditStatus)
                .orderByDesc(StyleQuotation::getUpdateTime)
                .last("LIMIT " + limit);

        List<StyleQuotation> items = styleQuotationService.list(query);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("summary", "报价共命中 " + items.size() + " 条");
        result.put("items", items.stream().map(this::toListDto).toList());
        return MAPPER.writeValueAsString(result);
    }

    private String getQuotation(Map<String, Object> args) throws Exception {
        String styleId = requireString(args, "styleId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        StyleQuotation q = styleQuotationService.lambdaQuery()
                .eq(StyleQuotation::getStyleId, Long.valueOf(styleId))
                .eq(StyleQuotation::getTenantId, tenantId)
                .one();
        if (q == null) return errorJson("报价不存在或无权访问");
        Map<String, Object> detail = toDetailDto(q);
        if (q.getTotalPrice() != null) {
            ProductionOrder latestOrder = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getStyleId, q.getStyleId())
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .orderByDesc(ProductionOrder::getCreateTime)
                    .last("LIMIT 1")
                    .one();
            if (latestOrder != null && latestOrder.getOrderQuantity() != null
                    && latestOrder.getOrderQuantity() > 0 && latestOrder.getFactoryUnitPrice() != null) {
                detail.put("factoryUnitPrice", latestOrder.getFactoryUnitPrice());
                BigDecimal quotationUnitPrice = com.fashion.supplychain.production.util.OrderPricingSnapshotUtils
                        .resolveQuotationUnitPrice(latestOrder.getOrderDetails());
                if (quotationUnitPrice != null && quotationUnitPrice.compareTo(BigDecimal.ZERO) > 0) {
                    if (UserContext.factoryId() != null) {
                        detail.put("quotationUnitPrice", "***");
                    } else {
                        detail.put("quotationUnitPrice", quotationUnitPrice);
                    }
                }
            }
        }
        return successJson("查询成功", Map.of("quotation", detail));
    }

    private String createQuotation(Map<String, Object> args) throws Exception {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String styleId = requireString(args, "styleId");
        StyleQuotation q = new StyleQuotation();
        q.setTenantId(tenantId);
        q.setStyleId(Long.valueOf(styleId));
        String mc = optionalString(args, "materialCost");
        if (mc != null) q.setMaterialCost(new BigDecimal(mc));
        String pc = optionalString(args, "processCost");
        if (pc != null) q.setProcessCost(new BigDecimal(pc));
        String oc = optionalString(args, "otherCost");
        if (oc != null) q.setOtherCost(new BigDecimal(oc));
        String pr = optionalString(args, "profitRate");
        if (pr != null) q.setProfitRate(new BigDecimal(pr));
        q.setAuditStatus(0);
        q.setCreatorId(String.valueOf(UserContext.userId()));
        q.setCreatorName(UserContext.username());
        styleQuotationService.save(q);
        return successJson("报价创建成功", Map.of("quotationId", q.getId()));
    }

    private String auditQuotation(Map<String, Object> args) throws Exception {
        String styleId = requireString(args, "styleId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        StyleQuotation q = styleQuotationService.lambdaQuery()
                .eq(StyleQuotation::getStyleId, Long.valueOf(styleId))
                .eq(StyleQuotation::getTenantId, tenantId)
                .one();
        if (q == null) return errorJson("报价不存在");
        q.setAuditStatus(1);
        q.setAuditorId(String.valueOf(UserContext.userId()));
        q.setAuditorName(UserContext.username());
        q.setAuditTime(java.time.LocalDateTime.now());
        q.setAuditRemark(optionalString(args, "auditRemark"));
        styleQuotationService.updateById(q);
        return successJson("报价审核通过", Map.of("styleId", styleId));
    }

    private String unlockQuotation(Map<String, Object> args) throws Exception {
        String styleId = requireString(args, "styleId");
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        StyleQuotation q = styleQuotationService.lambdaQuery()
                .eq(StyleQuotation::getStyleId, Long.valueOf(styleId))
                .eq(StyleQuotation::getTenantId, tenantId)
                .one();
        if (q == null) return errorJson("报价不存在");
        q.setIsLocked(0);
        styleQuotationService.updateById(q);
        return successJson("报价已解锁", Map.of("styleId", styleId));
    }

    private Map<String, Object> toListDto(StyleQuotation q) {
        Map<String, Object> dto = new LinkedHashMap<>();
        dto.put("id", q.getId());
        dto.put("styleId", q.getStyleId());
        dto.put("materialCost", q.getMaterialCost());
        dto.put("processCost", q.getProcessCost());
        dto.put("otherCost", q.getOtherCost());
        dto.put("totalCost", q.getTotalCost());
        dto.put("totalPrice", q.getTotalPrice());
        dto.put("profitRate", q.getProfitRate());
        dto.put("auditStatus", q.getAuditStatus());
        dto.put("isLocked", q.getIsLocked());
        dto.put("createTime", q.getCreateTime());
        return dto;
    }

    private Map<String, Object> toDetailDto(StyleQuotation q) {
        Map<String, Object> dto = toListDto(q);
        dto.put("currency", q.getCurrency());
        dto.put("version", q.getVersion());
        dto.put("standardMaterialCost", q.getStandardMaterialCost());
        dto.put("standardProcessCost", q.getStandardProcessCost());
        dto.put("standardOtherCost", q.getStandardOtherCost());
        dto.put("materialVariance", q.getMaterialVariance());
        dto.put("processVariance", q.getProcessVariance());
        dto.put("totalVariance", q.getTotalVariance());
        dto.put("varianceRate", q.getVarianceRate());
        dto.put("overheadAllocationRate", q.getOverheadAllocationRate());
        dto.put("allocatedOverheadCost", q.getAllocatedOverheadCost());
        dto.put("creatorName", q.getCreatorName());
        dto.put("auditorName", q.getAuditorName());
        dto.put("auditRemark", q.getAuditRemark());
        return dto;
    }
}
