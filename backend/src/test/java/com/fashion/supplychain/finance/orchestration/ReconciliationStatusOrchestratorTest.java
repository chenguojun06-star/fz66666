package com.fashion.supplychain.finance.orchestration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import java.time.LocalDateTime;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
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
    private MaterialReconciliationService materialReconciliationService;

    @Mock
    private ShipmentReconciliationService shipmentReconciliationService;

    @InjectMocks
    private ReconciliationStatusOrchestrator orchestrator;

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @BeforeAll
    static void initLambdaCache() {
        // returnToPrevious 方法内部使用 LambdaUpdateWrapper，需要预先注册实体的 lambda 缓存
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        TableInfoHelper.initTableInfo(assistant, MaterialReconciliation.class);
        TableInfoHelper.initTableInfo(assistant, ShipmentReconciliation.class);
    }

    @Test
    void updateMaterialStatus_blocksBackwardTransition() {
        setUser("u", "主管");

        MaterialReconciliation mr = new MaterialReconciliation();
        mr.setId("1");
        mr.setStatus("paid");
        mr.setTenantId(1L);
        when(materialReconciliationService.getById("1")).thenReturn(mr);

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> orchestrator.updateMaterialStatus("1", "approved"));
        assertEquals("不允许回退状态，请使用退回操作", ex.getMessage());
        verify(materialReconciliationService, never()).updateById(any(MaterialReconciliation.class));
    }

    @Test
    void updateShipmentStatus_blocksRejectWhenNotSupervisor() {
        setUser("u", "user");

        ShipmentReconciliation sr = new ShipmentReconciliation();
        sr.setId("1");
        sr.setStatus("pending");
        sr.setTenantId(1L);
        when(shipmentReconciliationService.getById("1")).thenReturn(sr);

        AccessDeniedException ex = assertThrows(AccessDeniedException.class,
                () -> orchestrator.updateShipmentStatus("1", "rejected"));
        assertEquals("仅主管级别及以上可执行驳回", ex.getMessage());
        verify(shipmentReconciliationService, never()).updateById(any(ShipmentReconciliation.class));
    }

    @Test
    void updateShipmentStatus_updatesStatusOnForwardTransition() {
        setUser("u", "主管");

        ShipmentReconciliation sr = new ShipmentReconciliation();
        sr.setId("1");
        sr.setStatus("pending");
        sr.setTenantId(1L);
        when(shipmentReconciliationService.getById("1")).thenReturn(sr);
        when(shipmentReconciliationService.updateById(any(ShipmentReconciliation.class))).thenReturn(true);

        String msg = orchestrator.updateShipmentStatus("1", "approved");
        assertEquals("状态更新成功", msg);

        ArgumentCaptor<ShipmentReconciliation> captor = ArgumentCaptor.forClass(ShipmentReconciliation.class);
        verify(shipmentReconciliationService).updateById(captor.capture());
        ShipmentReconciliation saved = captor.getValue();
        assertEquals("approved", saved.getStatus());
        assertNotNull(saved.getApprovedAt());
        assertTrue(saved.getRemark().contains("[STATUS]"));
    }

    @Test
    void updateShipmentStatus_blocksBackwardTransition() {
        setUser("u", "主管");

        ShipmentReconciliation sr = new ShipmentReconciliation();
        sr.setId("1");
        sr.setStatus("paid");
        sr.setTenantId(1L);
        when(shipmentReconciliationService.getById("1")).thenReturn(sr);

        IllegalStateException ex = assertThrows(IllegalStateException.class,
                () -> orchestrator.updateShipmentStatus("1", "approved"));
        assertEquals("不允许回退状态，请使用退回操作", ex.getMessage());
        verify(shipmentReconciliationService, never()).updateById(any(ShipmentReconciliation.class));
    }

    @Test
    void updateShipmentStatus_resetsAuditTimesWhenRejectedToPending() {
        setUser("u", "主管");

        ShipmentReconciliation sr = new ShipmentReconciliation();
        sr.setId("1");
        sr.setStatus("rejected");
        sr.setTenantId(1L);
        sr.setVerifiedAt(LocalDateTime.now().minusDays(3));
        sr.setApprovedAt(LocalDateTime.now().minusDays(2));
        sr.setPaidAt(LocalDateTime.now().minusDays(1));
        when(shipmentReconciliationService.getById("1")).thenReturn(sr);
        when(shipmentReconciliationService.updateById(any(ShipmentReconciliation.class))).thenReturn(true);

        String msg = orchestrator.updateShipmentStatus("1", "pending");
        assertEquals("状态更新成功", msg);

        ArgumentCaptor<ShipmentReconciliation> captor = ArgumentCaptor.forClass(ShipmentReconciliation.class);
        verify(shipmentReconciliationService).updateById(captor.capture());
        ShipmentReconciliation saved = captor.getValue();
        assertEquals("pending", saved.getStatus());
        assertNull(saved.getVerifiedAt());
        assertNull(saved.getApprovedAt());
        assertNull(saved.getPaidAt());
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
        mr.setTenantId(1L);
        when(materialReconciliationService.getById("1")).thenReturn(mr);
        // returnToPrevious 内部使用 LambdaUpdateWrapper 调 update()，不是 updateById()
        when(materialReconciliationService.update(any())).thenReturn(true);

        String msg = orchestrator.returnMaterialToPrevious("1", "原因");
        assertEquals("退回成功", msg);

        // 直接验证 mr 对象被修改（与 LambdaUpdateWrapper 里的 set 对应）
        assertEquals("pending", mr.getStatus());
        assertNotNull(mr.getUpdateTime());
        assertTrue(mr.getRemark().startsWith("old\n"));
        assertTrue(mr.getRemark().contains("[tom]"));
        assertTrue(mr.getRemark().contains("[RETURN]"));
        assertTrue(mr.getRemark().contains("原因"));
        verify(materialReconciliationService).update(any());
    }

    @Test
    void returnShipmentToPrevious_updatesStatusAndReReviewWhenFromPaid() {
        setUser("tom", "主管");

        ShipmentReconciliation sr = new ShipmentReconciliation();
        sr.setId("1");
        sr.setStatus("paid");
        sr.setTenantId(1L);
        sr.setPaidAt(LocalDateTime.now().minusDays(1));
        when(shipmentReconciliationService.getById("1")).thenReturn(sr);
        // returnToPrevious 内部使用 LambdaUpdateWrapper 调 update()，不是 updateById()
        when(shipmentReconciliationService.update(any())).thenReturn(true);

        String msg = orchestrator.returnShipmentToPrevious("1", "原因");
        assertEquals("退回成功", msg);

        // 直接验证 sr 对象被修改
        assertEquals("approved", sr.getStatus());
        assertNull(sr.getPaidAt());
        assertNotNull(sr.getReReviewAt());
        assertEquals("原因", sr.getReReviewReason());
        assertTrue(sr.getRemark().contains("[tom]"));
        assertTrue(sr.getRemark().contains("[RETURN]"));
        verify(shipmentReconciliationService).update(any());
    }

    private static void setUser(String username, String role) {
        UserContext ctx = new UserContext();
        ctx.setUsername(username);
        ctx.setRole(role);
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }
}
