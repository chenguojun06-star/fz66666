package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import org.springframework.stereotype.Service;

@Service
public class ReconciliationBackfillOrchestrator {

    public static class BackfillAllResult {
        private final int financeTouched;
        private final int materialTouched;

        public BackfillAllResult(int financeTouched, int materialTouched) {
            this.financeTouched = financeTouched;
            this.materialTouched = materialTouched;
        }

        public int getFinanceTouched() {
            return financeTouched;
        }

        public int getMaterialTouched() {
            return materialTouched;
        }
    }

    private final ProductionOrderOrchestrator productionOrderOrchestrator;
    private final MaterialReconciliationOrchestrator materialReconciliationOrchestrator;

    public ReconciliationBackfillOrchestrator(
            ProductionOrderOrchestrator productionOrderOrchestrator,
            MaterialReconciliationOrchestrator materialReconciliationOrchestrator) {
        this.productionOrderOrchestrator = productionOrderOrchestrator;
        this.materialReconciliationOrchestrator = materialReconciliationOrchestrator;
    }

    public int backfillFinanceRecords() {
        return productionOrderOrchestrator.backfillFinanceRecords();
    }

    public BackfillAllResult backfillAll() {
        int financeTouched = productionOrderOrchestrator.backfillFinanceRecords();
        int materialTouched = materialReconciliationOrchestrator.backfill();
        return new BackfillAllResult(financeTouched, materialTouched);
    }
}
