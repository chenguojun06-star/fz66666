package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.intelligence.entity.WorkflowDefinition;
import com.fashion.supplychain.intelligence.entity.WorkflowExecution;
import com.fashion.supplychain.intelligence.mapper.WorkflowDefinitionMapper;
import com.fashion.supplychain.intelligence.mapper.WorkflowExecutionMapper;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowExecutionOrchestrator {

    private final WorkflowDefinitionMapper definitionMapper;
    private final WorkflowExecutionMapper executionMapper;
    private final IntelligenceInferenceOrchestrator inferenceOrchestrator;
    private final ObjectMapper objectMapper;

    @Data
    public static class WorkflowNode {
        private String id;
        private String type;
        private Map<String, Object> config;
    }

    @Data
    public static class WorkflowEdge {
        private String source;
        private String target;
        private String condition;
    }

    @Data
    public static class WorkflowDag {
        private List<WorkflowNode> nodes;
        private List<WorkflowEdge> edges;
    }

    @Data
    public static class WorkflowContext {
        private Map<String, Object> variables = new HashMap<>();
        private Map<String, Object> nodeResults = new HashMap<>();
        private String currentNodeId;
    }

    public WorkflowExecution execute(String workflowId, Long tenantId, String userId, Map<String, Object> inputVariables) {
        WorkflowDefinition def = definitionMapper.selectById(workflowId);
        if (def == null || def.getEnabled() != 1) {
            throw new IllegalStateException("Workflow not found or disabled: " + workflowId);
        }

        WorkflowExecution execution = new WorkflowExecution();
        execution.setId(UUID.randomUUID().toString());
        execution.setTenantId(tenantId);
        execution.setUserId(userId);
        execution.setWorkflowId(workflowId);
        execution.setStatus("running");
        execution.setCreatedAt(LocalDateTime.now());
        executionMapper.insert(execution);

        try {
            WorkflowDag dag = objectMapper.readValue(def.getDagJson(), WorkflowDag.class);
            WorkflowContext context = new WorkflowContext();
            if (inputVariables != null) context.getVariables().putAll(inputVariables);

            List<String> executionOrder = topologicalSort(dag);
            for (String nodeId : executionOrder) {
                WorkflowNode node = dag.getNodes().stream()
                        .filter(n -> n.getId().equals(nodeId)).findFirst().orElse(null);
                if (node == null) continue;

                execution.setCurrentNodeId(nodeId);
                execution.setUpdatedAt(LocalDateTime.now());
                executionMapper.updateById(execution);

                executeNode(node, context);
                context.setCurrentNodeId(nodeId);
            }

            execution.setStatus("completed");
            execution.setResultJson(objectMapper.writeValueAsString(context.getNodeResults()));
        } catch (Exception e) {
            execution.setStatus("failed");
            execution.setErrorMessage(e.getMessage());
            log.warn("[WorkflowExecution] failed: {}", e.getMessage());
        }
        execution.setUpdatedAt(LocalDateTime.now());
        executionMapper.updateById(execution);
        return execution;
    }

    private void executeNode(WorkflowNode node, WorkflowContext context) {
        try {
            switch (node.getType()) {
                case "llm" -> executeLlmNode(node, context);
                case "condition" -> { }
                case "parallel" -> { }
                default -> log.info("[WorkflowExecution] Unknown node type: {}", node.getType());
            }
        } catch (Exception e) {
            log.warn("[WorkflowExecution] executeNode {} failed: {}", node.getId(), e.getMessage());
        }
    }

    private void executeLlmNode(WorkflowNode node, WorkflowContext context) {
        String prompt = String.valueOf(node.getConfig().getOrDefault("prompt", ""));
        String scene = String.valueOf(node.getConfig().getOrDefault("scene", "daily-brief"));
        var result = inferenceOrchestrator.chat(scene, prompt, "");
        context.getNodeResults().put(node.getId(), result.getContent());
    }

    private List<String> topologicalSort(WorkflowDag dag) {
        Map<String, List<String>> adj = new HashMap<>();
        Map<String, Integer> inDegree = new HashMap<>();
        Set<String> allNodes = dag.getNodes().stream().map(WorkflowNode::getId).collect(Collectors.toSet());

        for (String nodeId : allNodes) {
            adj.put(nodeId, new ArrayList<>());
            inDegree.put(nodeId, 0);
        }
        for (WorkflowEdge edge : dag.getEdges()) {
            adj.get(edge.getSource()).add(edge.getTarget());
            inDegree.merge(edge.getTarget(), 1, Integer::sum);
        }

        Queue<String> queue = new LinkedList<>();
        for (Map.Entry<String, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) queue.add(entry.getKey());
        }

        List<String> result = new ArrayList<>();
        while (!queue.isEmpty()) {
            String current = queue.poll();
            result.add(current);
            for (String next : adj.get(current)) {
                int newDegree = inDegree.get(next) - 1;
                inDegree.put(next, newDegree);
                if (newDegree == 0) queue.add(next);
            }
        }
        return result;
    }
}
