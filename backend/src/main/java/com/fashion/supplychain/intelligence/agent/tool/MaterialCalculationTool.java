package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * BOM物料用量与成本计算工具 — 计算指定款号、数量下的面辅料需求及成本
 * Skill分类：计算类 Skill
 */
@Slf4j
@Component
public class MaterialCalculationTool implements AgentTool {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private ProductionOrderService productionOrderService;

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public String getName() {
        return "tool_material_calculation";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new HashMap<>();

        Map<String, Object> styleNoProp = new HashMap<>();
        styleNoProp.put("type", "string");
        styleNoProp.put("description", "款号（Style No），例如：D2024001");
        properties.put("styleNo", styleNoProp);

        Map<String, Object> orderQtyProp = new HashMap<>();
        orderQtyProp.put("type", "integer");
        orderQtyProp.put("description", "生产数量（件数），例如：500");
        properties.put("orderQuantity", orderQtyProp);

        Map<String, Object> wastageRateProp = new HashMap<>();
        wastageRateProp.put("type", "number");
        wastageRateProp.put("description", "额外损耗率（可选，0~1之间，默认使用BOM中配置的损耗率，若BOM未配置则默认0.05即5%）");
        properties.put("wastageRate", wastageRateProp);

        AiTool tool = new AiTool();
        AiTool.AiFunction function = new AiTool.AiFunction();
        function.setName(getName());
        function.setDescription("根据款号的BOM（物料清单）计算指定生产数量下所需各种面料/辅料的用量和采购成本。用于报价估算、采购计划、成本核算等场景。当用户问'做X件需要多少布料/辅料/成本'时调用。");
        AiTool.AiParameters aiParams = new AiTool.AiParameters();
        aiParams.setProperties(properties);
        aiParams.setRequired(List.of("styleNo", "orderQuantity"));
        function.setParameters(aiParams);
        tool.setFunction(function);
        return tool;
    }

    @Override
    public String execute(String argumentsJson) {
        try {
            JsonNode args = OBJECT_MAPPER.readTree(argumentsJson);
            String styleNo = args.path("styleNo").asText("").trim();
            int orderQuantity = args.path("orderQuantity").asInt(0);

            if (styleNo.isEmpty()) {
                return "{\"error\": \"请提供款号\"}";
            }
            if (orderQuantity <= 0) {
                return "{\"error\": \"生产数量必须大于0\"}";
            }

            Long tenantId = UserContext.tenantId();

            // 工厂账号：只能查看分配给本工厂的款式BOM
            String userFactoryId = UserContext.factoryId();
            if (userFactoryId != null) {
                long orderCount = productionOrderService.count(
                        new QueryWrapper<ProductionOrder>()
                                .eq("factory_id", userFactoryId)
                                .eq(tenantId != null, "tenant_id", tenantId)
                                .eq("style_no", styleNo)
                                .eq("delete_flag", 0));
                if (orderCount == 0) {
                    return "{\"error\": \"您的工厂没有此款号的生产订单，无权查看BOM成本\"}";
                }
            }

            // 查找款式
            QueryWrapper<StyleInfo> styleQw = new QueryWrapper<StyleInfo>()
                    .eq("style_no", styleNo)
                    .eq(tenantId != null, "tenant_id", tenantId)
                    .eq("delete_flag", 0)
                    .last("LIMIT 1");
            StyleInfo style = styleInfoService.getOne(styleQw, false);

            if (style == null) {
                return "{\"error\": \"未找到款号 " + styleNo + " 的款式信息，请确认款号是否正确\"}";
            }

            // 获取BOM清单
            List<StyleBom> bomList = styleBomService.listByStyleId(style.getId());

            if (bomList == null || bomList.isEmpty()) {
                return "{\"message\": \"款号 " + styleNo + " 暂无BOM物料清单，请先在款式管理中配置物料信息\"}";
            }

            // 计算用料与成本
            BigDecimal qty = BigDecimal.valueOf(orderQuantity);
            BigDecimal defaultWastage = BigDecimal.valueOf(0.05);
            BigDecimal totalMaterialCost = BigDecimal.ZERO;

            List<Map<String, Object>> materialDetails = new ArrayList<>();
            boolean hasCost = false;

            for (StyleBom bom : bomList) {
                if (bom.getUsageAmount() == null || bom.getUsageAmount().compareTo(BigDecimal.ZERO) <= 0) {
                    continue;
                }

                // 损耗率：优先用BOM配置值，否则用默认5%
                BigDecimal lossRate = (bom.getLossRate() != null && bom.getLossRate().compareTo(BigDecimal.ZERO) > 0)
                        ? bom.getLossRate().divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP)
                        : defaultWastage;

                // 总用量 = 单件用量 × 数量 × (1 + 损耗率)
                BigDecimal totalUsage = bom.getUsageAmount()
                        .multiply(qty)
                        .multiply(BigDecimal.ONE.add(lossRate))
                        .setScale(2, RoundingMode.HALF_UP);

                Map<String, Object> detail = new HashMap<>();
                detail.put("materialName", bom.getMaterialName());
                detail.put("materialCode", bom.getMaterialCode() != null ? bom.getMaterialCode() : "");
                detail.put("materialType", bom.getMaterialType() != null ? bom.getMaterialType() : "");
                detail.put("color", bom.getColor() != null ? bom.getColor() : "");
                detail.put("unit", bom.getUnit() != null ? bom.getUnit() : "");
                detail.put("usagePerPiece", bom.getUsageAmount().toPlainString());
                detail.put("lossRatePct", lossRate.multiply(BigDecimal.valueOf(100)).setScale(1, RoundingMode.HALF_UP).toPlainString() + "%");
                detail.put("totalUsage", totalUsage.toPlainString());

                // 成本计算
                if (bom.getUnitPrice() != null && bom.getUnitPrice().compareTo(BigDecimal.ZERO) > 0) {
                    BigDecimal cost = totalUsage.multiply(bom.getUnitPrice()).setScale(2, RoundingMode.HALF_UP);
                    detail.put("unitPrice", bom.getUnitPrice().toPlainString());
                    detail.put("materialCost", cost.toPlainString());
                    totalMaterialCost = totalMaterialCost.add(cost);
                    hasCost = true;
                } else {
                    detail.put("unitPrice", "未报价");
                    detail.put("materialCost", "未知");
                }

                materialDetails.add(detail);
            }

            Map<String, Object> result = new HashMap<>();
            result.put("styleNo", styleNo);
            result.put("styleName", style.getStyleName() != null ? style.getStyleName() : "");
            result.put("orderQuantity", orderQuantity);
            result.put("materialCount", materialDetails.size());
            result.put("materials", materialDetails);

            if (hasCost) {
                BigDecimal avgCostPerPiece = totalMaterialCost.divide(qty, 2, RoundingMode.HALF_UP);
                result.put("totalMaterialCost", totalMaterialCost.toPlainString() + " 元");
                result.put("avgMaterialCostPerPiece", avgCostPerPiece.toPlainString() + " 元/件");
                result.put("note", "以上为物料成本，不含加工费（CMT）和其他费用");
            } else {
                result.put("totalMaterialCost", "部分物料未配置单价，无法合计成本");
            }

            return OBJECT_MAPPER.writeValueAsString(result);

        } catch (Exception e) {
            log.error("[MaterialCalculationTool] 计算异常", e);
            return "{\"error\": \"计算失败: " + e.getMessage() + "\"}";
        }
    }
}
