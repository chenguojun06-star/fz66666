package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.finance.service.EcSalesRevenueService;
import com.fashion.supplychain.finance.service.ExpenseReimbursementService;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.MaterialInboundService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import static org.mockito.ArgumentMatchers.any;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FinanceMissingOrchestratorTest {

    // ── EcSalesRevenueOrchestrator ─────────────────────────────────────────
    @Mock EcSalesRevenueService ecSalesRevenueService;
    @InjectMocks EcSalesRevenueOrchestrator ecSalesRevenueOrchestrator;

    // ── ExpenseReimbursementOrchestrator ───────────────────────────────────
    @Mock ExpenseReimbursementService expenseReimbursementService;
    @InjectMocks ExpenseReimbursementOrchestrator expenseReimbursementOrchestrator;

    // ── MaterialReconciliationSyncOrchestrator ─────────────────────────────
    @Mock MaterialReconciliationService materialReconciliationService;
    @Mock MaterialInboundService materialInboundService;
    @Mock MaterialPurchaseService materialPurchaseService;
    @InjectMocks MaterialReconciliationSyncOrchestrator materialReconciliationSyncOrchestrator;

    // ── OrderProfitOrchestrator ────────────────────────────────────────────
    @Mock ProductionOrderService productionOrderService;
    @Mock ProductWarehousingService productWarehousingService;
    @Mock ShipmentReconciliationService shipmentReconciliationService;
    @Mock StyleInfoService styleInfoService;
    @Mock StyleQuotationService styleQuotationService;
    @Mock TemplateLibraryService templateLibraryService;
    @Mock StyleBomService styleBomService;
    @Mock StyleProcessService styleProcessService;
    @Mock SecondaryProcessService secondaryProcessService;
    @InjectMocks OrderProfitOrchestrator orderProfitOrchestrator;

    // ── PayrollAggregationOrchestrator (constructor injection) ──────────────
    @Mock ScanRecordService scanRecordService;
    PayrollAggregationOrchestrator payrollAggregationOrchestrator;

    // ── ReconciliationBackfillOrchestrator (constructor injection) ──────────
    @Mock ProductionOrderOrchestrator productionOrderOrchestrator;
    @Mock MaterialReconciliationOrchestrator materialReconciliationOrchestrator;
    ReconciliationBackfillOrchestrator reconciliationBackfillOrchestrator;

    @BeforeEach
    void setUp() {
        payrollAggregationOrchestrator =
                new PayrollAggregationOrchestrator(scanRecordService, productionOrderService);
        reconciliationBackfillOrchestrator =
                new ReconciliationBackfillOrchestrator(productionOrderOrchestrator, materialReconciliationOrchestrator);
    }

    // ────────────────────────────────────────────────────────────────────────
    //  Tests
    // ────────────────────────────────────────────────────────────────────────

    @Test
    void ecSalesRevenue_recordOnOutbound_withNullOrder_doesNotThrow() {
        assertThatCode(() -> ecSalesRevenueOrchestrator.recordOnOutbound(null))
                .doesNotThrowAnyException();
    }

    @Test
    void expenseReimbursement_deleteWhenNotFound_throwsRuntime() {
        when(expenseReimbursementService.getById(anyString())).thenReturn(null);
        assertThatThrownBy(() -> expenseReimbursementOrchestrator.deleteReimbursement("missing-id"))
                .isInstanceOf(RuntimeException.class);
    }

    @Test
    void materialReconciliationSync_isInboundSynced_withNullId_returnsFalse() {
        assertThat(materialReconciliationSyncOrchestrator.isInboundSynced(null)).isFalse();
    }

    @Test
    void orderProfit_computeWithBothEmpty_throwsIllegalArgument() {
        assertThatThrownBy(() -> orderProfitOrchestrator.computeOrderProfit("", ""))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void payrollAggregation_aggregateWithNoFilters_returnsNonNull() {
        when(scanRecordService.list(any(QueryWrapper.class))).thenReturn(Collections.emptyList());
        var result = payrollAggregationOrchestrator.aggregatePayrollByOperatorAndProcess(
                null, null, null, null, null, false);
        assertThat(result).isNotNull();
    }

    @Test
    void reconciliationBackfill_backfillFinanceRecords_returnsResult() {
        when(productionOrderOrchestrator.backfillFinanceRecords()).thenReturn(0);
        int count = reconciliationBackfillOrchestrator.backfillFinanceRecords();
        assertThat(count).isZero();
    }
}
