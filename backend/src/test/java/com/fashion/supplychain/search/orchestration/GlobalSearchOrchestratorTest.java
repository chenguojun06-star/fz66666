package com.fashion.supplychain.search.orchestration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.search.dto.GlobalSearchResult;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

/**
 * GlobalSearchOrchestrator 单元测试
 */
@ExtendWith(MockitoExtension.class)
class GlobalSearchOrchestratorTest {

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private UserService userService;

    @InjectMocks
    private GlobalSearchOrchestrator orchestrator;

    @Test
    void search_emptyQuery_returnsEmptyResult() {
        GlobalSearchResult result = orchestrator.search("", 1L);
        assertThat(result).isNotNull();
        assertThat(result.getOrders()).isEmpty();
        assertThat(result.getStyles()).isEmpty();
        assertThat(result.getWorkers()).isEmpty();
    }

    @Test
    void search_nullQuery_returnsEmptyResult() {
        GlobalSearchResult result = orchestrator.search(null, 1L);
        assertThat(result).isNotNull();
        assertThat(result.getOrders()).isEmpty();
    }

    @Test
    @SuppressWarnings("unchecked")
    void search_validQuery_returnsResult() {
        when(productionOrderService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(styleInfoService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());
        when(userService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        GlobalSearchResult result = orchestrator.search("PO2026", 1L);
        assertThat(result).isNotNull();
    }

    @Test
    @SuppressWarnings("unchecked")
    void search_withOrdersAndStyles_populatesResult() {
        ProductionOrder order = new ProductionOrder();
        order.setId("1");
        order.setOrderNo("PO20260001");
        order.setStatus("IN_PROGRESS");

        StyleInfo style = new StyleInfo();
        style.setId(2L);
        style.setStyleNo("FZ2026001");
        style.setStyleName("春季款");

        when(productionOrderService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of(order));
        when(styleInfoService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of(style));
        when(userService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());

        GlobalSearchResult result = orchestrator.search("PO2026", 1L);
        assertThat(result).isNotNull();
        assertThat(result.getOrders()).hasSize(1);
        assertThat(result.getStyles()).hasSize(1);
    }
}
