package com.fashion.supplychain.intelligence.engine.kg;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.mapper.FactoryMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Component
@RequiredArgsConstructor
public class BelongsToRelationExtractor implements RelationExtractor {

    private final ProductionOrderMapper productionOrderMapper;
    private final FactoryMapper factoryMapper;

    @Override
    public RelationType getRelationType() {
        return RelationType.BELONGS_TO;
    }

    @Override
    public List<KgRelation> extract(Long tenantId) {
        if (tenantId == null) return List.of();
        List<Factory> factories = factoryMapper.selectList(
                new LambdaQueryWrapper<Factory>()
                        .eq(Factory::getTenantId, tenantId)
                        .eq(Factory::getDeleteFlag, 0));
        Set<String> tenantFactoryIds = factories.stream()
                .map(Factory::getId).collect(Collectors.toSet());

        List<ProductionOrder> orders = productionOrderMapper.selectList(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .last("LIMIT 2000"));
        if (orders.isEmpty()) return List.of();

        Set<String> seen = new HashSet<>();
        List<KgRelation> results = new ArrayList<>();
        for (ProductionOrder o : orders) {
            if (o.getFactoryId() == null) continue;
            if (!tenantFactoryIds.isEmpty() && !tenantFactoryIds.contains(o.getFactoryId())) continue;
            if (!seen.add(o.getId())) continue;

            KgRelation rel = new KgRelation();
            rel.setRelationType(RelationType.BELONGS_TO.name());
            rel.setSourceType("order");
            rel.setSourceName(o.getOrderNo());
            rel.setSourceExternalId(o.getId());
            rel.setTargetType("factory");
            rel.setTargetName(o.getFactoryId());
            rel.setTargetExternalId(o.getFactoryId());
            rel.setWeight(1.0);
            rel.getProperties().put("status", o.getStatus());
            results.add(rel);
        }
        return results;
    }
}
