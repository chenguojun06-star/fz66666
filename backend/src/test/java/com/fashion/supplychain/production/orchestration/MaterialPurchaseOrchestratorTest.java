package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
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
}
