package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.service.FinishedProductSettlementExportService;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import com.fashion.supplychain.finance.service.FinishedSettlementApprovalStatusService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.HashMap;
import java.util.Map;
import java.util.Objects;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@ExtendWith(MockitoExtension.class)
class FinishedProductSettlementControllerTest {

    private MockMvc mockMvc;

    @Mock
    private FinishedProductSettlementService settlementService;

    @Mock
    private FinishedProductSettlementExportService exportService;

    @Mock
    private FinishedSettlementApprovalStatusService approvalStatusService;

    @InjectMocks
    private FinishedProductSettlementController controller;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        UserContext ctx = new UserContext();
        ctx.setUserId("u-test-1");
        ctx.setUsername("测试审批人");
        ctx.setTenantId(100L);
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void shouldApproveThenReturnApprovedStatus() throws Exception {
        String settlementId = "SETTLE-001";

        FinishedProductSettlement settlement = new FinishedProductSettlement();
        settlement.setTenantId(100L);
        when(settlementService.getById(settlementId)).thenReturn(settlement);
        when(approvalStatusService.getApprovalStatus(settlementId, 100L)).thenReturn("approved");

        Map<String, String> approveReq = new HashMap<>();
        approveReq.put("id", settlementId);

        mockMvc.perform(post("/api/finance/finished-settlement/approve")
                .contentType(Objects.requireNonNull(MediaType.APPLICATION_JSON))
                .content(Objects.requireNonNull(objectMapper.writeValueAsString(approveReq))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200));

        verify(approvalStatusService).markApproved(
                eq(settlementId),
                eq(100L),
                eq("u-test-1"),
                eq("测试审批人")
        );

        mockMvc.perform(get("/api/finance/finished-settlement/approval-status/" + settlementId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(settlementId))
                .andExpect(jsonPath("$.data.status").value("approved"));

        verify(approvalStatusService).getApprovalStatus(settlementId, 100L);
    }

    @Test
    void shouldReturnPendingWhenStatusServiceReturnsPending() throws Exception {
        String settlementId = "SETTLE-002";
        when(approvalStatusService.getApprovalStatus(settlementId, 100L)).thenReturn("pending");

        mockMvc.perform(get("/api/finance/finished-settlement/approval-status/" + settlementId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value(settlementId))
                .andExpect(jsonPath("$.data.status").value("pending"));

        verify(approvalStatusService).getApprovalStatus(settlementId, 100L);
    }
}
