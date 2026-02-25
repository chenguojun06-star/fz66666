package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.*;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
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
@SuppressWarnings("unchecked")
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

    @Mock
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @InjectMocks
    private QualityScanExecutor executor;

    private CuttingBundle mockBundle;
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
        baseParams.put("quantity", "50");

        // Mock 订单
        mockOrder = new ProductionOrder();
        mockOrder.setId("order-001");
        mockOrder.setOrderNo("PO-2024-001");
        mockOrder.setStyleId("style-001");

        // Mock 菲号
        mockBundle = new CuttingBundle();
        mockBundle.setId("bundle-001");
        mockBundle.setProductionOrderId("order-001");
        mockBundle.setQuantity(50);

        // 默认 Mock：菲号查询 + save
        lenient().when(cuttingBundleService.getByQrCode(anyString())).thenReturn(mockBundle);
        lenient().when(scanRecordService.saveScanRecord(any(ScanRecord.class))).thenReturn(true);

        // 模拟生产前置条件检查（已有生产扫码记录）
        lenient().when(scanRecordService.count(any())).thenReturn(1L);

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
        // Given: 质检验收，操作人与领取人不匹配
        baseParams.put("qualityStage", "inspect");
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));

        // 领取记录属于 other-001
        ScanRecord otherReceive = new ScanRecord();
        otherReceive.setId("receive-other");
        otherReceive.setOperatorId("other-001");
        otherReceive.setOperatorName("李四");
        // 第一次 getOne: 查 quality_inspect → null（沒有inspect记录）
        // 第二次 getOne: 查 quality_receive → other-001的领取记录
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class)))
                .thenReturn(null, otherReceive);

        // When & Then: 验收人与领取人不一致，应拒绝并提示
        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
                executor.execute(baseParams, "req-002", "operator-001", "张三",
                        mockOrder, colorResolver, sizeResolver));
        assertTrue(ex.getMessage().contains("只能由领取人验收"),
                "不匹配时应提示只能由领取人验收，实际: " + ex.getMessage());
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

        // Mock 领取记录存在；confirm 记录不存在（无重复）
        ScanRecord receiveRecord = new ScanRecord();
        receiveRecord.setId("receive-001");
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class)))
            .thenReturn(receiveRecord, null);

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

        // Then: handleConfirm 只录质检结果不入库（WarehouseScanExecutor 负责入库）
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "质检确认应返回 success=true");
        verify(scanRecordService).saveScanRecord(any(ScanRecord.class));
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

        // Mock 领取记录存在；confirm 记录不存在（无重复）
        ScanRecord receiveRecord = new ScanRecord();
        receiveRecord.setId("receive-001");
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class)))
            .thenReturn(receiveRecord, null);

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

        // Then: handleConfirm 只录质检结果，入库由 WarehouseScanExecutor 负责
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "应该返回success=true");
        verify(scanRecordService).saveScanRecord(any(ScanRecord.class));
    }

    @Test
    void testComputeRemainingRepairQuantity_WithRepairPool() {
        // Given: 返修场景，qualityResult=repaired → handleConfirm 只录结果不入库
        // 入库由 WarehouseScanExecutor 独立负责
        baseParams.put("qualityStage", "confirm");
        baseParams.put("qualityResult", "repaired");
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));

        ScanRecord rcv = new ScanRecord(); rcv.setId("rcv-001");
        // 第一次 getOne → receive 记录存在；第二次 → 无重复 confirm 记录
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class)))
                .thenReturn(rcv, null);

        // When: 执行返修结果录入
        Map<String, Object> result = executor.execute(
                baseParams, "req-repair-001", "op-001", "王五",
                mockOrder, colorResolver, sizeResolver);

        // Then: 只保存扫码记录，不调用入库相关方法
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "返修结果录入应成功");
        verify(scanRecordService).saveScanRecord(any(ScanRecord.class));
    }

    @Test
    void testValidateInspectAfterReceive_Success() {
        // Given: 领取记录存在，操作人匹配 — 验收应通过
        baseParams.put("qualityStage", "inspect");
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));
        when(scanRecordService.saveScanRecord(any(ScanRecord.class))).thenReturn(true);

        // inspect不存在 + receive存在（operatorId 匹配）
        ScanRecord receiveRecord = new ScanRecord();
        receiveRecord.setId("receive-001");
        receiveRecord.setOperatorId("operator-001");
        receiveRecord.setOperatorName("张三");
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class)))
                .thenReturn(null, receiveRecord);

        // When & Then: 不应抛出操作人校验异常
        Map<String, Object> result = executor.execute(
                baseParams, "req-vi-001", "operator-001", "张三",
                mockOrder, colorResolver, sizeResolver);
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "操作人匹配时验收应成功");
        assertEquals("验收成功", result.get("message"));
    }

    @Test
    void testHandleConfirm_ExceedOrderQuantity() {
        // Given: 质检确认，数量超过订单上限 → inventoryValidator 抛出异常
        baseParams.put("qualityStage", "confirm");
        doThrow(new IllegalArgumentException("入库数量超过订单数量限制"))
                .when(inventoryValidator).validateNotExceedOrderQuantity(
                        any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));

        // When & Then: 应传播 inventoryValidator 的异常
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                executor.execute(baseParams, "req-exceed-001", "op-001", "李四",
                        mockOrder, colorResolver, sizeResolver));
        assertTrue(ex.getMessage().contains("超过"),
                "超量时应抛出包含‘超过’的异常，实际: " + ex.getMessage());
    }

    // ========== 辅助方法测试 ==========

    @Test
    void testParseQualityResult_FromParams() {
        // Given: 明确传入 qualityResult=unqualified 的质检领取
        baseParams.put("qualityStage", "receive");
        baseParams.put("qualityResult", "unqualified");
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class))).thenReturn(null);
        when(scanRecordService.saveScanRecord(any(ScanRecord.class))).thenReturn(true);

        // When: 执行
        Map<String, Object> result = executor.execute(
                baseParams, "req-pqr-001", "op-001", "王五",
                mockOrder, colorResolver, sizeResolver);

        // Then: 领取阶段不受 qualityResult 影响，仍应成功
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"));
    }

    @Test
    void testParseQualityStage_DefaultToConfirm() {
        // Given: 未传 qualityStage，期望默认走 confirm 路径
        baseParams.remove("qualityStage");
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));

        ScanRecord rcv = new ScanRecord(); rcv.setId("rcv-def");
        // 第一次 getOne → receive 记录存在；第二次 → 无重复 confirm 记录
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class)))
                .thenReturn(rcv, null);

        // When: 默认走 confirm 路径
        Map<String, Object> result = executor.execute(
                baseParams, "req-default-001", "op-001", "王五",
                mockOrder, colorResolver, sizeResolver);

        // Then: 应进入 confirm 路径保存扫码记录（入库由 WarehouseScanExecutor 负责）
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "默认 confirm 路径应成功");
        verify(scanRecordService).saveScanRecord(any(ScanRecord.class));
    }

    @Test
    void testExecute_CompletedOrder_ThrowsError() {
        // Given: 订单已完成
        mockOrder.setStatus("completed");
        baseParams.put("quantity", "10");

        CuttingBundle bundle = new CuttingBundle();
        bundle.setId("bundle-001");
        bundle.setProductionOrderId("order-001");
        when(cuttingBundleService.getByQrCode(anyString())).thenReturn(bundle);

        // When & Then: 应拒绝质检，提示“进度节点已完成”
        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
                executor.execute(baseParams, "req-cmp-001", "op-001", "李四",
                        mockOrder, colorResolver, sizeResolver));
        assertTrue(ex.getMessage().contains("进度节点已完成"),
                "完成订单应提示进度节点已完成，实际: " + ex.getMessage());
    }
}
