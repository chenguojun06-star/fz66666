package com.fashion.supplychain.intelligence.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AgentCheckpoint;
import com.fashion.supplychain.intelligence.entity.AgentEvent;
import com.fashion.supplychain.intelligence.entity.AgentSession;
import com.fashion.supplychain.intelligence.mapper.AgentCheckpointMapper;
import com.fashion.supplychain.intelligence.mapper.AgentEventMapper;
import com.fashion.supplychain.intelligence.mapper.AgentSessionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AgentStateStore {

    private final AgentSessionMapper sessionMapper;
    private final AgentCheckpointMapper checkpointMapper;
    private final AgentEventMapper eventMapper;
    private final ObjectMapper objectMapper;

    public String createSession(Long tenantId, String userId, String userMessage) {
        AgentSession session = new AgentSession();
        session.setId(UUID.randomUUID().toString());
        session.setTenantId(tenantId != null ? tenantId : 0L);
        session.setUserId(userId);
        session.setStatus("running");
        session.setUserMessage(userMessage);
        session.setTotalTokens(0);
        session.setTotalIterations(0);
        sessionMapper.insert(session);
        return session.getId();
    }

    public void saveCheckpoint(String sessionId, int iteration, Object messages, Object toolRecords, int totalTokens) {
        try {
            AgentCheckpoint cp = new AgentCheckpoint();
            cp.setSessionId(sessionId);
            cp.setIteration(iteration);
            cp.setMessagesJson(objectMapper.writeValueAsString(messages));
            cp.setToolCallsJson(toolRecords != null ? objectMapper.writeValueAsString(toolRecords) : "[]");
            cp.setTotalTokens(totalTokens);
            checkpointMapper.insert(cp);
        } catch (Exception e) {
            log.warn("[AgentStateStore] saveCheckpoint failed: {}", e.getMessage());
        }
    }

    public AgentCheckpoint loadLatestCheckpoint(String sessionId) {
        return checkpointMapper.selectOne(
                new LambdaQueryWrapper<AgentCheckpoint>()
                        .eq(AgentCheckpoint::getSessionId, sessionId)
                        .orderByDesc(AgentCheckpoint::getIteration)
                        .last("LIMIT 1"));
    }

    public void rollbackToCheckpoint(String sessionId, int targetIteration) {
        checkpointMapper.delete(
                new LambdaQueryWrapper<AgentCheckpoint>()
                        .eq(AgentCheckpoint::getSessionId, sessionId)
                        .gt(AgentCheckpoint::getIteration, targetIteration));
        eventMapper.delete(
                new LambdaQueryWrapper<AgentEvent>()
                        .eq(AgentEvent::getSessionId, sessionId)
                        .gt(AgentEvent::getIteration, targetIteration));
    }

    public void recordEvent(String sessionId, int iteration, String eventType, Object eventData) {
        try {
            AgentEvent event = new AgentEvent();
            event.setSessionId(sessionId);
            event.setIteration(iteration);
            event.setEventType(eventType);
            event.setEventDataJson(objectMapper.writeValueAsString(eventData));
            eventMapper.insert(event);
        } catch (Exception e) {
            log.warn("[AgentStateStore] recordEvent failed: {}", e.getMessage());
        }
    }

    public void completeSession(String sessionId, String finalAnswer, int totalTokens, int totalIterations) {
        AgentSession patch = new AgentSession();
        AgentSession existing = sessionMapper.selectById(sessionId);
        if (existing == null) return;
        patch.setId(sessionId);
        patch.setStatus("completed");
        patch.setFinalAnswer(finalAnswer);
        patch.setTotalTokens(totalTokens);
        patch.setTotalIterations(totalIterations);
        patch.setUpdatedAt(LocalDateTime.now());
        sessionMapper.updateById(patch);
    }

    public void failSession(String sessionId, String errorMessage) {
        AgentSession patch = new AgentSession();
        AgentSession existing = sessionMapper.selectById(sessionId);
        if (existing == null) return;
        patch.setId(sessionId);
        patch.setStatus("failed");
        patch.setFinalAnswer(errorMessage);
        patch.setUpdatedAt(LocalDateTime.now());
        sessionMapper.updateById(patch);
    }

    public AgentSession getSession(String sessionId) {
        return sessionMapper.selectById(sessionId);
    }

    public List<AgentCheckpoint> getCheckpoints(String sessionId) {
        return checkpointMapper.selectList(
                new LambdaQueryWrapper<AgentCheckpoint>()
                        .eq(AgentCheckpoint::getSessionId, sessionId)
                        .orderByAsc(AgentCheckpoint::getIteration));
    }
}
