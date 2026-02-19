package com.fashion.supplychain.finance.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ReconciliationStatusOrchestratorCompatTest {

    @Mock
    private MaterialReconciliationService materialReconciliationService;

    @Mock
    private ShipmentReconciliationService shipmentReconciliationService;

    @InjectMocks
    private ReconciliationStatusOrchestrator orchestrator;

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void updateStatusCompat_updatesMaterialWhenFound() {
        setUser("u", "主管");
        MaterialReconciliation mr = new MaterialReconciliation();
        mr.setId("1");
        mr.setStatus("pending");
        mr.setTenantId(1L);

        when(materialReconciliationService.getById("1")).thenReturn(mr);
        when(materialReconciliationService.updateById(any(MaterialReconciliation.class))).thenReturn(true);

        String msg = orchestrator.updateStatusCompat("1", "approved");
        assertEquals("状态更新成功", msg);

        ArgumentCaptor<MaterialReconciliation> captor = ArgumentCaptor.forClass(MaterialReconciliation.class);
        verify(materialReconciliationService).updateById(captor.capture());
        assertEquals("approved", captor.getValue().getStatus());
        verify(shipmentReconciliationService, never()).updateById(any());
    }

    @Test
    void updateStatusCompat_throwsWhenMissingEverywhere() {
        setUser("u", "主管");
        when(materialReconciliationService.getById("1")).thenReturn(null);
        when(shipmentReconciliationService.getById("1")).thenReturn(null);

        java.util.NoSuchElementException ex = assertThrows(java.util.NoSuchElementException.class,
                () -> orchestrator.updateStatusCompat("1", "approved"));
        assertEquals("对账单不存在", ex.getMessage());
    }

    private static void setUser(String username, String role) {
        UserContext ctx = new UserContext();
        ctx.setUsername(username);
        ctx.setRole(role);
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }
}
