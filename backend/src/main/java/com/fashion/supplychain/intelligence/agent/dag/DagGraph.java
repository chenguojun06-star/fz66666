package com.fashion.supplychain.intelligence.agent.dag;

import lombok.Data;

import java.util.*;

@Data
public class DagGraph {

    private String id;
    private String name;
    private String description;
    private LinkedHashMap<String, DagNode> nodes = new LinkedHashMap<>();

    public DagGraph() {}

    public DagGraph(String id, String name) {
        this.id = id;
        this.name = name;
    }

    public DagGraph addNode(DagNode node) {
        nodes.put(node.getId(), node);
        return this;
    }

    public DagNode getNode(String nodeId) {
        return nodes.get(nodeId);
    }

    public Collection<DagNode> allNodes() {
        return nodes.values();
    }

    public List<String> topologicalOrder() {
        List<String> result = new ArrayList<>();
        Set<String> visited = new HashSet<>();
        Set<String> visiting = new HashSet<>();

        for (String nodeId : nodes.keySet()) {
            visit(nodeId, visited, visiting, result);
        }
        return result;
    }

    private void visit(String nodeId, Set<String> visited, Set<String> visiting, List<String> result) {
        if (visited.contains(nodeId)) return;
        if (visiting.contains(nodeId)) {
            throw new IllegalStateException("DAG循环检测: 节点 " + nodeId + " 存在循环依赖");
        }
        visiting.add(nodeId);
        DagNode node = nodes.get(nodeId);
        if (node != null && node.getDependsOn() != null) {
            for (String dep : node.getDependsOn()) {
                if (nodes.containsKey(dep)) {
                    visit(dep, visited, visiting, result);
                }
            }
        }
        visiting.remove(nodeId);
        visited.add(nodeId);
        result.add(nodeId);
    }

    public List<List<String>> executionLayers() {
        Map<String, Integer> layerMap = new HashMap<>();
        for (String nodeId : topologicalOrder()) {
            DagNode node = nodes.get(nodeId);
            int maxDepLayer = -1;
            if (node.getDependsOn() != null) {
                for (String dep : node.getDependsOn()) {
                    Integer depLayer = layerMap.get(dep);
                    if (depLayer != null && depLayer > maxDepLayer) {
                        maxDepLayer = depLayer;
                    }
                }
            }
            layerMap.put(nodeId, maxDepLayer + 1);
        }

        int maxLayer = layerMap.values().stream().max(Integer::compare).orElse(0);
        List<List<String>> layers = new ArrayList<>();
        for (int i = 0; i <= maxLayer; i++) {
            layers.add(new ArrayList<>());
        }
        layerMap.forEach((nodeId, layer) -> layers.get(layer).add(nodeId));
        return layers;
    }

    public static DagGraph fullAnalysisGraph() {
        return new DagGraph("full-analysis", "全量分析图")
                .addNode(new DagNode("digital_twin", "数字孪生"))
                .addNode(new DagNode("supervisor", "主管路由", "digital_twin"))
                .addNode(new DagNode("production_specialist", "生产专家", "supervisor"))
                .addNode(new DagNode("finance_specialist", "财务专家", "supervisor"))
                .addNode(new DagNode("warehouse_specialist", "仓储专家", "supervisor"))
                .addNode(new DagNode("style_specialist", "款式专家", "supervisor"))
                .addNode(new DagNode("reflection", "反思引擎", "production_specialist", "finance_specialist", "warehouse_specialist", "style_specialist"))
                .addNode(new DagNode("decision", "决策闭环", "reflection"));
    }

    public static DagGraph quickAnalysisGraph() {
        return new DagGraph("quick-analysis", "快速分析图")
                .addNode(new DagNode("digital_twin", "数字孪生"))
                .addNode(new DagNode("supervisor", "主管路由", "digital_twin"))
                .addNode(new DagNode("reflection", "反思引擎", "supervisor"))
                .addNode(new DagNode("decision", "决策闭环", "reflection"));
    }

    public static DagGraph productionOnlyGraph() {
        return new DagGraph("production-only", "生产专项图")
                .addNode(new DagNode("digital_twin", "数字孪生"))
                .addNode(new DagNode("supervisor", "主管路由", "digital_twin"))
                .addNode(new DagNode("production_specialist", "生产专家", "supervisor"))
                .addNode(new DagNode("reflection", "反思引擎", "production_specialist"))
                .addNode(new DagNode("decision", "决策闭环", "reflection"));
    }
}
