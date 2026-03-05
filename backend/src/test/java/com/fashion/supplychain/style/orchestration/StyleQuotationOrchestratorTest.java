package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.SecondaryProcess;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StyleQuotationOrchestratorTest {

    @InjectMocks
    private StyleQuotationOrchestrator orchestrator;

    @Mock
    private StyleQuotationService styleQuotationService;
    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private StyleBomService styleBomService;
    @Mock
    private StyleProcessService styleProcessService;
    @Mock
    private SecondaryProcessService secondaryProcessService;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    // ── getByStyleId() ────────────────────────────────────────────────────────

    @Test
    void getByStyleId_delegatesToService() {
        StyleQuotation q = new StyleQuotation();
        q.setStyleId(10L);
        when(styleQuotationService.getByStyleId(10L)).thenReturn(q);

        StyleQuotation result = orchestrator.getByStyleId(10L);

        assertThat(result.getStyleId()).isEqualTo(10L);
    }

    // ── recalculateFromLiveData() ─────────────────────────────────────────────

    @Test
    void recalculateFromLiveData_nullStyleId_returns() {
        // Should not throw
        orchestrator.recalculateFromLiveData(null);
        verifyNoInteractions(styleQuotationService);
    }

    @Test
    void recalculateFromLiveData_noExistingQuotation_skips() {
        when(styleQuotationService.getByStyleId(10L)).thenReturn(null);

        orchestrator.recalculateFromLiveData(10L);

        verify(styleQuotationService, never()).updateById(any());
    }

    @Test
    void recalculateFromLiveData_withQuotation_recalcsMaterialAndProcess() {
        StyleQuotation existing = new StyleQuotation();
        existing.setStyleId(10L);
        existing.setProfitRate(BigDecimal.valueOf(20)); // 20%
        existing.setOtherCost(BigDecimal.ZERO);
        when(styleQuotationService.getByStyleId(10L)).thenReturn(existing);

        // BOM: totalPrice = 100
        StyleBom bom = new StyleBom();
        bom.setTotalPrice(BigDecimal.valueOf(100));
        when(styleBomService.listByStyleId(10L)).thenReturn(List.of(bom));

        // Process: price = 30
        StyleProcess proc = new StyleProcess();
        proc.setPrice(BigDecimal.valueOf(30));
        when(styleProcessService.listByStyleId(10L)).thenReturn(List.of(proc));

        when(secondaryProcessService.listByStyleId(10L)).thenReturn(List.of());

        // lambdaUpdate chain mock
        var mockUpdate = mock(com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper.class);
        when(styleInfoService.lambdaUpdate()).thenReturn(mockUpdate);
        when(mockUpdate.eq(any(), any())).thenReturn(mockUpdate);
        when(mockUpdate.set(any(), any())).thenReturn(mockUpdate);
        when(mockUpdate.update()).thenReturn(true);

        orchestrator.recalculateFromLiveData(10L);

        // material=100, process=30, other=0 → total=130, price=130*1.2=156
        verify(styleQuotationService).updateById(argThat(q ->
                q.getMaterialCost().compareTo(BigDecimal.valueOf(100)) == 0
                && q.getProcessCost().compareTo(BigDecimal.valueOf(30)) == 0
                && q.getTotalCost().compareTo(BigDecimal.valueOf(130)) == 0
                && q.getTotalPrice().compareTo(BigDecimal.valueOf(156)) == 0
        ));
    }

    // ── saveOrUpdate() ────────────────────────────────────────────────────────

    @Test
    void saveOrUpdate_nullParam_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.saveOrUpdate(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void saveOrUpdate_nullStyleId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.saveOrUpdate(new StyleQuotation()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("styleId");
    }

    @Test
    void saveOrUpdate_newQuotation_calculatesAndSaves() {
        StyleQuotation q = new StyleQuotation();
        q.setStyleId(10L);
        q.setMaterialCost(BigDecimal.valueOf(100));
        q.setProcessCost(BigDecimal.valueOf(50));
        q.setOtherCost(BigDecimal.valueOf(10));
        q.setProfitRate(BigDecimal.valueOf(10)); // 10%

        when(styleQuotationService.getByStyleId(10L)).thenReturn(null); // no existing
        when(styleQuotationService.saveOrUpdate(q)).thenReturn(true);

        var mockUpdate = mock(com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper.class);
        when(styleInfoService.lambdaUpdate()).thenReturn(mockUpdate);
        when(mockUpdate.eq(any(), any())).thenReturn(mockUpdate);
        when(mockUpdate.set(any(), any())).thenReturn(mockUpdate);
        when(mockUpdate.update()).thenReturn(true);

        boolean ok = orchestrator.saveOrUpdate(q);

        assertThat(ok).isTrue();
        // totalCost = 100+50+10=160; totalPrice = 160*1.1 = 176
        assertThat(q.getTotalCost()).isEqualByComparingTo(BigDecimal.valueOf(160));
        assertThat(q.getTotalPrice()).isEqualByComparingTo(BigDecimal.valueOf(176));
    }

    @Test
    void saveOrUpdate_existingQuotation_mergesId() {
        StyleQuotation existing = new StyleQuotation();
        existing.setId("q-old");
        existing.setStyleId(10L);

        StyleQuotation q = new StyleQuotation();
        q.setStyleId(10L);
        q.setMaterialCost(BigDecimal.valueOf(50));
        q.setProcessCost(BigDecimal.ZERO);
        q.setOtherCost(BigDecimal.ZERO);
        q.setProfitRate(BigDecimal.ZERO);

        when(styleQuotationService.getByStyleId(10L)).thenReturn(existing);
        when(styleQuotationService.saveOrUpdate(q)).thenReturn(true);

        var mockUpdate = mock(com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper.class);
        when(styleInfoService.lambdaUpdate()).thenReturn(mockUpdate);
        when(mockUpdate.eq(any(), any())).thenReturn(mockUpdate);
        when(mockUpdate.set(any(), any())).thenReturn(mockUpdate);
        when(mockUpdate.update()).thenReturn(true);

        orchestrator.saveOrUpdate(q);

        assertThat(q.getId()).isEqualTo("q-old");
    }
}
