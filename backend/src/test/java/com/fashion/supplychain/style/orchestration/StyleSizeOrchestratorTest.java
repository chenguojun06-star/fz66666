package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleSizeService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StyleSizeOrchestratorTest {

    @InjectMocks
    private StyleSizeOrchestrator orchestrator;

    @Mock
    private StyleSizeService styleSizeService;
    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

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
        StyleSize sz = new StyleSize();
        sz.setStyleId(1L);
        when(styleSizeService.listByStyleId(1L)).thenReturn(List.of(sz));

        List<StyleSize> result = orchestrator.listByStyleId(1L);

        assertThat(result).hasSize(1);
    }

    // ── save() ────────────────────────────────────────────────────────────────

    @Test
    void save_nullParam_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.save(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void save_nullStyleId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.save(new StyleSize()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void save_patternLocked_throwsIllegalState() {
        StyleSize sz = new StyleSize();
        sz.setStyleId(10L);
        when(styleInfoService.isPatternLocked(10L)).thenReturn(true);

        assertThatThrownBy(() -> orchestrator.save(sz))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("纸样已完成");
    }

    @Test
    void save_valid_savesSuccessfully() {
        StyleSize sz = new StyleSize();
        sz.setStyleId(10L);
        when(styleInfoService.isPatternLocked(10L)).thenReturn(false);
        when(styleSizeService.save(sz)).thenReturn(true);

        boolean ok = orchestrator.save(sz);

        assertThat(ok).isTrue();
    }

    // ── update() ──────────────────────────────────────────────────────────────

    @Test
    void update_nullId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.update(new StyleSize()))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void update_notFound_throwsNoSuchElement() {
        StyleSize sz = new StyleSize();
        sz.setId("sz-1");
        when(styleSizeService.getById("sz-1")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.update(sz))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void update_patternLocked_throwsIllegalState() {
        StyleSize existing = new StyleSize();
        existing.setId("sz-1");
        existing.setStyleId(10L);
        StyleSize sz = new StyleSize();
        sz.setId("sz-1");

        when(styleSizeService.getById("sz-1")).thenReturn(existing);
        when(styleInfoService.isPatternLocked(10L)).thenReturn(true);

        assertThatThrownBy(() -> orchestrator.update(sz))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("纸样已完成");
    }

    @Test
    void update_valid_updatesSuccessfully() {
        StyleSize existing = new StyleSize();
        existing.setId("sz-1");
        existing.setStyleId(10L);
        StyleSize sz = new StyleSize();
        sz.setId("sz-1");

        when(styleSizeService.getById("sz-1")).thenReturn(existing);
        when(styleInfoService.isPatternLocked(10L)).thenReturn(false);
        when(styleSizeService.updateNullableFieldsById(sz)).thenReturn(true);

        boolean ok = orchestrator.update(sz);

        assertThat(ok).isTrue();
    }

    // ── delete() ──────────────────────────────────────────────────────────────

    @Test
    void delete_notFound_throwsNoSuchElement() {
        when(styleSizeService.getById("x")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.delete("x"))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void delete_patternLocked_throwsIllegalState() {
        StyleSize existing = new StyleSize();
        existing.setId("sz-1");
        existing.setStyleId(10L);
        when(styleSizeService.getById("sz-1")).thenReturn(existing);
        when(styleInfoService.isPatternLocked(10L)).thenReturn(true);

        assertThatThrownBy(() -> orchestrator.delete("sz-1"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("纸样已完成");
    }

    @Test
    void delete_valid_deletesSuccessfully() {
        StyleSize existing = new StyleSize();
        existing.setId("sz-1");
        existing.setStyleId(10L);
        when(styleSizeService.getById("sz-1")).thenReturn(existing);
        when(styleInfoService.isPatternLocked(10L)).thenReturn(false);
        when(styleSizeService.removeById("sz-1")).thenReturn(true);

        boolean ok = orchestrator.delete("sz-1");

        assertThat(ok).isTrue();
    }
}
