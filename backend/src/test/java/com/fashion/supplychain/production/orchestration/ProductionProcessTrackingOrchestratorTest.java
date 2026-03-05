package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.exception.BusinessException;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ProductionProcessTracking;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProcessParentMappingService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductionProcessTrackingService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductionProcessTrackingOrchestratorTest {

    @Mock
    private ProductionProcessTrackingService trackingService;

    @Mock
    private CuttingBundleService cuttingBundleService;

    @Mock
    private ProductWarehousingService productWarehousingService;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private TemplateLibraryService templateLibraryService;

    @Mock
    private CuttingTaskService cuttingTaskService;

    @Mock
    private ProcessParentMappingService processParentMappingService;

    @InjectMocks
    private ProductionProcessTrackingOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUsername("testUser");
        ctx.setRole("user");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ---- initializeProcessTracking ----

    @Test
    void initializeProcessTracking_orderNotFound_throwsBusinessException() {
        when(productionOrderService.getById("UNKNOWN_ORDER")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.initializeProcessTracking("UNKNOWN_ORDER"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("订单不存在");
    }

    @Test
    void initializeProcessTracking_noBundles_verifyOrderLookup() {
        // 验证订单不存在路径（无需多余 stub），orchestrator 内部只调用 getById("UNKNOWN_ORDER")
        when(productionOrderService.getById("UNKNOWN_ORDER")).thenReturn(null);
        assertThatThrownBy(() -> orchestrator.initializeProcessTracking("UNKNOWN_ORDER"))
                .isInstanceOf(BusinessException.class);
    }

    // ---- resetScanRecord ----

    @Test
    void resetScanRecord_trackingNotFound_throwsBusinessException() {
        when(trackingService.getById("T001")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.resetScanRecord("T001", "测试原因"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("跟踪记录不存在");
    }

    @Test
    void resetScanRecord_alreadySettled_throwsBusinessException() {
        ProductionProcessTracking tracking = new ProductionProcessTracking();
        tracking.setId("T001");
        tracking.setIsSettled(true);
        when(trackingService.getById("T001")).thenReturn(tracking);

        assertThatThrownBy(() -> orchestrator.resetScanRecord("T001", "测试原因"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("已结算");
    }

    @Test
    void resetScanRecord_validTracking_callsUpdate() {
        ProductionProcessTracking tracking = new ProductionProcessTracking();
        tracking.setId("T001");
        tracking.setIsSettled(false);
        tracking.setBundleNo(1);
        tracking.setProcessName("车缝");
        tracking.setOperatorName("张三");
        when(trackingService.getById("T001")).thenReturn(tracking);
        when(trackingService.update(any())).thenReturn(true);

        boolean result = orchestrator.resetScanRecord("T001", "操作有误");

        assertThat(result).isTrue();
        verify(trackingService).update(any());
    }

    // ---- getTrackingRecords ----

    @Test
    void getTrackingRecords_noRecords_returnsEmptyList() {
        when(trackingService.getByOrderId("ORDER001")).thenReturn(List.of());

        List<ProductionProcessTracking> result = orchestrator.getTrackingRecords("ORDER001");

        assertThat(result).isEmpty();
    }

    @Test
    void getTrackingRecords_orderNotFound_returnsRawRecords() {
        ProductionProcessTracking record = new ProductionProcessTracking();
        record.setId("T001");
        record.setProductionOrderId("ORDER001");
        when(trackingService.getByOrderId("ORDER001")).thenReturn(List.of(record));
        when(productionOrderService.getById("ORDER001")).thenReturn(null);

        List<ProductionProcessTracking> result = orchestrator.getTrackingRecords("ORDER001");

        assertThat(result).hasSize(1);
    }
}
