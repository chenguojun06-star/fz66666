package com.fashion.supplychain.production.controller;

import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.orchestration.CuttingTaskOrchestrator;
import com.fashion.supplychain.production.service.CuttingTaskService;
import java.util.List;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class CuttingTaskControllerTest {

    private MockMvc mockMvc;

    @Mock
    private CuttingTaskOrchestrator cuttingTaskOrchestrator;

    @Mock
    private CuttingTaskService cuttingTaskService;

    @InjectMocks
    private CuttingTaskController controller;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void shouldCreateCustomCuttingTask() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("styleNo", "TPL-001");
        body.put("orderNo", "CUT-ORDER-001");
        body.put("orderDate", "2026-03-15");
        body.put("deliveryDate", "2026-03-25");
        body.put("orderLines", List.of(
            Map.of("color", "黑色", "size", "XL", "quantity", 120),
            Map.of("color", "白色", "size", "L", "quantity", 50)));

        CuttingTask task = new CuttingTask();
        task.setId("task-1");
        task.setProductionOrderId("order-1");
        task.setProductionOrderNo("CUT-ORDER-001");
        task.setStyleNo("TPL-001");
        task.setColor("多色");
        task.setSize("多码");
        task.setOrderQuantity(170);
        task.setStatus("pending");

        when(cuttingTaskOrchestrator.createCustom(anyMap())).thenReturn(task);

        mockMvc.perform(post("/api/production/cutting-task/custom/create")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value(200))
                .andExpect(jsonPath("$.data.id").value("task-1"))
                .andExpect(jsonPath("$.data.productionOrderNo").value("CUT-ORDER-001"))
                .andExpect(jsonPath("$.data.styleNo").value("TPL-001"))
                .andExpect(jsonPath("$.data.color").value("多色"))
                .andExpect(jsonPath("$.data.size").value("多码"))
                .andExpect(jsonPath("$.data.orderQuantity").value(170))
                .andExpect(jsonPath("$.data.status").value("pending"));

        verify(cuttingTaskOrchestrator).createCustom(anyMap());
    }
}
