package com.fashion.supplychain.production.orchestration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.springframework.security.test.context.support.WithMockUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@SpringBootTest
@AutoConfigureMockMvc
public class FinalOrchestratorTest {
    private static final Logger log = LoggerFactory.getLogger(FinalOrchestratorTest.class);

    @Autowired
    private MockMvc mockMvc;

    @Test
    @WithMockUser
    public void testControllerEndpoint() {
        log.error("====== TESTING CONTROLLER ENDPOINT ======");
        try {
            String response = mockMvc.perform(get("/api/production/product-warehousing/stats"))
                .andReturn().getResponse().getContentAsString();
            log.error("CONTROLLER RESPONSE: {}", response);
        } catch (Exception e) {
            log.error("Crashed at HTTP level: ", e);
        }
    }
}
