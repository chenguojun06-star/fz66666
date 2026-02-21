package com.fashion.supplychain.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.websocket.dto.WebSocketMessage;
import com.fashion.supplychain.websocket.enums.WebSocketMessageType;
import com.fashion.supplychain.websocket.manager.WebSocketSessionManager;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 实时WebSocket处理器
 * 处理扫码、订单状态等实时数据同步
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class RealTimeWebSocketHandler extends TextWebSocketHandler {

    private final WebSocketSessionManager sessionManager;
    private final ObjectMapper objectMapper;

    // 心跳检测：sessionId -> lastPingTime
    private final Map<String, Long> lastPingTime = new ConcurrentHashMap<>();

    // 心跳超时时间（毫秒） — 如需启用心跳超时检测可恢复
    // private static final long HEARTBEAT_TIMEOUT = 60000;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        // 从URL参数中获取用户ID和客户端类型
        String query = session.getUri().getQuery();
        String userId = extractParam(query, "userId");
        String clientType = extractParam(query, "clientType");

        if (userId == null || clientType == null) {
            log.warn("[WebSocket] 连接参数缺失，关闭连接: sessionId={}", session.getId());
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        sessionManager.addSession(session, userId, clientType);
        lastPingTime.put(session.getId(), System.currentTimeMillis());

        // 发送连接成功消息
        sendMessage(session, WebSocketMessage.create(
            WebSocketMessageType.DATA_CHANGED,
            Map.of("message", "连接成功", "userId", userId, "clientType", clientType)
        ));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        String sessionId = session.getId();

        try {
            WebSocketMessage<?> wsMessage = objectMapper.readValue(payload, WebSocketMessage.class);
            String type = wsMessage.getType();

            log.debug("[WebSocket] 收到消息: type={}, sessionId={}", type, sessionId);

            // 处理心跳
            if (WebSocketMessageType.PING.getCode().equals(type)) {
                handlePing(session);
                return;
            }

            // 处理其他消息类型
            handleBusinessMessage(session, wsMessage);

        } catch (Exception e) {
            log.error("[WebSocket] 消息处理失败: sessionId={}, payload={}", sessionId, payload, e);
            sendError(session, "消息格式错误: " + e.getMessage());
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        String sessionId = session.getId();
        sessionManager.removeSession(sessionId);
        lastPingTime.remove(sessionId);
        log.info("[WebSocket] 连接关闭: sessionId={}, status={}", sessionId, status);
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) throws Exception {
        log.error("[WebSocket] 传输错误: sessionId={}", session.getId(), exception);
        sessionManager.removeSession(session.getId());
        lastPingTime.remove(session.getId());
    }

    /**
     * 处理心跳
     */
    private void handlePing(WebSocketSession session) {
        lastPingTime.put(session.getId(), System.currentTimeMillis());
        sendMessage(session, WebSocketMessage.create(WebSocketMessageType.PONG, Map.of("time", System.currentTimeMillis())));
    }

    /**
     * 处理业务消息
     */
    private void handleBusinessMessage(WebSocketSession session, WebSocketMessage<?> message) {
        String type = message.getType();

        // 根据消息类型处理
        WebSocketMessageType msgType = WebSocketMessageType.fromCode(type);
        if (msgType == null) {
            sendError(session, "未知的消息类型: " + type);
            return;
        }

        // 广播消息给其他客户端
        broadcastToOthers(session, message);
    }

    /**
     * 广播消息给其他客户端（不包括发送者）
     */
    private void broadcastToOthers(WebSocketSession senderSession, WebSocketMessage<?> message) {
        String senderUserId = sessionManager.getUserIdBySession(senderSession.getId());
        String senderType = sessionManager.getClientTypeBySession(senderSession.getId());

        // 获取所有在线用户
        Set<String> onlineUsers = sessionManager.getAllOnlineUsers();

        for (String userId : onlineUsers) {
            // 获取用户的所有会话
            Set<WebSocketSession> userSessions = sessionManager.getUserSessions(userId);

            for (WebSocketSession session : userSessions) {
                // 跳过发送者自己
                if (session.getId().equals(senderSession.getId())) {
                    continue;
                }

                // 检查会话是否打开
                if (!session.isOpen()) {
                    continue;
                }

                // 发送消息
                sendMessage(session, message);
            }
        }

        log.info("[WebSocket] 广播消息: type={}, from={}({}), to {} users",
                message.getType(), senderUserId, senderType, onlineUsers.size() - 1);
    }

    /**
     * 发送消息到指定会话
     */
    public void sendMessage(WebSocketSession session, WebSocketMessage<?> message) {
        if (session == null || !session.isOpen()) {
            return;
        }

        try {
            String payload = objectMapper.writeValueAsString(message);
            session.sendMessage(new TextMessage(payload));
        } catch (IOException e) {
            log.error("[WebSocket] 发送消息失败: sessionId={}", session.getId(), e);
        }
    }

    /**
     * 发送错误消息
     */
    private void sendError(WebSocketSession session, String errorMessage) {
        sendMessage(session, WebSocketMessage.create(
            WebSocketMessageType.ERROR,
            Map.of("message", errorMessage)
        ));
    }

    /**
     * 从URL参数中提取值
     */
    private String extractParam(String query, String paramName) {
        if (query == null || query.isEmpty()) {
            return null;
        }

        String[] pairs = query.split("&");
        for (String pair : pairs) {
            String[] keyValue = pair.split("=");
            if (keyValue.length == 2 && keyValue[0].equals(paramName)) {
                return keyValue[1];
            }
        }
        return null;
    }

    /**
     * 广播消息（供Service层调用）
     */
    public void broadcast(WebSocketMessage<?> message) {
        Set<WebSocketSession> allSessions = sessionManager.getAllSessions();

        for (WebSocketSession session : allSessions) {
            if (session.isOpen()) {
                sendMessage(session, message);
            }
        }

        log.info("[WebSocket] 全局广播: type={}, to {} sessions",
                message.getType(), allSessions.size());
    }

    /**
     * 发送消息给指定用户
     */
    public void sendToUser(String userId, WebSocketMessage<?> message) {
        Set<WebSocketSession> userSessions = sessionManager.getUserSessions(userId);

        for (WebSocketSession session : userSessions) {
            if (session.isOpen()) {
                sendMessage(session, message);
            }
        }

        log.info("[WebSocket] 发送给用户: userId={}, type={}, sessions={}",
                userId, message.getType(), userSessions.size());
    }

    /**
     * 发送消息给指定用户的指定客户端类型
     */
    public void sendToUserByType(String userId, String clientType, WebSocketMessage<?> message) {
        Set<WebSocketSession> userSessions = sessionManager.getUserSessionsByType(userId, clientType);

        for (WebSocketSession session : userSessions) {
            if (session.isOpen()) {
                sendMessage(session, message);
            }
        }

        log.info("[WebSocket] 发送给用户指定类型: userId={}, type={}, clientType={}, sessions={}",
                userId, message.getType(), clientType, userSessions.size());
    }
}
