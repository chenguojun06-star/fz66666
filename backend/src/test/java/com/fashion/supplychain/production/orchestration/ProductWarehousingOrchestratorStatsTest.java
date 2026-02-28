package com.fashion.supplychain.production.orchestration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import java.util.Map;
import com.fashion.supplychain.production.service.ProductWarehousingService;

@SpringBootTest
public class ProductWarehousingOrchestratorStatsTest {

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Test
    public void testGetStats() {
        System.out.println("====== STARTING WAREHOUSING SERVICE TEST ======");
        try {
            Map<String, Object> stats = productWarehousingService.getWarehousingStats();
            System.out.println("SERVICE STATS RESULT: " + (stats != null ? stats.getClass().getName() : "null"));
            if (stats != null) {
                for (Map.Entry<String, Object> entry : stats.entrySet()) {
                    System.out.println("KEY: " + entry.getKey() + " | VALUE TYPE: " + 
                        (entry.getValue() != null ? entry.getValue().getClass().getName() : "null") + 
                        " | VALUE: " + entry.getValue());
                }
            }
        } catch (Exception e) {
            System.err.println("EXCEPTION IN SERVICE: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
