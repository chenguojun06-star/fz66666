package com.fashion.supplychain.intelligence.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.dto.SupplierScorecardResponse;
import com.fashion.supplychain.intelligence.orchestration.SupplierScorecardOrchestrator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.ArrayList;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SupplierScorecardToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private SupplierScorecardOrchestrator supplierScorecardOrchestrator;

    @InjectMocks
    private SupplierScorecardTool tool;

    // ─── helpers ──────────────────────────────────────────────────────────────

    private SupplierScorecardResponse.SupplierScore makeScore(String factory, String tier, double overall) {
        SupplierScorecardResponse.SupplierScore s = new SupplierScorecardResponse.SupplierScore();
        s.setFactoryName(factory);
        s.setTier(tier);
        s.setOverallScore(overall);
        s.setTotalOrders(10);
        s.setCompletedOrders(8);
        s.setOverdueOrders(2);
        s.setOnTimeRate(0.8);
        s.setQualityScore(85.0);
        return s;
    }

    private SupplierScorecardResponse makeResponse(List<SupplierScorecardResponse.SupplierScore> scores) {
        SupplierScorecardResponse resp = new SupplierScorecardResponse();
        resp.setScores(scores);
        resp.setTopCount(2);
        resp.setSummary("综合评估完成");
        return resp;
    }

    // ─── scorecard ───────────────────────────────────────────────────────────

    @Test
    void scorecard_noFilter_returnsAllFactories() throws Exception {
        List<SupplierScorecardResponse.SupplierScore> scores = List.of(
                makeScore("优质厂A", "S", 95.0),
                makeScore("良好厂B", "A", 82.0),
                makeScore("普通厂C", "B", 68.0)
        );
        when(supplierScorecardOrchestrator.scorecard()).thenReturn(makeResponse(scores));

        String result = tool.execute("{\"action\":\"scorecard\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertEquals(3, node.path("data").path("totalEvaluated").asInt());
    }

    @Test
    void scorecard_withTierFilter_returnsFilteredFactories() throws Exception {
        List<SupplierScorecardResponse.SupplierScore> scores = List.of(
                makeScore("优质厂A", "S", 95.0),
                makeScore("良好厂B", "A", 82.0),
                makeScore("普通厂C", "B", 68.0)
        );
        when(supplierScorecardOrchestrator.scorecard()).thenReturn(makeResponse(scores));

        String result = tool.execute("{\"action\":\"scorecard\",\"tier_filter\":\"S\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertEquals(1, node.path("data").path("factories").size());
    }

    // ─── top ─────────────────────────────────────────────────────────────────

    @Test
    void top_defaultN5_returnsSAndATier() throws Exception {
        List<SupplierScorecardResponse.SupplierScore> scores = new ArrayList<>();
        scores.add(makeScore("S级厂1", "S", 96.0));
        scores.add(makeScore("A级厂1", "A", 88.0));
        scores.add(makeScore("B级厂1", "B", 68.0));
        when(supplierScorecardOrchestrator.scorecard()).thenReturn(makeResponse(scores));

        String result = tool.execute("{\"action\":\"top\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        // Only S and A tier should appear
        JsonNode factories = node.path("data").path("topFactories");
        assertTrue(factories.isArray());
        for (JsonNode f : factories) {
            String tier = f.path("tier").asText();
            assertTrue(tier.equals("S") || tier.equals("A"), "tier should be S or A, got: " + tier);
        }
    }

    @Test
    void top_customTopN_limitsResult() throws Exception {
        List<SupplierScorecardResponse.SupplierScore> scores = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            scores.add(makeScore("S级厂" + i, "S", 90.0 - i));
        }
        when(supplierScorecardOrchestrator.scorecard()).thenReturn(makeResponse(scores));

        String result = tool.execute("{\"action\":\"top\",\"top_n\":3}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        assertTrue(node.path("data").path("topFactories").size() <= 3);
    }

    // ─── risk ─────────────────────────────────────────────────────────────────

    @Test
    void risk_withBAndCFactories_returnsThemInReverseOrder() throws Exception {
        // Place B/C at end so reverse iteration picks them
        List<SupplierScorecardResponse.SupplierScore> scores = new ArrayList<>();
        scores.add(makeScore("S级厂", "S", 95.0));
        scores.add(makeScore("C级厂", "C", 55.0));
        scores.add(makeScore("B级厂", "B", 65.0));
        when(supplierScorecardOrchestrator.scorecard()).thenReturn(makeResponse(scores));

        String result = tool.execute("{\"action\":\"risk\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        JsonNode riskFactories = node.path("data").path("riskFactories");
        assertTrue(riskFactories.isArray());
        assertTrue(riskFactories.size() > 0);
        for (JsonNode f : riskFactories) {
            String tier = f.path("tier").asText();
            assertTrue(tier.equals("B") || tier.equals("C"), "risk tier should be B or C, got: " + tier);
        }
    }

    @Test
    void risk_noBOrCFactories_returnsPositiveMessage() throws Exception {
        List<SupplierScorecardResponse.SupplierScore> scores = List.of(
                makeScore("S级厂", "S", 95.0),
                makeScore("A级厂", "A", 88.0)
        );
        when(supplierScorecardOrchestrator.scorecard()).thenReturn(makeResponse(scores));

        String result = tool.execute("{\"action\":\"risk\"}");
        JsonNode node = JSON.readTree(result);

        assertTrue(node.path("ok").asBoolean());
        // Should contain positive message about no risk factories
        String summary = node.path("data").path("summary").asText();
        assertTrue(summary.contains("良好") || node.path("message").asText().contains("良好"),
                "Expected positive message, got: " + result);
    }

    // ─── unknown action ───────────────────────────────────────────────────────

    @Test
    void unknownAction_returnsError() throws Exception {
        String result = tool.execute("{\"action\":\"delete\"}");
        assertFalse(JSON.readTree(result).path("ok").asBoolean());
    }
}
