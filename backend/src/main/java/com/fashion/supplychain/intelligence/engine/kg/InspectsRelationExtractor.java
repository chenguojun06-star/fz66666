package com.fashion.supplychain.intelligence.engine.kg;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;

@Component
@Lazy
@RequiredArgsConstructor
public class InspectsRelationExtractor implements RelationExtractor {

    private final ProductionOrderMapper productionOrderMapper;

    @Override
    public RelationType getRelationType() {
        return RelationType.INSPECTS;
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

        List<KgRelation> results = new ArrayList<>();
        for (ProductionOrder o : orders) {
            String status = o.getStatus() != null ? o.getStatus() : "";
            boolean inspected = status.contains("质检") || status.contains("检验")
                    || status.contains("品检") || status.contains("INSPECTED")
                    || status.contains("QUALITY_CHECKED");
            if (!inspected) continue;

            KgRelation rel = new KgRelation();
            rel.setRelationType(RelationType.INSPECTS.name());
            rel.setSourceType("inspection");
            rel.setSourceName("质检-" + o.getOrderNo());
            rel.setSourceExternalId("INSP-" + o.getId());
            rel.setTargetType("order");
            rel.setTargetName(o.getOrderNo());
            rel.setTargetExternalId(o.getId());
            rel.setWeight(0.9);
            rel.getProperties().put("status", status);
            results.add(rel);
        }
        return results;
    }
}
