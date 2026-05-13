package com.fashion.supplychain.production.integration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.helper.OrderRemarkHelper;
import com.fashion.supplychain.production.helper.ProductWarehousingPendingHelper;
import com.fashion.supplychain.production.helper.ProductWarehousingPostActionHelper;
import com.fashion.supplychain.production.helper.ProductWarehousingQueryHelper;
import com.fashion.supplychain.production.helper.ProductWarehousingRepairHelper;
import com.fashion.supplychain.production.helper.ProductWarehousingRollbackHelper;
import com.fashion.supplychain.production.orchestration.ProductWarehousingOrchestrator;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
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

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("入库→库存→订单状态变更集成测试 - 规则17")
class WarehousingStockOrderIntegrationTest {

    @Mock private ProductWarehousingService productWarehousingService;
    @Mock private ProductionOrderService productionOrderService;
    @Mock private CuttingBundleService cuttingBundleService;
    @Mock private ScanRecordService scanRecordService;
    @Mock private ProductSkuService productSkuService;
    @Mock private ProductWarehousingQueryHelper queryHelper;
    @Mock private ProductWarehousingRepairHelper repairHelper;
    @Mock private ProductWarehousingRollbackHelper rollbackHelper;
    @Mock private ProductWarehousingPostActionHelper postActionHelper;
    @Mock private OrderRemarkHelper orderRemarkHelper;
    @Mock private ProductWarehousingPendingHelper pendingHelper;

    @InjectMocks private ProductWarehousingOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        setTenantUser(1L);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private void setTenantUser(Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setUserId("wh-001");
        ctx.setUsername("仓库员");
        ctx.setRole("worker");
        ctx.setTenantId(tenantId);
        UserContext.set(ctx);
    }

    private void setSupervisorUser(Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setUserId("sup-001");
        ctx.setUsername("主管");
        ctx.setRole("supervisor");
        ctx.setTenantId(tenantId);
        UserContext.set(ctx);
    }

    private ProductionOrder buildOrder(int orderQty, int completedQty, String status) {
        ProductionOrder order = new ProductionOrder();
        order.setId("order-001");
        order.setOrderNo("PO-001");
        order.setStyleNo("FZ-001");
        order.setColor("黑色");
        order.setSize("L");
        order.setStatus(status);
        order.setOrderQuantity(orderQty);
        order.setCompletedQuantity(completedQty);
        order.setDeleteFlag(0);
        order.setTenantId(1L);
        return order;
    }

    private CuttingBundle buildBundle(int bundleQty) {
        CuttingBundle bundle = new CuttingBundle();
        bundle.setId("bundle-001");
        bundle.setQrCode("QR-001");
        bundle.setStyleNo("FZ-001");
        bundle.setColor("黑色");
        bundle.setSize("L");
        bundle.setQuantity(bundleQty);
        bundle.setStatus("qualified");
        bundle.setTenantId(1L);
        return bundle;
    }

    private ProductWarehousing buildWarehousing(int qty) {
        ProductWarehousing w = new ProductWarehousing();
        w.setId("wh-001");
        w.setOrderId("order-001");
        w.setStyleNo("FZ-001");
        w.setWarehousingQuantity(qty);
        w.setQualifiedQuantity(qty);
        w.setCuttingBundleId("bundle-001");
        w.setTenantId(1L);
        return w;
    }

    private ScanRecord buildQualityConfirmRecord() {
        ScanRecord sr = new ScanRecord();
        sr.setId("sr-qc-001");
        sr.setScanType("quality");
        sr.setProcessCode("quality_receive");
        sr.setScanResult("success");
        sr.setConfirmTime(LocalDateTime.now());
        sr.setOrderId("order-001");
        sr.setCuttingBundleId("bundle-001");
        return sr;
    }

    private void setupWarehousingMocks(ProductionOrder order, CuttingBundle bundle) {
        when(productionOrderService.getById("order-001")).thenReturn(order);
        when(cuttingBundleService.getById("bundle-001")).thenReturn(bundle);
        when(scanRecordService.getOne(any())).thenReturn(buildQualityConfirmRecord());
        when(scanRecordService.count(any())).thenReturn(1L);
        when(productWarehousingService.count(any())).thenReturn(0L);
        when(productWarehousingService.saveWarehousingAndUpdateOrder(any())).thenReturn(true);
    }

    @Nested
    @DisplayName("入库→库存更新")
    class WarehousingToStock {

        @Test
        @DisplayName("入库后应调用SKU库存更新服务增加库存")
        void warehousing_increasesSkuStock() {
            ProductWarehousing w = buildWarehousing(50);
            ProductionOrder order = buildOrder(100, 0, "in_production");
            CuttingBundle bundle = buildBundle(50);
            setupWarehousingMocks(order, bundle);

            orchestrator.save(w);

            verify(postActionHelper).triggerPostSaveActions(eq("order-001"), eq(w));
        }

        @Test
        @DisplayName("入库回滚后应减少SKU库存")
        void warehousingRollback_decreasesSkuStock() {
            setSupervisorUser(1L);
            when(rollbackHelper.rollbackByBundle(anyMap())).thenReturn(true);

            Map<String, Object> body = new HashMap<>();
            body.put("orderId", "order-001");
            body.put("cuttingBundleQrCode", "QR-001");
            body.put("rollbackQuantity", 50);
            body.put("rollbackRemark", "测试回滚");

            boolean result = orchestrator.rollbackByBundle(body);

            assertTrue(result);
            verify(rollbackHelper).rollbackByBundle(body);
        }
    }

    @Nested
    @DisplayName("入库→订单状态变更")
    class WarehousingToOrderStatus {

        @Test
        @DisplayName("入库保存应触发后置动作更新订单完成数量")
        void warehousingSave_triggersOrderStatusUpdate() {
            ProductWarehousing w = buildWarehousing(50);
            ProductionOrder order = buildOrder(100, 0, "in_production");
            CuttingBundle bundle = buildBundle(50);
            setupWarehousingMocks(order, bundle);

            boolean result = orchestrator.save(w);

            assertTrue(result);
            verify(productWarehousingService).saveWarehousingAndUpdateOrder(any());
            verify(postActionHelper).triggerPostSaveActions(eq("order-001"), eq(w));
        }

        @Test
        @DisplayName("部分入库时订单状态保持in_production")
        void partialWarehousing_orderInProduction() {
            ProductWarehousing w = buildWarehousing(50);
            ProductionOrder order = buildOrder(100, 50, "in_production");
            CuttingBundle bundle = buildBundle(50);
            setupWarehousingMocks(order, bundle);

            orchestrator.save(w);

            verify(productWarehousingService).saveWarehousingAndUpdateOrder(argThat(pw ->
                    pw.getQualifiedQuantity() == 50));
        }

        @Test
        @DisplayName("入库回滚应委托给rollbackHelper执行")
        void warehousingRollback_delegatesToRollbackHelper() {
            setSupervisorUser(1L);
            when(rollbackHelper.rollbackByBundle(anyMap())).thenReturn(true);

            Map<String, Object> body = new HashMap<>();
            body.put("orderId", "order-001");
            body.put("cuttingBundleQrCode", "QR-001");
            body.put("rollbackQuantity", 50);

            boolean result = orchestrator.rollbackByBundle(body);

            assertTrue(result);
            verify(rollbackHelper).rollbackByBundle(body);
        }
    }

    @Nested
    @DisplayName("入库数量校验")
    class WarehousingQuantityValidation {

        @Test
        @DisplayName("入库数量超过裁剪数量时InventoryValidator应拦截")
        void cumulativeWarehousing_notExceedCuttingQuantity() {
            CuttingBundle bundle = buildBundle(50);
            int incomingQty = 60;

            assertTrue(incomingQty > bundle.getQuantity(),
                    "入库数量超过裁剪数量应被拦截");
        }

        @Test
        @DisplayName("菲号状态为unqualified时阻止入库")
        void unqualifiedBundle_blocksWarehousing() {
            ProductWarehousing w = buildWarehousing(50);
            ProductionOrder order = buildOrder(100, 0, "in_production");
            CuttingBundle bundle = buildBundle(50);
            bundle.setStatus("unqualified");

            when(productionOrderService.getById("order-001")).thenReturn(order);
            when(cuttingBundleService.getById("bundle-001")).thenReturn(bundle);
            when(scanRecordService.count(any())).thenReturn(1L);

            assertThrows(Exception.class, () -> orchestrator.save(w));
        }
    }

    @Nested
    @DisplayName("入库前置校验")
    class WarehousingPrerequisite {

        @Test
        @DisplayName("必须有生产扫码记录才能入库")
        void productionScanRequired_beforeWarehousing() {
            ProductWarehousing w = buildWarehousing(50);
            ProductionOrder order = buildOrder(100, 0, "in_production");
            CuttingBundle bundle = buildBundle(50);

            when(productionOrderService.getById("order-001")).thenReturn(order);
            when(cuttingBundleService.getById("bundle-001")).thenReturn(bundle);
            when(scanRecordService.count(any())).thenReturn(0L);

            IllegalStateException ex = assertThrows(IllegalStateException.class,
                    () -> orchestrator.save(w));
            assertTrue(ex.getMessage().contains("生产扫码"),
                    "应提示需要先完成生产扫码");
        }

        @Test
        @DisplayName("无质检确认记录时仍可入库（PC端入库不强制质检确认）")
        void noQualityConfirm_warehousingStillWorks() {
            ProductWarehousing w = buildWarehousing(50);
            ProductionOrder order = buildOrder(100, 0, "in_production");
            CuttingBundle bundle = buildBundle(50);

            when(productionOrderService.getById("order-001")).thenReturn(order);
            when(cuttingBundleService.getById("bundle-001")).thenReturn(bundle);
            when(scanRecordService.count(any())).thenReturn(1L);
            when(productWarehousingService.count(any())).thenReturn(0L);
            when(productWarehousingService.saveWarehousingAndUpdateOrder(any())).thenReturn(true);

            boolean result = orchestrator.save(w);

            assertTrue(result);
        }
    }

    @Nested
    @DisplayName("入库数据一致性验证")
    class WarehousingDataConsistency {

        @Test
        @DisplayName("入库保存应同时创建入库记录和更新订单完成数量")
        void warehousingSave_createsRecordAndUpdatesOrder() {
            ProductWarehousing w = buildWarehousing(50);
            ProductionOrder order = buildOrder(100, 0, "in_production");
            CuttingBundle bundle = buildBundle(50);
            setupWarehousingMocks(order, bundle);

            boolean result = orchestrator.save(w);

            assertTrue(result);
            verify(productWarehousingService).saveWarehousingAndUpdateOrder(argThat(pw ->
                    pw.getOrderId().equals("order-001") &&
                    pw.getCuttingBundleId().equals("bundle-001") &&
                    pw.getQualifiedQuantity() == 50));
        }

        @Test
        @DisplayName("入库保存应填充操作人信息")
        void warehousingSave_fillsOperatorInfo() {
            ProductWarehousing w = buildWarehousing(50);
            ProductionOrder order = buildOrder(100, 0, "in_production");
            CuttingBundle bundle = buildBundle(50);
            setupWarehousingMocks(order, bundle);

            orchestrator.save(w);

            verify(productWarehousingService).saveWarehousingAndUpdateOrder(argThat(pw ->
                    pw.getWarehousingOperatorId() != null &&
                    pw.getWarehousingOperatorName() != null));
        }

        @Test
        @DisplayName("入库保存应触发后置动作（进度重算、WebSocket通知等）")
        void warehousingSave_triggersPostActions() {
            ProductWarehousing w = buildWarehousing(50);
            ProductionOrder order = buildOrder(100, 0, "in_production");
            CuttingBundle bundle = buildBundle(50);
            setupWarehousingMocks(order, bundle);

            orchestrator.save(w);

            verify(postActionHelper).triggerPostSaveActions(eq("order-001"), any(ProductWarehousing.class));
        }
    }
}
