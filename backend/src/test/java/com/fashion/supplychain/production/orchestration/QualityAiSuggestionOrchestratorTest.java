package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.dto.QualityAiSuggestionResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class QualityAiSuggestionOrchestratorTest {

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private ProductWarehousingService productWarehousingService;

    @InjectMocks
    private QualityAiSuggestionOrchestrator orchestrator;

    private ProductionOrder order;

    @BeforeEach
    void setUp() {
        order = new ProductionOrder();
        order.setId("ORDER001");
        order.setOrderNo("PO2026001");
    }

    @Test
    void getSuggestion_nullOrderId_returnsEmpty() {
        QualityAiSuggestionResponse resp = orchestrator.getSuggestion(null);

        assertThat(resp).isNotNull();
        verifyNoInteractions(productionOrderService);
    }

    @Test
    void getSuggestion_blankOrderId_returnsEmpty() {
        QualityAiSuggestionResponse resp = orchestrator.getSuggestion("   ");

        assertThat(resp).isNotNull();
        verifyNoInteractions(productionOrderService);
    }

    @Test
    void getSuggestion_orderNotFound_returnsEmpty() {
        when(productionOrderService.getById("UNKNOWN")).thenReturn(null);

        QualityAiSuggestionResponse resp = orchestrator.getSuggestion("UNKNOWN");

        assertThat(resp).isNotNull();
        verify(productionOrderService).getById("UNKNOWN");
    }

    @Test
    void getSuggestion_validOrder_noCategory_returnsCommonCheckpoints() {
        order.setProductCategory(null);
        when(productionOrderService.getById("ORDER001")).thenReturn(order);
        when(productWarehousingService.list(any(QueryWrapper.class))).thenReturn(List.of());

        QualityAiSuggestionResponse resp = orchestrator.getSuggestion("ORDER001");

        assertThat(resp).isNotNull();
        assertThat(resp.getCheckpoints()).isNotNull().isNotEmpty();
    }

    @Test
    void getSuggestion_shirtCategory_includesCategoryCheckpoints() {
        order.setProductCategory("shirt");
        when(productionOrderService.getById("ORDER001")).thenReturn(order);
        when(productWarehousingService.list(any(QueryWrapper.class))).thenReturn(List.of());

        QualityAiSuggestionResponse resp = orchestrator.getSuggestion("ORDER001");

        assertThat(resp).isNotNull();
        assertThat(resp.getCheckpoints()).isNotNull();
        // shirt类别应比无类别检查点更多
        assertThat(resp.getCheckpoints().size()).isGreaterThanOrEqualTo(5);
    }

    @Test
    void getSuggestion_urgentOrder_tipNotEmpty() {
        order.setUrgencyLevel("urgent");
        order.setProductCategory(null);
        when(productionOrderService.getById("ORDER001")).thenReturn(order);
        when(productWarehousingService.list(any(QueryWrapper.class))).thenReturn(List.of());

        QualityAiSuggestionResponse resp = orchestrator.getSuggestion("ORDER001");

        assertThat(resp).isNotNull();
        assertThat(resp.getUrgentTip()).isNotBlank();
    }

    @Test
    void getSuggestion_normalOrder_defectSuggestionsNotNull() {
        order.setProductCategory("pants");
        when(productionOrderService.getById("ORDER001")).thenReturn(order);
        when(productWarehousingService.list(any(QueryWrapper.class))).thenReturn(List.of());

        QualityAiSuggestionResponse resp = orchestrator.getSuggestion("ORDER001");

        assertThat(resp).isNotNull();
        assertThat(resp.getDefectSuggestions()).isNotNull();
    }

    @Test
    void getSuggestion_warehousingServiceThrows_stillReturnsResponse() {
        order.setProductCategory(null);
        when(productionOrderService.getById("ORDER001")).thenReturn(order);
        when(productWarehousingService.list(any(QueryWrapper.class))).thenThrow(new RuntimeException("DB error"));

        // try-catch 包裹，不应抛出
        QualityAiSuggestionResponse resp = orchestrator.getSuggestion("ORDER001");

        assertThat(resp).isNotNull();
    }
}
