package com.fashion.supplychain.intelligence.engine.impl;

import com.fashion.supplychain.intelligence.engine.PerceptionEngine;
import com.fashion.supplychain.intelligence.engine.dto.RiskSet;
import com.fashion.supplychain.intelligence.engine.risk.ParallelRiskDetector;
import com.fashion.supplychain.intelligence.engine.risk.RiskItem;
import com.fashion.supplychain.intelligence.engine.risk.RiskType;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

@Service
@Lazy
public class PerceptionEngineImpl implements PerceptionEngine {

    @Autowired(required = false)
    private ParallelRiskDetector parallelRiskDetector;

    @Override
    public RiskSet detectAllRisks(Long tenantId) {
        RiskSet set = new RiskSet();
        set.setTenantId(tenantId);
        if (parallelRiskDetector == null) return set;

        long start = System.currentTimeMillis();
        Map<RiskType, List<RiskItem>> byType = parallelRiskDetector.detectAll(tenantId);
        List<RiskItem> ranked = parallelRiskDetector.mergeAndRank(byType);
        List<RiskItem> deduped = parallelRiskDetector.deduplicate(ranked);

        int high = 0, critical = 0;
        for (RiskItem item : deduped) {
            RiskSet.RiskItem r = new RiskSet.RiskItem();
            r.setRiskType(item.getType().name());
            r.setSeverity(item.getSeverity());
            r.setOrderId(item.getOrderId());
            r.setDescription(item.getDescription());
            set.getItems().add(r);
            if (item.isCritical()) critical++;
            else if (item.isHigh()) high++;
        }
        set.setTotalCount(deduped.size());
        return set;
    }

    @Override
    public RiskSet mergeRisks(List<RiskSet> riskSets) {
        RiskSet merged = new RiskSet();
        if (riskSets == null || riskSets.isEmpty()) return merged;
        for (RiskSet rs : riskSets) {
            if (rs == null) continue;
            if (merged.getTenantId() == null) merged.setTenantId(rs.getTenantId());
            if (rs.getItems() != null) merged.getItems().addAll(rs.getItems());
        }
        merged.setTotalCount(merged.getItems().size());
        return merged;
    }

    @Override
    public List<Long> schedulePush(RiskSet merged, Long tenantId) {
        if (merged == null || merged.getItems() == null || merged.getItems().isEmpty()) {
            return Collections.emptyList();
        }
        List<Long> userIds = new ArrayList<>();
        long critical = 0, high = 0;
        for (RiskSet.RiskItem r : merged.getItems()) {
            if ("CRITICAL".equals(r.getSeverity())) critical++;
            else if ("HIGH".equals(r.getSeverity())) high++;
        }
        if (critical > 0) userIds.add(-1L);
        if (high > 0) userIds.add(-2L);
        return userIds;
    }
}
