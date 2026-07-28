package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.SharedAgentMemory;
import com.fashion.supplychain.intelligence.mapper.SharedAgentMemoryMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;

/**
 * 多Agent共享记忆服务
 *
 * <p>同会话内 Sub-Agent 共享事实，避免重复查询和事实冲突</p>
 * <p>不加 @Transactional（D-001：Service 层禁止事务）</p>
 * <p>共享记忆失败不影响主流程，异常吞掉仅 log.warn</p>
 *
 * <p>P3-1 升级（2026-07-28）：滑动续期
 * <ul>
 *   <li>读取命中时自动延长 expire_time 至 NOW + 24h</li>
 *   <li>硬上限：单条事实最长生命周期 7 天（从 createTime 起算）</li>
 *   <li>避免长时间不活跃的会话仍占用共享记忆</li>
 *   <li>续期失败不影响读取（best-effort）</li>
 * </ul>
 *
 * @author xiaoyun
 * @since 2026-07-22
 * @version P3-1 2026-07-28 滑动续期
 */
@Slf4j
@Service
public class SharedAgentMemoryService {

    /** 滑动续期延长时长（小时） */
    private static final long SLIDING_EXTEND_HOURS = 24;

    /** 单条事实最长生命周期（天，硬上限，防止无限续期） */
    private static final long MAX_LIFETIME_DAYS = 7;

    @Autowired
    private SharedAgentMemoryMapper sharedAgentMemoryMapper;

    /**
     * 写入/更新事实（UPSERT 语义：同 session_id+fact_key 则 UPDATE，否则 INSERT）
     *
     * <p>confidence 使用 BigDecimal（与 entity 字段类型一致，避免浮点精度损失）</p>
     *
     * @param tenantId   租户ID（P0铁律4）
     * @param sessionId  会话ID（隔离边界）
     * @param agentName  Agent名称
     * @param factKey    事实键
     * @param factValue  事实值JSON
     * @param confidence 置信度0-100（null 时默认 0.80）
     */
    public void writeFact(Long tenantId, String sessionId, String agentName,
                          String factKey, String factValue, BigDecimal confidence) {
        try {
            LambdaQueryWrapper<SharedAgentMemory> qw = new LambdaQueryWrapper<>();
            qw.eq(SharedAgentMemory::getTenantId, tenantId)
              .eq(SharedAgentMemory::getSessionId, sessionId)
              .eq(SharedAgentMemory::getFactKey, factKey);
            SharedAgentMemory existing = sharedAgentMemoryMapper.selectOne(qw);

            LocalDateTime now = LocalDateTime.now();
            LocalDateTime expireAt = now.plusHours(SLIDING_EXTEND_HOURS);
            BigDecimal conf = (confidence != null) ? confidence : new BigDecimal("0.80");

            if (existing != null) {
                existing.setAgentName(agentName);
                existing.setFactValue(factValue);
                existing.setConfidence(conf);
                existing.setCreateTime(now);
                existing.setExpireTime(expireAt);
                sharedAgentMemoryMapper.updateById(existing);
            } else {
                SharedAgentMemory mem = new SharedAgentMemory();
                mem.setTenantId(tenantId);
                mem.setSessionId(sessionId);
                mem.setAgentName(agentName);
                mem.setFactKey(factKey);
                mem.setFactValue(factValue);
                mem.setConfidence(conf);
                mem.setCreateTime(now);
                mem.setExpireTime(expireAt);
                sharedAgentMemoryMapper.insert(mem);
            }
        } catch (Exception e) {
            log.warn("[SharedAgentMemory] writeFact 失败(不影响主流程): tenant={}, session={}, key={}, err={}",
                    tenantId, sessionId, factKey, e.getMessage());
        }
    }

    /**
     * 读取会话内所有有效事实（未过期）
     *
     * <p>P3-1：读取命中时触发滑动续期（best-effort，失败不影响读取）
     */
    public List<SharedAgentMemory> readFacts(Long tenantId, String sessionId) {
        try {
            List<SharedAgentMemory> facts = sharedAgentMemoryMapper.findBySession(tenantId, sessionId);
            // P3-1：滑动续期（有命中才续期，避免空查询触发 UPDATE）
            if (facts != null && !facts.isEmpty()) {
                slideExpireBestEffort(tenantId, sessionId, facts);
            }
            return facts;
        } catch (Exception e) {
            log.warn("[SharedAgentMemory] readFacts 失败(不影响主流程): tenant={}, session={}, err={}",
                    tenantId, sessionId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 读取单条事实（仅返回未过期的）
     *
     * <p>P3-1：读取命中时触发滑动续期（best-effort）
     *
     * @return 事实值JSON，不存在或已过期返回 null
     */
    public String readFact(Long tenantId, String sessionId, String factKey) {
        try {
            List<SharedAgentMemory> facts = sharedAgentMemoryMapper.findBySession(tenantId, sessionId);
            String value = facts.stream()
                    .filter(m -> factKey.equals(m.getFactKey()))
                    .map(SharedAgentMemory::getFactValue)
                    .findFirst()
                    .orElse(null);
            // P3-1：命中才续期
            if (value != null) {
                slideExpireBestEffort(tenantId, sessionId, facts);
            }
            return value;
        } catch (Exception e) {
            log.warn("[SharedAgentMemory] readFact 失败(不影响主流程): tenant={}, session={}, key={}, err={}",
                    tenantId, sessionId, factKey, e.getMessage());
            return null;
        }
    }

    /**
     * 清理过期记忆（由定时任务 SharedAgentMemoryCleanupJob 调用）
     */
    public void purgeExpired() {
        try {
            int deleted = sharedAgentMemoryMapper.purgeExpired();
            if (deleted > 0) {
                log.info("[SharedAgentMemory] 清理过期共享记忆: 删除{}条", deleted);
            }
        } catch (Exception e) {
            log.warn("[SharedAgentMemory] purgeExpired 失败(不影响主流程): {}", e.getMessage());
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // P3-1：滑动续期内部实现
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * P3-1 滑动续期（best-effort，失败不抛异常）
     *
     * <p>策略：
     * <ul>
     *   <li>newExpire = NOW + 24h（每次读取延长 24h）</li>
     *   <li>maxExpire = 最早 createTime + 7 天（硬上限，防止无限续期）</li>
     *   <li>SQL 限制：只续期 expire_time &lt; maxExpire 的记录</li>
     * </ul>
     *
     * <p>注意：maxExpire 用最早 createTime 计算，保证所有事实在同一时间点统一到期，
     * 避免 Agent A 的事实比 Agent B 的事实更早过期导致协作时序混乱。
     */
    private void slideExpireBestEffort(Long tenantId, String sessionId, List<SharedAgentMemory> facts) {
        try {
            // 计算硬上限：最早 createTime + 7 天
            LocalDateTime earliestCreate = facts.stream()
                    .map(SharedAgentMemory::getCreateTime)
                    .filter(java.util.Objects::nonNull)
                    .min(LocalDateTime::compareTo)
                    .orElse(LocalDateTime.now());
            LocalDateTime maxExpire = earliestCreate.plusDays(MAX_LIFETIME_DAYS);

            LocalDateTime newExpireRaw = LocalDateTime.now().plusHours(SLIDING_EXTEND_HOURS);

            // 不超过硬上限
            final LocalDateTime newExpire;
            if (newExpireRaw.isAfter(maxExpire)) {
                newExpire = maxExpire;
            } else {
                newExpire = newExpireRaw;
            }

            // 已经过期或即将过期才需要续期（避免每次读取都触发 UPDATE）
            boolean needExtend = facts.stream().anyMatch(m ->
                    m.getExpireTime() == null || m.getExpireTime().isBefore(newExpire.minusHours(1)));
            if (!needExtend) {
                return;
            }

            int renewed = sharedAgentMemoryMapper.extendExpire(tenantId, sessionId, newExpire, maxExpire);
            if (renewed > 0) {
                log.debug("[SharedAgentMemory] 滑动续期 tenant={} session={} 续期{}条",
                        tenantId, sessionId, renewed);
            }
        } catch (Exception e) {
            log.debug("[SharedAgentMemory] 滑动续期失败(不影响读取): tenant={}, session={}, err={}",
                    tenantId, sessionId, e.getMessage());
        }
    }
}
