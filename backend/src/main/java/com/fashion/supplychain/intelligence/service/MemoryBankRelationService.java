package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.entity.MemoryBankEntry;
import com.fashion.supplychain.intelligence.entity.MemoryBankRelation;
import com.fashion.supplychain.intelligence.mapper.MemoryBankRelationMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Memory Bank 知识图谱关系服务（ConPort 模式）。
 *
 * <p>提供 decisions ↔ progress ↔ architecture 之间的显式关系管理，
 * 支持 CTE 递归遍历（maxDepth ≤2 防爆炸）。
 *
 * <p>关系类型：
 * <ul>
 *   <li>IMPACTS — A 影响 B（如 D-018 IMPACTS INC-20260611-001）</li>
 *   <li>DEPENDS_ON — A 依赖 B</li>
 *   <li>EVOLVES_FROM — A 由 B 演化而来（如 D-021 EVOLVES_FROM D-018）</li>
 *   <li>REFERENCES — A 引用 B</li>
 * </ul>
 *
 * <p>多租户隔离：所有查询带 tenant_id（P0 铁律）。
 */
@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class MemoryBankRelationService {

    private final MemoryBankRelationMapper relationMapper;
    private final MemoryBankDbService memoryBankDbService;

    /** 图谱遍历最大深度（防爆炸） */
    private static final int MAX_TRAVERSE_DEPTH = 2;

    /**
     * 添加知识图谱关系（委托 MemoryBankDbService，自动解析 key 为 entryId）。
     */
    public void addRelation(Long tenantId, String sourceKey, String targetKey,
                             String relationType, double weight) {
        memoryBankDbService.addRelation(tenantId, sourceKey, targetKey, relationType, weight);
    }

    /**
     * 查询某条目的出边关系（source = entryId）。
     */
    public List<MemoryBankRelation> getOutgoingRelations(Long tenantId, String entryKey) {
        MemoryBankEntry entry = resolveEntry(tenantId, entryKey);
        if (entry == null) return List.of();
        return relationMapper.selectOutgoing(tenantId, entry.getId());
    }

    /**
     * 查询某条目的入边关系（target = entryId）。
     */
    public List<MemoryBankRelation> getIncomingRelations(Long tenantId, String entryKey) {
        MemoryBankEntry entry = resolveEntry(tenantId, entryKey);
        if (entry == null) return List.of();
        return relationMapper.selectIncoming(tenantId, entry.getId());
    }

    /**
     * CTE 递归遍历知识图谱（从 entryKey 出发，maxDepth ≤2）。
     *
     * <p>防爆炸：maxDepth 强制限制 ≤ {@link #MAX_TRAVERSE_DEPTH}。
     *
     * @return 关联条目列表（不含起点本身）
     */
    public List<MemoryBankEntry> traverseGraph(Long tenantId, String startKey, int maxDepth) {
        MemoryBankEntry entry = resolveEntry(tenantId, startKey);
        if (entry == null) return List.of();
        int safeDepth = Math.min(Math.max(maxDepth, 1), MAX_TRAVERSE_DEPTH);
        return relationMapper.traverseGraph(tenantId, entry.getId(), safeDepth);
    }

    private MemoryBankEntry resolveEntry(Long tenantId, String entryKey) {
        if (tenantId == null || entryKey == null) return null;
        return memoryBankDbService.getEntry(tenantId, "decision_log", entryKey)
                .or(() -> memoryBankDbService.getEntry(tenantId, "progress", entryKey))
                .or(() -> memoryBankDbService.getEntry(tenantId, "product_context", entryKey))
                .orElse(null);
    }
}
