package com.fashion.supplychain.production.orchestration;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ScanRecordOrchestratorAutoStageTest {

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
    private MaterialPurchaseService materialPurchaseService;

    @Mock
    private TemplateLibraryService templateLibraryService;

    @Mock
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @InjectMocks
    private ScanRecordOrchestrator orchestrator;

    @Test
    @Disabled("缺少 DuplicateScanPreventer/QrCodeSigner/Executor mock 及 UserContext，需专项补全")
    void productionScan_autoStage_resolvesProcurement() {
        ProductionOrder order = new ProductionOrder();
        order.setId("o1");
        order.setDeleteFlag(0);
        order.setStatus("pending");
        order.setOrderNo("PO20260118001");
        order.setStyleId("SID1");
        order.setStyleNo("S1");
        order.setColor("黑");
        order.setSize("M");
        order.setOrderQuantity(100);
        order.setMaterialArrivalRate(0);
        order.setProductionProgress(10);

        when(scanRecordService.getOne(any())).thenReturn(null);
        when(cuttingBundleService.getByQrCode(any())).thenReturn(null);
        when(productionOrderService.getById("o1")).thenReturn(order);
        when(templateLibraryService.resolveProgressNodes("S1")).thenReturn(List.of("下单", "采购", "裁剪", "车缝", "质检"));
        when(templateLibraryService.isProgressQualityStageName(any()))
                .thenAnswer(inv -> {
                    Object arg = inv.getArgument(0);
                    String s = arg == null ? "" : String.valueOf(arg).trim();
                    return "质检".equals(s);
                });
        when(templateLibraryService.progressStageNameMatches(any(), any()))
                .thenAnswer(inv -> {
                    Object a = inv.getArgument(0);
                    Object b = inv.getArgument(1);
                    return a != null && b != null && String.valueOf(a).trim().equals(String.valueOf(b).trim());
                });
        when(scanRecordDomainService.getNodeIndexFromProgress(5, 10)).thenReturn(1);
        when(templateLibraryService.resolveProcessUnitPrices("S1")).thenReturn(null);
        when(productionOrderService.recomputeProgressFromRecords("o1")).thenReturn(order);
        when(materialPurchaseService.list(org.mockito.ArgumentMatchers.<Wrapper<MaterialPurchase>>any()))
                .thenReturn(List.of());

        Map<String, Object> params = new HashMap<>();
        params.put("requestId", "r1");
        params.put("scanType", "production");
        params.put("operatorId", "u1");
        params.put("operatorName", "张三");
        params.put("orderId", "o1");
        params.put("scanCode", "PO20260118001");
        params.put("quantity", 1);

        orchestrator.execute(params);

        verify(scanRecordService).saveScanRecord(argThat(sr -> sr != null
                && "采购".equals(sr.getProgressStage())
                && "采购".equals(sr.getProcessName())));
    }
}
