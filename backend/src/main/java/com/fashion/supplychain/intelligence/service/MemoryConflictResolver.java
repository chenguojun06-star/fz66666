package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 记忆冲突消解服务（Gen2.5 双时态升级）
 * <p>
 * 核心思想：同 subject 的新事实写入时，自动失效旧事实，
 * 保留历史版本，支持"某时刻事实为真"的时序查询。
 * <p>
 * 参考 Zep Graphiti 双时态知识图设计（bi-temporal knowledge graph）。
 */
@Slf4j
@Service
@Lazy
public class MemoryConflictResolver {

    @Autowired
    private AiLongMemoryMapper longMemoryMapper;

    /**
     * 写入事实记忆时执行冲突消解
     * - 先查找同 tenant + 同 fact_key + 当前有效的旧事实
     * - 将旧事实的 invalid_at 设为当前时间
     * - 再插入新事实（valid_from = 当前时间）
     */
    public void upsertFactWithConflictResolution(AiLongMemory newMemory) {
        if (newMemory == null) return;
        if (newMemory.getTenantId() == null) return;
        if (!"FACT".equals(newMemory.getLayer())) {
            longMemoryMapper.insert(newMemory);
            return;
        }

        String factKey = newMemory.getFactKey();
        if (factKey == null || factKey.isBlank()) {
            factKey = buildFactKey(newMemory);
            newMemory.setFactKey(factKey);
        }

        if (newMemory.getValidFrom() == null) {
            newMemory.setValidFrom(LocalDateTime.now());
        }

        try {
            List<AiLongMemory> activeFacts = longMemoryMapper.selectList(
                new LambdaQueryWrapper<AiLongMemory>()
                    .eq(AiLongMemory::getTenantId, newMemory.getTenantId())
                    .eq(AiLongMemory::getFactKey, factKey)
                    .eq(AiLongMemory::getLayer, "FACT")
                    .eq(AiLongMemory::getDeleteFlag, 0)
                    .isNull(AiLongMemory::getInvalidAt)
                    .last("LIMIT 100"));

            int invalidated = 0;
            for (AiLongMemory old : activeFacts) {
                if (old.getId().equals(newMemory.getId())) continue;
                old.setInvalidAt(LocalDateTime.now());
                old.setUpdateTime(LocalDateTime.now());
                longMemoryMapper.updateById(old);
                invalidated++;
            }

            if (invalidated > 0) {
                log.debug("[MemoryConflict] 冲突消解：factKey={} 失效{}条旧事实", factKey, invalidated);
            }

            longMemoryMapper.insert(newMemory);

        } catch (Exception e) {
            log.warn("[MemoryConflict] 冲突消解异常，降级为直接插入: {}", e.getMessage());
            try {
                longMemoryMapper.insert(newMemory);
            } catch (Exception ex) {
                log.error("[MemoryConflict] 降级插入也失败: {}", ex.getMessage());
            }
        }
    }

    /**
     * 构建事实唯一键
     * 格式：subjectType:subjectId:predicate
     * - predicate 从 content 中提取关键词（简化版）
     */
    public String buildFactKey(AiLongMemory memory) {
        StringBuilder sb = new StringBuilder();
        sb.append(memory.getSubjectType() != null ? memory.getSubjectType() : "unknown");
        sb.append(":");
        sb.append(memory.getSubjectId() != null ? memory.getSubjectId() : "global");
        sb.append(":");
        String content = memory.getContent();
        if (content != null && content.length() > 32) {
            content = content.substring(0, 32);
        }
        sb.append(content != null ? content.replaceAll("\\s+", "_") : "default");
        return sb.toString();
    }

    /**
     * 查询某租户当前所有有效事实
     */
    public List<AiLongMemory> listActiveFacts(Long tenantId, String subjectType, int limit) {
        LambdaQueryWrapper<AiLongMemory> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AiLongMemory::getTenantId, tenantId)
            .eq(AiLongMemory::getLayer, "FACT")
            .eq(AiLongMemory::getDeleteFlag, 0)
            .isNull(AiLongMemory::getInvalidAt)
            .orderByDesc(AiLongMemory::getHitCount)
            .last("LIMIT " + limit);

        if (subjectType != null && !subjectType.isBlank()) {
            wrapper.eq(AiLongMemory::getSubjectType, subjectType);
        }

        return longMemoryMapper.selectList(wrapper);
    }

    /**
     * 查询某事实的历史版本（时间线）
     */
    public List<AiLongMemory> listFactHistory(Long tenantId, String factKey, int limit) {
        return longMemoryMapper.selectList(
            new LambdaQueryWrapper<AiLongMemory>()
                .eq(AiLongMemory::getTenantId, tenantId)
                .eq(AiLongMemory::getFactKey, factKey)
                .eq(AiLongMemory::getDeleteFlag, 0)
                .orderByAsc(AiLongMemory::getValidFrom)
                .last("LIMIT " + limit));
    }
}
