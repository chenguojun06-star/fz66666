package com.fashion.supplychain.finance.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.FactoryReconciliation;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.service.FactoryReconciliationService;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

@ExtendWith(MockitoExtension.class)
class ReconciliationStatusOrchestratorTest {

    @Mock
    private FactoryReconciliationService factoryReconciliationService;

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
    void updateFactoryStatus_returnsParamErrorWhenMissingParams() {
        IllegalArgumentException ex1 = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.updateFactoryStatus(null, "verified"));
        assertEquals("参数错误", ex1.getMessage());

        IllegalArgumentException ex2 = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.updateFactoryStatus(" ", "verified"));
        assertEquals("参数错误", ex2.getMessage());

        IllegalArgumentException ex3 = assertThrows(IllegalArgumentException.class,
                () -> orchestrator.updateFactoryStatus("id", " "));
        assertEquals("参数错误", ex3.getMessage());
    }

    @Test
    void updateFactoryStatus_blocksRejectWhenNotSupervisor() {
        setUser("u", "user");

        FactoryReconciliation fr = new FactoryReconciliation();
        fr.setId("1");
        fr.setStatus("pending");
        when(factoryReconciliationService.getById("1")).thenReturn(fr);

        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.updateFactoryStatus("1", "rejected"));
        assertEquals("仅主管级别及以上可执行驳回", ex.getMessage());
        verify(factoryReconciliationService, never()).updateById(any(FactoryReconciliation.class));
    }

    @Test
    void updateFactoryStatus_updatesStatusOnForwardTransition() {
        setUser("u", "主管");

        FactoryReconciliation fr = new FactoryReconciliation();
        fr.setId("1");
        fr.setStatus("pending");
        when(factoryReconciliationService.getById("1")).thenReturn(fr);
        when(factoryReconciliationService.updateById(any(FactoryReconciliation.class))).thenReturn(true);

        String msg = orchestrator.updateFactoryStatus("1", "verified");
        assertEquals("状态更新成功", msg);

        ArgumentCaptor<FactoryReconciliation> captor = ArgumentCaptor.forClass(FactoryReconciliation.class);
        verify(factoryReconciliationService).updateById(captor.capture());
        FactoryReconciliation saved = captor.getValue();
        assertEquals("verified", saved.getStatus());
        assertNotNull(saved.getVerifiedAt());
    }

    @Test
    void updateMaterialStatus_blocksBackwardTransition() {
        setUser("u", "主管");

        MaterialReconciliation mr = new MaterialReconciliation();
        mr.setId("1");
        mr.setStatus("approved");
        when(materialReconciliationService.getById("1")).thenReturn(mr);

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> orchestrator.updateMaterialStatus("1", "verified"));
        assertEquals("不允许回退状态，请使用退回操作", ex.getMessage());
        verify(materialReconciliationService, never()).updateById(any(MaterialReconciliation.class));
    }

    @Test
    void returnMaterialToPrevious_requiresSupervisor() {
        setUser("u", "user");

        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.returnMaterialToPrevious("1", "原因"));
        assertEquals("仅主管级别及以上可执行退回", ex.getMessage());
        verify(materialReconciliationService, never()).getById(any());
    }

    @Test
    void returnMaterialToPrevious_updatesStatusAndRemark() {
        setUser("tom", "主管");

        MaterialReconciliation mr = new MaterialReconciliation();
        mr.setId("1");
        mr.setStatus("approved");
        mr.setRemark("old");
        when(materialReconciliationService.getById("1")).thenReturn(mr);
        when(materialReconciliationService.updateById(any(MaterialReconciliation.class))).thenReturn(true);

        String msg = orchestrator.returnMaterialToPrevious("1", "原因");
        assertEquals("退回成功", msg);

        ArgumentCaptor<MaterialReconciliation> captor = ArgumentCaptor.forClass(MaterialReconciliation.class);
        verify(materialReconciliationService).updateById(captor.capture());

        MaterialReconciliation saved = captor.getValue();
        assertEquals("verified", saved.getStatus());
        assertNotNull(saved.getUpdateTime());
        assertTrue(saved.getRemark().startsWith("old\n"));
        assertTrue(saved.getRemark().contains("[tom]"));
        assertTrue(saved.getRemark().contains("[RETURN]"));
        assertTrue(saved.getRemark().contains("原因"));
    }

    private static void setUser(String username, String role) {
        UserContext ctx = new UserContext();
        ctx.setUsername(username);
        ctx.setRole(role);
        UserContext.set(ctx);
    }
}
