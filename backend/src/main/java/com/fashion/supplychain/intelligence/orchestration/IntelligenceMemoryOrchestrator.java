package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse.MemoryItem;
import com.fashion.supplychain.intelligence.entity.IntelligenceMemory;
import com.fashion.supplychain.intelligence.mapper.IntelligenceMemoryMapper;
import com.fashion.supplychain.intelligence.service.QdrantService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 智能记忆编排器
 *
 * <p>职责：
 * <ul>
 *   <li>保存经验案例到 MySQL + Qdrant 向量库</li>
 *   <li>从 Qdrant 向量检索相似记忆，返回带相似度分数的结果</li>
 *   <li>标记某条记忆被采纳（统计有效性）</li>
 * </ul>
 *
 * <p>降级：Qdrant 不可用时仅写 MySQL，检索退化为 MySQL 关键词 LIKE。
 */
@Service
@Slf4j
public class IntelligenceMemoryOrchestrator {

    @Autowired
    private IntelligenceMemoryMapper memoryMapper;

    @Autowired
    private QdrantService qdrantService;

    // ──────────────────────────────────────────────────────────────

    /**
     * 保存一条经验案例并同步到 Qdrant 向量库。
     *
     * @param memoryType     case / knowledge / preference
     * @param businessDomain production / finance / warehouse
     * @param title          标题（用于 Qdrant payload）
     * @param content        正文（用于向量化）
     */
    @Transactional(rollbackFor = Exception.class)
    public IntelligenceMemoryResponse saveCase(
            String memoryType, String businessDomain, String title, String content) {

        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        IntelligenceMemoryResponse response = new IntelligenceMemoryResponse();

        // 1. 写入 MySQL
        IntelligenceMemory memory = new IntelligenceMemory();
        memory.setTenantId(tenantId);
        memory.setMemoryType(memoryType);
        memory.setBusinessDomain(businessDomain);
        memory.setTitle(title);
        memory.setContent(content);
        memory.setRecallCount(0);
        memory.setAdoptedCount(0);
        memory.setDeleteFlag(0);
        memory.setCreateTime(LocalDateTime.now());
        memory.setUpdateTime(LocalDateTime.now());
        memoryMapper.insert(memory);

        // 2. 同步 Qdrant（降级安全）
        boolean vectorSynced = false;
        try {
            if (qdrantService.isAvailable()) {
                String pointId = "mem_" + memory.getId();
                Map<String, Object> payload = Map.of(
                        "title", title,
                        "type", memoryType,
                    "domain", businessDomain,
                    "content", content == null ? "" : content);
                vectorSynced = qdrantService.upsertVector(pointId, tenantId, content, payload);
                if (vectorSynced) {
                    memory.setEmbeddingId(pointId);
                    memoryMapper.updateById(memory);
                }
            }
        } catch (Exception e) {
            log.warn("[记忆编排] Qdrant 同步失败，仅保留 MySQL 记录: {}", e.getMessage());
        }

        response.setSuccess(true);
        response.setSavedMemoryId(memory.getId());
        response.setVectorSynced(vectorSynced);
        log.info("[记忆编排] 保存记忆 id={} type={} domain={} vectorSynced={}",
                memory.getId(), memoryType, businessDomain, vectorSynced);
        return response;
    }

    /**
     * 向量语义检索相似记忆。Qdrant 不可用时退化为 MySQL LIKE 检索。
     */
    public IntelligenceMemoryResponse recallSimilar(Long tenantId, String queryText, int topK) {
        IntelligenceMemoryResponse response = new IntelligenceMemoryResponse();
        List<MemoryItem> items = new ArrayList<>();

        Map<String, Float> semanticScoreMap = new LinkedHashMap<>();
        List<IntelligenceMemory> semanticRecords = new ArrayList<>();
        try {
            if (qdrantService.isAvailable()) {
                List<QdrantService.ScoredPoint> hits = qdrantService.search(tenantId, queryText, Math.max(topK * 2, 6));
                if (!hits.isEmpty()) {
                    List<String> pointIds = hits.stream()
                            .map(QdrantService.ScoredPoint::getPointId)
                            .collect(Collectors.toList());
                    for (QdrantService.ScoredPoint hit : hits) {
                        semanticScoreMap.put(hit.getPointId(), hit.getScore());
                    }
                    // 按 embedding_id 批量查 DB
                    semanticRecords = memoryMapper.selectList(
                            new QueryWrapper<IntelligenceMemory>()
                                    .in("embedding_id", pointIds)
                                    .eq("tenant_id", tenantId)
                                    .eq("delete_flag", 0));
                }
            }
        } catch (Exception e) {
            log.warn("[记忆检索] Qdrant 检索失败，退化为 LIKE 检索: {}", e.getMessage());
        }

        // 关键词召回：无论Qdrant是否命中都补充，增强生产稳定性
        String keyword = queryText.length() > 30 ? queryText.substring(0, 30) : queryText;
        List<IntelligenceMemory> keywordRecords = memoryMapper.selectList(
                new QueryWrapper<IntelligenceMemory>()
                        .eq("tenant_id", tenantId)
                        .eq("delete_flag", 0)
                        .and(wrapper -> wrapper.like("title", keyword)
                                .or().like("content", keyword)
                                .or().like("business_domain", keyword)
                                .or().like("memory_type", keyword))
                        .orderByDesc("adopted_count")
                        .last("LIMIT " + Math.max(topK * 2, 6)));

        LinkedHashMap<Long, IntelligenceMemory> candidateMap = new LinkedHashMap<>();
        for (IntelligenceMemory record : semanticRecords) {
            candidateMap.put(record.getId(), record);
        }
        for (IntelligenceMemory record : keywordRecords) {
            candidateMap.putIfAbsent(record.getId(), record);
        }

        List<MemoryHit> ranked = candidateMap.values().stream()
                .map(memory -> buildMemoryHit(memory, queryText,
                        semanticScoreMap.getOrDefault(memory.getEmbeddingId(), 0f)))
                .sorted(Comparator.comparing(MemoryHit::getHybridScore).reversed()
                        .thenComparing(MemoryHit::getKeywordScore).reversed()
                        .thenComparing(MemoryHit::getSemanticScore).reversed())
                .limit(topK)
                .collect(Collectors.toList());

        for (MemoryHit hit : ranked) {
            MemoryItem item = toMemoryItem(hit.getMemory(), (float) hit.getHybridScore());
            items.add(item);
            try {
                IntelligenceMemory update = new IntelligenceMemory();
                update.setId(hit.getMemory().getId());
                update.setRelevanceScore(BigDecimal.valueOf(hit.getHybridScore()).setScale(4, RoundingMode.HALF_UP));
                memoryMapper.updateById(update);
            } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        }

        response.setRecalled(items);
        response.setRecalledTotal(items.size());
        return response;
    }

    /**
     * 标记某条记忆被采纳（提升其排名权重）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void markAdopted(Long memoryId) {
        memoryMapper.incrementAdoptedCount(memoryId);
        memoryMapper.incrementRecallCount(memoryId);
    }

    // ──────────────────────────────────────────────────────────────

    private MemoryItem toMemoryItem(IntelligenceMemory m, float score) {
        MemoryItem item = new MemoryItem();
        item.setMemoryId(m.getId());
        item.setMemoryType(m.getMemoryType());
        item.setBusinessDomain(m.getBusinessDomain());
        item.setTitle(m.getTitle());
        item.setContent(m.getContent());
        item.setSimilarityScore(Math.round(score * 10000f) / 10000f);
        item.setRecallCount(m.getRecallCount() == null ? 0 : m.getRecallCount());
        item.setAdoptedCount(m.getAdoptedCount() == null ? 0 : m.getAdoptedCount());
        return item;
    }

    private MemoryHit buildMemoryHit(IntelligenceMemory memory, String queryText, float semanticScore) {
        double keywordScore = computeKeywordScore(memory, queryText);
        double adoptionScore = computeAdoptionScore(memory);
        double semantic = Math.max(0d, semanticScore);
        // 采纳率权重：0.10→0.15，让被用户采纳过的经验更容易被召回；语义权重相应微降 0.58→0.53
        double rawScore = semantic * 0.53d + keywordScore * 0.32d + adoptionScore * 0.15d;

        // 记忆时间衰减：半衰期90天，越旧的记忆权重越低，避免过时建议误导决策
        double decayFactor = 1.0d;
        if (memory.getCreateTime() != null) {
            long daysSinceCreated = ChronoUnit.DAYS.between(memory.getCreateTime(), LocalDateTime.now());
            decayFactor = Math.exp(-0.0077d * Math.max(daysSinceCreated, 0));  // ln(2)/90 ≈ 0.0077
        }
        double hybridScore = rawScore * decayFactor;

        MemoryHit hit = new MemoryHit();
        hit.setMemory(memory);
        hit.setSemanticScore(semantic);
        hit.setKeywordScore(keywordScore);
        hit.setHybridScore(Math.min(hybridScore, 1.0d));
        return hit;
    }

    private double computeKeywordScore(IntelligenceMemory memory, String queryText) {
        String query = normalize(queryText);
        if (query.isEmpty()) {
            return 0d;
        }
        String title = normalize(memory.getTitle());
        String content = normalize(memory.getContent());
        String domain = normalize(memory.getBusinessDomain());
        String type = normalize(memory.getMemoryType());

        double score = 0d;
        if (title.contains(query)) score += 0.55d;
        if (content.contains(query)) score += 0.35d;
        if (domain.contains(query)) score += 0.18d;
        if (type.contains(query)) score += 0.12d;

        for (String token : Arrays.stream(safe(queryText).split("[\\s,，、/|]+"))
                .map(String::trim)
                .filter(token -> token.length() >= 2)
                .collect(Collectors.toList())) {
            String t = normalize(token);
            if (title.contains(t)) score += 0.10d;
            if (content.contains(t)) score += 0.06d;
        }
        return Math.min(score, 1.0d);
    }

    private double computeAdoptionScore(IntelligenceMemory memory) {
        int adopted = memory.getAdoptedCount() == null ? 0 : memory.getAdoptedCount();
        int recalled = memory.getRecallCount() == null ? 0 : memory.getRecallCount();
        // 系数调大：adopted 2.0→3.0，recalled 0.3→0.5，让少量采纳也能显著影响排序
        double raw = Math.log1p(adopted * 3.0d + recalled * 0.5d) / 10.0d;
        return Math.min(raw, 1.0d);
    }

    private String normalize(String text) {
        return safe(text).toLowerCase().replace("\n", " ").replace("\r", " ").trim();
    }

    private String safe(String text) {
        return text == null ? "" : text;
    }

    @lombok.Data
    private static class MemoryHit {
        private IntelligenceMemory memory;
        private double semanticScore;
        private double keywordScore;
        private double hybridScore;
    }
}
