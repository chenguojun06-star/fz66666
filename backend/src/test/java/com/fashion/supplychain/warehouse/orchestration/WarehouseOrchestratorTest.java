package com.fashion.supplychain.warehouse.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.mapper.MaterialDatabaseMapper;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.mapper.ProductOutstockMapper;
import com.fashion.supplychain.production.mapper.ProductWarehousingMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.dto.LowStockItemDTO;
import com.fashion.supplychain.warehouse.dto.RecentOperationDTO;
import com.fashion.supplychain.warehouse.dto.TrendDataPointDTO;
import com.fashion.supplychain.warehouse.dto.WarehouseStatsDTO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 仓库模块编排器单元测试
 * 覆盖：WarehouseDashboardOrchestrator / FinishedInventoryOrchestrator
 */
@ExtendWith(MockitoExtension.class)
class WarehouseOrchestratorTest {

    // ===== WarehouseDashboardOrchestrator =====

    @InjectMocks
    private WarehouseDashboardOrchestrator warehouseDashboard;

    @Mock
    private MaterialDatabaseMapper materialDatabaseMapper;

    @Mock
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Mock
    private ProductWarehousingMapper productWarehousingMapper;

    @Mock
    private MaterialStockMapper materialStockMapper;

    @Mock
    private ProductOutstockMapper productOutstockMapper;

    // ===== FinishedInventoryOrchestrator deps =====

    @Mock
    private ProductSkuService productSkuService;

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private StyleAttachmentService styleAttachmentService;

    @Mock
    private ProductionOrderService productionOrderService;

    @BeforeEach
    void setUp() {
        UserContext.clear();
    }

    // ─────────────────────────── WarehouseDashboardOrchestrator ───────────────────────────

    @Test
    void getWarehouseStats_withZeroData_returnsDefaultStats() {
        when(materialDatabaseMapper.selectCount(any())).thenReturn(0L);
        when(productWarehousingMapper.selectTotalQuantity()).thenReturn(null);
        when(materialPurchaseMapper.selectTodayArrivalCount(any())).thenReturn(0);
        when(productWarehousingMapper.selectTodayInboundCount(any())).thenReturn(0);
        when(materialStockMapper.selectCount(any())).thenReturn(0L);
        when(materialStockMapper.selectMaps(any())).thenReturn(Collections.emptyList());
        when(productOutstockMapper.selectCount(any())).thenReturn(0L);

        WarehouseStatsDTO result = warehouseDashboard.getWarehouseStats();

        assertThat(result).isNotNull();
        assertThat(result.getMaterialCount()).isEqualTo(0);
        assertThat(result.getFinishedCount()).isEqualTo(0);
        assertThat(result.getTodayInbound()).isEqualTo(0);
        assertThat(result.getTodayOutbound()).isEqualTo(0);
    }

    @Test
    void getWarehouseStats_withActualCounts_reflectsAllFields() {
        when(materialDatabaseMapper.selectCount(any())).thenReturn(15L);
        when(productWarehousingMapper.selectTotalQuantity()).thenReturn(300);
        when(materialPurchaseMapper.selectTodayArrivalCount(any())).thenReturn(3);
        when(productWarehousingMapper.selectTodayInboundCount(any())).thenReturn(2);
        when(materialStockMapper.selectCount(any())).thenReturn(4L);
        when(materialStockMapper.selectMaps(any())).thenReturn(Collections.emptyList());
        when(productOutstockMapper.selectCount(any())).thenReturn(1L);

        WarehouseStatsDTO result = warehouseDashboard.getWarehouseStats();

        assertThat(result.getMaterialCount()).isEqualTo(15);
        assertThat(result.getFinishedCount()).isEqualTo(300);
        assertThat(result.getLowStockCount()).isEqualTo(4);
        assertThat(result.getTodayInbound()).isEqualTo(5); // 3 + 2
    }

    @Test
    void getLowStockItems_withNoLowStock_returnsEmptyList() {
        when(materialStockMapper.selectList(any())).thenReturn(Collections.emptyList());

        List<LowStockItemDTO> result = warehouseDashboard.getLowStockItems();

        assertThat(result).isNotNull().isEmpty();
    }

    @Test
    void getRecentOperations_withNoData_returnsEmptyList() {
        when(materialPurchaseMapper.selectTodayArrivals(any())).thenReturn(Collections.emptyList());
        when(productWarehousingMapper.selectTodayInbound(any())).thenReturn(Collections.emptyList());

        List<RecentOperationDTO> result = warehouseDashboard.getRecentOperations();

        assertThat(result).isNotNull().isEmpty();
    }

    @Test
    void getTrendData_weekRange_returnsNonNullList() {
        // Mockito 默认对返回 List 的方法返回空集合，自定义 mapper 方法不需额外 stub
        List<TrendDataPointDTO> result = warehouseDashboard.getTrendData("week", "inbound");

        assertThat(result).isNotNull();
    }

    @Test
    void getTrendData_monthRange_returnsNonNullList() {
        // Mockito 默认对返回 List 的方法返回空集合，自定义 mapper 方法不需额外 stub
        List<TrendDataPointDTO> result = warehouseDashboard.getTrendData("month", "outbound");

        assertThat(result).isNotNull();
    }

    // ─────────────────────────── FinishedInventoryOrchestrator ───────────────────────────

    @Test
    void getFinishedInventoryPage_withEmptySkus_returnsEmptyPage() {
        FinishedInventoryOrchestrator orchestrator = new FinishedInventoryOrchestrator(
                productSkuService, productWarehousingMapper, productionOrderService, styleInfoService, styleAttachmentService);

        when(productSkuService.page(any(), any())).thenReturn(new Page<>());

        Map<String, Object> params = new HashMap<>();
        params.put("page", "1");
        params.put("pageSize", "20");

        IPage<?> result = orchestrator.getFinishedInventoryPage(params);

        assertThat(result).isNotNull();
        assertThat(result.getRecords()).isEmpty();
    }

    @Test
    void getFinishedInventoryPage_withStyleNoFilter_doesNotThrow() {
        FinishedInventoryOrchestrator orchestrator = new FinishedInventoryOrchestrator(
                productSkuService, productWarehousingMapper, productionOrderService, styleInfoService, styleAttachmentService);

        when(productSkuService.page(any(), any())).thenReturn(new Page<>());

        Map<String, Object> params = new HashMap<>();
        params.put("page", "1");
        params.put("pageSize", "10");
        params.put("styleNo", "FZ2024001");

        IPage<?> result = orchestrator.getFinishedInventoryPage(params);

        assertThat(result).isNotNull();
    }
}
