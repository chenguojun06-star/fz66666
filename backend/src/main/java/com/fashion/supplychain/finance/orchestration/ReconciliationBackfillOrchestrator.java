package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ReconciliationBackfillOrchestrator {

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Autowired
    private MaterialReconciliationOrchestrator materialReconciliationOrchestrator;

    public int backfillFinanceRecords() {
        return productionOrderOrchestrator.backfillFinanceRecords();
    }

    public Map<String, Object> backfillAll() {
        int financeTouched = productionOrderOrchestrator.backfillFinanceRecords();
        int materialTouched = materialReconciliationOrchestrator.backfill();
        return Map.of(
                "financeTouched", financeTouched,
                "materialTouched", materialTouched);
    }
}
