package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse;
import com.fashion.supplychain.intelligence.dto.IntelligenceMemoryResponse.MemoryItem;
import com.fashion.supplychain.intelligence.entity.IntelligenceMemory;
import com.fashion.supplychain.intelligence.mapper.IntelligenceMemoryMapper;
import com.fashion.supplychain.intelligence.service.QdrantService;
import java.time.LocalDateTime;
import java.util.ArrayList;
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
                        "domain", businessDomain);
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

        boolean vectorOk = false;
        try {
            if (qdrantService.isAvailable()) {
                List<QdrantService.ScoredPoint> hits = qdrantService.search(tenantId, queryText, topK);
                if (!hits.isEmpty()) {
                    vectorOk = true;
                    List<String> pointIds = hits.stream()
                            .map(QdrantService.ScoredPoint::getPointId)
                            .collect(Collectors.toList());
                    // 按 embedding_id 批量查 DB
                    List<IntelligenceMemory> dbRecords = memoryMapper.selectList(
                            new QueryWrapper<IntelligenceMemory>()
                                    .in("embedding_id", pointIds)
                                    .eq("tenant_id", tenantId)
                                    .eq("delete_flag", 0));
                    Map<String, IntelligenceMemory> byEmbedId = dbRecords.stream()
                            .collect(Collectors.toMap(
                                    IntelligenceMemory::getEmbeddingId,
                                    m -> m, (a, b) -> a));
                    for (QdrantService.ScoredPoint hit : hits) {
                        IntelligenceMemory m = byEmbedId.get(hit.getPointId());
                        if (m != null) items.add(toMemoryItem(m, hit.getScore()));
                    }
                }
            }
        } catch (Exception e) {
            log.warn("[记忆检索] Qdrant 检索失败，退化为 LIKE 检索: {}", e.getMessage());
        }

        // 降级：MySQL LIKE
        if (!vectorOk) {
            String keyword = queryText.length() > 20 ? queryText.substring(0, 20) : queryText;
            List<IntelligenceMemory> dbRecords = memoryMapper.selectList(
                    new QueryWrapper<IntelligenceMemory>()
                            .eq("tenant_id", tenantId)
                            .eq("delete_flag", 0)
                            .like("content", keyword)
                            .orderByDesc("adopted_count")
                            .last("LIMIT " + topK));
            for (IntelligenceMemory m : dbRecords) {
                items.add(toMemoryItem(m, 0.5f));
            }
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
        memoryMapper.incrementAdopted(memoryId);
        memoryMapper.incrementRecall(memoryId);
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
}
