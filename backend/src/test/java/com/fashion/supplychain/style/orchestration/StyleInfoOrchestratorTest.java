package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.helper.StyleStageHelper;
import com.fashion.supplychain.style.service.SecondaryProcessService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StyleInfoOrchestratorTest {

    @InjectMocks
    private StyleInfoOrchestrator orchestrator;

    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private StyleStageHelper styleStageHelper;
    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private PatternProductionService patternProductionService;
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
        ctx.setUsername("tester");
        UserContext.set(ctx);
    }

    // ── detail() ──────────────────────────────────────────────────────────────

    @Test
    void detail_found_returnsStyleInfo() {
        StyleInfo style = new StyleInfo();
        style.setId(10L);
        style.setStyleNo("FZ001");
        when(styleInfoService.getDetailById(10L)).thenReturn(style);

        StyleInfo result = orchestrator.detail(10L);

        assertThat(result.getStyleNo()).isEqualTo("FZ001");
    }

    @Test
    void detail_notFound_throwsNoSuchElement() {
        when(styleInfoService.getDetailById(99L)).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.detail(99L))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("款号不存在");
    }

    // ── save() 参数校验 ────────────────────────────────────────────────────────

    @Test
    void save_nullParam_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.save(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void save_missingStyleNo_throwsIllegalArgument() {
        StyleInfo style = new StyleInfo();
        style.setStyleName("测试款");

        assertThatThrownBy(() -> orchestrator.save(style))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("款号");
    }

    @Test
    void save_missingStyleName_throwsIllegalArgument() {
        StyleInfo style = new StyleInfo();
        style.setStyleNo("FZ001");

        assertThatThrownBy(() -> orchestrator.save(style))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("款名");
    }

    @Test
    void save_valid_callsServiceAndReturnsTrue() {
        StyleInfo style = new StyleInfo();
        style.setStyleNo("FZ001");
        style.setStyleName("春季款");
        when(styleInfoService.saveOrUpdateStyle(style)).thenReturn(true);
        // 新增时查询自动创建样板生产记录的 lambdaQuery 返回 null 避免 NPE
        var mockQuery = mock(com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper.class);
        when(styleInfoService.lambdaQuery()).thenReturn(mockQuery);
        when(mockQuery.eq(any(), any())).thenReturn(mockQuery);
        when(mockQuery.orderByDesc(any())).thenReturn(mockQuery);
        when(mockQuery.last(any())).thenReturn(mockQuery);
        when(mockQuery.one()).thenReturn(null); // 没查到，跳过自动创建

        boolean ok = orchestrator.save(style);

        assertThat(ok).isTrue();
    }

    // ── delete() ──────────────────────────────────────────────────────────────

    @Test
    void delete_hasActiveOrders_throwsIllegalState() {
        when(productionOrderService.count(any(LambdaQueryWrapper.class))).thenReturn(2L);

        assertThatThrownBy(() -> orchestrator.delete(5L))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("生产订单");
    }

    @Test
    void delete_noOrders_deletesSuccessfully() {
        when(productionOrderService.count(any(LambdaQueryWrapper.class))).thenReturn(0L);
        // 级联删除样板生产记录
        var mockUpdate = mock(com.baomidou.mybatisplus.extension.conditions.update.LambdaUpdateChainWrapper.class);
        when(patternProductionService.lambdaUpdate()).thenReturn(mockUpdate);
        when(mockUpdate.eq(any(), any())).thenReturn(mockUpdate);
        when(mockUpdate.remove()).thenReturn(false); // 没有样板记录
        when(styleInfoService.deleteById(5L)).thenReturn(true);

        boolean result = orchestrator.delete(5L);

        assertThat(result).isTrue();
        verify(styleInfoService).deleteById(5L);
    }

    // ── isProductionReqLocked() ───────────────────────────────────────────────

    @Test
    void isProductionReqLocked_nullId_returnsFalse() {
        assertThat(orchestrator.isProductionReqLocked(null)).isFalse();
    }

    @Test
    void isProductionReqLocked_styleNotFound_returnsFalse() {
        when(styleInfoService.getById(99L)).thenReturn(null);

        assertThat(orchestrator.isProductionReqLocked(99L)).isFalse();
    }

    @Test
    void isProductionReqLocked_hasOrders_returnsTrue() {
        StyleInfo style = new StyleInfo();
        style.setId(10L);
        style.setStyleNo("FZ001");
        when(styleInfoService.getById(10L)).thenReturn(style);
        when(productionOrderService.count(any(QueryWrapper.class))).thenReturn(3L);

        assertThat(orchestrator.isProductionReqLocked(10L)).isTrue();
    }

    @Test
    void isProductionReqLocked_noOrders_returnsFalse() {
        StyleInfo style = new StyleInfo();
        style.setId(10L);
        style.setStyleNo("FZ002");
        when(styleInfoService.getById(10L)).thenReturn(style);
        when(productionOrderService.count(any(QueryWrapper.class))).thenReturn(0L);

        assertThat(orchestrator.isProductionReqLocked(10L)).isFalse();
    }

    // ── saveSampleReview() ────────────────────────────────────────────────────

    @Test
    void saveSampleReview_notFound_throwsRuntimeException() {
        when(styleInfoService.getById(99L)).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.saveSampleReview(99L, "PASS", "good"))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("款式不存在");
    }

    @Test
    void saveSampleReview_found_updatesFields() {
        StyleInfo style = new StyleInfo();
        style.setId(10L);
        StyleInfo updated = new StyleInfo();
        updated.setId(10L);
        updated.setSampleReviewStatus("PASS");
        when(styleInfoService.getById(10L)).thenReturn(style);
        when(styleInfoService.updateById(any())).thenReturn(true);
        when(styleInfoService.getById(10L)).thenReturn(updated);

        StyleInfo result = orchestrator.saveSampleReview(10L, "PASS", "很好");

        assertThat(result.getSampleReviewStatus()).isEqualTo("PASS");
    }
}
