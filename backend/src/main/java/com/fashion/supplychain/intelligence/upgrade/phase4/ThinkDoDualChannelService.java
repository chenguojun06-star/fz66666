package com.fashion.supplychain.intelligence.upgrade.phase4;

import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Service
@Slf4j
public class ThinkDoDualChannelService {

    private final Map<String, AgentSession> activeSessions = new ConcurrentHashMap<>();
    private final AtomicLong sessionCounter = new AtomicLong(0);

    public AgentSession createSession(Long tenantId, String userId, String scene) {
        String sessionId = "td-" + sessionCounter.incrementAndGet();
        AgentSession session = new AgentSession();
        session.sessionId = sessionId;
        session.tenantId = tenantId;
        session.userId = userId;
        session.scene = scene;
        session.status = "running";
        session.progress = 0;
        session.doLog = new ArrayList<>();
        session.thinkLog = new ArrayList<>();
        activeSessions.put(sessionId, session);
        return session;
    }

    public void updateProgress(String sessionId, int progress, String currentStep) {
        AgentSession session = activeSessions.get(sessionId);
        if (session == null) return;
        session.progress = Math.min(100, Math.max(0, progress));
        DoLogEntry entry = new DoLogEntry();
        entry.step = currentStep;
        entry.progress = progress;
        entry.timestamp = System.currentTimeMillis();
        session.doLog.add(entry);
    }

    public void recordToolResult(String sessionId, String toolName, String result, boolean success) {
        AgentSession session = activeSessions.get(sessionId);
        if (session == null) return;
        DoLogEntry entry = new DoLogEntry();
        entry.toolName = toolName;
        entry.result = result != null ? result.substring(0, Math.min(200, result.length())) : "";
        entry.success = success;
        entry.timestamp = System.currentTimeMillis();
        session.doLog.add(entry);
    }

    public ThinkInjectResult injectThink(String sessionId, String userHint) {
        AgentSession session = activeSessions.get(sessionId);
        if (session == null) {
            ThinkInjectResult r = new ThinkInjectResult();
            r.accepted = false;
            r.reason = "session not found";
            return r;
        }

        ThinkLogEntry entry = new ThinkLogEntry();
        entry.userHint = userHint;
        entry.timestamp = System.currentTimeMillis();
        session.thinkLog.add(entry);

        ThinkInjectResult result = new ThinkInjectResult();
        result.accepted = true;
        result.sessionId = sessionId;
        result.currentProgress = session.progress;
        result.redirectHint = userHint;
        return result;
    }

    public AgentSession getSession(String sessionId) {
        return activeSessions.get(sessionId);
    }

    public void completeSession(String sessionId, String finalAnswer) {
        AgentSession session = activeSessions.get(sessionId);
        if (session == null) return;
        session.status = "completed";
        session.progress = 100;
        session.finalAnswer = finalAnswer;
    }

    public void failSession(String sessionId, String error) {
        AgentSession session = activeSessions.get(sessionId);
        if (session == null) return;
        session.status = "failed";
        session.error = error;
    }

    public List<AgentSession> listActiveSessions(Long tenantId) {
        List<AgentSession> result = new ArrayList<>();
        for (AgentSession s : activeSessions.values()) {
            if (s.tenantId.equals(tenantId) && "running".equals(s.status)) {
                result.add(s);
            }
        }
        return result;
    }

    @Data
    public static class AgentSession {
        private String sessionId;
        private Long tenantId;
        private String userId;
        private String scene;
        private String status;
        private int progress;
        private String finalAnswer;
        private String error;
        private List<DoLogEntry> doLog;
        private List<ThinkLogEntry> thinkLog;
    }

    @Data
    public static class DoLogEntry {
        private String step;
        private int progress;
        private String toolName;
        private String result;
        private boolean success;
        private long timestamp;
    }

    @Data
    public static class ThinkLogEntry {
        private String userHint;
        private long timestamp;
    }

    @Data
    public static class ThinkInjectResult {
        private boolean accepted;
        private String reason;
        private String sessionId;
        private int currentProgress;
        private String redirectHint;
    }
}
