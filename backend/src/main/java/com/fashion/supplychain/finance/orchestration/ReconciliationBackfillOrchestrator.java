package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import org.springframework.stereotype.Service;

/**
 * 对账回填编排器 — 批量回填财务记录和物料对账记录。
 *
 * @deprecated 当前零消费者，为历史遗留的死代码。
 * 计划于 2026-Q3 删除。如需回填功能，请使用对应模块的独立回填方法。
 */
@Deprecated
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
