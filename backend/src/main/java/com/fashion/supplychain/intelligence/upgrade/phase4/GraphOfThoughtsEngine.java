package com.fashion.supplychain.intelligence.upgrade.phase4;

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
public class GraphOfThoughtsEngine {

    @Value("${ai.got.enabled:true}")
    private boolean enabled;

    @Value("${ai.got.max-iterations:4}")
    private int maxIterations;

    @Value("${ai.got.merge-threshold:0.7}")
    private double mergeThreshold;

    @Autowired
    private IntelligenceInferenceOrchestrator inferenceOrchestrator;

    private final ExecutorService executor = Executors.newFixedThreadPool(4);

    public GotResult reason(String scene, String question, List<AiMessage> context, List<AiTool> tools) {
        if (!enabled) {
            GotResult r = new GotResult();
            r.success = false;
            r.reason = "GoT disabled";
            return r;
        }

        GotNode root = new GotNode();
        root.id = "root";
        root.content = question;
        root.nodeType = "question";

        List<GotNode> frontier = new ArrayList<>();
        frontier.add(root);

        for (int iter = 0; iter < maxIterations; iter++) {
            List<GotNode> expanded = expandFrontier(frontier, scene, context, tools);
            List<GotNode> merged = tryMerge(expanded, scene, context);
            frontier = merged;
            if (frontier.size() == 1 && "conclusion".equals(frontier.get(0).nodeType)) break;
        }

        GotNode best = frontier.stream()
                .max(Comparator.comparingDouble(n -> n.score))
                .orElse(root);

        GotResult result = new GotResult();
        result.success = true;
        result.conclusion = best.content;
        result.score = best.score;
        result.nodeCount = countAllNodes(root);
        result.edgeCount = countEdges(root);
        result.paths = extractPaths(best);
        return result;
    }

    private List<GotNode> expandFrontier(List<GotNode> frontier, String scene,
                                          List<AiMessage> context, List<AiTool> tools) {
        List<GotNode> result = new ArrayList<>();
        List<Future<List<GotNode>>> futures = new ArrayList<>();

        for (GotNode node : frontier) {
            futures.add(executor.submit(() -> {
                String prompt = "基于以下分析，生成2个不同的推理方向:\n" + node.content;
                List<AiMessage> msgs = new ArrayList<>(context);
                msgs.add(AiMessage.user(prompt));
                try {
                    IntelligenceInferenceResult inf = inferenceOrchestrator.chat(scene + ":got-expand", msgs, tools);
                    List<GotNode> children = new ArrayList<>();
                    String[] parts = inf.getContent().split("(?i)方向[12][:：]|\\n[12][.、]");
                    for (int i = 0; i < Math.min(parts.length, 2); i++) {
                        GotNode child = new GotNode();
                        child.id = node.id + "-" + i;
                        child.content = parts[i].trim();
                        child.parent = node;
                        child.nodeType = "reasoning";
                        children.add(child);
                    }
                    if (children.isEmpty()) {
                        GotNode child = new GotNode();
                        child.id = node.id + "-0";
                        child.content = inf.getContent();
                        child.parent = node;
                        child.nodeType = "reasoning";
                        children.add(child);
                    }
                    node.children = children;
                    return children;
                } catch (Exception e) {
                    return Collections.<GotNode>emptyList();
                }
            }));
        }

        for (Future<List<GotNode>> f : futures) {
            try {
                result.addAll(f.get(30, TimeUnit.SECONDS));
            } catch (Exception ignored) {}
        }
        return result;
    }

    private List<GotNode> tryMerge(List<GotNode> nodes, String scene, List<AiMessage> context) {
        if (nodes.size() <= 1) return nodes;
        List<GotNode> result = new ArrayList<>(nodes);
        for (int i = 0; i < nodes.size(); i++) {
            for (int j = i + 1; j < nodes.size(); j++) {
                if (similarity(nodes.get(i).content, nodes.get(j).content) > mergeThreshold) {
                    GotNode merged = new GotNode();
                    merged.id = "merge-" + i + "-" + j;
                    merged.content = "综合结论: " + nodes.get(i).content;
                    merged.nodeType = "conclusion";
                    merged.mergeSources = List.of(nodes.get(i), nodes.get(j));
                    merged.score = Math.max(nodes.get(i).score, nodes.get(j).score) + 0.1;
                    result.remove(nodes.get(i));
                    result.remove(nodes.get(j));
                    result.add(merged);
                    break;
                }
            }
        }
        return result;
    }

    private double similarity(String a, String b) {
        if (a == null || b == null) return 0;
        Set<String> wordsA = new HashSet<>(Arrays.asList(a.split("[\\s，。、：]+")));
        Set<String> wordsB = new HashSet<>(Arrays.asList(b.split("[\\s，。、：]+")));
        long intersection = wordsA.stream().filter(wordsB::contains).count();
        return intersection * 2.0 / (wordsA.size() + wordsB.size());
    }

    private int countAllNodes(GotNode node) {
        int count = 1;
        if (node.children != null) for (GotNode c : node.children) count += countAllNodes(c);
        if (node.mergeSources != null) for (GotNode s : node.mergeSources) count += countAllNodes(s);
        return count;
    }

    private int countEdges(GotNode node) {
        int count = 0;
        if (node.children != null) {
            count += node.children.size();
            for (GotNode c : node.children) count += countEdges(c);
        }
        if (node.mergeSources != null) {
            count += node.mergeSources.size();
            for (GotNode s : node.mergeSources) count += countEdges(s);
        }
        return count;
    }

    private List<String> extractPaths(GotNode node) {
        List<String> paths = new ArrayList<>();
        if (node.mergeSources != null) {
            for (GotNode src : node.mergeSources) {
                paths.addAll(extractPaths(src));
            }
        }
        if (node.parent != null) {
            paths.addAll(extractPaths(node.parent));
        }
        paths.add(node.id + ": " + node.content.substring(0, Math.min(60, node.content.length())));
        return paths;
    }

    @Data
    public static class GotNode {
        private String id;
        private String content;
        private String nodeType;
        private double score;
        private GotNode parent;
        private List<GotNode> children;
        private List<GotNode> mergeSources;
    }

    @Data
    public static class GotResult {
        private boolean success;
        private String reason;
        private String conclusion;
        private double score;
        private int nodeCount;
        private int edgeCount;
        private List<String> paths;
    }
}
