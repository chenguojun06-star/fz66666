package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PayrollAggregationOrchestratorTest {

    @Mock
    private ScanRecordService scanRecordService;

    @Mock
    private ProductionOrderService productionOrderService;

    @InjectMocks
    private PayrollAggregationOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUsername("tester");
        ctx.setPermissionRange("all"); // 管理员视角，不加操作人过滤
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void aggregatePayroll_emptyRecords_returnsEmptyList() {
        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        List<PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO> result =
                orchestrator.aggregatePayrollByOperatorAndProcess(null, null, null, null, null, false);

        assertThat(result).isEmpty();
    }

    @Test
    void aggregatePayroll_nullOrderNo_doesNotFilter() {
        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        // 传 null 过滤项不应报错
        List<PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO> result =
                orchestrator.aggregatePayrollByOperatorAndProcess(null, null, null, null, null, true);

        assertThat(result).isNotNull();
    }

    @Test
    void aggregatePayroll_singleRecord_returnsSingleDTO() {
        ScanRecord rec = new ScanRecord();
        rec.setOperatorId("op1");
        rec.setOperatorName("张三");
        rec.setProcessName("车缝");
        rec.setQuantity(50);
        rec.setUnitPrice(new BigDecimal("2.00"));
        rec.setScanTime(LocalDateTime.now());
        rec.setOrderNo("PO2026001");
        rec.setOrderId("100");

        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Collections.singletonList(rec));
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        List<PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO> result =
                orchestrator.aggregatePayrollByOperatorAndProcess("PO2026001", null, null, null, null, false);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getOperatorName()).isEqualTo("张三");
        assertThat(result.get(0).getProcessName()).isEqualTo("车缝");
        assertThat(result.get(0).getQuantity()).isEqualTo(50L);
    }

    @Test
    void aggregatePayroll_sameOperatorProcess_aggregatesQuantity() {
        ScanRecord r1 = buildRecord("op1", "张三", "裁剪", 30, "2.5", "PO001");
        ScanRecord r2 = buildRecord("op1", "张三", "裁剪", 20, "2.5", "PO001");

        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Arrays.asList(r1, r2));
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        List<PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO> result =
                orchestrator.aggregatePayrollByOperatorAndProcess(null, null, null, null, null, false);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getQuantity()).isEqualTo(50L); // 30 + 20
    }

    @Test
    void aggregatePayroll_differentOperators_returnsSeparateDTOs() {
        ScanRecord r1 = buildRecord("op1", "张三", "车缝", 30, "2.0", "PO001");
        ScanRecord r2 = buildRecord("op2", "李四", "车缝", 40, "2.0", "PO001");

        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Arrays.asList(r1, r2));
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        List<PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO> result =
                orchestrator.aggregatePayrollByOperatorAndProcess(null, null, null, null, null, false);

        assertThat(result).hasSize(2);
    }

    @Test
    void aggregatePayroll_withOrderStatus_backfillsStatus() {
        ScanRecord rec = buildRecord("op1", "张三", "车缝", 20, "2.0", "PO999");

        ProductionOrder order = new ProductionOrder();
        order.setOrderNo("PO999");
        order.setStatus("completed");

        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Collections.singletonList(rec));
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.singletonList(order));

        List<PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO> result =
                orchestrator.aggregatePayrollByOperatorAndProcess(null, null, null, null, null, false);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getOrderStatus()).isEqualTo("completed");
    }

    @Test
    void aggregatePayroll_scanCostPrioritizedOverUnitPrice() {
        ScanRecord rec = new ScanRecord();
        rec.setOperatorId("op1");
        rec.setOperatorName("王五");
        rec.setProcessName("锁边");
        rec.setQuantity(10);
        rec.setUnitPrice(new BigDecimal("1.00"));
        rec.setScanCost(new BigDecimal("8.88")); // 优先使用 scanCost
        rec.setScanTime(LocalDateTime.now());
        rec.setOrderNo("PO111");

        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Collections.singletonList(rec));
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        List<PayrollAggregationOrchestrator.PayrollOperatorProcessSummaryDTO> result =
                orchestrator.aggregatePayrollByOperatorAndProcess(null, null, null, null, null, false);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getTotalAmount()).isEqualByComparingTo("8.88");
    }

    // --- 辅助方法 ---

    private ScanRecord buildRecord(String operatorId, String operatorName,
                                   String processName, int qty, String unitPrice, String orderNo) {
        ScanRecord r = new ScanRecord();
        r.setOperatorId(operatorId);
        r.setOperatorName(operatorName);
        r.setProcessName(processName);
        r.setQuantity(qty);
        r.setUnitPrice(new BigDecimal(unitPrice));
        r.setScanTime(LocalDateTime.now());
        r.setOrderNo(orderNo);
        return r;
    }
}
