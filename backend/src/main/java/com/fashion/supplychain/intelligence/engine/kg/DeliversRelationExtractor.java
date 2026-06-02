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

@Component
@RequiredArgsConstructor
public class DeliversRelationExtractor implements RelationExtractor {

    private final ProductionOrderMapper productionOrderMapper;
    private final FactoryMapper factoryMapper;

    @Override
    public RelationType getRelationType() {
        return RelationType.DELIVERS;
    }

    @Override
    public List<KgRelation> extract(Long tenantId) {
        if (tenantId == null) return List.of();
        List<ProductionOrder> orders = productionOrderMapper.selectList(
                new LambdaQueryWrapper<ProductionOrder>()
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .last("LIMIT 2000"));
        if (orders.isEmpty()) return List.of();

        Set<String> tenantFactoryIds = factoryMapper.selectList(
                new LambdaQueryWrapper<Factory>()
                        .eq(Factory::getTenantId, tenantId)
                        .eq(Factory::getDeleteFlag, 0))
                .stream().map(Factory::getId).collect(java.util.stream.Collectors.toSet());

        Set<String> seen = new HashSet<>();
        List<KgRelation> results = new ArrayList<>();
        for (ProductionOrder o : orders) {
            if (o.getFactoryId() == null) continue;
            if (!tenantFactoryIds.isEmpty() && !tenantFactoryIds.contains(o.getFactoryId())) continue;
            String key = o.getFactoryId() + "|" + o.getId();
            if (!seen.add(key)) continue;

            String status = o.getStatus() != null ? o.getStatus() : "";
            boolean delivered = status.contains("已发货") || status.contains("已交付")
                    || status.contains("已签收") || status.contains("已完成")
                    || status.contains("DELIVERED") || status.contains("COMPLETED");
            if (!delivered) continue;

            KgRelation rel = new KgRelation();
            rel.setRelationType(RelationType.DELIVERS.name());
            rel.setSourceType("factory");
            rel.setSourceName(o.getFactoryId());
            rel.setSourceExternalId(o.getFactoryId());
            rel.setTargetType("order");
            rel.setTargetName(o.getOrderNo());
            rel.setTargetExternalId(o.getId());
            rel.setWeight(1.0);
            rel.getProperties().put("status", status);
            results.add(rel);
        }
        return results;
    }
}
