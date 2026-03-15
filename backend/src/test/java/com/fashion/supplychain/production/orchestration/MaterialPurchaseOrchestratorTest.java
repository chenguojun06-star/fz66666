package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.production.entity.MaterialOutboundLog;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.mapper.MaterialOutboundLogMapper;
import com.fashion.supplychain.production.service.MaterialPickingService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MaterialPurchaseOrchestratorTest {

    @InjectMocks
    MaterialPurchaseOrchestrator orchestrator;

    @Mock MaterialPurchaseService materialPurchaseService;
    @Mock ProductionOrderService productionOrderService;
    @Mock ProductionOrderOrchestrator productionOrderOrchestrator;
    @Mock ProductionOrderScanRecordDomainService scanRecordDomainService;
    @Mock MaterialReconciliationOrchestrator materialReconciliationOrchestrator;
    @Mock MaterialPurchaseOrchestratorHelper helper;
    @Mock MaterialStockService materialStockService;
    @Mock MaterialPickingService materialPickingService;
    @Mock MaterialOutboundLogMapper materialOutboundLogMapper;

    @Test
    void list_delegatesToService() {
        when(materialPurchaseService.queryPage(any())).thenReturn(new Page<>());
        assertThat(orchestrator.list(Map.of())).isNotNull();
    }

    @Test
    void getById_withBlankId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.getById(""))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void save_withNullParam_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.save(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void delete_withBlankId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.delete(""))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void confirmPickingOutbound_writesOutboundLogAndUpdatesStockDate() {
        MaterialPicking picking = new MaterialPicking();
        picking.setId("pick-1");
        picking.setPickingNo("MPK001");
        picking.setStatus("pending");
        picking.setPickerId("user-1");
        picking.setPickerName("仓管员");

        MaterialPickingItem item = new MaterialPickingItem();
        item.setMaterialStockId("stock-1");
        item.setMaterialCode("FAB001");
        item.setMaterialName("主面料");
        item.setQuantity(12);

        MaterialStock stock = new MaterialStock();
        stock.setId("stock-1");
        stock.setMaterialCode("FAB001");
        stock.setMaterialName("主面料");
        stock.setLocation("A-01");

        when(materialPickingService.getById("pick-1")).thenReturn(picking);
        when(materialPickingService.getItemsByPickingId("pick-1")).thenReturn(List.of(item));
        when(materialStockService.getById("stock-1")).thenReturn(stock);

        orchestrator.confirmPickingOutbound("pick-1");

        verify(materialStockService).decreaseStockById("stock-1", 12);
        verify(materialOutboundLogMapper).insert(any(MaterialOutboundLog.class));
        verify(materialStockService).updateById(any(MaterialStock.class));
        verify(materialPickingService).updateById(eq(picking));
    }
}
