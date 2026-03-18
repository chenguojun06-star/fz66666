package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.agent.AiTool;
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
        AiTool productionDefinition = new AiTool();
        AiTool.AiFunction productionFunction = new AiTool.AiFunction();
        productionFunction.setName("tool_create_production_order");
        productionDefinition.setFunction(productionFunction);

        AiTool knowledgeDefinition = new AiTool();
        AiTool.AiFunction knowledgeFunction = new AiTool.AiFunction();
        knowledgeFunction.setName("tool_knowledge_search");
        knowledgeDefinition.setFunction(knowledgeFunction);

        when(productionOrderTool.getName()).thenReturn("tool_create_production_order");
        when(productionOrderTool.getToolDefinition()).thenReturn(productionDefinition);
        when(knowledgeTool.getName()).thenReturn("tool_knowledge_search");
        when(knowledgeTool.getToolDefinition()).thenReturn(knowledgeDefinition);

        ReflectionTestUtils.setField(orchestrator, "registeredTools", List.of(productionOrderTool, knowledgeTool));

        orchestrator.init();

        @SuppressWarnings("unchecked")
        Map<String, AgentTool> toolMap = (Map<String, AgentTool>) ReflectionTestUtils.getField(orchestrator, "toolMap");
        @SuppressWarnings("unchecked")
        List<AiTool> apiTools = (List<AiTool>) ReflectionTestUtils.getField(orchestrator, "apiTools");

        assertNotNull(toolMap);
        assertNotNull(apiTools);
        assertEquals(2, toolMap.size());
        assertEquals(2, apiTools.size());
        assertTrue(toolMap.containsKey("tool_create_production_order"));
        assertTrue(toolMap.containsKey("tool_knowledge_search"));
        assertEquals("tool_create_production_order", apiTools.get(0).getFunction().getName());
    }
}
