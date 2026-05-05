package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.FactoryShipment;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.FactoryShipmentDetailService;
import com.fashion.supplychain.production.service.FactoryShipmentService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.ProductSkuService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("FactoryShipmentOrchestrator - 工厂出货编排")
class FactoryShipmentOrchestratorTest {

    @Mock
    private FactoryShipmentService factoryShipmentService;
    @Mock
    private CuttingBundleService cuttingBundleService;
    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private FactoryShipmentDetailService factoryShipmentDetailService;
    @Mock
    private ProductSkuService productSkuService;

    @InjectMocks
    private FactoryShipmentOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setUserId("user-001");
        ctx.setUsername("管理员");
        ctx.setRole("admin");
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private ProductionOrder buildOrder(String orderId, String factoryId) {
        ProductionOrder order = new ProductionOrder();
        order.setId(orderId);
        order.setOrderNo("ON-" + orderId);
        order.setStyleNo("S-001");
        order.setStyleName("测试款式");
        order.setFactoryId(factoryId);
        order.setFactoryName("测试工厂");
        order.setTenantId(1L);
        return order;
    }

    private Map<String, Object> buildShipParams(String orderId, List<Map<String, Object>> details) {
        Map<String, Object> params = new HashMap<>();
        params.put("orderId", orderId);
        params.put("details", details);
        return params;
    }

    private List<Map<String, Object>> buildDetails(int qty) {
        Map<String, Object> detail = new HashMap<>();
        detail.put("color", "黑色");
        detail.put("size", "L");
        detail.put("quantity", qty);
        return Collections.singletonList(detail);
    }

    @Nested
    @DisplayName("ship - 发货")
    class Ship {

        @Test
        @DisplayName("缺少orderId-返回失败")
        void missingOrderId_returnsFail() {
            Map<String, Object> params = new HashMap<>();
            params.put("details", buildDetails(10));
            Result<FactoryShipment> result = orchestrator.ship(params);
            assertEquals(500, result.getCode());
            assertTrue(result.getMessage().contains("orderId"));
        }

        @Test
        @DisplayName("订单不存在-返回失败")
        void orderNotFound_returnsFail() {
            when(productionOrderService.getById("order-001")).thenReturn(null);
            Result<FactoryShipment> result = orchestrator.ship(buildShipParams("order-001", buildDetails(10)));
            assertEquals(500, result.getCode());
            assertTrue(result.getMessage().contains("订单不存在"));
        }

        @Test
        @DisplayName("工厂用户操作其他工厂订单-拒绝")
        void factoryUser_otherFactory_rejected() {
            UserContext.clear();
            UserContext ctx = new UserContext();
            ctx.setUserId("factory-user-001");
            ctx.setRole("worker");
            ctx.setTenantId(1L);
            ctx.setFactoryId("factory-A");
            UserContext.set(ctx);

            ProductionOrder order = buildOrder("order-001", "factory-B");
            when(productionOrderService.getById("order-001")).thenReturn(order);

            Result<FactoryShipment> result = orchestrator.ship(buildShipParams("order-001", buildDetails(10)));
            assertEquals(500, result.getCode());
            assertTrue(result.getMessage().contains("其他工厂"));
        }

        @Test
        @DisplayName("发货明细为空-返回失败")
        void emptyDetails_returnsFail() {
            ProductionOrder order = buildOrder("order-001", "factory-A");
            when(productionOrderService.getById("order-001")).thenReturn(order);

            Result<FactoryShipment> result = orchestrator.ship(buildShipParams("order-001", Collections.emptyList()));
            assertEquals(500, result.getCode());
            assertTrue(result.getMessage().contains("发货明细"));
        }

        @Test
        @DisplayName("发货数量为0-返回失败")
        void zeroQuantity_returnsFail() {
            ProductionOrder order = buildOrder("order-001", "factory-A");
            when(productionOrderService.getById("order-001")).thenReturn(order);

            Map<String, Object> detail = new HashMap<>();
            detail.put("quantity", 0);
            detail.put("color", "黑色");
            detail.put("sizeName", "L");
            Result<FactoryShipment> result = orchestrator.ship(
                    buildShipParams("order-001", Collections.singletonList(detail)));
            assertEquals(500, result.getCode());
            assertTrue(result.getMessage().contains("大于 0"));
        }

        @Test
        @DisplayName("发货数量超限-返回失败")
        void exceedsCuttingTotal_returnsFail() {
            ProductionOrder order = buildOrder("order-001", "factory-A");
            when(productionOrderService.getById("order-001")).thenReturn(order);

            Map<String, Object> summary = new HashMap<>();
            summary.put("totalQuantity", 50);
            when(cuttingBundleService.summarize(anyString(), anyString())).thenReturn(summary);
            when(factoryShipmentService.sumShippedByOrderId("order-001")).thenReturn(40);

            Result<FactoryShipment> result = orchestrator.ship(buildShipParams("order-001", buildDetails(20)));
            assertEquals(500, result.getCode());
            assertTrue(result.getMessage().contains("超限"));
        }

        @Test
        @DisplayName("正常发货-成功")
        void normalShip_success() {
            ProductionOrder order = buildOrder("order-001", "factory-A");
            when(productionOrderService.getById("order-001")).thenReturn(order);

            Map<String, Object> summary = new HashMap<>();
            summary.put("totalQuantity", 100);
            when(cuttingBundleService.summarize(anyString(), anyString())).thenReturn(summary);
            when(factoryShipmentService.sumShippedByOrderId("order-001")).thenReturn(0);
            when(factoryShipmentService.buildShipmentNo()).thenReturn("FS20260427001");
            when(factoryShipmentService.save(any(FactoryShipment.class))).thenReturn(true);
            doNothing().when(factoryShipmentDetailService).saveDetails(anyString(), any(), anyLong());

            Map<String, Object> detail = new HashMap<>();
            detail.put("color", "黑色");
            detail.put("sizeName", "L");
            detail.put("quantity", 50);
            Result<FactoryShipment> result = orchestrator.ship(buildShipParams("order-001", Collections.singletonList(detail)));
            assertEquals(200, result.getCode());
            verify(factoryShipmentService).save(any(FactoryShipment.class));
        }

        @Test
        @DisplayName("工厂用户操作本工厂订单-成功")
        void factoryUser_ownFactory_success() {
            UserContext.clear();
            UserContext ctx = new UserContext();
            ctx.setUserId("factory-user-001");
            ctx.setRole("worker");
            ctx.setTenantId(1L);
            ctx.setFactoryId("factory-A");
            UserContext.set(ctx);

            ProductionOrder order = buildOrder("order-001", "factory-A");
            when(productionOrderService.getById("order-001")).thenReturn(order);

            Map<String, Object> summary = new HashMap<>();
            summary.put("totalQuantity", 100);
            when(cuttingBundleService.summarize(anyString(), anyString())).thenReturn(summary);
            when(factoryShipmentService.sumShippedByOrderId("order-001")).thenReturn(0);
            when(factoryShipmentService.buildShipmentNo()).thenReturn("FS20260427001");
            when(factoryShipmentService.save(any(FactoryShipment.class))).thenReturn(true);
            doNothing().when(factoryShipmentDetailService).saveDetails(anyString(), anyList(), anyLong());
            doNothing().when(productSkuService).updateStock(anyString(), anyInt());

            Map<String, Object> detail = new HashMap<>();
            detail.put("color", "黑色");
            detail.put("sizeName", "L");
            detail.put("quantity", 50);
            Result<FactoryShipment> result = orchestrator.ship(buildShipParams("order-001", Collections.singletonList(detail)));
            assertEquals(200, result.getCode());
        }
    }

    @Nested
    @DisplayName("receive - 收货确认")
    class Receive {

        @Test
        @DisplayName("shipmentId为空-返回失败")
        void emptyShipmentId_returnsFail() {
            Result<FactoryShipment> result = orchestrator.receive("", 50, null);
            assertEquals(500, result.getCode());
        }

        @Test
        @DisplayName("发货单不存在-返回失败")
        void shipmentNotFound_returnsFail() {
            when(factoryShipmentService.getById("fs-001")).thenReturn(null);
            Result<FactoryShipment> result = orchestrator.receive("fs-001", 50, null);
            assertEquals(500, result.getCode());
            assertTrue(result.getMessage().contains("不存在"));
        }

        @Test
        @DisplayName("已收货-防重复")
        void alreadyReceived_rejected() {
            FactoryShipment fs = new FactoryShipment();
            fs.setId("fs-001");
            fs.setReceiveStatus("received");
            fs.setTenantId(1L);
            when(factoryShipmentService.getById("fs-001")).thenReturn(fs);

            Result<FactoryShipment> result = orchestrator.receive("fs-001", 50, null);
            assertEquals(500, result.getCode());
            assertTrue(result.getMessage().contains("无法收货"));
        }

        @Test
        @DisplayName("收货数量超过发货数量-拒绝")
        void receivedQtyExceedsShipQty_rejected() {
            FactoryShipment fs = new FactoryShipment();
            fs.setId("fs-001");
            fs.setReceiveStatus("pending");
            fs.setShipQuantity(30);
            fs.setTenantId(1L);
            when(factoryShipmentService.getById("fs-001")).thenReturn(fs);

            Result<FactoryShipment> result = orchestrator.receive("fs-001", 50, null);
            assertEquals(500, result.getCode());
            assertTrue(result.getMessage().contains("超过"));
        }

        @Test
        @DisplayName("正常收货-成功")
        void normalReceive_success() {
            FactoryShipment fs = new FactoryShipment();
            fs.setId("fs-001");
            fs.setReceiveStatus("pending");
            fs.setShipQuantity(50);
            fs.setTenantId(1L);
            when(factoryShipmentService.getById("fs-001")).thenReturn(fs);
            when(factoryShipmentService.updateById(any(FactoryShipment.class))).thenReturn(true);

            Result<FactoryShipment> result = orchestrator.receive("fs-001", 50, null);
            assertEquals(200, result.getCode());
            verify(factoryShipmentService).updateById(any(FactoryShipment.class));
        }
    }
}
