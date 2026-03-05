package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.orchestration.MaterialDatabaseOrchestrator;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
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
class StyleBomOrchestratorTest {

    @InjectMocks
    private StyleBomOrchestrator orchestrator;

    @Mock
    private StyleBomService styleBomService;
    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;
    @Mock
    private MaterialDatabaseService materialDatabaseService;
    @Mock
    private MaterialDatabaseOrchestrator materialDatabaseOrchestrator;
    @Mock
    private MaterialPurchaseService materialPurchaseService;
    @Mock
    private MaterialStockService materialStockService;
    @Mock
    private StyleQuotationOrchestrator styleQuotationOrchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUsername("tester");
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
        StyleBom bom = new StyleBom();
        bom.setStyleId(1L);
        bom.setMaterialName("棉布");
        when(styleBomService.listByStyleId(1L)).thenReturn(List.of(bom));

        List<StyleBom> result = orchestrator.listByStyleId(1L);

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getMaterialName()).isEqualTo("棉布");
    }

    // ── save() ────────────────────────────────────────────────────────────────

    @Test
    void save_nullParam_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.save(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void save_nullStyleId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.save(new StyleBom()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("styleId");
    }

    @Test
    void save_valid_savesAndTriggersQuotationRecalc() {
        StyleBom bom = new StyleBom();
        bom.setStyleId(10L);
        bom.setMaterialName("涤纶");
        bom.setUsageAmount(BigDecimal.valueOf(2.5));
        bom.setUnitPrice(BigDecimal.valueOf(10));
        when(styleBomService.save(bom)).thenReturn(true);
        doNothing().when(styleQuotationOrchestrator).recalculateFromLiveData(10L);

        // styleInfoService.getById for merchandiser sync - return null = skip
        when(styleInfoService.getById(10L)).thenReturn(null);

        boolean ok = orchestrator.save(bom);

        assertThat(ok).isTrue();
        verify(styleQuotationOrchestrator).recalculateFromLiveData(10L);
    }

    @Test
    void save_serviceFails_throwsIllegalState() {
        StyleBom bom = new StyleBom();
        bom.setStyleId(10L);
        when(styleBomService.save(bom)).thenReturn(false);

        assertThatThrownBy(() -> orchestrator.save(bom))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("保存失败");
    }

    // ── update() ──────────────────────────────────────────────────────────────

    @Test
    void update_nullId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.update(new StyleBom()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("id");
    }

    @Test
    void update_notFound_throwsNoSuchElement() {
        StyleBom bom = new StyleBom();
        bom.setId("bom-1");
        when(styleBomService.getById("bom-1")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.update(bom))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void update_valid_updatesSuccessfully() {
        StyleBom existing = new StyleBom();
        existing.setId("bom-1");
        existing.setStyleId(5L);

        StyleBom bom = new StyleBom();
        bom.setId("bom-1");
        bom.setUnitPrice(BigDecimal.valueOf(15));

        when(styleBomService.getById("bom-1")).thenReturn(existing);
        when(styleBomService.updateById(bom)).thenReturn(true);
        doNothing().when(styleQuotationOrchestrator).recalculateFromLiveData(5L);

        boolean ok = orchestrator.update(bom);

        assertThat(ok).isTrue();
        verify(styleQuotationOrchestrator).recalculateFromLiveData(5L);
    }
}
