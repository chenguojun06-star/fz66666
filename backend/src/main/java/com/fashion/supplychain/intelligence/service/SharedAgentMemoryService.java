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
 * @author xiaoyun
 * @since 2026-07-22
 */
@Slf4j
@Service
public class SharedAgentMemoryService {

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
            LocalDateTime expireAt = now.plusHours(24);
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
     */
    public List<SharedAgentMemory> readFacts(Long tenantId, String sessionId) {
        try {
            return sharedAgentMemoryMapper.findBySession(tenantId, sessionId);
        } catch (Exception e) {
            log.warn("[SharedAgentMemory] readFacts 失败(不影响主流程): tenant={}, session={}, err={}",
                    tenantId, sessionId, e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 读取单条事实（仅返回未过期的）
     *
     * @return 事实值JSON，不存在或已过期返回 null
     */
    public String readFact(Long tenantId, String sessionId, String factKey) {
        try {
            List<SharedAgentMemory> facts = sharedAgentMemoryMapper.findBySession(tenantId, sessionId);
            return facts.stream()
                    .filter(m -> factKey.equals(m.getFactKey()))
                    .map(SharedAgentMemory::getFactValue)
                    .findFirst()
                    .orElse(null);
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
}
