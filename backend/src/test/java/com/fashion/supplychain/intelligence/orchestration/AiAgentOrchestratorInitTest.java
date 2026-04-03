package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.tool.AgentTool;
import com.fashion.supplychain.intelligence.service.AiContextBuilderService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiAgentOrchestratorInitTest {

    @Mock
    private AiCriticOrchestrator criticOrchestrator;

    @Mock
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    @Mock
    private AiContextBuilderService aiContextBuilderService;

    @Mock
    private AiMemoryOrchestrator aiMemoryOrchestrator;

    @Mock
    private IntelligenceMemoryOrchestrator intelligenceMemoryOrchestrator;

    @Mock
    private AgentTool productionOrderTool;

    @Mock
    private AgentTool knowledgeTool;

    @InjectMocks
    private AiAgentOrchestrator orchestrator;

    @Test
    void init_registersAllAgentToolsIncludingProductionOrderTool() {
        when(productionOrderTool.getName()).thenReturn("tool_create_production_order");
        when(knowledgeTool.getName()).thenReturn("tool_knowledge_search");

        ReflectionTestUtils.setField(orchestrator, "registeredTools", List.of(productionOrderTool, knowledgeTool));

        orchestrator.init();

        @SuppressWarnings("unchecked")
        Map<String, AgentTool> toolMap = (Map<String, AgentTool>) ReflectionTestUtils.getField(orchestrator, "toolMap");

        assertNotNull(toolMap);
        assertEquals(2, toolMap.size());
        assertTrue(toolMap.containsKey("tool_create_production_order"));
        assertTrue(toolMap.containsKey("tool_knowledge_search"));
    }
}
