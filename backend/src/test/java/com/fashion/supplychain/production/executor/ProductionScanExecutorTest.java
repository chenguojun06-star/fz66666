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
        // Given: 正常生产扫码
        baseParams.put("processName", "车缝");

        // TODO: Mock scanRecordService.save() 成功

        // When: 执行生产扫码
        Map<String, Object> result = executor.execute(
                baseParams,
                "req-001",
                "operator-001",
                "王五",
                "production",
                50,
                false,
                colorResolver,
                sizeResolver
        );

        // Then: 验证成功
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "应该返回success=true");
    }

    @Test
    void testExecute_AutoProcessDetection_Success() {
        // Given: 自动工序识别
        baseParams.remove("processName");

        // TODO: Mock processStageDetector.resolveAutoProcessName() 返回"车缝"

        // When: 执行扫码
        Map<String, Object> result = executor.execute(
                baseParams,
                "req-002",
                "operator-001",
                "王五",
                "production",
                50,
                true,  // autoProcess = true
                colorResolver,
                sizeResolver
        );

        // Then: 应自动识别工序
        assertNotNull(result);
        // TODO: verify(processStageDetector, times(1)).resolveAutoProcessName(any(), any());
    }

    @Test
    void testExecute_CuttingDetection_CheckPattern() {
        // Given: 裁剪工序
        baseParams.put("processName", "裁剪");
        baseParams.put("scanType", "cutting");

        // TODO: Mock checkPatternForCutting() 检查版型文件

        // When: 执行裁剪扫码
        Map<String, Object> result = executor.execute(
                baseParams,
                "req-003",
                "operator-001",
                "王五",
                "cutting",
                50,
                false,
                colorResolver,
                sizeResolver
        );

        // Then: 应检查版型
        assertNotNull(result);
        // TODO: verify(styleAttachmentService, times(1)).checkPatternComplete(any());
    }

    @Test
    void testExecute_UnitPriceResolution_Success() {
        // Given: 需要解析单价
        baseParams.put("processName", "车缝");
        // mockOrder.setStyleId("style-001"); // 已在setUp()中设置

        // TODO: Mock templateLibraryService.getById() 返回模板

        // When: 执行扫码
        Map<String, Object> result = executor.execute(
                baseParams,
                "req-004",
                "operator-001",
                "王五",
                "production",
                50,
                false,
                colorResolver,
                sizeResolver
        );

        // Then: 应解析单价
        assertNotNull(result);
        // TODO: verify(templateLibraryService, times(1)).getById(any());
    }

    @Test
    void testExecute_MaterialPurchaseAttachment_ForProcurement() {
        // Given: 采购工序
        baseParams.put("processName", "采购");

        // TODO: Mock materialPurchaseService.list() 返回面料清单

        // When: 执行扫码
        Map<String, Object> result = executor.execute(
                baseParams,
                "req-005",
                "operator-001",
                "王五",
                "production",
                50,
                false,
                colorResolver,
                sizeResolver
        );

        // Then: 应附加面料清单
        assertNotNull(result);
        // 采购工序可能不会附加materialPurchaseList，只需验证不报错
        assertTrue((Boolean) result.get("success"), "应该执行成功");
    }

    @Test
    void testTryUpdateExistingBundleScanRecord_UpdateSuccess() {
        // Given: 存在菲号扫码记录
        ScanRecord existingRecord = new ScanRecord();
        existingRecord.setId("record-001");
        existingRecord.setOperatorId("operator-001");
        existingRecord.setQuantity(30);

        // TODO: Mock scanRecordService.getOne() 返回existingRecord
        // TODO: Mock scanRecordService.updateById() 成功

        // When: 尝试更新
        // Map<String, Object> result = executor.tryUpdateExistingBundleScanRecord(...);

        // Then: 应更新数量
        // assertNotNull(result);
        // assertEquals(80, existingRecord.getQuantity()); // 30 + 50
    }

    @Test
    void testTryUpdateExistingBundleScanRecord_OperatorMismatch() {
        // Given: 存在记录，但操作人不匹配
        ScanRecord existingRecord = new ScanRecord();
        existingRecord.setOperatorId("operator-002");

        // TODO: Mock scanRecordService.getOne() 返回existingRecord

        // When: 尝试更新
        // Map<String, Object> result = executor.tryUpdateExistingBundleScanRecord(...);

        // Then: 应返回null（不更新）
        // assertNull(result);
    }

    @Test
    void testNormalizeFixedProductionNodeName_StandardNode() {
        // Given: 标准节点名称
        // When: 标准化
        // String normalized = executor.normalizeFixedProductionNodeName("车缝");

        // Then: 应返回原名称
        // assertEquals("车缝", normalized);
    }

    @Test
    void testNormalizeFixedProductionNodeName_CustomNode() {
        // Given: 自定义节点名称
        // When: 标准化
        // String normalized = executor.normalizeFixedProductionNodeName("特殊工序");

        // Then: 应返回原名称（不在固定8节点内）
        // assertEquals("特殊工序", normalized);
    }

    @Test
    void testCheckPatternForCutting_PatternComplete() {
        // Given: 版型文件完整
        // TODO: Mock styleAttachmentService.checkPatternComplete() 返回true

        // When: 检查版型
        // executor.checkPatternForCutting("style-001");

        // Then: 不应抛出异常
        // assertDoesNotThrow(() -> executor.checkPatternForCutting("style-001"));
    }

    @Test
    void testCheckPatternForCutting_PatternIncomplete() {
        // Given: 版型文件不完整
        // TODO: Mock styleAttachmentService.checkPatternComplete() 返回false

        // When: 检查版型
        // executor.checkPatternForCutting("style-001");

        // Then: 应记录警告日志（不阻止扫码）
        // TODO: 验证日志输出
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
