package com.fashion.supplychain.integration.openapi.orchestration;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OpenApiOrchestratorTest {

    @Mock private ProductionOrderService productionOrderService;
    @Mock private ScanRecordService scanRecordService;
    @Mock private ProductOutstockService productOutstockService;
    @Mock private MaterialPurchaseService materialPurchaseService;
    @Mock private ShipmentReconciliationService shipmentReconciliationService;
    @Mock private StyleInfoService styleInfoService;
    @Mock private StyleProcessService styleProcessService;
    @Mock private FactoryService factoryService;
    @Mock private UserService userService;

    @InjectMocks
    private OpenApiOrchestrator orchestrator;

    private TenantApp sampleApp;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUsername("tester");
        UserContext.set(ctx);

        sampleApp = new TenantApp();
        sampleApp.setAppName("TestApp");
        sampleApp.setAppKey("abcdefgh12345678");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ===== pullExternalData 参数校验 =====

    @Test
    void pullExternalData_missingAction_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.pullExternalData(sampleApp, "{}"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("action");
    }

    @Test
    void pullExternalData_nullBody_throwsException() {
        assertThatThrownBy(() -> orchestrator.pullExternalData(sampleApp, "null"))
                .isInstanceOf(Exception.class);
    }

    // ===== createExternalOrder 参数校验 =====

    @Test
    void createExternalOrder_missingStyleNo_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.createExternalOrder(sampleApp, "{\"quantity\":100}"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("styleNo");
    }

    @Test
    void createExternalOrder_missingQuantity_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.createExternalOrder(sampleApp, "{\"styleNo\":\"FZ001\"}"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("quantity");
    }

    @Test
    void createExternalOrder_zeroQuantity_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.createExternalOrder(sampleApp,
                "{\"styleNo\":\"FZ001\",\"quantity\":0}"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("quantity");
    }

    @Test
    void createExternalOrder_validParams_createsOrderSuccessfully() {
        // 款式不存在 → 仍然创建订单
        when(styleInfoService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(productionOrderService.getOne(any(Wrapper.class))).thenReturn(null); // 无已有订单，seq=1

        Map<String, Object> result = orchestrator.createExternalOrder(sampleApp,
                "{\"styleNo\":\"FZ888\",\"quantity\":200}");

        assertThat(result).containsKey("orderNo");
        assertThat(result.get("orderStatus")).isEqualTo("pending");
        assertThat(result.get("quantity")).isEqualTo(200);
    }

    @Test
    void createExternalOrder_orderNoSequential_usesExistingAsBase() {
        // 已有同日订单，序号应从上一个续接
        ProductionOrder existing = new ProductionOrder();
        String today = java.time.format.DateTimeFormatter.ofPattern("yyyyMMdd")
                .format(java.time.LocalDateTime.now());
        existing.setOrderNo("PO" + today + "0003");

        when(styleInfoService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(productionOrderService.getOne(any(Wrapper.class))).thenReturn(existing);

        Map<String, Object> result = orchestrator.createExternalOrder(sampleApp,
                "{\"styleNo\":\"FZ999\",\"quantity\":50}");

        // 序号应为 0004
        assertThat((String) result.get("orderNo")).endsWith("0004");
    }

    // ===== getOrderStatus =====

    @Test
    void getOrderStatus_orderNotFound_throwsIllegalArgument() {
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        assertThatThrownBy(() -> orchestrator.getOrderStatus(sampleApp, "PO_NOT_EXIST"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("订单不存在");
    }
}
