package com.fashion.supplychain.intelligence.engine.kg;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
@Lazy
@RequiredArgsConstructor
public class ProducesRelationExtractor implements RelationExtractor {

    private final FactoryMapper factoryMapper;
    private final ProductionOrderMapper productionOrderMapper;
    private final StyleInfoMapper styleInfoMapper;

    @Override
    public RelationType getRelationType() {
        return RelationType.PRODUCES;
    }

    @Override
    public List<KgRelation> extract(Long tenantId) {
        if (tenantId == null) return List.of();
        List<Factory> factories = factoryMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<Factory>()
                        .eq(Factory::getTenantId, tenantId));
        if (factories.isEmpty()) return List.of();

        Set<String> tenantFactoryIds = factories.stream()
                .map(Factory::getId)
                .collect(java.util.stream.Collectors.toSet());
        if (tenantFactoryIds.isEmpty()) return List.of();

        List<ProductionOrder> orders = productionOrderMapper.selectList(
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .last("LIMIT 1000"));

        // 批量预加载 StyleInfo（修复 N+1 查询）
        Set<String> styleIds = orders.stream()
                .map(ProductionOrder::getStyleId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        Map<String, StyleInfo> styleMap = styleIds.isEmpty()
                ? Collections.emptyMap()
                : styleInfoMapper.selectBatchIds(styleIds).stream()
                        .collect(Collectors.toMap(s -> String.valueOf(s.getId()), Function.identity(), (a, b) -> a));

        Set<String> seen = new HashSet<>();
        List<KgRelation> results = new ArrayList<>();
        for (ProductionOrder o : orders) {
            if (o.getFactoryId() == null || o.getStyleId() == null) continue;
            if (!tenantFactoryIds.contains(o.getFactoryId())) continue;
            String key = o.getFactoryId() + "|" + o.getStyleId();
            if (!seen.add(key)) continue;

            StyleInfo style = styleMap.get(o.getStyleId());
            if (style == null) continue;

            KgRelation rel = new KgRelation();
            rel.setRelationType(RelationType.PRODUCES.name());
            rel.setSourceType("factory");
            rel.setSourceName(o.getFactoryId());
            rel.setSourceExternalId(o.getFactoryId());
            rel.setTargetType("style");
            rel.setTargetName(style.getStyleNo() + "-" + style.getStyleName());
            rel.setTargetExternalId(String.valueOf(style.getId()));
            rel.setWeight(0.8);
            rel.getProperties().put("orderNo", o.getOrderNo());
            results.add(rel);
        }
        return results;
    }
}
