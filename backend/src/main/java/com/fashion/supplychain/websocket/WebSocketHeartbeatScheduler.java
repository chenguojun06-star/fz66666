package com.fashion.supplychain.websocket;

import com.fashion.supplychain.websocket.dto.WebSocketMessage;
import com.fashion.supplychain.websocket.enums.WebSocketMessageType;
import com.fashion.supplychain.websocket.manager.WebSocketSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.Map;
import java.util.Set;

/**
 * 服务端 WebSocket 心跳调度器
 *
 * 微信云托管负载均衡器有 60s 空闲超时，客户端心跳 18s + 服务端心跳 20s 双保险，
 * 确保连接始终保活，避免控制台频繁出现 WebSocket connection failed 错误。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketHeartbeatScheduler {

    private final WebSocketSessionManager sessionManager;
    private final RealTimeWebSocketHandler webSocketHandler;

    /**
     * 每 20 秒向所有在线客户端推送一次服务端 ping，保活连接
     */
    @Scheduled(fixedDelay = 20000)
    public void sendHeartbeat() {
        Set<WebSocketSession> allSessions = sessionManager.getAllSessions();
        if (allSessions.isEmpty()) {
            return;
        }

        WebSocketMessage<?> pingMsg = WebSocketMessage.create(
                WebSocketMessageType.PING,
                Map.of("serverTime", System.currentTimeMillis())
        );

        int sent = 0;
        int removed = 0;
        for (WebSocketSession session : allSessions) {
            if (session.isOpen()) {
                webSocketHandler.sendMessage(session, pingMsg);
                sent++;
            } else {
                // 顺便清理已失效的 session
                sessionManager.removeSession(session.getId());
                removed++;
            }
        }

        if (sent > 0 || removed > 0) {
            log.debug("[WebSocket心跳] 推送 {} 个客户端，清理 {} 个失效连接", sent, removed);
        }
    }
}
