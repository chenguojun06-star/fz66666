package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.*;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.service.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * QualityScanExecutor 单元测试
 * 测试范围：质检领取 → 验收 → 确认完整流程
 */
@ExtendWith(MockitoExtension.class)
class QualityScanExecutorTest {

    @Mock
    private ScanRecordService scanRecordService;

    @Mock
    private CuttingBundleService cuttingBundleService;

    @Mock
    private ProductWarehousingService productWarehousingService;

    @Mock
    private InventoryValidator inventoryValidator;

    @Mock
    private SKUService skuService;

    @InjectMocks
    private QualityScanExecutor executor;

    private Map<String, Object> baseParams;
    private ProductionOrder mockOrder;
    private Function<String, String> colorResolver;
    private Function<String, String> sizeResolver;

    @BeforeEach
    void setUp() {
        // 基础参数
        baseParams = new HashMap<>();
        baseParams.put("scanCode", "TEST-BUNDLE-001");
        baseParams.put("qualityStage", "receive");
        baseParams.put("qualityResult", "qualified");

        // Mock 订单
        mockOrder = new ProductionOrder();
        mockOrder.setId("order-001");
        mockOrder.setOrderNo("PO-2024-001");
        mockOrder.setStyleId("style-001");

        // 解析器
        colorResolver = (unused) -> "红色";
        sizeResolver = (unused) -> "XL";
    }

    @Test
    void testExecute_QualityReceive_Success() {
        // Given: 质检领取场景
        baseParams.put("qualityStage", "receive");
        baseParams.put("qualityResult", "qualified");
        baseParams.put("quantity", "50");

        // Mock 菲号查询
        CuttingBundle mockBundle = new CuttingBundle();
        mockBundle.setId("bundle-001");
        mockBundle.setProductionOrderId("order-001");
        mockBundle.setQuantity(50);
        when(cuttingBundleService.getByQrCode("TEST-BUNDLE-001")).thenReturn(mockBundle);

        // Mock 查询不存在历史记录（首次领取）
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class))).thenReturn(null);

        // Mock save成功
        when(scanRecordService.saveScanRecord(any(ScanRecord.class))).thenReturn(true);

        // Mock 库存验证（不抛异常）
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));

        // When: 执行质检领取
        Map<String, Object> result = executor.execute(
                baseParams,
                "req-001",
                "operator-001",
                "张三",
                mockOrder,
                colorResolver,
                sizeResolver
        );

        // Then: 验证结果
        assertNotNull(result, "返回结果不应为null");
        assertTrue((Boolean) result.get("success"), "success应为true");
        assertEquals("领取成功", result.get("message"));

        // Then: 验证 Mock 调用
        verify(cuttingBundleService, times(1)).getByQrCode("TEST-BUNDLE-001");
        verify(scanRecordService, times(1)).getOne(any(LambdaQueryWrapper.class));
        verify(scanRecordService, times(1)).saveScanRecord(argThat(record ->
                "quality".equals(record.getScanType()) &&
                "quality_receive".equals(record.getProcessCode()) &&
                "operator-001".equals(record.getOperatorId())
        ));
    }

    @Test
    void testExecute_QualityInspect_OperatorMismatch() {
        // Given: 质检验收，但操作人与领取人不匹配
        baseParams.put("qualityStage", "inspect");
        baseParams.put("qualityResult", "qualified");

        // TODO: Mock findQualityStageRecord() 返回领取记录（operatorId=other-001）

        // When & Then: 应抛出异常
        // assertThrows(RuntimeException.class, () -> {
        //     executor.execute(baseParams, "req-002", "operator-001", "张三", mockOrder, colorResolver, sizeResolver);
        // });
    }

    @Test
    void testExecute_QualityConfirm_WithUnqualified() {
        // Given: 质检确认，有次品
        baseParams.put("qualityStage", "confirm");
        baseParams.put("qualityResult", "unqualified");
        baseParams.put("quantity", "50");
        baseParams.put("unqualifiedQuantity", "5");
        baseParams.put("defectCategory", "质量问题");
        baseParams.put("defectRemark", "返修");  // 只能是"返修"或"报废"

        // Mock 菲号查询
        CuttingBundle mockBundle = new CuttingBundle();
        mockBundle.setId("bundle-001");
        mockBundle.setProductionOrderId("order-001");
        when(cuttingBundleService.getByQrCode("TEST-BUNDLE-001")).thenReturn(mockBundle);

        // Mock 领取记录
        ScanRecord receiveRecord = new ScanRecord();
        receiveRecord.setId("receive-001");
        ScanRecord inspectRecord = new ScanRecord();
        inspectRecord.setId("inspect-001");
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class)))
            .thenReturn(receiveRecord, inspectRecord, null);

        // Mock 入库保存
        when(productWarehousingService.saveWarehousingAndUpdateOrder(any(ProductWarehousing.class))).thenReturn(true);
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));

        // When: 执行确认
        Map<String, Object> result = executor.execute(
                baseParams,
                "req-003",
                "operator-001",
                "张三",
                mockOrder,
                colorResolver,
                sizeResolver
        );

        // Then: 验证ProductWarehousing记录创建
        assertNotNull(result);
        // TODO: verify(productWarehousingService, times(1)).save(any(ProductWarehousing.class));
    }

    @Test
    void testExecute_QualityConfirm_AllQualified() {
        // Given: 质检确认，全部合格
        baseParams.put("qualityStage", "confirm");
        baseParams.put("qualityResult", "qualified");
        baseParams.put("quantity", "100");  // 添加必须参数
        baseParams.put("qualifiedQuantity", "100");

        // Mock 菲号查询
        CuttingBundle mockBundle = new CuttingBundle();
        mockBundle.setId("bundle-001");
        mockBundle.setProductionOrderId("order-001");
        when(cuttingBundleService.getByQrCode("TEST-BUNDLE-001")).thenReturn(mockBundle);

        // Mock 领取和验收记录
        ScanRecord receiveRecord = new ScanRecord();
        receiveRecord.setId("receive-001");
        ScanRecord inspectRecord = new ScanRecord();
        inspectRecord.setId("inspect-001");
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class)))
            .thenReturn(receiveRecord, inspectRecord, null);

        // Mock 入库保存
        when(productWarehousingService.saveWarehousingAndUpdateOrder(any(ProductWarehousing.class))).thenReturn(true);
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));

        // When: 执行确认
        Map<String, Object> result = executor.execute(
                baseParams,
                "req-004",
                "operator-001",
                "张三",
                mockOrder,
                colorResolver,
                sizeResolver
        );

        // Then: 验证成品入库
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "应该返回success=true");
    }

    @Test
    void testComputeRemainingRepairQuantity_WithRepairPool() {
        // Given: 有返修库存
        // TODO: Mock productWarehousingService.list() 返回返修记录

        // When: 计算剩余返修数量
        // int remaining = executor.computeRemainingRepairQuantity("order-001", "bundle-001", null);

        // Then: 验证计算正确
        // assertEquals(10, remaining);
    }

    @Test
    void testValidateInspectAfterReceive_Success() {
        // Given: 领取记录存在，操作人匹配
        // TODO: Mock findQualityStageRecord() 返回领取记录

        // When & Then: 不应抛出异常
        // assertDoesNotThrow(() -> {
        //     executor.validateInspectAfterReceive("order-001", "bundle-001", "operator-001");
        // });
    }

    @Test
    void testHandleConfirm_ExceedOrderQuantity() {
        // Given: 确认数量超过订单数量
        // TODO: Mock inventoryValidator.validateNotExceedOrderQuantity() 抛出异常

        // When & Then: 应传播异常
        // assertThrows(RuntimeException.class, () -> {
        //     executor.execute(baseParams, "req-005", "operator-001", "张三", mockOrder, colorResolver, sizeResolver);
        // });
    }

    // ========== 辅助方法测试 ==========

    @Test
    void testParseQualityResult_FromParams() {
        // Given: 参数中有qualityResult
        baseParams.put("qualityResult", "unqualified");

        // When: 解析质检结果
        // String result = executor.parseQualityResultFromParams(baseParams);

        // Then: 应返回unqualified
        // assertEquals("unqualified", result);
    }

    @Test
    void testParseQualityStage_DefaultToConfirm() {
        // Given: 参数中无qualityStage
        baseParams.remove("qualityStage");

        // When: 解析质检阶段
        // String stage = executor.parseQualityStageFromParams(baseParams);

        // Then: 应默认返回confirm
        // assertEquals("confirm", stage);
    }
}
