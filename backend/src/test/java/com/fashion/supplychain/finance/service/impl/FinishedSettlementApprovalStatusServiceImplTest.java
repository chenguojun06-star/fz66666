package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.fashion.supplychain.finance.entity.FinishedSettlementApprovalStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class FinishedSettlementApprovalStatusServiceImplTest {

    @Test
    void markApprovedShouldSaveWhenNotExists() {
        FinishedSettlementApprovalStatusServiceImpl service = spy(new FinishedSettlementApprovalStatusServiceImpl());

        doReturn(null).when(service).getOne(any(Wrapper.class), eq(false));
        doReturn(true).when(service).save(any(FinishedSettlementApprovalStatus.class));

        service.markApproved("SETTLE-1001", 200L, "user-1", "审批人A");

        ArgumentCaptor<FinishedSettlementApprovalStatus> captor =
                ArgumentCaptor.forClass(FinishedSettlementApprovalStatus.class);
        verify(service).save(captor.capture());

        FinishedSettlementApprovalStatus saved = captor.getValue();
        assertEquals("SETTLE-1001", saved.getSettlementId());
        assertEquals("approved", saved.getStatus());
        assertEquals("user-1", saved.getApprovedById());
        assertEquals("审批人A", saved.getApprovedByName());
        assertEquals(200L, saved.getTenantId());
        assertNotNull(saved.getApprovedTime());
    }

    @Test
    void markApprovedShouldUpdateWhenExists() {
        FinishedSettlementApprovalStatusServiceImpl service = spy(new FinishedSettlementApprovalStatusServiceImpl());

        FinishedSettlementApprovalStatus existing = new FinishedSettlementApprovalStatus();
        existing.setSettlementId("SETTLE-1002");
        existing.setStatus("pending");

        doReturn(existing).when(service).getOne(any(Wrapper.class), eq(false));
        doReturn(true).when(service).updateById(any(FinishedSettlementApprovalStatus.class));

        service.markApproved("SETTLE-1002", 200L, "user-2", "审批人B");

        ArgumentCaptor<FinishedSettlementApprovalStatus> captor =
                ArgumentCaptor.forClass(FinishedSettlementApprovalStatus.class);
        verify(service).updateById(captor.capture());

        FinishedSettlementApprovalStatus updated = captor.getValue();
        assertEquals("SETTLE-1002", updated.getSettlementId());
        assertEquals("approved", updated.getStatus());
        assertEquals("user-2", updated.getApprovedById());
        assertEquals("审批人B", updated.getApprovedByName());
        assertNotNull(updated.getApprovedTime());
    }

    @Test
    void getApprovalStatusShouldReturnPendingWhenNotExists() {
        FinishedSettlementApprovalStatusServiceImpl service = spy(new FinishedSettlementApprovalStatusServiceImpl());

        doReturn(null).when(service).getOne(any(Wrapper.class), eq(false));

        String status = service.getApprovalStatus("SETTLE-1003", 200L);
        assertEquals("pending", status);
    }

    @Test
    void getApprovalStatusShouldReturnRecordStatusWhenExists() {
        FinishedSettlementApprovalStatusServiceImpl service = spy(new FinishedSettlementApprovalStatusServiceImpl());

        FinishedSettlementApprovalStatus existing = new FinishedSettlementApprovalStatus();
        existing.setStatus("approved");
        doReturn(existing).when(service).getOne(any(Wrapper.class), eq(false));

        String status = service.getApprovalStatus("SETTLE-1004", 200L);
        assertEquals("approved", status);
    }
}
