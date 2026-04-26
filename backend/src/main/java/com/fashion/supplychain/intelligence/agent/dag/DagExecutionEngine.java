package com.fashion.supplychain.intelligence.agent.dag;

import com.fashion.supplychain.intelligence.agent.sse.SseEmitterHelper;
import com.fashion.supplychain.intelligence.agent.sse.SseEvent;
import com.fashion.supplychain.intelligence.dto.AgentState;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Component
public class DagExecutionEngine {

    private final Map<String, DagNodeExecutor> executorRegistry = new ConcurrentHashMap<>();
    private final ExecutorService parallelExecutor = new ThreadPoolExecutor(
            4, 8, 60L, TimeUnit.SECONDS,
            new LinkedBlockingQueue<>(32),
            r -> {
                Thread t = new Thread(r, "dag-exec-" + System.nanoTime());
                t.setDaemon(true);
                return t;
            },
            new ThreadPoolExecutor.CallerRunsPolicy());

    public void registerExecutor(String nodeId, DagNodeExecutor executor) {
        executorRegistry.put(nodeId, executor);
    }

    public DagExecutionResult execute(DagGraph graph, AgentState state) {
        long start = System.currentTimeMillis();
        String graphId = graph.getId();
        log.info("[DAG] 开始执行图: id={}, name={}, nodes={}", graphId, graph.getName(), graph.getNodes().size());

        Map<String, Object> nodeResults = new ConcurrentHashMap<>();
        Set<String> completedNodes = ConcurrentHashMap.newKeySet();
        Set<String> failedNodes = ConcurrentHashMap.newKeySet();
        AtomicInteger completedCount = new AtomicInteger(0);

        List<List<String>> layers = graph.executionLayers();
        log.debug("[DAG] 执行分层: {} 层", layers.size());

        for (List<String> layer : layers) {
            List<CompletableFuture<Void>> futures = new ArrayList<>();

            for (String nodeId : layer) {
                DagNode node = graph.getNode(nodeId);
                if (node == null) {
                    log.warn("[DAG] 节点不存在: {}", nodeId);
                    failedNodes.add(nodeId);
                    continue;
                }

                boolean depsFailed = node.getDependsOn() != null &&
                        node.getDependsOn().stream().anyMatch(failedNodes::contains);

                if (depsFailed && !node.isOptional()) {
                    log.warn("[DAG] 节点 {} 的依赖失败，跳过", nodeId);
                    failedNodes.add(nodeId);
                    continue;
                }
                if (depsFailed && node.isOptional()) {
                    log.info("[DAG] 可选节点 {} 的依赖失败，跳过", nodeId);
                    continue;
                }

                futures.add(CompletableFuture.runAsync(() -> {
                    executeNode(nodeId, node, state, nodeResults, completedNodes, failedNodes, completedCount, graph.getNodes().size());
                }, parallelExecutor));
            }

            try {
                CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).get(120, TimeUnit.SECONDS);
            } catch (TimeoutException e) {
                log.error("[DAG] 图 {} 层执行超时", graphId);
                break;
            } catch (Exception e) {
                log.error("[DAG] 图 {} 层执行异常: {}", graphId, e.getMessage());
                break;
            }
        }

        long latency = System.currentTimeMillis() - start;
        log.info("[DAG] 图执行完成: id={}, 完成={}, 失败={}, 耗时={}ms",
                graphId, completedCount.get(), failedNodes.size(), latency);

        return new DagExecutionResult(graphId, completedNodes, failedNodes, nodeResults, latency);
    }

    public void executeStreaming(DagGraph graph, AgentState state, SseEmitter emitter) {
        long start = System.currentTimeMillis();
        String graphId = graph.getId();

        SseEmitterHelper.send(emitter, SseEvent.graphStart(graphId));

        Map<String, Object> nodeResults = new ConcurrentHashMap<>();
        Set<String> completedNodes = ConcurrentHashMap.newKeySet();
        Set<String> failedNodes = ConcurrentHashMap.newKeySet();

        List<List<String>> layers = graph.executionLayers();

        for (List<String> layer : layers) {
            List<CompletableFuture<Void>> futures = new ArrayList<>();

            for (String nodeId : layer) {
                DagNode node = graph.getNode(nodeId);
                if (node == null) continue;

                boolean depsFailed = node.getDependsOn() != null &&
                        node.getDependsOn().stream().anyMatch(failedNodes::contains);

                if (depsFailed && !node.isOptional()) {
                    failedNodes.add(nodeId);
                    SseEmitterHelper.send(emitter, SseEvent.nodeDone(nodeId, Map.of("status", "skipped", "reason", "dependency_failed")));
                    continue;
                }
                if (depsFailed && node.isOptional()) continue;

                futures.add(CompletableFuture.runAsync(() -> {
                    long nodeStart = System.currentTimeMillis();
                    try {
                        Object result = executeSingleNode(nodeId, node, state, nodeResults);
                        nodeResults.put(nodeId, result);
                        completedNodes.add(nodeId);
                        long nodeLatency = System.currentTimeMillis() - nodeStart;
                        SseEmitterHelper.send(emitter, SseEvent.nodeDone(nodeId,
                                Map.of("result", result != null ? result : Map.of(), "latencyMs", nodeLatency)));
                    } catch (Exception e) {
                        failedNodes.add(nodeId);
                        if (node.isOptional()) {
                            log.warn("[DAG] 可选节点 {} 执行失败(忽略): {}", nodeId, e.getMessage());
                        } else {
                            log.error("[DAG] 节点 {} 执行失败", nodeId, e);
                        }
                        SseEmitterHelper.send(emitter, SseEvent.nodeDone(nodeId,
                                Map.of("status", "failed", "error", e.getMessage())));
                    }
                }, parallelExecutor));
            }

            try {
                CompletableFuture.allOf(futures.toArray(new CompletableFuture[0])).get(120, TimeUnit.SECONDS);
            } catch (Exception e) {
                log.error("[DAG] 流式执行层异常: {}", e.getMessage());
                break;
            }
        }

        long latency = System.currentTimeMillis() - start;
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("graphId", graphId);
        summary.put("completedNodes", completedNodes);
        summary.put("failedNodes", failedNodes);
        summary.put("latencyMs", latency);
        SseEmitterHelper.send(emitter, SseEvent.graphDone(summary));
        SseEmitterHelper.complete(emitter);
    }

    private void executeNode(String nodeId, DagNode node, AgentState state,
                             Map<String, Object> nodeResults, Set<String> completedNodes,
                             Set<String> failedNodes, AtomicInteger completedCount, int totalNodes) {
        try {
            Object result = executeSingleNode(nodeId, node, state, nodeResults);
            nodeResults.put(nodeId, result);
            completedNodes.add(nodeId);
            int done = completedCount.incrementAndGet();
            log.debug("[DAG] 节点 {} 完成 ({}/{})", nodeId, done, totalNodes);
        } catch (Exception e) {
            failedNodes.add(nodeId);
            if (node.isOptional()) {
                log.warn("[DAG] 可选节点 {} 失败(忽略): {}", nodeId, e.getMessage());
            } else {
                log.error("[DAG] 节点 {} 执行失败", nodeId, e);
            }
        }
    }

    private Object executeSingleNode(String nodeId, DagNode node, AgentState state,
                                     Map<String, Object> nodeResults) throws Exception {
        DagNodeExecutor executor = executorRegistry.get(nodeId);
        if (executor == null) {
            log.warn("[DAG] 无执行器: {}, 跳过", nodeId);
            return Map.of("status", "no_executor");
        }

        Map<String, Object> depResults = new HashMap<>();
        if (node.getDependsOn() != null) {
            for (String dep : node.getDependsOn()) {
                Object depResult = nodeResults.get(dep);
                if (depResult != null) depResults.put(dep, depResult);
            }
        }

        return executor.execute(state, depResults, node.getConfig());
    }

    public Map<String, DagNodeExecutor> getExecutorRegistry() {
        return Collections.unmodifiableMap(executorRegistry);
    }
}
