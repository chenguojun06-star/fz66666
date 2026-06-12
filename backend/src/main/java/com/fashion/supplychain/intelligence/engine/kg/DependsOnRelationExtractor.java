package com.fashion.supplychain.intelligence.engine.kg;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.mapper.StyleProcessMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Component
@Lazy
@RequiredArgsConstructor
public class DependsOnRelationExtractor implements RelationExtractor {

    private final StyleProcessMapper styleProcessMapper;

    @Override
    public RelationType getRelationType() {
        return RelationType.DEPENDS_ON;
    }

    @Override
    public List<KgRelation> extract(Long tenantId) {
        if (tenantId == null) return List.of();
        List<StyleProcess> processes = styleProcessMapper.selectList(
                new LambdaQueryWrapper<StyleProcess>()
                        .eq(StyleProcess::getTenantId, tenantId)
                        .last("LIMIT 2000"));
        if (processes.isEmpty()) return List.of();

        Map<Long, List<StyleProcess>> byStyle = processes.stream()
                .filter(sp -> sp.getStyleId() != null)
                .collect(Collectors.groupingBy(StyleProcess::getStyleId));

        List<KgRelation> results = new ArrayList<>();
        for (List<StyleProcess> styleProcs : byStyle.values()) {
            List<StyleProcess> sorted = styleProcs.stream()
                    .sorted(Comparator.comparingInt(sp -> sp.getSortOrder() != null ? sp.getSortOrder() : 999))
                    .collect(Collectors.toList());
            for (int i = 1; i < sorted.size(); i++) {
                StyleProcess prev = sorted.get(i - 1);
                StyleProcess curr = sorted.get(i);
                KgRelation rel = new KgRelation();
                rel.setRelationType(RelationType.DEPENDS_ON.name());
                rel.setSourceType("process");
                rel.setSourceName(prev.getProcessName());
                rel.setSourceExternalId(prev.getId());
                rel.setTargetType("process");
                rel.setTargetName(curr.getProcessName());
                rel.setTargetExternalId(curr.getId());
                rel.setWeight(0.85);
                rel.getProperties().put("styleId", String.valueOf(curr.getStyleId()));
                results.add(rel);
            }
        }
        return results;
    }
}
