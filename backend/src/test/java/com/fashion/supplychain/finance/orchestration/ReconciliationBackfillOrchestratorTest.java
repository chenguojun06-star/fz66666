package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ReconciliationBackfillOrchestratorTest {

    @Mock
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Mock
    private MaterialReconciliationOrchestrator materialReconciliationOrchestrator;

    @InjectMocks
    private ReconciliationBackfillOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUsername("tester");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void backfillFinanceRecords_delegatesToProductionOrderOrchestrator() {
        when(productionOrderOrchestrator.backfillFinanceRecords()).thenReturn(5);

        int result = orchestrator.backfillFinanceRecords();

        assertThat(result).isEqualTo(5);
        verify(productionOrderOrchestrator).backfillFinanceRecords();
    }

    @Test
    void backfillFinanceRecords_zero_whenNothingToFix() {
        when(productionOrderOrchestrator.backfillFinanceRecords()).thenReturn(0);

        int result = orchestrator.backfillFinanceRecords();

        assertThat(result).isZero();
    }

    @Test
    void backfillAll_combinesFinanceAndMaterialResults() {
        when(productionOrderOrchestrator.backfillFinanceRecords()).thenReturn(3);
        when(materialReconciliationOrchestrator.backfill()).thenReturn(7);

        ReconciliationBackfillOrchestrator.BackfillAllResult result = orchestrator.backfillAll();

        assertThat(result.getFinanceTouched()).isEqualTo(3);
        assertThat(result.getMaterialTouched()).isEqualTo(7);
    }

    @Test
    void backfillAll_bothZero_whenNothingToFix() {
        when(productionOrderOrchestrator.backfillFinanceRecords()).thenReturn(0);
        when(materialReconciliationOrchestrator.backfill()).thenReturn(0);

        ReconciliationBackfillOrchestrator.BackfillAllResult result = orchestrator.backfillAll();

        assertThat(result.getFinanceTouched()).isZero();
        assertThat(result.getMaterialTouched()).isZero();
    }

    @Test
    void backfillAll_callsBothOrchestrators() {
        when(productionOrderOrchestrator.backfillFinanceRecords()).thenReturn(1);
        when(materialReconciliationOrchestrator.backfill()).thenReturn(2);

        orchestrator.backfillAll();

        verify(productionOrderOrchestrator).backfillFinanceRecords();
        verify(materialReconciliationOrchestrator).backfill();
    }
}
