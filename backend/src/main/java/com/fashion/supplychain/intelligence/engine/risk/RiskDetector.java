package com.fashion.supplychain.intelligence.engine.risk;

import java.util.List;

public interface RiskDetector {
    RiskType getType();
    List<RiskItem> detect(Long tenantId);
}
