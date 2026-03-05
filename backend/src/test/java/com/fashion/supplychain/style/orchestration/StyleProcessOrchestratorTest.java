package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StyleProcessOrchestratorTest {

    @InjectMocks
    private StyleProcessOrchestrator orchestrator;

    @Mock
    private StyleProcessService styleProcessService;
    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;
    @Mock
    private StyleQuotationOrchestrator styleQuotationOrchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    // ── listByStyleId() ───────────────────────────────────────────────────────

    @Test
    void listByStyleId_nullId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.listByStyleId(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void listByStyleId_valid_returnsList() {
        StyleProcess p = new StyleProcess();
        p.setStyleId(1L);
        p.setProcessName("锁边");
        when(styleProcessService.listByStyleId(1L)).thenReturn(List.of(p));

        List<StyleProcess> result = orchestrator.listByStyleId(1L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getProcessName()).isEqualTo("锁边");
    }

    // ── save() ────────────────────────────────────────────────────────────────

    @Test
    void save_nullParam_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.save(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void save_nullStyleId_throwsIllegalArgument() {
        StyleProcess p = new StyleProcess();
        // styleId is null
        assertThatThrownBy(() -> orchestrator.save(p))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void save_valid_savesAndTriggersQuotationRecalc() {
        StyleProcess p = new StyleProcess();
        p.setStyleId(10L);
        p.setProcessName("剪线");
        p.setPrice(BigDecimal.valueOf(0.5));
        when(styleProcessService.save(p)).thenReturn(true);
        doNothing().when(styleQuotationOrchestrator).recalculateFromLiveData(10L);

        boolean ok = orchestrator.save(p);

        assertThat(ok).isTrue();
        verify(styleQuotationOrchestrator).recalculateFromLiveData(10L);
    }

    @Test
    void save_serviceFails_throwsIllegalState() {
        StyleProcess p = new StyleProcess();
        p.setStyleId(10L);
        when(styleProcessService.save(p)).thenReturn(false);

        assertThatThrownBy(() -> orchestrator.save(p))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("保存失败");
    }

    // ── update() ──────────────────────────────────────────────────────────────

    @Test
    void update_nullId_throwsIllegalArgument() {
        StyleProcess p = new StyleProcess();
        assertThatThrownBy(() -> orchestrator.update(p))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void update_notFound_throwsNoSuchElement() {
        StyleProcess p = new StyleProcess();
        p.setId("proc-1");
        when(styleProcessService.getById("proc-1")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.update(p))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void update_valid_updatesAndTriggersQuotationRecalc() {
        StyleProcess existing = new StyleProcess();
        existing.setId("proc-1");
        existing.setStyleId(10L);

        StyleProcess p = new StyleProcess();
        p.setId("proc-1");
        p.setPrice(BigDecimal.valueOf(1.0));

        when(styleProcessService.getById("proc-1")).thenReturn(existing);
        when(styleProcessService.updateById(p)).thenReturn(true);
        doNothing().when(styleQuotationOrchestrator).recalculateFromLiveData(10L);

        boolean ok = orchestrator.update(p);

        assertThat(ok).isTrue();
        verify(styleQuotationOrchestrator).recalculateFromLiveData(10L);
    }

    // ── delete() ──────────────────────────────────────────────────────────────

    @Test
    void delete_notFound_throwsNoSuchElement() {
        when(styleProcessService.getById("x")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.delete("x"))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void delete_valid_deletesAndTriggersQuotationRecalc() {
        StyleProcess existing = new StyleProcess();
        existing.setId("proc-1");
        existing.setStyleId(10L);
        when(styleProcessService.getById("proc-1")).thenReturn(existing);
        when(styleProcessService.removeById("proc-1")).thenReturn(true);
        doNothing().when(styleQuotationOrchestrator).recalculateFromLiveData(10L);

        boolean ok = orchestrator.delete("proc-1");

        assertThat(ok).isTrue();
        verify(styleQuotationOrchestrator).recalculateFromLiveData(10L);
    }
}
