package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiLongMemory;
import com.fashion.supplychain.intelligence.mapper.AiLongMemoryMapper;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 长期记忆三层架构
 * <p>FACT(事实)、EPISODIC(过程)、REFLECTIVE(反思)。
 * <br>租户层 (TENANT) 仅自身可见；平台层 (PLATFORM_GLOBAL) 由超管沉淀的跨租户匿名经验。</p>
 */
@Slf4j
@Service
public class LongTermMemoryOrchestrator {

    @Autowired
    private AiLongMemoryMapper memoryMapper;

    /**
     * 写入租户级记忆（FACT/EPISODIC/REFLECTIVE）
     */
    public AiLongMemory writeTenantMemory(String layer, String subjectType, String subjectId,
                                          String subjectName, String content, String embeddingId,
                                          BigDecimal confidence, String sourceSessionId) {
        AiLongMemory m = baseRecord(layer, subjectType, subjectId, subjectName, content,
            embeddingId, confidence, sourceSessionId);
        m.setScope("TENANT");
        m.setTenantId(UserContext.tenantId());
        memoryMapper.insert(m);
        return m;
    }

    /**
     * 写入平台级匿名经验（仅超管可调用，需脱敏后传入）
     */
    public AiLongMemory writePlatformMemory(String layer, String subjectType, String content,
                                            String embeddingId, BigDecimal confidence) {
        AiLongMemory m = baseRecord(layer, subjectType, null, null, content, embeddingId,
            confidence, null);
        m.setScope("PLATFORM_GLOBAL");
        m.setTenantId(null);
        memoryMapper.insert(m);
        return m;
    }

    /**
     * 检索：当前租户记忆 + 平台全局经验（合并返回）
     */
    public List<AiLongMemory> retrieve(String subjectType, String subjectId, int limit) {
        Long tid = UserContext.tenantId();
        LambdaQueryWrapper<AiLongMemory> w = new LambdaQueryWrapper<>();
        w.eq(subjectType != null, AiLongMemory::getSubjectType, subjectType)
         .eq(subjectId != null, AiLongMemory::getSubjectId, subjectId)
         .eq(AiLongMemory::getDeleteFlag, 0)
         .and(q -> q.eq(AiLongMemory::getScope, "PLATFORM_GLOBAL")
                    .or(o -> o.eq(AiLongMemory::getScope, "TENANT")
                              .eq(AiLongMemory::getTenantId, tid)))
         .orderByDesc(AiLongMemory::getConfidence)
         .last("LIMIT " + Math.min(Math.max(limit, 1), 50));
        return memoryMapper.selectList(w);
    }

    public void incrementHit(Long id) {
        try {
            memoryMapper.incrementHit(id);
        } catch (Exception e) {
            log.warn("[Memory] 递增命中失败 id={} err={}", id, e.getMessage());
        }
    }

    private AiLongMemory baseRecord(String layer, String subjectType, String subjectId,
                                    String subjectName, String content, String embeddingId,
                                    BigDecimal confidence, String sourceSessionId) {
        AiLongMemory m = new AiLongMemory();
        m.setMemoryUid(UUID.randomUUID().toString().replace("-", ""));
        m.setLayer(layer == null ? "FACT" : layer);
        m.setSubjectType(subjectType);
        m.setSubjectId(subjectId);
        m.setSubjectName(subjectName);
        m.setContent(content);
        m.setEmbeddingId(embeddingId);
        m.setConfidence(confidence == null ? BigDecimal.valueOf(60) : confidence);
        m.setHitCount(0);
        m.setSourceSessionId(sourceSessionId);
        m.setSourceUserId(UserContext.userId());
        m.setVerified(0);
        m.setDeleteFlag(0);
        m.setCreateTime(LocalDateTime.now());
        m.setUpdateTime(LocalDateTime.now());
        return m;
    }
}
