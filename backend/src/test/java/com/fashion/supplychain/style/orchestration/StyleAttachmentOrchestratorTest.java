package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
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
class StyleAttachmentOrchestratorTest {

    @InjectMocks
    private StyleAttachmentOrchestrator orchestrator;

    @Mock
    private StyleAttachmentService styleAttachmentService;
    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private CosService cosService;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    // ── list() 参数校验 ───────────────────────────────────────────────────────

    @Test
    void list_bothNull_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.list(null, null, "pattern"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("缺少参数");
    }

    @Test
    void list_styleNoProvided_styleNotFound_throwsNoSuchElement() {
        var mockQuery = mock(com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper.class);
        when(styleInfoService.lambdaQuery()).thenReturn(mockQuery);
        when(mockQuery.eq(any(), any())).thenReturn(mockQuery);
        when(mockQuery.one()).thenReturn(null); // 款号不存在

        assertThatThrownBy(() -> orchestrator.list(null, "FZ001", "pattern"))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("款号不存在");
    }

    @Test
    void list_styleNoProvided_styleFound_usesStyleId() {
        StyleInfo style = new StyleInfo();
        style.setId(10L);
        var mockQuery = mock(com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper.class);
        when(styleInfoService.lambdaQuery()).thenReturn(mockQuery);
        when(mockQuery.eq(any(), any())).thenReturn(mockQuery);
        when(mockQuery.one()).thenReturn(style);

        StyleAttachment att = new StyleAttachment();
        when(styleAttachmentService.listByStyleId("10", "pattern")).thenReturn(List.of(att));
        when(styleAttachmentService.listByStyleId("10", "pattern_final")).thenReturn(List.of());

        List<StyleAttachment> result = orchestrator.list(null, "FZ001", "pattern");

        assertThat(result).hasSize(1);
    }

    @Test
    void list_withStyleId_patternType_mergesBaseAndFinal() {
        StyleAttachment base = new StyleAttachment();
        StyleAttachment finalAtt = new StyleAttachment();
        when(styleAttachmentService.listByStyleId("10", "pattern")).thenReturn(List.of(base));
        when(styleAttachmentService.listByStyleId("10", "pattern_final")).thenReturn(List.of(finalAtt));

        List<StyleAttachment> result = orchestrator.list("10", null, "pattern");

        assertThat(result).hasSize(2);
    }

    @Test
    void list_withStyleId_patternGradingType_mergesBaseAndFinal() {
        StyleAttachment base = new StyleAttachment();
        StyleAttachment finalAtt = new StyleAttachment();
        when(styleAttachmentService.listByStyleId("10", "pattern_grading")).thenReturn(List.of(base));
        when(styleAttachmentService.listByStyleId("10", "pattern_grading_final")).thenReturn(List.of(finalAtt));

        List<StyleAttachment> result = orchestrator.list("10", null, "pattern_grading");

        assertThat(result).hasSize(2);
    }

    @Test
    void list_withStyleId_otherType_returnsDirectList() {
        StyleAttachment att = new StyleAttachment();
        when(styleAttachmentService.listByStyleId("10", "image")).thenReturn(List.of(att, att));

        List<StyleAttachment> result = orchestrator.list("10", null, "image");

        assertThat(result).hasSize(2);
    }

    // ── delete() ──────────────────────────────────────────────────────────────

    @Test
    void delete_notFound_throwsNoSuchElement() {
        when(styleAttachmentService.getById("x")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.delete("x"))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("附件不存在");
    }

    @Test
    void delete_valid_deletesSuccessfully() {
        StyleAttachment att = new StyleAttachment();
        att.setId("att-1");
        when(styleAttachmentService.getById("att-1")).thenReturn(att);
        when(styleAttachmentService.removeById("att-1")).thenReturn(true);

        boolean ok = orchestrator.delete("att-1");

        assertThat(ok).isTrue();
    }
}
