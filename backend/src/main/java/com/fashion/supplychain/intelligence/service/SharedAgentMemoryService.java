package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.entity.SharedAgentMemory;
import com.fashion.supplychain.intelligence.mapper.SharedAgentMemoryMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 多 Agent 共享记忆服务（五层记忆模型第六章）。
 *
 * <p>同会话内 Sub-Agent（扫码/质检/工资）共享事实，避免重复查询和事实冲突。
 *
 * <p>核心能力：
 * <ul>
 *   <li>{@link #writeFact} — Sub-Agent 执行后写入发现的事实</li>
 *   <li>{@link #readFacts} — Sub-Agent 执行前读取共享记忆</li>
 *   <li>{@link #detectConflicts} — 检测同 fact_key 的冲突（confidence 高的覆盖低的）</li>
 *   <li>{@link #purgeExpiredJob} — 每天清理过期记录</li>
 * </ul>
 *
 * <p>设计原则：
 * <ul>
 *   <li>多租户隔离（P0 铁律 4）：所有查询带 tenant_id WHERE</li>
 *   <li>会话隔离：按 session_id 隔离，同会话内共享，跨会话不共享</li>
 *   <li>冲突检测：同 fact_key 重复写入时，confidence 高的覆盖低的；同 confidence 时保留最新</li>
 *   <li>过期清理：会话结束 24h 后过期，定时任务清理</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class SharedAgentMemoryService {

    private final SharedAgentMemoryMapper sharedAgentMemoryMapper;

    /** 默认置信度 */
    private static final BigDecimal DEFAULT_CONFIDENCE = new BigDecimal("0.80");
    /** 默认过期时间（写入后 24h） */
    private static final long DEFAULT_TTL_HOURS = 24L;

    /**
     * 写入事实（多租户隔离）。
     *
     * <p>冲突检测：同 session_id + fact_key 已存在时，
     * confidence 高的覆盖低的；同 confidence 时保留最新（覆盖）。
     *
     * @param tenantId    租户ID
     * @param sessionId   会话ID
     * @param agentName   写入的 Agent 名（scan_agent/quality_agent/wage_agent）
     * @param factKey     事实键（order_status/quality_result/...）
     * @param factValue   事实值 JSON
     * @param confidence  置信度 0-100（null 用默认 0.80）
     */
    public void writeFact(Long tenantId, String sessionId, String agentName,
                           String factKey, String factValue, BigDecimal confidence) {
        if (tenantId == null || sessionId == null || factKey == null || factValue == null) return;
        try {
            BigDecimal conf = confidence != null ? confidence : DEFAULT_CONFIDENCE;
            SharedAgentMemory existing = sharedAgentMemoryMapper.findFact(tenantId, sessionId, factKey);
            if (existing == null) {
                SharedAgentMemory fact = new SharedAgentMemory();
                fact.setTenantId(tenantId);
                fact.setSessionId(sessionId);
                fact.setAgentName(agentName);
                fact.setFactKey(factKey);
                fact.setFactValue(factValue);
                fact.setConfidence(conf);
                fact.setExpireTime(LocalDateTime.now().plusHours(DEFAULT_TTL_HOURS));
                sharedAgentMemoryMapper.insert(fact);
            } else {
                // 冲突检测：confidence 高的覆盖低的；同 confidence 时保留最新
                BigDecimal existingConf = existing.getConfidence() == null ? BigDecimal.ZERO : existing.getConfidence();
                if (conf.compareTo(existingConf) >= 0) {
                    existing.setAgentName(agentName);
                    existing.setFactValue(factValue);
                    existing.setConfidence(conf);
                    sharedAgentMemoryMapper.updateById(existing);
                    log.debug("[SharedMem] 事实更新 tenant={} session={} key={} conf={}→{}",
                            tenantId, sessionId, factKey, existingConf, conf);
                } else {
                    log.debug("[SharedMem] 事实保留（新conf {} < 旧conf {}）tenant={} session={} key={}",
                            conf, existingConf, tenantId, sessionId, factKey);
                }
            }
        } catch (Exception e) {
            log.warn("[SharedMem] writeFact 失败 tenant={} session={} key={}: {}",
                    tenantId, sessionId, factKey, e.getMessage());
        }
    }

    /**
     * 读取会话内所有事实（多租户隔离）。
     */
    public List<SharedAgentMemory> readFacts(Long tenantId, String sessionId) {
        if (tenantId == null || sessionId == null) return java.util.Collections.emptyList();
        try {
            return sharedAgentMemoryMapper.findFactsBySession(tenantId, sessionId);
        } catch (Exception e) {
            log.warn("[SharedMem] readFacts 失败 tenant={} session={}: {}", tenantId, sessionId, e.getMessage());
            return java.util.Collections.emptyList();
        }
    }

    /**
     * 检测会话内的事实冲突（同 fact_key 多个 Agent 写入不同值）。
     *
     * <p>注意：由于 uk_session_fact 唯一索引，同 session_id + fact_key 只有一条记录，
     * 冲突已在 writeFact 时通过 confidence 比较 resolved。本方法返回的是"曾被多个 Agent 写入"的事实
     * （通过 agentName 与当前记录对比，需要外部传入历史记录）。
     *
     * <p>V1 实现：返回空列表（冲突在 writeFact 时已 resolved）。
     * V2 可扩展为记录写入历史，检测 Agent 间分歧。
     */
    public List<String> detectConflicts(Long tenantId, String sessionId) {
        return java.util.Collections.emptyList();
    }

    /**
     * 每天清理过期记录（会话结束 24h 后）。
     */
    @Scheduled(cron = "0 0 4 * * ?")
    public void purgeExpiredJob() {
        try {
            int purged = sharedAgentMemoryMapper.purgeExpired();
            if (purged > 0) {
                log.info("[SharedMem] 清理过期共享记忆 {} 条", purged);
            }
        } catch (Exception e) {
            log.warn("[SharedMem] 清理过期记录失败: {}", e.getMessage());
        }
    }
}
