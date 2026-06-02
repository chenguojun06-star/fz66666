package com.fashion.supplychain.intelligence.engine;

import com.fashion.supplychain.intelligence.engine.dto.RiskSet;
import java.util.List;

public interface PerceptionEngine {
    RiskSet detectAllRisks(Long tenantId);

    RiskSet mergeRisks(List<RiskSet> riskSets);

    List<Long> schedulePush(RiskSet merged, Long tenantId);
}
