package com.fashion.supplychain.intelligence.engine.kg;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class SuppliesRelationExtractor implements RelationExtractor {

    private final MaterialPurchaseMapper materialPurchaseMapper;

    @Override
    public RelationType getRelationType() {
        return RelationType.SUPPLIES;
    }

    @Override
    public List<KgRelation> extract(Long tenantId) {
        if (tenantId == null) return List.of();
        List<MaterialPurchase> purchases = materialPurchaseMapper.selectList(
                new LambdaQueryWrapper<MaterialPurchase>()
                        .eq(MaterialPurchase::getTenantId, tenantId)
                        .eq(MaterialPurchase::getDeleteFlag, 0)
                        .last("LIMIT 2000"));
        if (purchases.isEmpty()) return List.of();

        Set<String> seen = new HashSet<>();
        List<KgRelation> results = new ArrayList<>();
        for (MaterialPurchase mp : purchases) {
            if (mp.getSupplierId() == null || mp.getMaterialId() == null) continue;
            String key = mp.getSupplierId() + "|" + mp.getMaterialId();
            if (!seen.add(key)) continue;

            String supplierName = mp.getSupplierName() != null ? mp.getSupplierName() : mp.getSupplierId();
            String materialName = mp.getMaterialName() != null ? mp.getMaterialName() : mp.getMaterialCode();
            KgRelation rel = new KgRelation();
            rel.setRelationType(RelationType.SUPPLIES.name());
            rel.setSourceType("supplier");
            rel.setSourceName(supplierName);
            rel.setSourceExternalId(mp.getSupplierId());
            rel.setTargetType("material");
            rel.setTargetName(materialName);
            rel.setTargetExternalId(mp.getMaterialId());
            rel.setWeight(1.0);
            rel.getProperties().put("supplierType", "material");
            results.add(rel);
        }
        return results;
    }
}
