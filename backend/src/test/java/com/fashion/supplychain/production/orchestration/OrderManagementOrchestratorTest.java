package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.orchestration.StyleAttachmentOrchestrator;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderManagementOrchestratorTest {

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private StyleProcessService styleProcessService;

    @Mock
    private StyleAttachmentOrchestrator styleAttachmentOrchestrator;

    @Mock
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    @InjectMocks
    private OrderManagementOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUsername("testuser");
        ctx.setRole("user");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void createFromStyle_nullStyleId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.createFromStyle(null, List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("styleId");
    }

    @Test
    void createFromStyle_styleNotFound_throwsIllegalArgument() {
        when(styleInfoService.getById(99L)).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.createFromStyle(99L, List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("款号不存在");
    }

    @Test
    void createFromStyle_alreadyPushed_throwsIllegalState() {
        StyleInfo style = new StyleInfo();
        style.setId(1L);
        style.setStyleNo("FZ001");
        style.setOrderType("alreadyUser");  // 非空表示已推送
        when(styleInfoService.getById(1L)).thenReturn(style);

        assertThatThrownBy(() -> orchestrator.createFromStyle(1L, List.of()))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("已推送");
    }

    @Test
    void createFromStyle_noProcesses_stillSucceeds() {
        StyleInfo style = new StyleInfo();
        style.setId(1L);
        style.setStyleNo("FZ001");
        style.setOrderType(null);
        when(styleInfoService.getById(1L)).thenReturn(style);
        when(styleProcessService.listByStyleId(1L)).thenReturn(List.of());

        Map<String, Object> result = orchestrator.createFromStyle(1L, List.of());

        assertThat(result).containsKey("styleId");
        assertThat(result.get("status")).isEqualTo("ready_for_order");
    }

    @Test
    void createFromStyle_withProcesses_returnsSuccessMap() {
        StyleInfo style = new StyleInfo();
        style.setId(2L);
        style.setStyleNo("FZ002");
        style.setOrderType(null);
        style.setProgressNode("打版");
        StyleProcess process = new StyleProcess();
        process.setId("P1");
        when(styleInfoService.getById(2L)).thenReturn(style);
        when(styleProcessService.listByStyleId(2L)).thenReturn(List.of(process));

        Map<String, Object> result = orchestrator.createFromStyle(2L, List.of());

        assertThat(result).containsKey("styleNo");
        assertThat(result.get("styleNo")).isEqualTo("FZ002");
        verify(styleInfoService, atLeastOnce()).updateById(any());
    }

    @Test
    void createFromStyle_alreadySampleComplete_doesNotResetNode() {
        StyleInfo style = new StyleInfo();
        style.setId(3L);
        style.setStyleNo("FZ003");
        style.setOrderType(null);
        style.setProgressNode("样衣完成");
        when(styleInfoService.getById(3L)).thenReturn(style);
        when(styleProcessService.listByStyleId(3L)).thenReturn(List.of());

        Map<String, Object> result = orchestrator.createFromStyle(3L, List.of());

        assertThat(result.get("status")).isEqualTo("ready_for_order");
        // progressNode = "样衣完成" 时不会多一次 updateById 更新节点
        verify(styleInfoService, atMost(1)).updateById(any());
    }
}
