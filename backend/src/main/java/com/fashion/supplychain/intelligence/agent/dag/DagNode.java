package com.fashion.supplychain.intelligence.agent.dag;

import lombok.Data;

import java.util.*;

@Data
public class DagNode {

    private String id;
    private String name;
    private String description;
    private List<String> dependsOn = new ArrayList<>();
    private int timeoutMs = 60000;
    private int retryCount = 0;
    private boolean optional = false;
    private Map<String, Object> config = new HashMap<>();

    public DagNode() {}

    public DagNode(String id, String name, String... dependsOn) {
        this.id = id;
        this.name = name;
        this.dependsOn = Arrays.asList(dependsOn);
    }

    public boolean hasNoDependencies() {
        return dependsOn == null || dependsOn.isEmpty();
    }

    public boolean dependsOn(String nodeId) {
        return dependsOn != null && dependsOn.contains(nodeId);
    }
}
