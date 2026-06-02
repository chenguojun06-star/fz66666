package com.fashion.supplychain.intelligence.engine.kg;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Component
@RequiredArgsConstructor
public class RequiresRelationExtractor implements RelationExtractor {

    private final MaterialPurchaseMapper materialPurchaseMapper;
    private final StyleInfoMapper styleInfoMapper;

    @Override
    public RelationType getRelationType() {
        return RelationType.REQUIRES;
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
            if (mp.getStyleId() == null || mp.getMaterialId() == null) continue;
            String key = mp.getStyleId() + "|" + mp.getMaterialId();
            if (!seen.add(key)) continue;

            StyleInfo style = styleInfoMapper.selectById(mp.getStyleId());
            if (style == null) continue;

            String materialName = mp.getMaterialName() != null ? mp.getMaterialName() : mp.getMaterialCode();
            KgRelation rel = new KgRelation();
            rel.setRelationType(RelationType.REQUIRES.name());
            rel.setSourceType("style");
            rel.setSourceName(style.getStyleNo() + "-" + style.getStyleName());
            rel.setSourceExternalId(String.valueOf(style.getId()));
            rel.setTargetType("material");
            rel.setTargetName(materialName);
            rel.setTargetExternalId(mp.getMaterialId());
            rel.setWeight(0.9);
            rel.getProperties().put("materialType", mp.getMaterialType());
            results.add(rel);
        }
        return results;
    }
}
