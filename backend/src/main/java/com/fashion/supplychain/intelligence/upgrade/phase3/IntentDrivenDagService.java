package com.fashion.supplychain.intelligence.upgrade.phase3;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.dag.DagGraph;
import com.fashion.supplychain.intelligence.agent.dag.DagNode;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.*;

@Service
@Lazy
@Slf4j
public class IntentDrivenDagService {

    @Value("${ai.intent-dag.enabled:true}")
    private boolean enabled;

    /**
     * D-702：DAG 规划超时上限（毫秒）。
     *
     * <p>这是**可选提示**，不应拖慢主链路：生产实测该步骤曾阻塞 10.4s，
     * 而同一次 AgentLoop 自身仅 4.8s。默认 3.5s —— 足够覆盖正常模型响应
     * （P50 约 2~3s），超时即降级为不用 DAG 规划，主链路照常。
     */
    @Value("${ai.intent-dag.plan-timeout-ms:3500}")
    private long planTimeoutMs;

    /**
     * D-702：DAG 规划专用执行器（**单例守护线程池**）。
     *
     * <p>刻意不用 {@code Executors.newSingleThreadExecutor(...)} 内联创建 ——
     * 那会让每次调用都新建一个线程池且从不 shutdown，几十次问答后线程持续堆积，
     * 反而把"提速"变成"泄漏"。这里用 static 单例 + daemon：
     * daemon 保证 JVM 退出时不阻塞；单例保证只占用一个线程。
     */
    private static final java.util.concurrent.ExecutorService PLAN_EXECUTOR =
            java.util.concurrent.Executors.newSingleThreadExecutor(r -> {
                Thread t = new Thread(r, "intent-dag-plan");
                t.setDaemon(true);
                return t;
            });

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    public DagPlanResult planFromIntent(String scene, String userQuery, List<AiMessage> context) {
        if (!enabled) {
            DagPlanResult r = new DagPlanResult();
            r.success = false;
            r.reason = "intent-dag disabled";
            return r;
        }

        String planPrompt = buildPlanPrompt(userQuery);
        List<AiMessage> messages = new ArrayList<>(context);
        messages.add(AiMessage.user(planPrompt));

        // ── D-702 性能修复：加超时护栏 ──
        //
        // 修复前这里是**裸的同步 chat()，没有任何超时/降级**：模型慢或超时就硬等下去。
        // 生产实测这一步阻塞 **10.4s**（一次真实提问的全链路日志：
        // 20:34:20 → 20:34:31 "规划已注入"），而同一次 AgentLoop 自身只花 4.8s ——
        // 也就是说，**用户等待的一半以上时间花在等一个"可选提示"上**。
        //
        // 而它的产物只是注入给 Agent 上下文的规划提示（不影响工具选择、不影响数据），
        // 失败或超时都只是少一段提示，**不应阻塞主链路**。
        //
        // 语义说明：超时按「返回失败」处理，由调用方降级为不使用 DAG 规划，
        // 而不是让整个请求失败 —— 宁可没有提示，也不能让用户等。
        IntelligenceInferenceResult inf;
        java.util.concurrent.Future<IntelligenceInferenceResult> future = null;
        try {
            future = PLAN_EXECUTOR.submit(() -> inferenceOrchestrator.chat(scene + ":intent-plan", messages, null));
            inf = future.get(planTimeoutMs, java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (java.util.concurrent.TimeoutException te) {
            if (future != null) {
                future.cancel(true);   // 中断尽力而为：底层 HTTP 调用未必响应，但至少标记取消
            }
            DagPlanResult timedOut = new DagPlanResult();
            timedOut.success = false;
            timedOut.reason = "intent-dag plan timeout after " + planTimeoutMs + "ms（可选提示，降级跳过）";
            log.info("[IntentDag] 规划超时 {}ms，降级为不使用 DAG 规划", planTimeoutMs);
            return timedOut;
        } catch (Exception e) {
            if (future != null) {
                future.cancel(true);
            }
            log.debug("[IntentDag] 规划调用异常，降级跳过: {}", e.getMessage());
            DagPlanResult failed = new DagPlanResult();
            failed.success = false;
            failed.reason = "intent-dag plan failed: " + e.getMessage();
            return failed;
        }

        DagPlanResult result = new DagPlanResult();
        result.intent = parseIntent(inf.getContent());
        result.targetEntity = parseTargetEntity(inf.getContent());
        result.dagGraph = buildDagFromPlan(inf.getContent());
        result.rawPlan = inf.getContent();
        result.success = result.dagGraph != null;
        return result;
    }

    private String buildPlanPrompt(String query) {
        return "分析用户意图并生成执行计划(JSON格式):\n"
                + "用户输入: " + query + "\n"
                + "返回格式: {\"intent\":\"...\",\"target\":\"...\",\"steps\":["
                + "{\"id\":\"step1\",\"tool\":\"toolName\",\"depends\":[],\"desc\":\"...\"}]}\n"
                + "可用工具: order_query, production_progress, scan_stats, delay_analysis, "
                + "root_cause_analysis, factory_bottleneck, supplier_scorecard, financial_report, "
                + "smart_report, deep_analysis, rca_analysis";
    }

    private String parseIntent(String content) {
        try {
            com.fasterxml.jackson.databind.JsonNode node = extractJson(content);
            if (node != null && node.has("intent")) return node.get("intent").asText();
        } catch (Exception e) {
            log.warn("[IntentDag] 解析意图失败: {}", e.getMessage());
        }
        return "unknown";
    }

    private String parseTargetEntity(String content) {
        try {
            com.fasterxml.jackson.databind.JsonNode node = extractJson(content);
            if (node != null && node.has("target")) return node.get("target").asText();
        } catch (Exception e) {
            log.warn("[IntentDag] 解析目标实体失败: {}", e.getMessage());
        }
        return null;
    }

    private DagGraph buildDagFromPlan(String content) {
        try {
            com.fasterxml.jackson.databind.JsonNode node = extractJson(content);
            if (node == null || !node.has("steps")) return null;

            DagGraph graph = new DagGraph("intent-dag", "意图驱动DAG");

            for (com.fasterxml.jackson.databind.JsonNode step : node.get("steps")) {
                String id = step.path("id").asText();
                String desc = step.path("desc").asText();

                List<String> depends = new ArrayList<>();
                if (step.has("depends") && step.get("depends").isArray()) {
                    for (com.fasterxml.jackson.databind.JsonNode dep : step.get("depends")) {
                        depends.add(dep.asText());
                    }
                }

                DagNode dagNode = new DagNode(id, desc, depends.toArray(new String[0]));
                graph.addNode(dagNode);
            }
            return graph;
        } catch (Exception e) {
            log.debug("[IntentDag] plan parse failed: {}", e.getMessage());
            return null;
        }
    }

    private com.fasterxml.jackson.databind.JsonNode extractJson(String content) {
        if (content == null) return null;
        try {
            String trimmed = content.trim();
            if (trimmed.startsWith("```json")) {
                trimmed = trimmed.substring(7);
                if (trimmed.endsWith("```")) trimmed = trimmed.substring(0, trimmed.length() - 3);
            } else if (trimmed.startsWith("```")) {
                trimmed = trimmed.substring(3);
                if (trimmed.endsWith("```")) trimmed = trimmed.substring(0, trimmed.length() - 3);
            }
            return new com.fasterxml.jackson.databind.ObjectMapper().readTree(trimmed.trim());
        } catch (Exception e) {
            int start = content.indexOf('{');
            int end = content.lastIndexOf('}');
            if (start >= 0 && end > start) {
                try {
                    return new com.fasterxml.jackson.databind.ObjectMapper().readTree(content.substring(start, end + 1));
                } catch (Exception ex) {
                    log.warn("[IntentDag] 容错解析JSON失败: {}", ex.getMessage());
                }
            }
            return null;
        }
    }

    @Data
    public static class DagPlanResult {
        private boolean success;
        private String reason;
        private String intent;
        private String targetEntity;
        private DagGraph dagGraph;
        private String rawPlan;
    }
}
