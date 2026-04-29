package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.common.UserContext;
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
            Long tid = UserContext.tenantId();
            AgentCheckpoint cp = new AgentCheckpoint();
            cp.setTenantId(tid != null ? tid : 0L);
            cp.setThreadId(sessionId);
            cp.setNodeId("iteration_" + iteration);
            cp.setNodeName("迭代 #" + iteration);
            cp.setStateJson(objectMapper.writeValueAsString(messages));
            cp.setMetadataJson(objectMapper.writeValueAsString(
                    java.util.Map.of("totalTokens", totalTokens, "toolCalls", toolRecords != null ? toolRecords : "[]")));
            cp.setStepIndex(iteration);
            cp.setStatus("ACTIVE");
            cp.setCreatedAt(LocalDateTime.now());
            checkpointMapper.insert(cp);
        } catch (Exception e) {
            log.warn("[AgentStateStore] saveCheckpoint failed: {}", e.getMessage());
        }
    }

    public AgentCheckpoint loadLatestCheckpoint(String sessionId) {
        Long tid = UserContext.tenantId();
        return checkpointMapper.selectOne(
                new LambdaQueryWrapper<AgentCheckpoint>()
                        .eq(tid != null, AgentCheckpoint::getTenantId, tid)
                        .eq(AgentCheckpoint::getThreadId, sessionId)
                        .eq(AgentCheckpoint::getStatus, "ACTIVE")
                        .orderByDesc(AgentCheckpoint::getStepIndex)
                        .last("LIMIT 1"));
    }

    public void rollbackToCheckpoint(String sessionId, int targetIteration) {
        Long tid = UserContext.tenantId();
        checkpointMapper.delete(
                new LambdaQueryWrapper<AgentCheckpoint>()
                        .eq(tid != null, AgentCheckpoint::getTenantId, tid)
                        .eq(AgentCheckpoint::getThreadId, sessionId)
                        .gt(AgentCheckpoint::getStepIndex, targetIteration));
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
        AgentSession existing = sessionMapper.selectById(sessionId);
        if (existing == null) return;
        existing.setStatus("completed");
        existing.setFinalAnswer(finalAnswer);
        existing.setTotalTokens(totalTokens);
        existing.setTotalIterations(totalIterations);
        existing.setUpdatedAt(LocalDateTime.now());
        sessionMapper.updateById(existing);
    }

    public void failSession(String sessionId, String errorMessage) {
        AgentSession existing = sessionMapper.selectById(sessionId);
        if (existing == null) return;
        existing.setStatus("failed");
        existing.setFinalAnswer(errorMessage);
        existing.setUpdatedAt(LocalDateTime.now());
        sessionMapper.updateById(existing);
    }

    public AgentSession getSession(String sessionId) {
        return sessionMapper.selectById(sessionId);
    }

    public List<AgentCheckpoint> getCheckpoints(String sessionId) {
        Long tid = UserContext.tenantId();
        return checkpointMapper.selectList(
                new LambdaQueryWrapper<AgentCheckpoint>()
                        .eq(tid != null, AgentCheckpoint::getTenantId, tid)
                        .eq(AgentCheckpoint::getThreadId, sessionId)
                        .orderByAsc(AgentCheckpoint::getStepIndex));
    }
}
