package com.fashion.supplychain.finance.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.entity.PayrollSettlementItem;
import com.fashion.supplychain.finance.service.PayrollSettlementItemService;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.math.BigDecimal;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class PayrollSettlementOrchestratorTest {

    @Mock
    private PayrollSettlementService payrollSettlementService;

    @Mock
    private PayrollSettlementItemService payrollSettlementItemService;

    @Mock
    private ScanRecordMapper scanRecordMapper;

    @Mock
    private ProductionOrderService productionOrderService;

    @InjectMocks
    private PayrollSettlementOrchestrator orchestrator;

    @BeforeAll
    static void initLambdaCache() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, PayrollSettlement.class);
        TableInfoHelper.initTableInfo(assistant, PayrollSettlementItem.class);
        TableInfoHelper.initTableInfo(assistant, ScanRecord.class);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ─────────────────── detail() ───────────────────

    @Test
    void detail_throwsOnBlankId() {
        assertThrows(IllegalArgumentException.class, () -> orchestrator.detail(""));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.detail(null));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.detail("   "));
    }

    @Test
    void detail_throwsWhenNotFound() {
        when(payrollSettlementService.getDetailById("S001")).thenReturn(null);
        assertThrows(NoSuchElementException.class, () -> orchestrator.detail("S001"));
    }

    @Test
    void detail_returnsSettlement() {
        PayrollSettlement ps = new PayrollSettlement();
        ps.setId("S001");
        ps.setStatus("pending");
        when(payrollSettlementService.getDetailById("S001")).thenReturn(ps);

        PayrollSettlement result = orchestrator.detail("S001");
        assertNotNull(result);
        assertEquals("S001", result.getId());
    }

    // ─────────────────── generate() — 错误路径 ───────────────────

    @Test
    void generate_throwsWhenNoTenantContext() {
        // UserContext未设置 → TenantAssert.assertTenantContext() 抛出
        Map<String, Object> params = new HashMap<>();
        params.put("orderId", "ORD001");
        assertThrows(RuntimeException.class, () -> orchestrator.generate(params));
    }

    @Test
    void generate_throwsOnMissingRequiredParams() {
        setTenantContext(1L);
        // 所有参数为空 → IllegalArgumentException
        assertThrows(IllegalArgumentException.class, () -> orchestrator.generate(new HashMap<>()));
    }

    @Test
    void generate_throwsWhenNoScanRecords() {
        setTenantContext(1L);
        Map<String, Object> params = new HashMap<>();
        params.put("orderId", "ORD001");

        when(scanRecordMapper.selectPayrollAggregation(
                anyString(), any(), any(), any(), any(), any(), any(),
                any(), any(), anyBoolean()))
                .thenReturn(Collections.emptyList());

        assertThrows(IllegalStateException.class, () -> orchestrator.generate(params));
    }

    @Test
    void generate_throwsWhenScanRecordsNull() {
        setTenantContext(1L);
        Map<String, Object> params = new HashMap<>();
        params.put("orderId", "ORD001");

        when(scanRecordMapper.selectPayrollAggregation(
                anyString(), any(), any(), any(), any(), any(), any(),
                any(), any(), anyBoolean()))
                .thenReturn(null);

        assertThrows(IllegalStateException.class, () -> orchestrator.generate(params));
    }

    // ─────────────────── cancel() ───────────────────

    @Test
    void cancel_throwsOnBlankId() {
        setTenantContext(1L);
        assertThrows(IllegalArgumentException.class, () -> orchestrator.cancel("", "取消原因"));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.cancel(null, "取消原因"));
    }

    @Test
    void cancel_throwsWhenNotFound() {
        setTenantContext(1L);
        when(payrollSettlementService.getById("S999")).thenReturn(null);
        assertThrows(NoSuchElementException.class, () -> orchestrator.cancel("S999", "取消原因"));
    }

    @Test
    void cancel_throwsWhenStatusNotPending() {
        setTenantContext(1L);
        PayrollSettlement ps = new PayrollSettlement();
        ps.setId("S001");
        ps.setStatus("approved");
        when(payrollSettlementService.getById("S001")).thenReturn(ps);

        assertThrows(IllegalStateException.class, () -> orchestrator.cancel("S001", "取消原因"));
    }

    @Test
    void cancel_successUpdatesStatusAndReleasesScanRecords() {
        setTenantContext(1L);
        PayrollSettlement ps = new PayrollSettlement();
        ps.setId("S001");
        ps.setOrderId("ORD001");
        ps.setStatus("pending");
        when(payrollSettlementService.getById("S001")).thenReturn(ps);
        when(payrollSettlementService.update(any())).thenReturn(true);
        when(scanRecordMapper.update(any(), any())).thenReturn(1);

        orchestrator.cancel("S001", "取消原因");

        verify(payrollSettlementService, times(1)).update(any());
        verify(scanRecordMapper, times(1)).update(any(ScanRecord.class), any());
    }

    // ─────────────────── delete() ───────────────────

    @Test
    void delete_throwsOnBlankId() {
        setTenantContext(1L);
        assertThrows(IllegalArgumentException.class, () -> orchestrator.delete(""));
        assertThrows(IllegalArgumentException.class, () -> orchestrator.delete(null));
    }

    @Test
    void delete_throwsWhenNotFound() {
        setTenantContext(1L);
        when(payrollSettlementService.getById("S999")).thenReturn(null);
        assertThrows(NoSuchElementException.class, () -> orchestrator.delete("S999"));
    }

    @Test
    void delete_throwsWhenStatusNotCancelled() {
        setTenantContext(1L);
        PayrollSettlement ps = new PayrollSettlement();
        ps.setId("S001");
        ps.setStatus("pending");
        when(payrollSettlementService.getById("S001")).thenReturn(ps);

        assertThrows(IllegalStateException.class, () -> orchestrator.delete("S001"));
    }

    @Test
    void delete_successDeletesItemsAndSettlement() {
        setTenantContext(1L);
        PayrollSettlement ps = new PayrollSettlement();
        ps.setId("S001");
        ps.setOrderId("ORD001");
        ps.setStatus("cancelled");
        when(payrollSettlementService.getById("S001")).thenReturn(ps);
        doNothing().when(payrollSettlementItemService).deleteByOrderId("ORD001");
        when(payrollSettlementService.removeById("S001")).thenReturn(true);

        orchestrator.delete("S001");

        verify(payrollSettlementItemService).deleteByOrderId("ORD001");
        verify(payrollSettlementService).removeById("S001");
    }

    // ─────────────────── 辅助方法 ───────────────────

    private void setTenantContext(Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenantId);
        ctx.setUserId("U001");
        ctx.setUsername("测试员");
        UserContext.set(ctx);
    }
}
