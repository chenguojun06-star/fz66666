package com.fashion.supplychain.intelligence.engine.kg;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.mapper.StyleInfoMapper;
import com.fashion.supplychain.style.mapper.StyleProcessMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@Lazy
@RequiredArgsConstructor
public class ContainsRelationExtractor implements RelationExtractor {

    private final StyleInfoMapper styleInfoMapper;
    private final StyleProcessMapper styleProcessMapper;

    @Override
    public RelationType getRelationType() {
        return RelationType.CONTAINS;
    }

    @Override
    public List<KgRelation> extract(Long tenantId) {
        if (tenantId == null) return List.of();
        List<StyleProcess> processes = styleProcessMapper.selectList(
                new LambdaQueryWrapper<StyleProcess>()
                        .eq(StyleProcess::getTenantId, tenantId)
                        .last("LIMIT 2000"));
        if (processes.isEmpty()) return List.of();

        List<Long> styleIds = processes.stream()
                .map(StyleProcess::getStyleId)
                .filter(java.util.Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, StyleInfo> styleMap = styleInfoMapper.selectBatchIds(styleIds).stream()
                .collect(Collectors.toMap(StyleInfo::getId, s -> s));

        List<KgRelation> results = new ArrayList<>();
        for (StyleProcess sp : processes) {
            if (sp.getStyleId() == null) continue;
            StyleInfo style = styleMap.get(sp.getStyleId());
            if (style == null) continue;
            KgRelation rel = new KgRelation();
            rel.setRelationType(RelationType.CONTAINS.name());
            rel.setSourceType("style");
            rel.setSourceName(style.getStyleNo() + "-" + style.getStyleName());
            rel.setSourceExternalId(String.valueOf(style.getId()));
            rel.setTargetType("process");
            rel.setTargetName(sp.getProcessName());
            rel.setTargetExternalId(sp.getId());
            rel.setWeight(1.0);
            rel.getProperties().put("stage", sp.getProgressStage());
            rel.getProperties().put("sortOrder", sp.getSortOrder());
            results.add(rel);
        }
        return results;
    }
}
