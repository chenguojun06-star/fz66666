package com.fashion.supplychain.production.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.MaterialPurchaseMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

@ExtendWith(MockitoExtension.class)
class ProductionOrderProgressOrchestrationServiceTest {

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private MaterialPurchaseMapper materialPurchaseMapper;

    @Mock
    private ScanRecordMapper scanRecordMapper;

    @Mock
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @InjectMocks
    private ProductionOrderProgressOrchestrationService service;

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void rollback_requiresRemark() {
        when(scanRecordDomainService.clampPercent(10)).thenReturn(10);

        ProductionOrder existed = new ProductionOrder();
        existed.setId("o1");
        existed.setDeleteFlag(0);
        existed.setProductionProgress(20);
        existed.setStyleNo("S1");
        when(productionOrderService.getById("o1")).thenReturn(existed);

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.updateProductionProgress("o1", 10, " ", null));
        assertEquals("请填写问题点", ex.getMessage());
    }

    @Test
    void rollback_requiresSupervisor() {
        UserContext ctx = new UserContext();
        ctx.setRole("user");
        UserContext.set(ctx);

        when(scanRecordDomainService.clampPercent(10)).thenReturn(10);

        ProductionOrder existed = new ProductionOrder();
        existed.setId("o1");
        existed.setDeleteFlag(0);
        existed.setProductionProgress(20);
        existed.setStyleNo("S1");
        when(productionOrderService.getById("o1")).thenReturn(existed);

        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> service.updateProductionProgress("o1", 10, "原因", null));
        assertEquals("无权限退回环节", ex.getMessage());
    }

    @Test
    void forwardJump_requiresSupervisor() {
        UserContext ctx = new UserContext();
        ctx.setRole("user");
        UserContext.set(ctx);

        when(scanRecordDomainService.clampPercent(80)).thenReturn(80);
        when(scanRecordDomainService.resolveProgressNodes("S1")).thenReturn(List.of("下单", "采购", "裁剪", "车缝"));
        when(scanRecordDomainService.getNodeIndexFromProgress(4, 10)).thenReturn(0);
        when(scanRecordDomainService.getNodeIndexFromProgress(4, 80)).thenReturn(3);

        ProductionOrder existed = new ProductionOrder();
        existed.setId("o1");
        existed.setDeleteFlag(0);
        existed.setProductionProgress(10);
        existed.setStyleNo("S1");
        when(productionOrderService.getById("o1")).thenReturn(existed);

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> service.updateProductionProgress("o1", 80, null, null));
        assertEquals("仅允许推进到下一环节", ex.getMessage());
    }
}

