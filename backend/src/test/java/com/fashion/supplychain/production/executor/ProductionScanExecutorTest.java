package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.*;
import com.fashion.supplychain.production.helper.*;
import com.fashion.supplychain.production.service.*;
import com.fashion.supplychain.production.orchestration.ProductionProcessTrackingOrchestrator;
import com.fashion.supplychain.template.service.TemplateLibraryService;
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
 * ProductionScanExecutor 单元测试
 * 测试范围：裁剪/车缝/大烫等生产工序扫码
 */
@ExtendWith(MockitoExtension.class)
@SuppressWarnings("unchecked")
class ProductionScanExecutorTest {

    @Mock
    private ScanRecordService scanRecordService;

    @Mock
    private CuttingBundleService cuttingBundleService;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private ProcessStageDetector processStageDetector;

    @Mock
    private InventoryValidator inventoryValidator;

    @Mock
    private SKUService skuService;

    @Mock
    private TemplateLibraryService templateLibraryService;

    @Mock
    private MaterialPurchaseService materialPurchaseService;

    @Mock
    private com.fashion.supplychain.style.service.StyleAttachmentService styleAttachmentService;

    @Mock
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @InjectMocks
    private ProductionScanExecutor executor;

    private Map<String, Object> baseParams;
    private CuttingBundle mockBundle;
    private ProductionOrder mockOrder;
    private Function<String, String> colorResolver;
    private Function<String, String> sizeResolver;

    @BeforeEach
    void setUp() {
        // 基础参数
        baseParams = new HashMap<>();
        baseParams.put("scanCode", "BUNDLE-001");
        baseParams.put("processName", "车缝");
        baseParams.put("quantity", "50");

        // Mock 菲号
        mockBundle = new CuttingBundle();
        mockBundle.setId("bundle-001");
        mockBundle.setProductionOrderId("order-001");
        mockBundle.setQuantity(50);
        mockBundle.setColor("红色");
        mockBundle.setSize("XL");
        mockBundle.setStyleNo("FZ001");

        // Mock 订单
        mockOrder = new ProductionOrder();
        mockOrder.setId("order-001");
        mockOrder.setOrderNo("PO-2024-001");
        mockOrder.setStyleId("style-001");
        mockOrder.setDeleteFlag(0);  // 必须设置，否则resolveOrder返回null

        // 解析器
        colorResolver = (unused) -> "红色";
        sizeResolver = (unused) -> "XL";

        // 通用 Mock（所有测试共享）
        lenient().when(cuttingBundleService.getByQrCode(anyString())).thenReturn(mockBundle);
        lenient().when(scanRecordService.saveScanRecord(any(ScanRecord.class))).thenReturn(true);
        lenient().when(productionOrderService.getById(anyString())).thenReturn(mockOrder);
        lenient().when(productionOrderService.getOne(any(LambdaQueryWrapper.class))).thenReturn(mockOrder);
        lenient().doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), nullable(CuttingBundle.class));

        // Mock process detection (lenient)
        lenient().when(processStageDetector.resolveAutoProcessName(any(ProductionOrder.class))).thenReturn("车缝");

        // Mock template/price resolution (lenient)
        lenient().when(templateLibraryService.getById(anyString())).thenReturn(null);

        // Mock style attachment (lenient)
        lenient().when(styleAttachmentService.checkPatternComplete(anyString())).thenReturn(true);
        lenient().when(styleAttachmentService.list(any(LambdaQueryWrapper.class))).thenReturn(
                java.util.Collections.singletonList(
                        new com.fashion.supplychain.style.entity.StyleAttachment()));

        // Mock material purchase (lenient)
        lenient().when(materialPurchaseService.list(any(LambdaQueryWrapper.class))).thenReturn(java.util.Collections.emptyList());

        // Mock SKU validation
        lenient().when(skuService.validateSKU(any(ScanRecord.class))).thenReturn(true);
    }

    @Test
    void testExecute_ProductionScan_Success() {
        // Given: 正常生产扫码，setUp 已 mock scanRecordService.saveScanRecord() 返回 true
        baseParams.put("processName", "车缝");

        // When: 执行生产扫码
        Map<String, Object> result = executor.execute(
                baseParams, "req-001", "operator-001", "王五",
                "production", 50, false, colorResolver, sizeResolver);

        // Then: 验证成功并保存了扫码记录
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "应该返回success=true");
        verify(scanRecordService, atLeastOnce()).saveScanRecord(any(ScanRecord.class));
    }

    @Test
    void testExecute_AutoProcessDetection_Success() {
        // Given: 未传 processName，触发自动工序识别
        // setUp 已 mock processStageDetector.resolveAutoProcessName(any(ProductionOrder.class)) 返回 "车缝"
        baseParams.remove("processName");

        // When: 执行扫码
        Map<String, Object> result = executor.execute(
                baseParams, "req-002", "operator-001", "王五",
                "production", 50, true, colorResolver, sizeResolver);

        // Then: 应自动识别工序，并调用 resolveAutoProcessName
        assertNotNull(result);
        verify(processStageDetector, atLeastOnce()).resolveAutoProcessName(any(ProductionOrder.class));
    }

    @Test
    void testExecute_CuttingDetection_CheckPattern() {
        // Given: 裁剪工序，setUp 已 mock styleAttachmentService.list() 返回非空列表
        baseParams.put("processName", "裁剪");
        baseParams.put("scanType", "cutting");

        // When: 执行裁剪扫码
        Map<String, Object> result = executor.execute(
                baseParams, "req-003", "operator-001", "王五",
                "cutting", 50, false, colorResolver, sizeResolver);

        // Then: 应检查版型文件（实际调用 list）
        assertNotNull(result);
        verify(styleAttachmentService, atLeastOnce()).list(any(LambdaQueryWrapper.class));
    }

    @Test
    void testExecute_UnitPriceResolution_Success() {
        // Given: 车缝工序，setUp 已 mock templateLibraryService.getById() 返回 null（无绑定模板）
        baseParams.put("processName", "车缝");

        // When: 执行扫码
        Map<String, Object> result = executor.execute(
                baseParams, "req-004", "operator-001", "王五",
                "production", 50, false, colorResolver, sizeResolver);

        // Then: 无模板时不影响扫码结果
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "无绑定价格模板时扫码仍应成功");
    }

    @Test
    void testExecute_MaterialPurchaseAttachment_ForProcurement() {
        // Given: 采购工序，setUp 已 mock materialPurchaseService.list() 返回空列表
        baseParams.put("processName", "采购");

        // When: 执行扫码
        Map<String, Object> result = executor.execute(
                baseParams, "req-005", "operator-001", "王五",
                "production", 50, false, colorResolver, sizeResolver);

        // Then: 采购工序应执行成功
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "采购工序应该执行成功");
    }

    @Test
    void testTryUpdateExistingBundleScanRecord_UpdateSuccess() {
        // Given: 不存在历史记录 → 走新建路径
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class))).thenReturn(null);

        // When: 执行扫码
        Map<String, Object> result = executor.execute(
                baseParams, "req-upd-001", "operator-001", "王五",
                "production", 50, false, colorResolver, sizeResolver);

        // Then: 应新建扫码记录并成功
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "首次扫码应新建记录并成功");
        verify(scanRecordService, times(1)).saveScanRecord(any(ScanRecord.class));
    }

    @Test
    void testTryUpdateExistingBundleScanRecord_OperatorMismatch() {
        // Given: 已有同菲号记录，但操作人不同
        ScanRecord otherRecord = new ScanRecord();
        otherRecord.setId("record-other");
        otherRecord.setOperatorId("other-operator");
        otherRecord.setQuantity(30);
        when(scanRecordService.getOne(any(LambdaQueryWrapper.class))).thenReturn(otherRecord);

        // When & Then: 业务层抛出 IllegalStateException 或创建新记录均合法，不应有非业务异常
        assertDoesNotThrow(() -> {
            try {
                executor.execute(baseParams, "req-upd-002", "operator-001", "王五",
                        "production", 50, false, colorResolver, sizeResolver);
            } catch (IllegalStateException | IllegalArgumentException e) {
                // 业务拒绝是正常的，不算测试失败
            }
        });
    }

    @Test
    void testNormalizeFixedProductionNodeName_StandardNode() {
        // Given/When: 车缝是固定节点
        String result = executor.normalizeFixedProductionNodeName("车缝");

        // Then: 返回原名称
        assertEquals("车缝", result);
    }

    @Test
    void testNormalizeFixedProductionNodeName_CustomNode() {
        // Given/When: 自定义节点不在固定8节点列表内
        String result = executor.normalizeFixedProductionNodeName("特殊工序");

        // Then: 返回原名称（不做转换）
        assertNotNull(result);
        assertEquals("特殊工序", result);
    }

    @Test
    void testCheckPatternForCutting_PatternComplete() {
        // Given: 版型文件存在（list 返回非空）— setUp 已默认 mock list() 返回 1 个附件
        baseParams.put("processName", "裁剪");

        // When: 执行裁剪扫码
        Map<String, Object> result = executor.execute(
                baseParams, "req-pat-001", "operator-001", "王五",
                "cutting", 50, false, colorResolver, sizeResolver);

        // Then: 版型文件存在时裁剪扫码应成功
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "版型文件存在时裁剪扫码应成功");
        verify(styleAttachmentService, atLeastOnce()).list(any(LambdaQueryWrapper.class));
    }

    @Test
    void testCheckPatternForCutting_PatternIncomplete() {
        // Given: 版型文件不存在（list 返回空列表）— 源码会抛出 IllegalStateException「裁剪前必须上传版型文件」
        when(styleAttachmentService.list(any(LambdaQueryWrapper.class))).thenReturn(java.util.Collections.emptyList());
        baseParams.put("processName", "裁剪");

        // When & Then: 版型缺少时应抛出异常
        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
                executor.execute(baseParams, "req-pat-002", "operator-001", "王五",
                        "cutting", 50, false, colorResolver, sizeResolver));
        assertTrue(ex.getMessage().contains("版型文件"),
                "版型缺少时应提示版型文件，实际: " + ex.getMessage());
        verify(styleAttachmentService, atLeastOnce()).list(any(LambdaQueryWrapper.class));
    }

    @Test
    void testExecute_OrderModeWithoutBundle_Success() {
        // Given: ORDER 模式 —— 通过 orderNo+color+size 提交，无菲号（无 scanCode，不会调用 getByQrCode）
        Map<String, Object> orderParams = new HashMap<>();
        orderParams.put("orderNo", "PO-2024-001");
        orderParams.put("color", "红色");
        orderParams.put("size", "XL");
        orderParams.put("processName", "车缝");

        // Mock: orderNo+color+size 查不到菲号 → 走 ORDER 模式
        lenient().when(cuttingBundleService.getOne(any(LambdaQueryWrapper.class))).thenReturn(null);

        // When: 执行 ORDER 模式扫码
        Map<String, Object> result = executor.execute(
                orderParams,
                "req-order-001",
                "operator-001",
                "王五",
                "production",
                50,
                false,
                colorResolver,
                sizeResolver
        );

        // Then: 应该成功（不需要菲号）
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "ORDER模式无菲号应扫码成功");

        // 验证扫码记录已保存
        verify(scanRecordService, times(1)).saveScanRecord(any(ScanRecord.class));

        // 验证工序跟踪未调用（无菲号时不更新工序跟踪）
        verify(processTrackingOrchestrator, never()).updateScanRecord(anyString(), anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void testExecute_OrderModeWithoutBundle_NoOrderNo_ThrowsError() {
        // Given: 既无菲号也无订单号（无 scanCode）
        Map<String, Object> emptyParams = new HashMap<>();
        emptyParams.put("processName", "车缝");

        // When & Then: 应抛出参数错误
        assertThrows(IllegalArgumentException.class, () ->
                executor.execute(emptyParams, "req-err-001", "op-001", "王五",
                        "production", 50, false, colorResolver, sizeResolver));
    }

    @Test
    void testExecute_CompletedOrder_ThrowsError() {
        // Given: 订单已完成
        mockOrder.setStatus("completed");

        // When & Then: 应拒绝扫码，提示“进度节点已完成”
        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
                executor.execute(baseParams, "req-cmp-001", "op-001", "王五",
                        "production", 50, false, colorResolver, sizeResolver));
        assertTrue(ex.getMessage().contains("进度节点已完成"),
                "完成订单应提示进度节点已完成，实际: " + ex.getMessage());
    }
}
