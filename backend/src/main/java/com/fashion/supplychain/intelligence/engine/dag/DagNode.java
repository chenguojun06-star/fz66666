package com.fashion.supplychain.intelligence.engine.dag;

import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;
import java.util.function.Predicate;

@Data
@NoArgsConstructor
public class DagNode {
    private String id;
    private String name;
    private Function<Map<String, Object>, Map<String, Object>> executor;
    private Predicate<Map<String, Object>> skipCondition;
    private int maxRetries = 0;
    private long timeoutMs = 30_000L;
    private boolean critical = true;
    private Map<String, Object> metadata = new HashMap<>();

    public DagNode(String id, String name) {
        this.id = id;
        this.name = name;
    }

    public DagNode(String id, String name, Function<Map<String, Object>, Map<String, Object>> executor) {
        this.id = id;
        this.name = name;
        this.executor = executor;
    }

    public Map<String, Object> execute(Map<String, Object> input) {
        return executor == null ? new HashMap<>(input) : executor.apply(input);
    }

    public boolean shouldSkip(Map<String, Object> input) {
        return skipCondition != null && skipCondition.test(input);
    }
}
