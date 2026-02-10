package com.fashion.supplychain.production.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Answers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Mockito;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ProductionOrderFlowOrchestrationServiceTest {

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private ScanRecordMapper scanRecordMapper;

    @Mock
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Mock
    private CuttingTaskService cuttingTaskService;

    @Mock
    private CuttingBundleMapper cuttingBundleMapper;

    @Mock
    private ProductWarehousingService productWarehousingService;

    @Mock
    private ProductOutstockService productOutstockService;

    @Mock
    private ShipmentReconciliationService shipmentReconciliationService;

    @Mock
    private MaterialReconciliationService materialReconciliationService;

    @Mock
    private TemplateLibraryService templateLibraryService;

    @InjectMocks
    private ProductionOrderFlowOrchestrationService service;

    @Test
    void getOrderFlow_throwsWhenOrderIdMissing() {
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.getOrderFlow(" "));
        assertEquals("参数错误", ex.getMessage());
    }

    @Test
    void getOrderFlow_throwsWhenOrderMissing() {
        when(productionOrderService.getDetailById("o1")).thenReturn(null);

        NoSuchElementException ex = assertThrows(NoSuchElementException.class, () -> service.getOrderFlow("o1"));
        assertEquals("生产订单不存在", ex.getMessage());
    }

    @Test
    void getOrderFlow_buildsStageFlowWithBundleDedupAndQualityMapping() {
        ProductionOrder order = new ProductionOrder();
        order.setId("o1");
        order.setStyleNo("S1");
        order.setOrderQuantity(100);
        when(productionOrderService.getDetailById("o1")).thenReturn(order);

        doAnswer(invocation -> {
            @SuppressWarnings("unchecked")
            List<String> processOrder = (List<String>) invocation.getArgument(2);
            processOrder.clear();
            processOrder.add("下单");
            processOrder.add("裁剪");
            processOrder.add("质检");
            return null;
        }).when(templateLibraryService).loadProgressWeights(any(), any(), any());

        when(templateLibraryService.progressStageNameMatches(any(), any())).thenAnswer(invocation -> {
            String a = invocation.getArgument(0, String.class);
            String b = invocation.getArgument(1, String.class);
            return a.equals(b);
        });

        LocalDateTime t1 = LocalDateTime.of(2026, 1, 1, 10, 0);
        LocalDateTime t2 = LocalDateTime.of(2026, 1, 1, 10, 5);
        LocalDateTime t3 = LocalDateTime.of(2026, 1, 1, 10, 10);
        LocalDateTime tq1 = LocalDateTime.of(2026, 1, 1, 11, 0);
        LocalDateTime tq2 = LocalDateTime.of(2026, 1, 1, 11, 30);

        ScanRecord cutting1 = new ScanRecord();
        cutting1.setOrderId("o1");
        cutting1.setScanResult("success");
        cutting1.setProgressStage("裁剪");
        cutting1.setQuantity(30);
        cutting1.setCuttingBundleId("b1");
        cutting1.setOperatorId("op1");
        cutting1.setOperatorName("张三");
        cutting1.setScanTime(t1);

        ScanRecord cutting2 = new ScanRecord();
        cutting2.setOrderId("o1");
        cutting2.setScanResult("success");
        cutting2.setProgressStage("裁剪");
        cutting2.setQuantity(50);
        cutting2.setCuttingBundleId("b1");
        cutting2.setOperatorId("op2");
        cutting2.setOperatorName("李四");
        cutting2.setScanTime(t2);

        ScanRecord cutting3 = new ScanRecord();
        cutting3.setOrderId("o1");
        cutting3.setScanResult("success");
        cutting3.setProgressStage("裁剪");
        cutting3.setQuantity(10);
        cutting3.setOperatorId("op3");
        cutting3.setOperatorName("王五");
        cutting3.setScanTime(t3);

        ScanRecord quality1 = new ScanRecord();
        quality1.setOrderId("o1");
        quality1.setScanResult("success");
        quality1.setProcessCode("quality_warehousing");
        quality1.setProgressStage("其他");
        quality1.setQuantity(50);
        quality1.setOperatorId("q1");
        quality1.setOperatorName("质检员A");
        quality1.setScanTime(tq1);

        ScanRecord quality2 = new ScanRecord();
        quality2.setOrderId("o1");
        quality2.setScanResult("success");
        quality2.setProcessCode("quality_warehousing");
        quality2.setProgressStage("其他");
        quality2.setQuantity(60);
        quality2.setOperatorId("q2");
        quality2.setOperatorName("质检员B");
        quality2.setScanTime(tq2);

        ScanRecord ignoredFailure = new ScanRecord();
        ignoredFailure.setOrderId("o1");
        ignoredFailure.setScanResult("failure");
        ignoredFailure.setProgressStage("裁剪");
        ignoredFailure.setQuantity(999);
        ignoredFailure.setScanTime(LocalDateTime.of(2026, 1, 1, 0, 0));

        when(scanRecordMapper.selectList(any())).thenReturn(List.of(cutting1, cutting2, cutting3, quality1, quality2,
                ignoredFailure));
        when(materialPurchaseMapper.selectList(any())).thenReturn(List.of());
        when(cuttingTaskService.list(Mockito.<Wrapper<CuttingTask>>any())).thenReturn(List.of());
        when(cuttingBundleMapper.selectList(any())).thenReturn(List.of());
        when(productWarehousingService.list(Mockito.<Wrapper<ProductWarehousing>>any())).thenReturn(List.of());
        when(productOutstockService.list(Mockito.<Wrapper<ProductOutstock>>any())).thenReturn(List.of());

        @SuppressWarnings("unchecked")
        LambdaQueryChainWrapper<ShipmentReconciliation> sr = (LambdaQueryChainWrapper<ShipmentReconciliation>) Mockito
                .mock(LambdaQueryChainWrapper.class, Answers.RETURNS_SELF);
        when(sr.list()).thenReturn(List.of());
        when(shipmentReconciliationService.lambdaQuery()).thenReturn(sr);

        @SuppressWarnings("unchecked")
        LambdaQueryChainWrapper<MaterialReconciliation> mr = (LambdaQueryChainWrapper<MaterialReconciliation>) Mockito
                .mock(LambdaQueryChainWrapper.class, Answers.RETURNS_SELF);
        when(mr.list()).thenReturn(List.of());
        when(materialReconciliationService.lambdaQuery()).thenReturn(mr);

        ProductionOrderFlowOrchestrationService.OrderFlowResponse out = service.getOrderFlow("o1");

        List<Map<String, Object>> stages = out.getStages();
        assertEquals(3, stages.size());

        assertEquals("下单", stages.get(0).get("processName"));
        assertEquals("not_started", stages.get(0).get("status"));
        assertEquals(0, stages.get(0).get("totalQuantity"));

        assertEquals("裁剪", stages.get(1).get("processName"));
        assertEquals("in_progress", stages.get(1).get("status"));
        assertEquals(60, stages.get(1).get("totalQuantity"));
        assertEquals(t1, stages.get(1).get("startTime"));
        assertEquals(t3, stages.get(1).get("lastTime"));

        assertEquals("质检", stages.get(2).get("processName"));
        assertEquals("completed", stages.get(2).get("status"));
        assertEquals(110, stages.get(2).get("totalQuantity"));
        assertEquals(tq2, stages.get(2).get("completeTime"));
    }
}
