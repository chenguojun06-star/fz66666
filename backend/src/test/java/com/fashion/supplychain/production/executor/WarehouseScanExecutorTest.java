package com.fashion.supplychain.production.executor;

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
 * WarehouseScanExecutor 单元测试
 * 测试范围：仓库入库流程 + 次品阻止逻辑
 */
@ExtendWith(MockitoExtension.class)
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
        mockOrder.setQuantity(100);

        // Mock 菲号
        mockBundle = new CuttingBundle();
        mockBundle.setId("bundle-001");
        mockBundle.setOrderId("order-001");
        mockBundle.setQuantity(50);

        // 解析器
        colorResolver = (unused) -> "红色";
        sizeResolver = (unused) -> "XL";
    }

    @Test
    void testExecute_WarehouseScan_Success() {
        // Given: 正常入库场景
        baseParams.put("warehouse", "仓库A");

        // TODO: Mock scanRecordService.save() 成功
        // TODO: Mock productionOrderService.recomputeProgressFromRecords()

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
        assertEquals("success", result.get("status"));

        // TODO: verify(scanRecordService, times(1)).save(any(ScanRecord.class));
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
    void testExecute_WarehouseScan_BundleHasDefect() {
        // Given: 菲号有次品状态（待返修）
        mockBundle.setStatus("unqualified");

        // TODO: Mock isBundleBlockedForWarehousingStatus() 返回true

        // When & Then: 应阻止入库
        // RuntimeException exception = assertThrows(RuntimeException.class, () -> {
        //     executor.execute(baseParams, "req-003", "operator-001", "李四", mockOrder, colorResolver, sizeResolver);
        // });
        // assertTrue(exception.getMessage().contains("次品"));
    }

    @Test
    void testExecute_WarehouseScan_ExceedOrderQuantity() {
        // Given: 入库数量超过订单数量
        mockBundle.setQuantity(200); // 订单只有100

        // TODO: Mock inventoryValidator.validateNotExceedOrderQuantity() 抛出异常

        // When & Then: 应抛出异常
        // assertThrows(RuntimeException.class, () -> {
        //     executor.execute(baseParams, "req-004", "operator-001", "李四", mockOrder, colorResolver, sizeResolver);
        // });
    }

    @Test
    void testExecute_WarehouseScan_DuplicateHandling() {
        // Given: 重复扫码
        // TODO: Mock scanRecordService.save() 抛出DuplicateKeyException

        // When: 执行入库
        // Map<String, Object> result = executor.execute(...);

        // Then: 应忽略重复，返回成功
        // assertEquals("success", result.get("status"));
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
    void testFindWarehousingGeneratedRecord_Exists() {
        // Given: 存在入库记录
        // TODO: Mock scanRecordService.getOne() 返回记录

        // When: 查找记录
        // ScanRecord record = executor.findWarehousingGeneratedRecord("order-001", "bundle-001");

        // Then: 应找到
        // assertNotNull(record);
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
}
