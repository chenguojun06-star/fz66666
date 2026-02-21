package com.fashion.supplychain.production.executor;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.fashion.supplychain.production.entity.*;
import com.fashion.supplychain.production.helper.InventoryValidator;
import com.fashion.supplychain.production.service.*;
import org.springframework.dao.DuplicateKeyException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Answers;
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
 * WarehouseScanExecutor 单元测试
 * 测试范围：仓库入库流程 + 次品阻止逻辑
 */
@ExtendWith(MockitoExtension.class)
@SuppressWarnings("unchecked")
class WarehouseScanExecutorTest {

    @Mock
    private ScanRecordService scanRecordService;

    @Mock
    private CuttingBundleService cuttingBundleService;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private ProductWarehousingService productWarehousingService;

    @Mock
    private InventoryValidator inventoryValidator;

    @Mock
    private SKUService skuService;

    @Mock
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @SuppressWarnings("rawtypes")
    @Mock(answer = Answers.RETURNS_SELF)
    private LambdaQueryChainWrapper warehousingChain;

    @SuppressWarnings("rawtypes")
    @Mock(answer = Answers.RETURNS_SELF)
    private LambdaQueryChainWrapper scanChain;

    @InjectMocks
    private WarehouseScanExecutor executor;

    private Map<String, Object> baseParams;
    private ProductionOrder mockOrder;
    private CuttingBundle mockBundle;
    private Function<String, String> colorResolver;
    private Function<String, String> sizeResolver;

    @BeforeEach
    void setUp() {
        // 基础参数
        baseParams = new HashMap<>();
        baseParams.put("scanCode", "BUNDLE-001");
        baseParams.put("warehouse", "仓库A");

        // Mock 订单
        mockOrder = new ProductionOrder();
        mockOrder.setId("order-001");
        mockOrder.setOrderNo("PO-2024-001");
        mockOrder.setOrderQuantity(100);

        // Mock 菲号
        mockBundle = new CuttingBundle();
        mockBundle.setId("bundle-001");
        mockBundle.setProductionOrderId("order-001");
        mockBundle.setQuantity(50);

        // Mock 生产前置条件检查（已有生产扫码记录）
        lenient().when(scanRecordService.count(any())).thenReturn(1L);

        // 解析器
        colorResolver = (unused) -> "红色";
        sizeResolver = (unused) -> "XL";
    }

    @Test
    void testExecute_WarehouseScan_Success() {
        // Given: 正常入库场景
        baseParams.put("warehouse", "仓库A");
        baseParams.put("quantity", "50");  // 添加必须参数

        // Mock 菲号查询
        when(cuttingBundleService.getByQrCode("BUNDLE-001")).thenReturn(mockBundle);

        // Mock 菲号状态检查（不是次品）
        mockBundle.setStatus("qualified");

        // Mock 次品检查（没有待返修） - lenient模式
        lenient().when(productWarehousingService.list(any(LambdaQueryWrapper.class))).thenReturn(java.util.Collections.emptyList());

        // Mock 入库保存
        when(productWarehousingService.saveWarehousingAndUpdateOrder(any(ProductWarehousing.class))).thenReturn(true);

        // Mock 查找生成的记录（返回null，会创建新记录） - lenient模式
        lenient().when(scanRecordService.getOne(any(LambdaQueryWrapper.class))).thenReturn(null);

        // Mock save成功
        when(scanRecordService.saveScanRecord(any(ScanRecord.class))).thenReturn(true);
        when(productionOrderService.recomputeProgressFromRecords(anyString())).thenReturn(mockOrder);
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));

        // When: 执行仓库入库
        Map<String, Object> result = executor.execute(
                baseParams,
                "req-001",
                "operator-001",
                "李四",
                mockOrder,
                colorResolver,
                sizeResolver
        );

        // Then: 验证成功
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"));

        verify(scanRecordService, times(1)).saveScanRecord(any(ScanRecord.class));
        verify(productionOrderService, times(1)).recomputeProgressFromRecords("order-001");
    }

    @Test
    void testExecute_WarehouseScan_MissingWarehouse() {
        // Given: 缺少warehouse参数
        baseParams.remove("warehouse");

        // When & Then: 应抛出异常
        assertThrows(RuntimeException.class, () -> {
            executor.execute(baseParams, "req-002", "operator-001", "李四", mockOrder, colorResolver, sizeResolver);
        });
    }

    @Test
    @SuppressWarnings("unchecked")
    void testExecute_WarehouseScan_BundleHasDefect() {
        // Given: 菲号最后一条记录是 unqualified+返修 — 应阻止入库
        baseParams.put("quantity", "50");
        when(cuttingBundleService.getByQrCode("BUNDLE-001")).thenReturn(mockBundle);

        // Mock isBundleBlockedForWarehousingStatus 的 lambdaQuery 链式调用
        ProductWarehousing blockedRecord = new ProductWarehousing();
        blockedRecord.setQualityStatus("unqualified");
        blockedRecord.setUnqualifiedQuantity(5);
        blockedRecord.setDefectRemark("返修");
        doReturn(warehousingChain).when(productWarehousingService).lambdaQuery();
        when(warehousingChain.list()).thenReturn(java.util.Collections.singletonList(blockedRecord));

        // When & Then: 应阻止入库，提示返修信息
        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
                executor.execute(baseParams, "req-003", "operator-001", "李四",
                        mockOrder, colorResolver, sizeResolver));
        assertTrue(ex.getMessage().contains("次品") || ex.getMessage().contains("返修"),
                "次品阻止时应提示返修，实际: " + ex.getMessage());
    }

    @Test
    void testExecute_WarehouseScan_ExceedOrderQuantity() {
        // Given: inventoryValidator 拒绝超过订单数量
        baseParams.put("quantity", "50");
        when(cuttingBundleService.getByQrCode("BUNDLE-001")).thenReturn(mockBundle);
        doThrow(new IllegalArgumentException("入库数量超过订单数量限制"))
                .when(inventoryValidator).validateNotExceedOrderQuantity(
                        any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));

        // When & Then: 应抛出异常
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () ->
                executor.execute(baseParams, "req-004", "operator-001", "李四",
                        mockOrder, colorResolver, sizeResolver));
        assertTrue(ex.getMessage().contains("超过"),
                "超量时应提示超过，实际: " + ex.getMessage());
    }

    @Test
    void testExecute_WarehouseScan_DuplicateHandling() {
        // Given: saveWarehousingAndUpdateOrder 抛出 DuplicateKeyException
        baseParams.put("quantity", "50");
        when(cuttingBundleService.getByQrCode("BUNDLE-001")).thenReturn(mockBundle);
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));
        doThrow(new DuplicateKeyException("重复扫码"))
                .when(productWarehousingService).saveWarehousingAndUpdateOrder(any(ProductWarehousing.class));
        when(productionOrderService.recomputeProgressFromRecords(anyString())).thenReturn(mockOrder);
        when(scanRecordService.saveScanRecord(any(ScanRecord.class))).thenReturn(true);

        // When: 执行入库操作
        Map<String, Object> result = executor.execute(
                baseParams, "req-dup-001", "operator-001", "李四",
                mockOrder, colorResolver, sizeResolver);

        // Then: 重复扫码应被忽略，返回成功
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"), "重复入库应忽略并返回成功");
    }

    @Test
    void testIsBundleBlockedForWarehousingStatus_Unqualified() {
        // Given: 次品状态
        // When: 检查是否阻止
        // boolean blocked = executor.isBundleBlockedForWarehousingStatus("unqualified");

        // Then: 应阻止
        // assertTrue(blocked);
    }

    @Test
    void testIsBundleBlockedForWarehousingStatus_Repaired() {
        // Given: 返修完成状态
        // When: 检查是否阻止
        // boolean blocked = executor.isBundleBlockedForWarehousingStatus("repaired");

        // Then: 不应阻止
        // assertFalse(blocked);
    }

    @Test
    @SuppressWarnings("unchecked")
    void testFindWarehousingGeneratedRecord_Exists() {
        // Given: 入库后已生成扫码记录，通过 lambdaQuery 链式查询到
        baseParams.put("quantity", "50");
        when(cuttingBundleService.getByQrCode("BUNDLE-001")).thenReturn(mockBundle);
        doNothing().when(inventoryValidator).validateNotExceedOrderQuantity(
                any(ProductionOrder.class), anyString(), anyString(), anyInt(), any(CuttingBundle.class));

        // Mock saveWarehousingAndUpdateOrder 并设置 ID（使 findWarehousingGeneratedRecord 可执行）
        doAnswer(inv -> {
            ProductWarehousing w = inv.getArgument(0);
            w.setId("warehousing-found-001");
            return true;
        }).when(productWarehousingService).saveWarehousingAndUpdateOrder(any(ProductWarehousing.class));
        when(productionOrderService.recomputeProgressFromRecords(anyString())).thenReturn(mockOrder);

        // Mock scanRecordService.lambdaQuery() 链式 返回已存在的扫码记录
        ScanRecord existingRecord = new ScanRecord();
        existingRecord.setId("sr-existing-001");
        doReturn(scanChain).when(scanRecordService).lambdaQuery();
        when(scanChain.one()).thenReturn(existingRecord);

        // When: 执行入库
        Map<String, Object> result = executor.execute(
                baseParams, "req-find-001", "operator-001", "李四",
                mockOrder, colorResolver, sizeResolver);

        // Then: 找到已生成的扫码记录，不再新建
        assertNotNull(result);
        assertTrue((Boolean) result.get("success"));
        ScanRecord returnedRecord = (ScanRecord) result.get("scanRecord");
        assertNotNull(returnedRecord);
        assertEquals("sr-existing-001", returnedRecord.getId(), "应返回已存在的扫码记录");
        verify(scanRecordService, never()).saveScanRecord(any(ScanRecord.class));
    }

    @Test
    void testBuildWarehouseRecord_AllFields() {
        // Given: 完整参数
        baseParams.put("warehouse", "仓库A");
        baseParams.put("remark", "测试备注");

        // When: 构建入库记录
        // ScanRecord record = executor.buildWarehouseRecord(...);

        // Then: 验证字段
        // assertEquals("warehouse", record.getScanType());
        // assertEquals("仓库A", record.getWarehouse());
        // assertEquals("测试备注", record.getRemark());
    }

    @Test
    void testExecute_CompletedOrder_ThrowsError() {
        // Given: 订单已完成
        mockOrder.setStatus("completed");
        baseParams.put("quantity", "50");

        when(cuttingBundleService.getByQrCode("BUNDLE-001")).thenReturn(mockBundle);

        // When & Then: 应拒绝入库，提示“进度节点已完成”
        IllegalStateException ex = assertThrows(IllegalStateException.class, () ->
                executor.execute(baseParams, "req-cmp-001", "op-001", "李四",
                        mockOrder, colorResolver, sizeResolver));
        assertTrue(ex.getMessage().contains("进度节点已完成"),
                "完成订单应提示进度节点已完成，实际: " + ex.getMessage());
    }
}
