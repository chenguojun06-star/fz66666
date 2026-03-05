package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FactoryCapacityOrchestratorTest {

    @InjectMocks
    private FactoryCapacityOrchestrator orchestrator;

    @Mock private ProductionOrderService productionOrderService;
    @Mock private ScanRecordService scanRecordService;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void getFactoryCapacity_noOrders_returnsEmptyList() {
        when(productionOrderService.list(any(QueryWrapper.class))).thenReturn(List.of());

        List<FactoryCapacityOrchestrator.FactoryCapacityItem> result = orchestrator.getFactoryCapacity();

        assertThat(result).isNotNull().isEmpty();
    }

    @Test
    void getFactoryCapacity_singleFactory_returnsOneItem() {
        ProductionOrder o1 = new ProductionOrder();
        o1.setFactoryName("工厂A");
        o1.setOrderQuantity(100);
        o1.setProductionProgress(50);
        ProductionOrder o2 = new ProductionOrder();
        o2.setFactoryName("工厂A");
        o2.setOrderQuantity(200);
        o2.setProductionProgress(30);
        // completed orders query returns empty
        when(productionOrderService.list(any(QueryWrapper.class)))
                .thenReturn(List.of(o1, o2))
                .thenReturn(List.of());

        List<FactoryCapacityOrchestrator.FactoryCapacityItem> result = orchestrator.getFactoryCapacity();

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getFactoryName()).isEqualTo("工厂A");
        assertThat(result.get(0).getTotalOrders()).isEqualTo(2);
        assertThat(result.get(0).getTotalQuantity()).isEqualTo(300);
    }

    @Test
    void getFactoryCapacity_twoFactories_returnsTwoItems() {
        ProductionOrder o1 = new ProductionOrder();
        o1.setFactoryName("工厂A");
        o1.setOrderQuantity(50);
        ProductionOrder o2 = new ProductionOrder();
        o2.setFactoryName("工厂B");
        o2.setOrderQuantity(80);
        when(productionOrderService.list(any(QueryWrapper.class)))
                .thenReturn(List.of(o1, o2))
                .thenReturn(List.of());

        List<FactoryCapacityOrchestrator.FactoryCapacityItem> result = orchestrator.getFactoryCapacity();

        assertThat(result).hasSize(2);
    }

    @Test
    void getFactoryCapacity_overdueOrder_countedInOverdue() {
        ProductionOrder o = new ProductionOrder();
        o.setFactoryName("工厂A");
        o.setOrderQuantity(100);
        o.setPlannedEndDate(LocalDateTime.now().minusDays(3));  // 已逾期
        when(productionOrderService.list(any(QueryWrapper.class)))
                .thenReturn(List.of(o))
                .thenReturn(List.of());

        List<FactoryCapacityOrchestrator.FactoryCapacityItem> result = orchestrator.getFactoryCapacity();

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getOverdueCount()).isEqualTo(1);
    }

    @Test
    void getFactoryCapacity_nullOrderQuantity_treatedAsZero() {
        ProductionOrder o = new ProductionOrder();
        o.setFactoryName("工厂C");
        o.setOrderQuantity(null);
        when(productionOrderService.list(any(QueryWrapper.class)))
                .thenReturn(List.of(o))
                .thenReturn(List.of());

        List<FactoryCapacityOrchestrator.FactoryCapacityItem> result = orchestrator.getFactoryCapacity();

        assertThat(result).hasSize(1);
        assertThat(result.get(0).getTotalQuantity()).isZero();
    }
}
