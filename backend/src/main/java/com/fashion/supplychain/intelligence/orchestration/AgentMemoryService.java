package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AgentMemoryArchival;
import com.fashion.supplychain.intelligence.entity.AgentMemoryCore;
import com.fashion.supplychain.intelligence.mapper.AgentMemoryArchivalMapper;
import com.fashion.supplychain.intelligence.mapper.AgentMemoryCoreMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class AgentMemoryService {

    private static final double DECAY_RATE = 0.3;
    private static final int DECAY_THRESHOLD_DAYS = 180;

    private final AgentMemoryCoreMapper coreMapper;
    private final AgentMemoryArchivalMapper archivalMapper;

    public String getCoreMemory(Long tenantId, String agentId, String key) {
        AgentMemoryCore core = coreMapper.selectOne(
                new LambdaQueryWrapper<AgentMemoryCore>()
                        .eq(AgentMemoryCore::getTenantId, tenantId)
                        .eq(AgentMemoryCore::getAgentId, agentId)
                        .eq(AgentMemoryCore::getMemoryKey, key));
        return core != null ? core.getMemoryValue() : null;
    }

    public void setCoreMemory(Long tenantId, String agentId, String key, String value) {
        AgentMemoryCore existing = coreMapper.selectOne(
                new LambdaQueryWrapper<AgentMemoryCore>()
                        .eq(AgentMemoryCore::getTenantId, tenantId)
                        .eq(AgentMemoryCore::getAgentId, agentId)
                        .eq(AgentMemoryCore::getMemoryKey, key));
        if (existing != null) {
            existing.setMemoryValue(value);
            existing.setUpdatedAt(LocalDateTime.now());
            coreMapper.updateById(existing);
        } else {
            AgentMemoryCore core = new AgentMemoryCore();
            core.setTenantId(tenantId);
            core.setAgentId(agentId);
            core.setMemoryKey(key);
            core.setMemoryValue(value);
            core.setUpdatedAt(LocalDateTime.now());
            coreMapper.insert(core);
        }
    }

    public List<AgentMemoryCore> getAllCoreMemory(Long tenantId, String agentId) {
        return coreMapper.selectList(
                new LambdaQueryWrapper<AgentMemoryCore>()
                        .eq(AgentMemoryCore::getTenantId, tenantId)
                        .eq(AgentMemoryCore::getAgentId, agentId));
    }

    public void deleteCoreMemory(Long tenantId, String agentId, String key) {
        coreMapper.delete(
                new LambdaQueryWrapper<AgentMemoryCore>()
                        .eq(AgentMemoryCore::getTenantId, tenantId)
                        .eq(AgentMemoryCore::getAgentId, agentId)
                        .eq(AgentMemoryCore::getMemoryKey, key));
    }

    public void storeArchival(Long tenantId, String agentId, String content, String contentType) {
        AgentMemoryArchival archival = new AgentMemoryArchival();
        archival.setTenantId(tenantId);
        archival.setAgentId(agentId);
        archival.setContent(content);
        archival.setContentType(contentType);
        archival.setAccessCount(0);
        archival.setLastAccessedAt(LocalDateTime.now());
        archival.setDecayWeight(1.0);
        archival.setCreatedAt(LocalDateTime.now());
        archivalMapper.insert(archival);
    }

    public List<AgentMemoryArchival> recallArchival(Long tenantId, String agentId, String contentType, int limit) {
        List<AgentMemoryArchival> results = archivalMapper.selectList(
                new LambdaQueryWrapper<AgentMemoryArchival>()
                        .eq(AgentMemoryArchival::getTenantId, tenantId)
                        .eq(agentId != null, AgentMemoryArchival::getAgentId, agentId)
                        .eq(contentType != null, AgentMemoryArchival::getContentType, contentType)
                        .gt(AgentMemoryArchival::getDecayWeight, 0.1)
                        .orderByDesc(AgentMemoryArchival::getDecayWeight)
                        .last("LIMIT " + limit));

        for (AgentMemoryArchival a : results) {
            a.setAccessCount(a.getAccessCount() + 1);
            a.setLastAccessedAt(LocalDateTime.now());
            archivalMapper.updateById(a);
        }
        return results;
    }

    public int applyDecayCurve(Long tenantId) {
        LambdaQueryWrapper<AgentMemoryArchival> wrapper = new LambdaQueryWrapper<AgentMemoryArchival>()
                .gt(AgentMemoryArchival::getDecayWeight, 0.05);
        if (tenantId != null) {
            wrapper.eq(AgentMemoryArchival::getTenantId, tenantId);
        }
        List<AgentMemoryArchival> all = archivalMapper.selectList(wrapper);

        int updated = 0;
        for (AgentMemoryArchival a : all) {
            long daysSinceAccess = ChronoUnit.DAYS.between(
                    a.getLastAccessedAt() != null ? a.getLastAccessedAt() : a.getCreatedAt(),
                    LocalDateTime.now());
            double newWeight = Math.exp(-DECAY_RATE * daysSinceAccess / DECAY_THRESHOLD_DAYS);
            if (Math.abs(newWeight - a.getDecayWeight()) > 0.01) {
                a.setDecayWeight(Math.round(newWeight * 1000.0) / 1000.0);
                archivalMapper.updateById(a);
                updated++;
            }
        }
        log.info("[MemoryDecay] Applied decay curve: {} entries updated", updated);
        return updated;
    }

    public String compileContext(Long tenantId, String agentId, int coreLimit, int archivalLimit) {
        StringBuilder sb = new StringBuilder();

        List<AgentMemoryCore> coreMemories = getAllCoreMemory(tenantId, agentId);
        if (!coreMemories.isEmpty()) {
            sb.append("【核心记忆】\n");
            for (AgentMemoryCore cm : coreMemories.subList(0, Math.min(coreLimit, coreMemories.size()))) {
                sb.append("- ").append(cm.getMemoryKey()).append(": ").append(cm.getMemoryValue()).append("\n");
            }
        }

        List<AgentMemoryArchival> archivals = recallArchival(tenantId, agentId, null, archivalLimit);
        if (!archivals.isEmpty()) {
            sb.append("【长期知识】\n");
            for (AgentMemoryArchival am : archivals) {
                sb.append("- [").append(am.getContentType()).append(", 权重=")
                        .append(String.format("%.2f", am.getDecayWeight())).append("] ")
                        .append(am.getContent(), 0, Math.min(200, am.getContent().length())).append("\n");
            }
        }

        return sb.toString();
    }
}
