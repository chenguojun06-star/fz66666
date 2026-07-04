package com.fashion.supplychain.integration.ecommerce.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorPricePolicy;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 分销商价格政策 Service
 * 三种类型：FIXED（固定价）/ DISCOUNT（折扣）/ TIERED（阶梯）
 */
public interface DistributorPricePolicyService extends IService<DistributorPricePolicy> {

    /** 列表查询 */
    default List<DistributorPricePolicy> listByTenant(Long tenantId, String level, String skuCode, String policyType) {
        return list(new LambdaQueryWrapper<DistributorPricePolicy>()
                .eq(DistributorPricePolicy::getTenantId, tenantId)
                .eq(DistributorPricePolicy::getDeleteFlag, 0)
                .eq(level != null && !level.isBlank(), DistributorPricePolicy::getDistributorLevel, level)
                .eq(skuCode != null && !skuCode.isBlank(), DistributorPricePolicy::getSkuCode, skuCode)
                .eq(policyType != null && !policyType.isBlank(), DistributorPricePolicy::getPolicyType, policyType)
                .orderByDesc(DistributorPricePolicy::getCreateTime));
    }

    /**
     * 根据分销商等级 + SKU 查询生效价格政策
     * 优先级：精确匹配等级 > 等级为空（适用全部）
     */
    default List<DistributorPricePolicy> findEffective(Long tenantId, String level, String skuCode) {
        LocalDateTime now = LocalDateTime.now();
        return list(new LambdaQueryWrapper<DistributorPricePolicy>()
                .eq(DistributorPricePolicy::getTenantId, tenantId)
                .eq(DistributorPricePolicy::getDeleteFlag, 0)
                .eq(DistributorPricePolicy::getEnabled, 1)
                .eq(skuCode != null, DistributorPricePolicy::getSkuCode, skuCode)
                .and(w -> w.isNull(DistributorPricePolicy::getDistributorLevel)
                        .or().eq(DistributorPricePolicy::getDistributorLevel, level))
                .and(w -> w.isNull(DistributorPricePolicy::getEffectiveFrom)
                        .or().le(DistributorPricePolicy::getEffectiveFrom, now))
                .and(w -> w.isNull(DistributorPricePolicy::getEffectiveTo)
                        .or().ge(DistributorPricePolicy::getEffectiveTo, now))
                .orderByDesc(DistributorPricePolicy::getDistributorLevel));
    }

    /**
     * 计算供货价（B2B 下单时调用）
     * @return 供货价，未匹配返回 null
     */
    default BigDecimal calcSupplyPrice(Long tenantId, String level, String skuCode, Integer quantity) {
        List<DistributorPricePolicy> policies = findEffective(tenantId, level, skuCode);
        for (DistributorPricePolicy p : policies) {
            switch (p.getPolicyType()) {
                case "FIXED":
                    return p.getSupplyPrice();
                case "DISCOUNT":
                    // DISCOUNT 类型：supply_price 存储折扣后的价格
                    return p.getSupplyPrice();
                case "TIERED":
                    return resolveTierPrice(p.getTierJson(), quantity);
            }
        }
        return null;
    }

    /** 解析阶梯价 JSON */
    default BigDecimal resolveTierPrice(String tierJson, Integer quantity) {
        if (tierJson == null || tierJson.isBlank() || quantity == null) return null;
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            List<com.fasterxml.jackson.databind.JsonNode> tiers = mapper.readValue(tierJson,
                    mapper.getTypeFactory().constructCollectionType(List.class, com.fasterxml.jackson.databind.JsonNode.class));
            BigDecimal matched = null;
            for (com.fasterxml.jackson.databind.JsonNode t : tiers) {
                int minQty = t.has("minQty") ? t.get("minQty").asInt() : 0;
                int maxQty = t.has("maxQty") ? t.get("maxQty").asInt() : Integer.MAX_VALUE;
                if (quantity >= minQty && quantity <= maxQty) {
                    if (t.has("price")) return new BigDecimal(t.get("price").asText());
                }
                // 记录第一个阶梯作为兜底
                if (matched == null && t.has("price")) {
                    matched = new BigDecimal(t.get("price").asText());
                }
            }
            return matched;
        } catch (Exception e) {
            return null;
        }
    }
}
