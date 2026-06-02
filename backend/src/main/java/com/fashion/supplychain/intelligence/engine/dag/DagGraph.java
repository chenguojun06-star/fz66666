package com.fashion.supplychain.intelligence.engine.dag;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Data
@NoArgsConstructor
public class DagGraph {

    private final Map<String, DagNode> nodes = new LinkedHashMap<>();
    private final List<DagEdge> edges = new ArrayList<>();
    private String entryNodeId;
    private String exitNodeId;

    public DagGraph addNode(DagNode node) {
        if (entryNodeId == null) entryNodeId = node.getId();
        nodes.put(node.getId(), node);
        return this;
    }

    public DagGraph addEdge(String from, String to) {
        edges.add(new DagEdge(from, to, null, null));
        return this;
    }

    public DagGraph addEdge(String from, String to, String conditionKey, Object expectedValue) {
        edges.add(new DagEdge(from, to, conditionKey, expectedValue));
        return this;
    }

    public DagGraph setExitNode(String id) {
        this.exitNodeId = id;
        return this;
    }

    public List<String> topologicalOrder() {
        Map<String, Integer> inDegree = new HashMap<>();
        Map<String, List<String>> outAdj = new HashMap<>();
        for (String id : nodes.keySet()) {
            inDegree.put(id, 0);
            outAdj.put(id, new ArrayList<>());
        }
        for (DagEdge e : edges) {
            if (nodes.containsKey(e.getFromNode()) && nodes.containsKey(e.getToNode())) {
                inDegree.merge(e.getToNode(), 1, Integer::sum);
                outAdj.get(e.getFromNode()).add(e.getToNode());
            }
        }
        List<String> queue = new ArrayList<>();
        for (Map.Entry<String, Integer> e : inDegree.entrySet()) {
            if (e.getValue() == 0) queue.add(e.getKey());
        }
        List<String> order = new ArrayList<>();
        while (!queue.isEmpty()) {
            String cur = queue.remove(0);
            order.add(cur);
            for (String next : outAdj.get(cur)) {
                int newDeg = inDegree.merge(next, -1, Integer::sum);
                if (newDeg == 0) queue.add(next);
            }
        }
        if (order.size() != nodes.size()) {
            throw new IllegalStateException("DAG has cycle: visited=" + order.size() + " expected=" + nodes.size());
        }
        return order;
    }

    public List<List<String>> topologicalLayers() {
        Map<String, Integer> inDegree = new HashMap<>();
        Map<String, List<String>> outAdj = new HashMap<>();
        for (String id : nodes.keySet()) {
            inDegree.put(id, 0);
            outAdj.put(id, new ArrayList<>());
        }
        for (DagEdge e : edges) {
            if (nodes.containsKey(e.getFromNode()) && nodes.containsKey(e.getToNode())) {
                inDegree.merge(e.getToNode(), 1, Integer::sum);
                outAdj.get(e.getFromNode()).add(e.getToNode());
            }
        }
        List<List<String>> layers = new ArrayList<>();
        List<String> current = new ArrayList<>();
        for (Map.Entry<String, Integer> e : inDegree.entrySet()) {
            if (e.getValue() == 0) current.add(e.getKey());
        }
        Set<String> visited = new HashSet<>();
        while (!current.isEmpty()) {
            layers.add(new ArrayList<>(current));
            visited.addAll(current);
            List<String> next = new ArrayList<>();
            for (String node : current) {
                for (String neighbor : outAdj.get(node)) {
                    int newDeg = inDegree.merge(neighbor, -1, Integer::sum);
                    if (newDeg == 0 && !visited.contains(neighbor)) next.add(neighbor);
                }
            }
            current = next;
        }
        if (visited.size() != nodes.size()) {
            throw new IllegalStateException("DAG has cycle: visited=" + visited.size() + " expected=" + nodes.size());
        }
        return layers;
    }

    public List<String> downstreamOf(String nodeId) {
        List<String> downstream = new ArrayList<>();
        for (DagEdge e : edges) {
            if (e.getFromNode().equals(nodeId)) downstream.add(e.getToNode());
        }
        return downstream;
    }

    public int nodeCount() {
        return nodes.size();
    }
}
