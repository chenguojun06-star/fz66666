package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AgentCard;
import com.fashion.supplychain.intelligence.mapper.AgentCardMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class AgentCardService {

    private final AgentCardMapper agentCardMapper;
    private final ObjectMapper objectMapper;

    public void registerAgent(Long tenantId, String agentId, String agentName,
                               String description, List<String> skills,
                               List<String> inputTypes, List<String> outputTypes,
                               String endpointUrl) {
        try {
            AgentCard existing = agentCardMapper.selectOne(
                    new LambdaQueryWrapper<AgentCard>()
                            .eq(AgentCard::getTenantId, tenantId)
                            .eq(AgentCard::getAgentId, agentId));
            if (existing != null) {
                existing.setAgentName(agentName);
                existing.setDescription(description);
                existing.setSkillsJson(objectMapper.writeValueAsString(skills));
                existing.setInputTypesJson(objectMapper.writeValueAsString(inputTypes));
                existing.setOutputTypesJson(objectMapper.writeValueAsString(outputTypes));
                existing.setEndpointUrl(endpointUrl);
                existing.setUpdatedAt(LocalDateTime.now());
                agentCardMapper.updateById(existing);
                return;
            }
            AgentCard card = new AgentCard();
            card.setTenantId(tenantId);
            card.setAgentId(agentId);
            card.setAgentName(agentName);
            card.setDescription(description);
            card.setSkillsJson(objectMapper.writeValueAsString(skills));
            card.setInputTypesJson(objectMapper.writeValueAsString(inputTypes));
            card.setOutputTypesJson(objectMapper.writeValueAsString(outputTypes));
            card.setEndpointUrl(endpointUrl);
            card.setProtocol("A2A");
            card.setStatus("ACTIVE");
            agentCardMapper.insert(card);
            log.info("[AgentCard] Registered: {} ({})", agentId, agentName);
        } catch (Exception e) {
            log.warn("[AgentCard] Register failed: agentId={}, error={}", agentId, e.getMessage(), e);
        }
    }

    public List<AgentCard> discoverAgents(Long tenantId, String skill) {
        LambdaQueryWrapper<AgentCard> wrapper = new LambdaQueryWrapper<AgentCard>()
                .eq(AgentCard::getTenantId, tenantId)
                .eq(AgentCard::getStatus, "ACTIVE");
        if (skill != null) {
            wrapper.like(AgentCard::getSkillsJson, skill);
        }
        return agentCardMapper.selectList(wrapper);
    }

    public AgentCard getAgent(Long tenantId, String agentId) {
        return agentCardMapper.selectOne(
                new LambdaQueryWrapper<AgentCard>()
                        .eq(AgentCard::getTenantId, tenantId)
                        .eq(AgentCard::getAgentId, agentId)
                        .eq(AgentCard::getStatus, "ACTIVE"));
    }

    public void deregisterAgent(Long tenantId, String agentId) {
        AgentCard card = agentCardMapper.selectOne(
                new LambdaQueryWrapper<AgentCard>()
                        .eq(AgentCard::getTenantId, tenantId)
                        .eq(AgentCard::getAgentId, agentId));
        if (card != null) {
            card.setStatus("INACTIVE");
            card.setUpdatedAt(LocalDateTime.now());
            agentCardMapper.updateById(card);
        }
    }
}
