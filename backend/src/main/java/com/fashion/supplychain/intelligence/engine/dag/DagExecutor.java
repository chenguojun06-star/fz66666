package com.fashion.supplychain.intelligence.engine.dag;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Slf4j
@Data
@NoArgsConstructor
public class DagExecutor {

    private final Map<String, List<DagCheckpoint>> threadCheckpoints = new ConcurrentHashMap<>();
    private final ExecutorService parallelExecutor = Executors.newFixedThreadPool(4, r -> {
        Thread t = new Thread(r, "dag-parallel");
        t.setDaemon(true);
        return t;
    });

    public String newThreadId() {
        return UUID.randomUUID().toString();
    }

    public DagExecutionResult run(DagGraph graph, Map<String, Object> initialState) {
        return run(graph, initialState, newThreadId());
    }

    public DagExecutionResult run(DagGraph graph, Map<String, Object> initialState, String threadId) {
        long start = System.currentTimeMillis();
        Map<String, Object> state = new HashMap<>(initialState == null ? new HashMap<>() : initialState);
        List<DagCheckpoint> checkpoints = new ArrayList<>();
        List<String> executed = new ArrayList<>();
        List<String> skipped = new ArrayList<>();
        List<String> failed = new ArrayList<>();

        List<List<String>> layers = graph.topologicalLayers();
        int step = 0;
        for (List<String> layer : layers) {
            if (layer.size() == 1) {
                DagNode node = graph.getNodes().get(layer.get(0));
                DagCheckpoint ck = runNode(node, state, step, threadId);
                checkpoints.add(ck);
                if ("OK".equals(ck.getStatus())) {
                    executed.add(node.getId());
                    state.putAll(ck.getState());
                } else if ("SKIPPED".equals(ck.getStatus())) {
                    skipped.add(node.getId());
                } else {
                    failed.add(node.getId());
                    if (node.isCritical()) break;
                }
            } else {
                List<DagCheckpoint> ckList = runLayerParallel(graph, layer, state, step, threadId);
                for (int i = 0; i < layer.size(); i++) {
                    DagNode node = graph.getNodes().get(layer.get(i));
                    DagCheckpoint ck = ckList.get(i);
                    checkpoints.add(ck);
                    if ("OK".equals(ck.getStatus())) {
                        executed.add(node.getId());
                        for (Map.Entry<String, Object> e : ck.getState().entrySet()) {
                            if (!state.containsKey(e.getKey())) state.put(e.getKey(), e.getValue());
                        }
                    } else if ("SKIPPED".equals(ck.getStatus())) {
                        skipped.add(node.getId());
                    } else {
                        failed.add(node.getId());
                    }
                }
            }
            step += layer.size();
        }

        threadCheckpoints.put(threadId, checkpoints);
        DagExecutionResult result = new DagExecutionResult();
        result.setThreadId(threadId);
        result.setStepIndex(checkpoints.size() - 1);
        result.setExecutedNodes(executed);
        result.setSkippedNodes(skipped);
        result.setFailedNodes(failed);
        result.setFinalState(state);
        result.setCheckpoints(checkpoints);
        result.setSuccess(failed.isEmpty());
        result.setDurationMs(System.currentTimeMillis() - start);
        return result;
    }

    private DagCheckpoint runNode(DagNode node, Map<String, Object> state, int step, String threadId) {
        long start = System.currentTimeMillis();
        try {
            if (node.shouldSkip(state)) {
                DagCheckpoint ck = new DagCheckpoint(threadId, step, node.getId(), state);
                ck.setStatus("SKIPPED");
                return ck;
            }
            Map<String, Object> out = executeWithRetry(node, state);
            out.put("_node_" + node.getId() + "_duration", System.currentTimeMillis() - start);
            DagCheckpoint ck = new DagCheckpoint(threadId, step, node.getId(), out);
            ck.setDurationMs(System.currentTimeMillis() - start);
            return ck;
        } catch (Exception e) {
            log.warn("[DAG] node {} failed: {}", node.getId(), e.getMessage());
            DagCheckpoint ck = new DagCheckpoint(threadId, step, node.getId(), state);
            ck.setStatus("FAILED");
            ck.setDurationMs(System.currentTimeMillis() - start);
            return ck;
        }
    }

    private List<DagCheckpoint> runLayerParallel(DagGraph graph, List<String> layer,
                                                    Map<String, Object> state, int stepBase, String threadId) {
        java.util.List<java.util.concurrent.CompletableFuture<DagCheckpoint>> futures = new java.util.ArrayList<>();
        for (int i = 0; i < layer.size(); i++) {
            final int idx = i;
            final int step = stepBase + i;
            // 每个并行任务使用 state 的副本，避免并发写入同一个非线程安全的 HashMap
            final Map<String, Object> stateCopy = new HashMap<>(state);
            futures.add(java.util.concurrent.CompletableFuture.supplyAsync(
                    () -> runNode(graph.getNodes().get(layer.get(idx)), stateCopy, step, threadId),
                    parallelExecutor));
        }
        List<DagCheckpoint> results = new ArrayList<>();
        for (java.util.concurrent.CompletableFuture<DagCheckpoint> f : futures) {
            results.add(f.join());
        }
        return results;
    }

    private Map<String, Object> executeWithRetry(DagNode node, Map<String, Object> state) {
        Exception lastEx = null;
        for (int attempt = 0; attempt <= node.getMaxRetries(); attempt++) {
            try {
                return node.execute(state);
            } catch (Exception e) {
                lastEx = e;
                log.warn("[DAG] node {} attempt {} failed: {}", node.getId(), attempt + 1, e.getMessage());
            }
        }
        throw new RuntimeException("DAG node " + node.getId() + " failed after retries", lastEx);
    }

    public DagExecutionResult timeTravel(String threadId, int stepIndex) {
        List<DagCheckpoint> ckList = threadCheckpoints.get(threadId);
        if (ckList == null || ckList.isEmpty()) {
            DagExecutionResult empty = new DagExecutionResult();
            empty.setThreadId(threadId);
            empty.setSuccess(false);
            empty.setErrorMessage("no checkpoints for thread " + threadId);
            return empty;
        }
        if (stepIndex < 0 || stepIndex >= ckList.size()) stepIndex = ckList.size() - 1;
        DagCheckpoint target = ckList.get(stepIndex);
        Map<String, Object> state = new HashMap<>(target.getState());

        Map<String, Integer> idxMap = new HashMap<>();
        for (int i = 0; i < ckList.size(); i++) idxMap.put(ckList.get(i).getNodeId(), i);
        List<String> executed = new ArrayList<>();
        for (int i = 0; i <= stepIndex; i++) executed.add(ckList.get(i).getNodeId());

        DagExecutionResult result = new DagExecutionResult();
        result.setThreadId(threadId);
        result.setStepIndex(stepIndex);
        result.setFinalState(state);
        result.setExecutedNodes(executed);
        result.setSuccess(true);
        result.setDurationMs(0);
        return result;
    }

    public List<DagCheckpoint> getCheckpoints(String threadId) {
        return threadCheckpoints.get(threadId);
    }

    public int activeThreadCount() {
        return threadCheckpoints.size();
    }
}
