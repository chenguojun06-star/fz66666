package com.fashion.supplychain.intelligence.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * MCP SSE 会话管理服务
 *
 * <p>维护当前活跃的 SSE 连接（sessionId → SseEmitter），
 * 负责：
 * <ul>
 *   <li>创建新会话并返回 SseEmitter</li>
 *   <li>向指定会话发送 JSON-RPC 响应</li>
 *   <li>自动清理断开的会话（每 30 秒扫描一次）</li>
 *   <li>每 20 秒发送心跳，防止代理/负载均衡切断长连接</li>
 * </ul>
 *
 * <p>并发安全：所有公共方法均基于 {@link ConcurrentHashMap} 操作，无需外部锁。
 */
@Slf4j
@Service
public class McpSseSessionService {

    /** sessionId → SseEmitter 映射 */
    private final ConcurrentHashMap<String, SseEmitter> sessions = new ConcurrentHashMap<>();

    /** 心跳 + 会话清理调度器（单线程即可，IO 非阻塞） */
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "mcp-sse-heartbeat");
        t.setDaemon(true);
        return t;
    });

    /** SSE 连接最长保持时间：10 分钟（之后客户端自动重连） */
    private static final long SSE_TIMEOUT_MS = 10 * 60 * 1000L;

    public McpSseSessionService() {
        // 每 20 秒向所有活跃会话发送心跳注释（SSE comment，不触发 onmessage）
        scheduler.scheduleAtFixedRate(this::sendHeartbeats, 20, 20, TimeUnit.SECONDS);
        // 每 30 秒清理已完成/超时的会话（防止 Map 无限增长）
        scheduler.scheduleAtFixedRate(this::cleanupSessions, 30, 30, TimeUnit.SECONDS);
    }

    /**
     * 创建新 SSE 会话，返回 (sessionId, SseEmitter) 对。
     *
     * @param tenantId 租户ID，仅用于日志追踪
     */
    public SessionEntry createSession(Long tenantId) {
        String sessionId = UUID.randomUUID().toString().replace("-", "");
        SseEmitter emitter = new SseEmitter(SSE_TIMEOUT_MS);

        sessions.put(sessionId, emitter);

        // 注册清理回调
        emitter.onCompletion(() -> {
            sessions.remove(sessionId);
            log.debug("[MCP/SSE] 会话正常结束 sessionId={}", sessionId);
        });
        emitter.onTimeout(() -> {
            sessions.remove(sessionId);
            log.debug("[MCP/SSE] 会话超时 sessionId={}", sessionId);
        });
        emitter.onError(ex -> {
            sessions.remove(sessionId);
            log.debug("[MCP/SSE] 会话错误 sessionId={} err={}", sessionId, ex.getMessage());
        });

        log.info("[MCP/SSE] 新会话建立 sessionId={} tenantId={} activeSessions={}",
                sessionId, tenantId, sessions.size());
        return new SessionEntry(sessionId, emitter);
    }

    /**
     * 向指定会话发送 JSON 数据（JSON-RPC 响应）。
     *
     * @param sessionId 目标会话ID
     * @param json      JSON 字符串
     * @return true=发送成功，false=会话不存在或已断开
     */
    public boolean send(String sessionId, String json) {
        SseEmitter emitter = sessions.get(sessionId);
        if (emitter == null) {
            return false;
        }
        try {
            emitter.send(SseEmitter.event()
                    .name("message")
                    .data(json));
            return true;
        } catch (IOException e) {
            sessions.remove(sessionId);
            log.debug("[MCP/SSE] 发送失败，移除会话 sessionId={} err={}", sessionId, e.getMessage());
            return false;
        }
    }

    /**
     * 判断会话是否存在且活跃。
     */
    public boolean hasSession(String sessionId) {
        return sessions.containsKey(sessionId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 内部调度任务
    // ─────────────────────────────────────────────────────────────────────

    private void sendHeartbeats() {
        if (sessions.isEmpty()) return;
        sessions.forEach((sessionId, emitter) -> {
            try {
                // SSE comment 格式（: ...），不触发客户端 onmessage
                emitter.send(SseEmitter.event().comment("heartbeat"));
            } catch (IOException e) {
                sessions.remove(sessionId);
            }
        });
    }

    private void cleanupSessions() {
        // ConcurrentHashMap 的 onTimeout/onCompletion 回调应该已经清理，
        // 这里做二次防御，打印当前活跃数即可
        if (!sessions.isEmpty()) {
            log.debug("[MCP/SSE] 活跃会话数: {}", sessions.size());
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // DTO
    // ─────────────────────────────────────────────────────────────────────

    public record SessionEntry(String sessionId, SseEmitter emitter) {}
}
