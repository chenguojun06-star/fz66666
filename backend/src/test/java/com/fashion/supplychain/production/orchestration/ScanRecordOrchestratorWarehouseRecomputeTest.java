package com.fashion.supplychain.production.orchestration;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ScanRecordOrchestratorWarehouseRecomputeTest {

    @Mock
    private ScanRecordService scanRecordService;

    @Mock
    private ProductionCleanupOrchestrator productionCleanupOrchestrator;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private CuttingBundleService cuttingBundleService;

    @Mock
    private ProductWarehousingService productWarehousingService;

    @Mock
    private TemplateLibraryService templateLibraryService;

    @Mock
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @InjectMocks
    private ScanRecordOrchestrator orchestrator;

    @Test
    @Disabled("缺少 DuplicateScanPreventer/QrCodeSigner/Executor mock 及 UserContext，需专项补全")
    void warehouseScan_recomputesProgress() {
        ProductionOrder order = new ProductionOrder();
        order.setId("o1");
        order.setDeleteFlag(0);
        order.setStatus("production");
        order.setOrderNo("ON1");
        order.setStyleId("SID1");
        order.setStyleNo("S1");
        order.setColor("黑");
        order.setSize("M");

        when(scanRecordService.getOne(any())).thenReturn(null);
        when(productionOrderService.getById("o1")).thenReturn(order);
        when(productWarehousingService.saveWarehousingAndUpdateOrder(any())).thenReturn(true);
        when(productionOrderService.recomputeProgressFromRecords("o1")).thenReturn(order);

        Map<String, Object> params = new HashMap<>();
        params.put("requestId", "r1");
        params.put("scanType", "warehouse");
        params.put("operatorId", "u1");
        params.put("operatorName", "张三");
        params.put("orderId", "o1");
        params.put("scanCode", "QR1");
        params.put("warehouse", "A");
        params.put("quantity", 10);

        orchestrator.execute(params);

        verify(productionOrderService).recomputeProgressFromRecords("o1");
    }
}

