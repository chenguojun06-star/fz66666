package com.fashion.supplychain.intelligence.upgrade.phase3;

import com.fashion.supplychain.intelligence.agent.AiMessage;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.orchestration.IntelligenceInferenceOrchestrator;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;

@Service
@Slf4j
public class TreeOfThoughtsEngine {

    @Value("${ai.tot.enabled:true}")
    private boolean enabled;

    @Value("${ai.tot.max-depth:3}")
    private int maxDepth;

    @Value("${ai.tot.beam-width:3}")
    private int beamWidth;

    @Value("${ai.tot.timeout-seconds:60}")
    private int timeoutSeconds;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private final ExecutorService executor = Executors.newFixedThreadPool(4);

    public TotResult explore(String scene, String question, List<AiMessage> context, List<AiTool> tools) {
        if (!enabled) {
            TotResult r = new TotResult();
            r.success = false;
            r.reason = "ToT disabled";
            return r;
        }

        TotNode root = new TotNode();
        root.thought = question;
        root.depth = 0;

        List<TotNode> currentBeam = List.of(root);
        for (int depth = 0; depth < maxDepth; depth++) {
            List<TotNode> candidates = expandBeam(currentBeam, scene, context, tools, depth);
            if (candidates.isEmpty()) break;
            currentBeam = scoreAndPrune(candidates, scene, context);
            if (currentBeam.size() == 1 && currentBeam.get(0).score >= 0.8) break;
        }

        TotNode best = currentBeam.stream()
                .max(Comparator.comparingDouble(n -> n.score))
                .orElse(root);

        TotResult result = new TotResult();
        result.success = true;
        result.bestThought = best.thought;
        result.bestConclusion = best.conclusion;
        result.bestScore = best.score;
        result.exploredPaths = countNodes(root);
        result.allPaths = collectPaths(currentBeam);
        return result;
    }

    private List<TotNode> expandBeam(List<TotNode> beam, String scene,
                                      List<AiMessage> context, List<AiTool> tools, int depth) {
        List<TotNode> candidates = new ArrayList<>();
        List<Future<TotNode>> futures = new ArrayList<>();

        for (TotNode node : beam) {
            String prompt = buildExpansionPrompt(node, depth);
            List<AiMessage> messages = new ArrayList<>(context);
            messages.add(AiMessage.user(prompt));

            futures.add(executor.submit(() -> {
                try {
                    IntelligenceInferenceResult inf = inferenceOrchestrator.chat(
                            scene + ":tot-expand", messages, tools);
                    TotNode child = new TotNode();
                    child.thought = inf.getContent();
                    child.conclusion = inf.getContent();
                    child.depth = depth + 1;
                    child.parent = node;
                    return child;
                } catch (Exception e) {
                    log.debug("[ToT] expansion failed: {}", e.getMessage());
                    return null;
                }
            }));
        }

        for (Future<TotNode> f : futures) {
            try {
                TotNode n = f.get(timeoutSeconds, TimeUnit.SECONDS);
                if (n != null) candidates.add(n);
            } catch (Exception ignored) {}
        }
        return candidates;
    }

    private List<TotNode> scoreAndPrune(List<TotNode> candidates, String scene, List<AiMessage> context) {
        String prompt = "对以下推理路径评分(0-1)，返回JSON: [{\"index\":0,\"score\":0.9},...]\n";
        for (int i = 0; i < candidates.size(); i++) {
            prompt += "[" + i + "] " + candidates.get(i).conclusion + "\n";
        }
        List<AiMessage> messages = new ArrayList<>(context);
        messages.add(AiMessage.user(prompt));

        try {
            IntelligenceInferenceResult inf = inferenceOrchestrator.chat(scene + ":tot-score", messages, null);
            double[] scores = parseScores(inf.getContent(), candidates.size());
            for (int i = 0; i < candidates.size(); i++) {
                candidates.get(i).score = scores[i];
            }
        } catch (Exception e) {
            candidates.forEach(n -> n.score = 0.5);
        }

        candidates.sort(Comparator.comparingDouble(n -> -n.score));
        return candidates.subList(0, Math.min(beamWidth, candidates.size()));
    }

    private double[] parseScores(String content, int count) {
        double[] scores = new double[count];
        Arrays.fill(scores, 0.5);
        try {
            String trimmed = content.trim();
            if (trimmed.startsWith("```")) {
                trimmed = trimmed.substring(trimmed.indexOf('\n') + 1);
                if (trimmed.endsWith("```")) trimmed = trimmed.substring(0, trimmed.length() - 3);
            }
            com.fasterxml.jackson.databind.JsonNode arr = new com.fasterxml.jackson.databind.ObjectMapper()
                    .readTree(trimmed);
            if (arr.isArray()) {
                for (int i = 0; i < Math.min(arr.size(), count); i++) {
                    scores[arr.get(i).get("index").asInt()] = arr.get(i).get("score").asDouble(0.5);
                }
            }
        } catch (Exception ignored) {}
        return scores;
    }

    private String buildExpansionPrompt(TotNode node, int depth) {
        return String.format("当前推理深度=%d, 思路=%s\n请生成%d个不同的推理方向:",
                depth + 1, node.thought.substring(0, Math.min(200, node.thought.length())), beamWidth);
    }

    private int countNodes(TotNode root) {
        return 1 + (root.children != null ? root.children.stream().mapToInt(this::countNodes).sum() : 0);
    }

    private List<String> collectPaths(List<TotNode> nodes) {
        List<String> paths = new ArrayList<>();
        for (TotNode n : nodes) {
            StringBuilder sb = new StringBuilder();
            TotNode cur = n;
            while (cur != null) {
                if (sb.length() > 0) sb.insert(0, " → ");
                sb.insert(0, cur.thought.substring(0, Math.min(50, cur.thought.length())));
                cur = cur.parent;
            }
            paths.add(sb.toString());
        }
        return paths;
    }

    @Data
    public static class TotNode {
        private String thought;
        private String conclusion;
        private double score;
        private int depth;
        private TotNode parent;
        private List<TotNode> children;
    }

    @Data
    public static class TotResult {
        private boolean success;
        private String reason;
        private String bestThought;
        private String bestConclusion;
        private double bestScore;
        private int exploredPaths;
        private List<String> allPaths;
    }
}
