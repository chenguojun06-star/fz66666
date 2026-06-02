package com.fashion.supplychain.intelligence.engine.impl;

import com.fashion.supplychain.intelligence.engine.CognitionEngine;
import com.fashion.supplychain.intelligence.engine.dto.MultiIntentResult;
import com.fashion.supplychain.intelligence.engine.feature.IntelligenceFeatureFlag;
import com.fashion.supplychain.intelligence.engine.kg.KgRelation;
import com.fashion.supplychain.intelligence.engine.kg.RelationExtractorRegistry;
import com.fashion.supplychain.intelligence.engine.kg.RelationType;
import com.fashion.supplychain.intelligence.engine.multiint.MultiIntentRecognizer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Slf4j
@Service
public class CognitionEngineImpl implements CognitionEngine {

    @Autowired(required = false)
    private MultiIntentRecognizer multiIntentRecognizer;

    @Autowired(required = false)
    private RelationExtractorRegistry relationExtractorRegistry;

    @Autowired(required = false)
    private IntelligenceFeatureFlag featureFlag;

    @Override
    public MultiIntentResult recognizeIntent(String query, Long tenantId) {
        if (multiIntentRecognizer != null
                && (featureFlag == null || featureFlag.useNewCognition(tenantId))) {
            return multiIntentRecognizer.recognize(query, tenantId);
        }
        MultiIntentResult r = new MultiIntentResult();
        r.setCandidates(Collections.emptyList());
        r.setModifiers(Collections.emptyMap());
        r.setTenantId(tenantId);
        return r;
    }

    @Override
    public String reason(Long tenantId, String question) {
        if (relationExtractorRegistry == null || question == null || question.isBlank()) {
            return "";
        }
        if (featureFlag != null && !featureFlag.useNewCognition(tenantId)) {
            return "";
        }

        Map<RelationType, List<KgRelation>> graph = safeExtractAll(tenantId);
        if (graph.isEmpty()) {
            return "知识图谱暂无可用关系，无法推理";
        }

        Set<String> anchors = extractAnchors(question);
        List<ReasoningPath> paths = findReasoningPaths(graph, anchors, 3);

        StringBuilder sb = new StringBuilder();
        sb.append("【知识图谱推理】");
        int total = 0;
        for (List<KgRelation> list : graph.values()) total += list.size();
        sb.append("共 ").append(total).append(" 条关系，覆盖 ").append(graph.size()).append(" 类关系。\n");

        if (anchors.isEmpty()) {
            sb.append("未识别到明确锚点，返回关系概览。\n");
        } else {
            sb.append("锚点: ").append(anchors).append("\n");
        }

        if (paths.isEmpty()) {
            sb.append("未找到推理路径，建议补充上下文后重试。\n");
        } else {
            for (int i = 0; i < paths.size(); i++) {
                ReasoningPath p = paths.get(i);
                sb.append(String.format("路径%d(长度%d, 权重%.2f): %s\n",
                        i + 1, p.length(), p.weight(), pathToString(p)));
            }
        }
        return sb.toString();
    }

    private Map<RelationType, List<KgRelation>> safeExtractAll(Long tenantId) {
        try {
            return relationExtractorRegistry.extractAll(tenantId);
        } catch (Exception e) {
            log.warn("[Cognition] reason() extractAll failed: {}", e.getMessage());
            return Collections.emptyMap();
        }
    }

    private Set<String> extractAnchors(String question) {
        Set<String> anchors = new LinkedHashSet<>();
        if (question == null) return anchors;
        for (String token : question.split("[\\s,，。；;;、?？!！:：]+")) {
            String trimmed = token.trim();
            if (trimmed.length() >= 2 && trimmed.length() <= 12) {
                anchors.add(trimmed);
            }
        }
        return anchors;
    }

    private String sourceNode(KgRelation r) {
        return r.getSourceName() != null ? r.getSourceName() : r.getSourceExternalId();
    }

    private String targetNode(KgRelation r) {
        return r.getTargetName() != null ? r.getTargetName() : r.getTargetExternalId();
    }

    private List<ReasoningPath> findReasoningPaths(Map<RelationType, List<KgRelation>> graph,
                                                      Set<String> anchors, int maxPaths) {
        List<ReasoningPath> result = new ArrayList<>();
        if (anchors.isEmpty()) return result;

        Map<String, List<KgRelation>> byEntity = indexByEntity(graph);
        if (byEntity.isEmpty()) return result;

        for (String anchor : anchors) {
            List<KgRelation> starts = findRelationsByEntity(byEntity, anchor);
            for (KgRelation rel : starts) {
                List<KgRelation> path = new ArrayList<>();
                path.add(rel);
                String otherEnd = sourceNode(rel).equals(anchor) ? targetNode(rel) : sourceNode(rel);
                if (otherEnd == null) continue;
                extendPath(graph, byEntity, path, otherEnd, anchors, result, maxPaths);
                if (result.size() >= maxPaths) return result;
            }
        }
        return result;
    }

    private void extendPath(Map<RelationType, List<KgRelation>> graph,
                              Map<String, List<KgRelation>> byEntity,
                              List<KgRelation> current, String endEntity,
                              Set<String> anchors, List<ReasoningPath> out, int maxPaths) {
        if (current.size() >= 3) {
            out.add(buildPath(current));
            return;
        }
        List<KgRelation> nexts = byEntity.getOrDefault(endEntity, Collections.emptyList());
        boolean extended = false;
        for (KgRelation next : nexts) {
            String nextFrom = sourceNode(next);
            String nextTo = targetNode(next);
            if (containsNode(current, nextFrom) || containsNode(current, nextTo)) continue;
            current.add(next);
            String newEnd = nextFrom.equals(endEntity) ? nextTo : nextFrom;
            if (newEnd == null) {
                current.remove(current.size() - 1);
                continue;
            }
            extendPath(graph, byEntity, current, newEnd, anchors, out, maxPaths);
            current.remove(current.size() - 1);
            extended = true;
            if (out.size() >= maxPaths) return;
        }
        if (!extended) {
            out.add(buildPath(current));
        }
    }

    private boolean containsNode(List<KgRelation> path, String node) {
        if (node == null) return true;
        for (KgRelation r : path) {
            String from = sourceNode(r);
            String to = targetNode(r);
            if (node.equals(from) || node.equals(to)) return true;
        }
        return false;
    }

    private Map<String, List<KgRelation>> indexByEntity(Map<RelationType, List<KgRelation>> graph) {
        Map<String, List<KgRelation>> idx = new HashMap<>();
        for (List<KgRelation> rels : graph.values()) {
            for (KgRelation r : rels) {
                String from = sourceNode(r);
                String to = targetNode(r);
                if (from != null) idx.computeIfAbsent(from, k -> new ArrayList<>()).add(r);
                if (to != null) idx.computeIfAbsent(to, k -> new ArrayList<>()).add(r);
            }
        }
        return idx;
    }

    private List<KgRelation> findRelationsByEntity(Map<String, List<KgRelation>> idx, String entity) {
        if (idx.containsKey(entity)) return idx.get(entity);
        for (Map.Entry<String, List<KgRelation>> e : idx.entrySet()) {
            if (e.getKey() != null && e.getKey().contains(entity)) return e.getValue();
        }
        return Collections.emptyList();
    }

    private ReasoningPath buildPath(List<KgRelation> path) {
        double weight = 0;
        for (KgRelation r : path) {
            weight += r.getWeight() != null ? r.getWeight() : 0.5;
        }
        return new ReasoningPath(new ArrayList<>(path), weight);
    }

    private String pathToString(ReasoningPath p) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < p.relations().size(); i++) {
            if (i > 0) sb.append(" → ");
            KgRelation r = p.relations().get(i);
            sb.append(sourceNode(r)).append(" -[").append(r.getRelationType()).append("]-> ").append(targetNode(r));
        }
        return sb.toString();
    }

    @Override
    public Map<String, Double> selfEvaluate(String query, String answer, Long tenantId) {
        Map<String, Double> result = new HashMap<>();
        result.put("dataTruth", answer != null && answer.length() > 10 ? 0.7 : 0.4);
        result.put("completeness", answer != null && answer.length() > 30 ? 0.8 : 0.5);
        result.put("fluency", answer != null ? 0.85 : 0.3);
        result.put("relevance", 0.75);
        result.put("noHallucination", 0.7);
        return result;
    }

    @Override
    public Map<String, Object> loadUserPreference(Long userId) {
        Map<String, Object> prefs = new HashMap<>();
        prefs.put("userId", userId);
        prefs.put("preferredLanguage", "zh-CN");
        prefs.put("preferredDomain", "production");
        return prefs;
    }

    private record ReasoningPath(List<KgRelation> relations, double weight) {
        public int length() { return relations.size(); }
        public double weight() { return weight; }
    }
}
