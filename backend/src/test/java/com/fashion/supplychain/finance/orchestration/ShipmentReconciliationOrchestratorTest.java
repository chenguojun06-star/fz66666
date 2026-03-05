package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.DeductionItemMapper;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ShipmentReconciliationOrchestratorTest {

    @Mock
    private ShipmentReconciliationService shipmentReconciliationService;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Mock
    private DeductionItemMapper deductionItemMapper;

    @Mock
    private ScanRecordMapper scanRecordMapper;

    @InjectMocks
    private ShipmentReconciliationOrchestrator shipmentReconciliationOrchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    // ─── calculateScanCost ──────────────────────────────────────────────────

    @Test
    void calculateScanCost_withNullOrderId_returnsZero() {
        BigDecimal result = shipmentReconciliationOrchestrator.calculateScanCost(null);
        assertThat(result).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void calculateScanCost_withEmptyOrderId_returnsZero() {
        BigDecimal result = shipmentReconciliationOrchestrator.calculateScanCost("  ");
        assertThat(result).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void calculateScanCost_withNoScanRecords_returnsZero() {
        when(scanRecordMapper.selectList(any(Wrapper.class))).thenReturn(Collections.emptyList());

        BigDecimal result = shipmentReconciliationOrchestrator.calculateScanCost("ORDER001");

        assertThat(result).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void calculateScanCost_sumsScanCostFromAllRecords() {
        ScanRecord r1 = new ScanRecord();
        r1.setScanCost(new BigDecimal("15.50"));

        ScanRecord r2 = new ScanRecord();
        r2.setScanCost(new BigDecimal("24.00"));

        ScanRecord r3 = new ScanRecord();
        r3.setScanCost(null); // null should be filtered

        when(scanRecordMapper.selectList(any(Wrapper.class))).thenReturn(List.of(r1, r2, r3));

        BigDecimal result = shipmentReconciliationOrchestrator.calculateScanCost("ORDER001");

        assertThat(result).isEqualByComparingTo(new BigDecimal("39.50"));
    }

    // ─── fillProfitInfo ──────────────────────────────────────────────────────

    @Test
    void fillProfitInfo_withNullShipment_doesNotThrow() {
        // must not throw
        shipmentReconciliationOrchestrator.fillProfitInfo(null);
    }

    @Test
    void fillProfitInfo_calculatesProfit() {
        ShipmentReconciliation s = new ShipmentReconciliation();
        s.setOrderId("ORDER001");
        s.setFinalAmount(new BigDecimal("1000.00"));
        s.setMaterialCost(new BigDecimal("300.00"));

        // scanCost from scan records
        ScanRecord r = new ScanRecord();
        r.setScanCost(new BigDecimal("200.00"));
        when(scanRecordMapper.selectList(any(Wrapper.class))).thenReturn(List.of(r));

        shipmentReconciliationOrchestrator.fillProfitInfo(s);

        // totalCost = 200 + 300 = 500; profit = 1000 - 500 = 500; margin = 50%
        assertThat(s.getScanCost()).isEqualByComparingTo(new BigDecimal("200.00"));
        assertThat(s.getTotalCost()).isEqualByComparingTo(new BigDecimal("500.00"));
        assertThat(s.getProfitAmount()).isEqualByComparingTo(new BigDecimal("500.00"));
        assertThat(s.getProfitMargin()).isEqualByComparingTo(new BigDecimal("50.00"));
    }

    @Test
    void fillProfitInfo_withZeroFinalAmount_setsZeroMargin() {
        ShipmentReconciliation s = new ShipmentReconciliation();
        s.setOrderId("ORDER002");
        s.setFinalAmount(BigDecimal.ZERO);
        s.setMaterialCost(BigDecimal.ZERO);

        when(scanRecordMapper.selectList(any(Wrapper.class))).thenReturn(Collections.emptyList());

        shipmentReconciliationOrchestrator.fillProfitInfo(s);

        assertThat(s.getProfitMargin()).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void fillProfitInfo_withNegativeProfit_allowsNegativeMargin() {
        ShipmentReconciliation s = new ShipmentReconciliation();
        s.setOrderId("ORDER003");
        s.setFinalAmount(new BigDecimal("100.00"));
        s.setMaterialCost(new BigDecimal("500.00"));

        when(scanRecordMapper.selectList(any(Wrapper.class))).thenReturn(Collections.emptyList());

        shipmentReconciliationOrchestrator.fillProfitInfo(s);

        // profit = 100 - 500 = -400 (亏损)
        assertThat(s.getProfitAmount()).isEqualByComparingTo(new BigDecimal("-400.00"));
    }

    @Test
    void fillProfitInfo_withNullMaterialCost_treatedAsZero() {
        ShipmentReconciliation s = new ShipmentReconciliation();
        s.setOrderId("ORDER004");
        s.setFinalAmount(new BigDecimal("200.00"));
        s.setMaterialCost(null); // null materialCost

        when(scanRecordMapper.selectList(any(Wrapper.class))).thenReturn(Collections.emptyList());

        shipmentReconciliationOrchestrator.fillProfitInfo(s);

        assertThat(s.getProfitAmount()).isEqualByComparingTo(new BigDecimal("200.00"));
    }
}
