package com.fashion.supplychain.production.orchestration;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.util.QrCodeSigner;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.executor.ProductionScanExecutor;
import com.fashion.supplychain.production.executor.QualityScanExecutor;
import com.fashion.supplychain.production.executor.WarehouseScanExecutor;
import com.fashion.supplychain.production.helper.DuplicateScanPreventer;
import com.fashion.supplychain.production.helper.ScanRecordQueryHelper;
import com.fashion.supplychain.production.helper.UnitPriceResolver;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

/**
 * ScanRecordOrchestrator 路由测试：验证生产扫码正确委托给 ProductionScanExecutor
 * 业务逻辑细节已在 ProductionScanExecutorTest 覆盖
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class ScanRecordOrchestratorAutoStageTest {

    @Mock private ScanRecordService scanRecordService;
    @Mock private ProductionCleanupOrchestrator productionCleanupOrchestrator;
    @Mock private ProductionOrderService productionOrderService;
    @Mock private CuttingBundleService cuttingBundleService;
    @Mock private CuttingTaskService cuttingTaskService;
    @Mock private ProductWarehousingOrchestrator productWarehousingOrchestrator;
    @Mock private ProductWarehousingService productWarehousingService;
    @Mock private MaterialPurchaseService materialPurchaseService;
    @Mock private TemplateLibraryService templateLibraryService;
    @Mock private ProductionOrderScanRecordDomainService scanRecordDomainService;
    @Mock private DuplicateScanPreventer duplicateScanPreventer;
    @Mock private ScanRecordQueryHelper scanRecordQueryHelper;
    @Mock private UnitPriceResolver unitPriceResolver;
    @Mock private QualityScanExecutor qualityScanExecutor;
    @Mock private WarehouseScanExecutor warehouseScanExecutor;
    @Mock private ProductionScanExecutor productionScanExecutor;
    @Mock private QrCodeSigner qrCodeSigner;

    @InjectMocks
    private ScanRecordOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        // 设置租户上下文（TenantAssert.assertTenantContext() 必须）
        UserContext ctx = new UserContext();
        ctx.setUserId("u1");
        ctx.setUsername("张三");
        ctx.setTenantId(1L);
        UserContext.set(ctx);

        // QR 码验证放行（向后兼容模式）
        when(qrCodeSigner.verify(anyString()))
                .thenReturn(QrCodeSigner.VerifyResult.unsigned("PO20260118001"));

        // 防重复扫码：无历史记录
        when(duplicateScanPreventer.findByRequestId(anyString())).thenReturn(null);
        when(duplicateScanPreventer.generateRequestId()).thenReturn("r1");

        // 生产扫码执行器返回成功结果
        when(productionScanExecutor.execute(any(), anyString(), anyString(), anyString(),
                anyString(), anyInt(), anyBoolean(), any(), any()))
                .thenReturn(new HashMap<>());
    }

    @AfterEach
    void tearDown() {
        UserContext.set(null);
    }

    @Test
    void productionScan_routesToProductionScanExecutor() {
        ProductionOrder order = new ProductionOrder();
        order.setId("o1");
        order.setDeleteFlag(0);
        order.setStatus("pending");
        order.setOrderNo("PO20260118001");
        order.setStyleId("SID1");
        order.setStyleNo("S1");
        order.setOrderQuantity(100);

        when(productionOrderService.getById("o1")).thenReturn(order);

        Map<String, Object> params = new HashMap<>();
        params.put("requestId", "r1");
        params.put("scanType", "production");
        params.put("orderId", "o1");
        params.put("scanCode", "PO20260118001");
        params.put("quantity", 1);

        orchestrator.execute(params);

        // 验证 Orchestrator 正确将生产扫码委托给 ProductionScanExecutor
        verify(productionScanExecutor).execute(
                any(), anyString(), anyString(), anyString(),
                anyString(), anyInt(), anyBoolean(), any(), any());
    }
}
