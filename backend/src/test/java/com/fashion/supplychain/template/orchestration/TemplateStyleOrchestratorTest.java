package com.fashion.supplychain.template.orchestration;

import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.StyleSizePriceService;
import com.fashion.supplychain.style.service.StyleSizeService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.List;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TemplateStyleOrchestratorTest {

    @InjectMocks
    private TemplateStyleOrchestrator orchestrator;

    @Mock
    private TemplateLibraryService templateLibraryService;
    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private StyleBomService styleBomService;
    @Mock
    private StyleProcessService styleProcessService;
    @Mock
    private StyleSizeService styleSizeService;
    @Mock
    private StyleSizePriceService styleSizePriceService;

    // ────────────────────────────────────────────────────────────
    // applyTemplateToStyle
    // ────────────────────────────────────────────────────────────

    @Test
    void applyTemplateToStyle_nullTemplateId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.applyTemplateToStyle(null, 1L, "bom"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void applyTemplateToStyle_blankTemplateId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.applyTemplateToStyle("  ", 1L, "bom"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void applyTemplateToStyle_nullTargetStyleId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.applyTemplateToStyle("tpl-1", null, "bom"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void applyTemplateToStyle_styleNotFound_throwsNoSuchElement() {
        when(styleInfoService.getById(anyLong())).thenReturn(null);
        assertThatThrownBy(() -> orchestrator.applyTemplateToStyle("tpl-1", 99L, "bom"))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void applyTemplateToStyle_templateNotFound_throwsNoSuchElement() {
        StyleInfo style = new StyleInfo();
        style.setId(1L);
        when(styleInfoService.getById(anyLong())).thenReturn(style);
        when(templateLibraryService.getById(anyString())).thenReturn(null);
        assertThatThrownBy(() -> orchestrator.applyTemplateToStyle("tpl-99", 1L, "bom"))
                .isInstanceOf(NoSuchElementException.class);
    }

    // ────────────────────────────────────────────────────────────
    // createTemplateFromStyle
    // ────────────────────────────────────────────────────────────

    @Test
    void createTemplateFromStyle_blankStyleNo_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.createTemplateFromStyle("", null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void createTemplateFromStyle_styleNotFound_throwsNoSuchElement() {
        when(styleInfoService.lambdaQuery()).thenThrow(new NoSuchElementException("款号不存在"));
        assertThatThrownBy(() -> orchestrator.createTemplateFromStyle("FZ2024001", null))
                .isInstanceOf(NoSuchElementException.class);
    }

    // ────────────────────────────────────────────────────────────
    // batchApplyBomTemplate
    // ────────────────────────────────────────────────────────────

    @Test
    void batchApplyBomTemplate_nullTemplateId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.batchApplyBomTemplate(null, List.of(1L), false))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void batchApplyBomTemplate_emptyTargetList_returnsZero() {
        int result = orchestrator.batchApplyBomTemplate("tpl-1", Collections.emptyList(), false);
        assertThat(result).isZero();
    }

    @Test
    void batchApplyBomTemplate_nullTargetList_returnsZero() {
        int result = orchestrator.batchApplyBomTemplate("tpl-1", null, false);
        assertThat(result).isZero();
    }

    // ────────────────────────────────────────────────────────────
    // batchApplyProcessTemplate
    // ────────────────────────────────────────────────────────────

    @Test
    void batchApplyProcessTemplate_nullTemplateId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.batchApplyProcessTemplate(null, List.of(1L), false))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void batchApplyProcessTemplate_emptyTargetList_returnsZero() {
        int result = orchestrator.batchApplyProcessTemplate("tpl-1", Collections.emptyList(), false);
        assertThat(result).isZero();
    }
}
