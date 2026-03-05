package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.style.service.ProductSkuService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.NoSuchElementException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductOutstockOrchestratorTest {

    @Mock
    private ProductOutstockService productOutstockService;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Mock
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Mock
    private ProductSkuService productSkuService;

    // webhookPushService 是 @Autowired(required=false)，不注入

    @InjectMocks
    private ProductOutstockOrchestrator orchestrator;

    // ---- getById ----

    @Test
    void getById_nullId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.getById(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("参数错误");
    }

    @Test
    void getById_blankId_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.getById("  "))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void getById_notFound_throwsNoSuchElement() {
        when(productOutstockService.getById("OUT001")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.getById("OUT001"))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("出库单不存在");
    }

    @Test
    void getById_deletedRecord_throwsNoSuchElement() {
        ProductOutstock outstock = new ProductOutstock();
        outstock.setId("OUT001");
        outstock.setDeleteFlag(1);
        when(productOutstockService.getById("OUT001")).thenReturn(outstock);

        assertThatThrownBy(() -> orchestrator.getById("OUT001"))
                .isInstanceOf(NoSuchElementException.class);
    }

    @Test
    void getById_validRecord_returnsOutstock() {
        ProductOutstock outstock = new ProductOutstock();
        outstock.setId("OUT001");
        outstock.setDeleteFlag(0);
        when(productOutstockService.getById("OUT001")).thenReturn(outstock);

        ProductOutstock result = orchestrator.getById("OUT001");

        assertThat(result).isNotNull();
        assertThat(result.getId()).isEqualTo("OUT001");
    }

    // ---- save ----

    @Test
    void save_nullOutstock_throwsIllegalArgument() {
        assertThatThrownBy(() -> orchestrator.save(null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("参数错误");
    }

    @Test
    void save_validOutstock_returnTrue() {
        ProductOutstock outstock = new ProductOutstock();
        outstock.setId("OUT002");
        outstock.setOrderNo("PO001");
        outstock.setOutstockNo("OUT2026001");
        when(productOutstockService.saveOutstockAndValidate(outstock)).thenReturn(true);

        boolean result = orchestrator.save(outstock);

        assertThat(result).isTrue();
    }

    @Test
    void save_serviceReturnsFalse_throwsIllegalState() {
        ProductOutstock outstock = new ProductOutstock();
        outstock.setId("OUT003");
        when(productOutstockService.saveOutstockAndValidate(outstock)).thenReturn(false);

        assertThatThrownBy(() -> orchestrator.save(outstock))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("保存失败");
    }
}
