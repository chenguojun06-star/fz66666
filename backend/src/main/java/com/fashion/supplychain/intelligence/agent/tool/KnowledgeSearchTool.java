package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import com.fashion.supplychain.intelligence.entity.KnowledgeBase;
import com.fashion.supplychain.intelligence.service.KnowledgeBaseService;
import com.fashion.supplychain.intelligence.service.CohereRerankService;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.intelligence.orchestration.KnowledgeGraphOrchestrator;
import com.fashion.supplychain.intelligence.util.RrfFusion;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

/**
 * RAG知识库检索工具 — 回答行业术语、系统操作、业务FAQ等问题
 * Skill分类：问答/知识库类 Skill
 */
@Slf4j
@Component
public class KnowledgeSearchTool extends AbstractAgentTool {

    @Autowired
    private KnowledgeBaseService knowledgeBaseService;

    /** 向量检索引擎 — Qdrant不可用时自动降级为纯SQL检索 */
    @Autowired(required = false)
    private QdrantService qdrantService;

    /** Cohere Reranker 精排服务 — 未配置时自动降级为混合评分排序 */
    @Autowired(required = false)
    private CohereRerankService cohereRerankService;

    /** 知识图谱推理引擎 — 可用时提供第三路召回 */
    @Autowired(required = false)
    private KnowledgeGraphOrchestrator knowledgeGraphOrchestrator;

    @Override
    public String getName() {
        return "tool_knowledge_search";
    }

    @Override
    public AiTool getToolDefinition() {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("query", stringProp("搜索关键词，例如：FOB、菲号、如何建单、工资结算、逾期处理"));
        properties.put("category", stringProp("知识分类（可选）：terminology=行业术语, system_guide=系统操作指南, faq=常见问题, sop=标准操作流程, rule=业务规则"));

        return buildToolDef(
                "搜索知识库，回答行业术语（FOB/CMT/ODM/菲号等）、系统操作指南（如何建单/扫码/结算）、"
                        + "业务常见问题（面料不足/逾期处理/报价计算）等问题。当用户询问'什么是X'、'如何操作X'、'X怎么算'时调用此工具。",
                properties, List.of("query"));
    }

    @Override
    protected String doExecute(String argumentsJson) throws Exception {
        JsonNode args = MAPPER.readTree(argumentsJson);
        String query = args.path("query").asText("").trim();
        String category = args.path("category").asText("").trim();

        if (query.isEmpty()) {
            return errorJson("请提供搜索关键词");
        }

            Long tenantId = UserContext.tenantId();

            if (tenantId == null) {
                log.warn("[KnowledgeSearch] tenantId为null，拒绝搜索以防止跨租户数据泄露");
                return errorJson("租户上下文缺失，无法搜索知识库");
            }

            // ── STEP 1: Qdrant语义召回（向量引擎可用时优先）──
            Map<String, Float> semanticScoreMap = new LinkedHashMap<>();
            boolean qdrantEnabled = qdrantService != null && qdrantService.isAvailable();
            if (qdrantEnabled) {
                try {
                    List<QdrantService.ScoredPoint> hits = qdrantService.search(tenantId, query, 10);
                    for (QdrantService.ScoredPoint hit : hits) {
                        String pid = hit.getPointId();
                        if (pid != null && pid.startsWith("kb_")) {
                            semanticScoreMap.put(pid.substring(3), hit.getScore());
                        }
                    }
                    if (!semanticScoreMap.isEmpty()) {
                        log.debug("[KnowledgeSearch] Qdrant语义命中 {} 条", semanticScoreMap.size());
                    }
                } catch (Exception e) {
                    log.debug("[KnowledgeSearch] Qdrant语义检索跳过: {}", e.getMessage());
                }
            }

            // ── STEP 2: MySQL关键词召回（补充语义结果）──
            QueryWrapper<KnowledgeBase> qw = new QueryWrapper<KnowledgeBase>()
                    .eq("delete_flag", 0)
                    .and(wrapper -> wrapper
                            .isNull("tenant_id")
                            .or()
                            .eq("tenant_id", tenantId)
                    )
                    .and(wrapper -> wrapper
                            .like("title", query)
                            .or().like("keywords", query)
                            .or().like("content", query)
                    );
            if (!category.isEmpty()) qw.eq("category", category);
                        qw.orderByAsc("category").last("LIMIT 10");
            List<KnowledgeBase> sqlResults = knowledgeBaseService.list(qw);

                        // ── STEP 3: 拉取语义命中的KB条目 ──
            List<KnowledgeBase> semanticKbList = new ArrayList<>();
                        if (!semanticScoreMap.isEmpty()) {
                QueryWrapper<KnowledgeBase> semanticQw = new QueryWrapper<KnowledgeBase>()
                        .eq("delete_flag", 0)
                            .in("id", semanticScoreMap.keySet())
                        .and(w -> w.isNull("tenant_id").or().eq("tenant_id", tenantId));
                        if (!category.isEmpty()) semanticQw.eq("category", category);
                semanticKbList = knowledgeBaseService.list(semanticQw);
            }

            // ── STEP 3.5: 知识图谱推理召回（第三路）──
            List<KnowledgeGraphOrchestrator.ReasoningPath> graphPaths = new ArrayList<>();
            Set<String> graphEntityIds = new HashSet<>();
            boolean graphEnabled = knowledgeGraphOrchestrator != null;
            if (graphEnabled) {
                try {
                    graphPaths = knowledgeGraphOrchestrator.reason(tenantId, query, 3);
                    for (KnowledgeGraphOrchestrator.ReasoningPath path : graphPaths) {
                        if (path.getEntityNames() != null) {
                            for (String entityName : path.getEntityNames()) {
                                QueryWrapper<KnowledgeBase> graphQw = new QueryWrapper<KnowledgeBase>()
                                        .eq("delete_flag", 0)
                                        .and(w -> w.isNull("tenant_id").or().eq("tenant_id", tenantId))
                                        .and(w -> w.like("title", entityName).or().like("keywords", entityName));
                                if (!category.isEmpty()) graphQw.eq("category", category);
                                graphQw.last("LIMIT 3");
                                for (KnowledgeBase kb : knowledgeBaseService.list(graphQw)) {
                                    graphEntityIds.add(kb.getId());
                                }
                            }
                        }
                    }
                    if (!graphPaths.isEmpty()) {
                        log.debug("[KnowledgeSearch] 知识图谱推理命中 {} 条路径, 关联KB {} 条", graphPaths.size(), graphEntityIds.size());
                    }
                } catch (Exception e) {
                    log.debug("[KnowledgeSearch] 知识图谱推理跳过: {}", e.getMessage());
                }
            }

            // ── STEP 4: RRF多路融合（语义 + 关键词 + 图谱）──
            LinkedHashMap<String, KnowledgeBase> candidateMap = new LinkedHashMap<>();
            for (KnowledgeBase kb : semanticKbList) {
                candidateMap.put(kb.getId(), kb);
            }
            for (KnowledgeBase kb : sqlResults) {
                candidateMap.putIfAbsent(kb.getId(), kb);
            }
            if (!graphEntityIds.isEmpty()) {
                QueryWrapper<KnowledgeBase> graphKbQw = new QueryWrapper<KnowledgeBase>()
                        .eq("delete_flag", 0)
                        .in("id", graphEntityIds)
                        .and(w -> w.isNull("tenant_id").or().eq(tenantId != null, "tenant_id", tenantId));
                if (!category.isEmpty()) graphKbQw.eq("category", category);
                for (KnowledgeBase kb : knowledgeBaseService.list(graphKbQw)) {
                    candidateMap.putIfAbsent(kb.getId(), kb);
                }
            }

            Map<String, List<RrfFusion.RankedItem<String>>> rrfInput = new LinkedHashMap<>();
            List<RrfFusion.RankedItem<String>> semanticRanked = new ArrayList<>();
            for (KnowledgeBase kb : semanticKbList) {
                semanticRanked.add(new RrfFusion.RankedItem<String>(kb.getId(), safe(kb.getTitle()), (double) semanticScoreMap.getOrDefault(kb.getId(), 0f)));
            }
            rrfInput.put("semantic", semanticRanked);

            List<RrfFusion.RankedItem<String>> keywordRanked = new ArrayList<>();
            for (KnowledgeBase kb : sqlResults) {
                keywordRanked.add(new RrfFusion.RankedItem<String>(kb.getId(), safe(kb.getTitle()), computeKeywordScore(kb, query)));
            }
            rrfInput.put("keyword", keywordRanked);

            if (!graphEntityIds.isEmpty()) {
                List<RrfFusion.RankedItem<String>> graphRanked = new ArrayList<>();
                for (String eid : new ArrayList<>(graphEntityIds)) {
                    graphRanked.add(new RrfFusion.RankedItem<String>(eid, "graph:" + eid, 0.5d));
                }
                rrfInput.put("graph", graphRanked);
            }

            List<RrfFusion.RankedItem<String>> fusedResults = RrfFusion.fuse(rrfInput);
            Map<String, Double> rrfScoreMap = new LinkedHashMap<>();
            for (RrfFusion.RankedItem<String> item : fusedResults) {
                rrfScoreMap.put(item.getItem(), item.getScore());
            }

            int candidateLimit = (cohereRerankService != null && cohereRerankService.isAvailable()) ? 15 : 5;
            List<KnowledgeHit> candidateHits = new ArrayList<>();
            for (RrfFusion.RankedItem<String> fused : fusedResults.stream().limit(candidateLimit).collect(Collectors.toList())) {
                KnowledgeBase kb = candidateMap.get(fused.getItem());
                if (kb == null) continue;
                KnowledgeHit hit = new KnowledgeHit();
                hit.setKnowledgeBase(kb);
                hit.setSemanticScore(semanticScoreMap.containsKey(kb.getId()) ? semanticScoreMap.get(kb.getId()) : 0d);
                hit.setKeywordScore(computeKeywordScore(kb, query));
                hit.setHybridScore(fused.getScore());
                hit.setGraphBoosted(graphEntityIds.contains(kb.getId()));
                candidateHits.add(hit);
            }

            // ── STEP 4.5: Cohere Reranker 精排（可选，不可用时自动降级）──
                        List<KnowledgeHit> rankedHits;
                        if (cohereRerankService != null && cohereRerankService.isAvailable()) {
                            List<KnowledgeBase> candidateKbs = candidateHits.stream()
                                    .map(KnowledgeHit::getKnowledgeBase).collect(Collectors.toList());
                            List<KnowledgeBase> rerankedKbs = cohereRerankService.rerank(query, candidateKbs, 5);
                            Map<String, KnowledgeHit> hitMap = candidateHits.stream()
                                    .collect(Collectors.toMap(h -> h.getKnowledgeBase().getId(), h -> h));
                            rankedHits = rerankedKbs.stream()
                                    .map(kb -> hitMap.get(kb.getId()))
                                    .filter(Objects::nonNull)
                                    .collect(Collectors.toList());
                        } else {
                            rankedHits = candidateHits;
                        }

                        List<KnowledgeBase> finalList = rankedHits.stream()
                            .map(KnowledgeHit::getKnowledgeBase)
                            .collect(Collectors.toList());

            if (finalList.isEmpty()) {
                return "{\"message\": \"知识库中未找到关于 '" + query + "' 的相关内容。\"}";
            }

            // ── STEP 5: 异步将SQL结果索引到Qdrant（渐进式自建知识向量库）──
            if (qdrantEnabled && !sqlResults.isEmpty()) {
                for (KnowledgeBase kb : sqlResults) {
                    try {
                        Long kbTenantId = kb.getTenantId() != null ? kb.getTenantId()
                                : (tenantId != null ? tenantId : 0L);
                        String kbContent = kb.getTitle() + "\n"
                                + (kb.getKeywords() != null ? kb.getKeywords() + "\n" : "")
                                + kb.getContent();
                        Map<String, Object> payload = new HashMap<>();
                        payload.put("type", "kb");
                        payload.put("category", kb.getCategory() != null ? kb.getCategory() : "general");
                        payload.put("title", safe(kb.getTitle()));
                        payload.put("keywords", safe(kb.getKeywords()));
                        payload.put("source", safe(kb.getSource()));
                        qdrantService.upsertVector("kb_" + kb.getId(), kbTenantId, kbContent,
                            payload);
                    } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); } // 非关键路径，失败不影响主流程
                }
            }

            // ── STEP 6: 格式化返回 ──
            List<Map<String, Object>> formatted = new ArrayList<>();
                    for (KnowledgeHit hit : rankedHits) {
                    KnowledgeBase kb = hit.getKnowledgeBase();
                Map<String, Object> item = new HashMap<>();
                item.put("title", kb.getTitle());
                item.put("category", kb.getCategory());
                item.put("content", kb.getContent());
                    item.put("semanticScore", round(hit.getSemanticScore()));
                    item.put("keywordScore", round(hit.getKeywordScore()));
                    item.put("hybridScore", round(hit.getHybridScore()));
                formatted.add(item);
                try {
                    KnowledgeBase update = new KnowledgeBase();
                    update.setId(kb.getId());
                    update.setViewCount(kb.getViewCount() == null ? 1 : kb.getViewCount() + 1);
                    knowledgeBaseService.updateById(update);
                } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
            }

            Map<String, Object> result = new HashMap<>();
            result.put("count", finalList.size());
            result.put("items", formatted);
            result.put("semantic", !semanticKbList.isEmpty());
            result.put("retrievalMode", graphEnabled && !graphPaths.isEmpty() ? "rrf_graph" : (cohereRerankService != null && cohereRerankService.isAvailable() ? "reranked" : "hybrid"));
            result.put("semanticHits", semanticKbList.size());
            result.put("keywordHits", sqlResults.size());
            result.put("graphHits", graphEntityIds.size());
            if (!graphPaths.isEmpty()) {
                List<Map<String, Object>> pathSummaries = new ArrayList<>();
                for (KnowledgeGraphOrchestrator.ReasoningPath path : graphPaths.stream().limit(3).collect(Collectors.toList())) {
                    Map<String, Object> ps = new HashMap<>();
                    ps.put("description", path.getPathDescription());
                    ps.put("confidence", path.getConfidence());
                    pathSummaries.add(ps);
                }
                result.put("graphPaths", pathSummaries);
            }
            return MAPPER.writeValueAsString(result);
    }

    private KnowledgeHit buildKnowledgeHit(KnowledgeBase kb,
                                           String query,
                                           String category,
                                           float semanticScore) {
        double keywordScore = computeKeywordScore(kb, query);
        double popularityScore = computePopularityScore(kb);
        double categoryBonus = (!category.isEmpty() && category.equalsIgnoreCase(safe(kb.getCategory()))) ? 0.08d : 0d;
        double semantic = Math.max(0d, semanticScore);
        double hybridScore = semantic * 0.55d + keywordScore * 0.40d + popularityScore * 0.05d + categoryBonus;

        KnowledgeHit hit = new KnowledgeHit();
        hit.setKnowledgeBase(kb);
        hit.setSemanticScore(semantic);
        hit.setKeywordScore(keywordScore);
        hit.setHybridScore(hybridScore);
        return hit;
    }

    private double computeKeywordScore(KnowledgeBase kb, String query) {
        String normalizedQuery = normalize(query);
        if (normalizedQuery.isEmpty()) {
            return 0d;
        }

        double score = 0d;
        String title = normalize(kb.getTitle());
        String keywords = normalize(kb.getKeywords());
        String content = normalize(kb.getContent());

        if (!title.isEmpty() && title.contains(normalizedQuery)) score += 0.55d;
        if (!keywords.isEmpty() && keywords.contains(normalizedQuery)) score += 0.70d;
        if (!content.isEmpty() && content.contains(normalizedQuery)) score += 0.35d;

        for (String token : splitQueryTokens(query)) {
            if (token.length() < 2) {
                continue;
            }
            String normalizedToken = normalize(token);
            if (normalizedToken.isEmpty()) {
                continue;
            }
            if (!title.isEmpty() && title.contains(normalizedToken)) score += 0.12d;
            if (!keywords.isEmpty() && keywords.contains(normalizedToken)) score += 0.18d;
            if (!content.isEmpty() && content.contains(normalizedToken)) score += 0.08d;
        }
        return Math.min(score, 1.0d);
    }

    private List<String> splitQueryTokens(String query) {
        return Arrays.stream(safe(query).split("[\\s,，、/|]+"))
                .map(String::trim)
                .filter(token -> !token.isEmpty())
                .collect(Collectors.toList());
    }

    private double computePopularityScore(KnowledgeBase kb) {
        int helpful = kb.getHelpfulCount() == null ? 0 : kb.getHelpfulCount();
        int views = kb.getViewCount() == null ? 0 : kb.getViewCount();
        double raw = Math.log1p(helpful * 2.0d + views * 0.25d) / 10.0d;
        return Math.min(raw, 1.0d);
    }

    private double round(double value) {
        return BigDecimal.valueOf(value).setScale(4, RoundingMode.HALF_UP).doubleValue();
    }

    private String normalize(String text) {
        return safe(text).toLowerCase(Locale.ROOT)
                .replace("\n", " ")
                .replace("\r", " ")
                .replace("\t", " ")
                .trim();
    }

    private String safe(String text) {
        return text == null ? "" : text;
    }

    @lombok.Data
    private static class KnowledgeHit {
        private KnowledgeBase knowledgeBase;
        private double semanticScore;
        private double keywordScore;
        private double hybridScore;
        private boolean graphBoosted;
    }
}
