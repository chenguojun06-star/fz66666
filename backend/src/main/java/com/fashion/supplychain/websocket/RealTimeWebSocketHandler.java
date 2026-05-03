package com.fashion.supplychain.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.auth.AuthTokenService;
import com.fashion.supplychain.auth.TokenSubject;
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
    private final AuthTokenService authTokenService;

    // 心跳检测：sessionId -> lastPingTime
    private final Map<String, Long> lastPingTime = new ConcurrentHashMap<>();

    // 心跳超时时间（毫秒） — 如需启用心跳超时检测可恢复
    // private static final long HEARTBEAT_TIMEOUT = 60000;

    private static final int MAX_CONNECTIONS = 10000;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        if (sessionManager.getSessionCount() >= MAX_CONNECTIONS) {
            log.warn("[WebSocket] 连接数已达上限 {}, 拒绝新连接: sessionId={}", MAX_CONNECTIONS, session.getId());
            session.close(new CloseStatus(1013, "Too many connections"));
            return;
        }

        String query = session.getUri().getQuery();
        String token = extractParam(query, "token");
        String userId = extractParam(query, "userId");
        String clientType = extractParam(query, "clientType");
        String tenantIdStr = extractParam(query, "tenantId");

        if (token != null && !token.isBlank()) {
            TokenSubject subject = authTokenService.verifyAndParse(token);
            if (subject == null) {
                log.warn("[WebSocket] JWT验证失败，关闭连接: sessionId={}", session.getId());
                session.close(CloseStatus.NOT_ACCEPTABLE);
                return;
            }
            if (userId == null) userId = subject.getUserId();
            if (tenantIdStr == null && subject.getTenantId() != null) tenantIdStr = String.valueOf(subject.getTenantId());
        } else {
            log.warn("[WebSocket] 无Token，关闭连接: sessionId={}, userId={}", session.getId(), userId);
            session.close(CloseStatus.NOT_ACCEPTABLE);
            return;
        }

        Long tenantId = null;
        if (tenantIdStr != null && !tenantIdStr.isBlank()) {
            try { tenantId = Long.parseLong(tenantIdStr); } catch (NumberFormatException e) { log.debug("数字解析失败: {}", e.getMessage()); }
        }

        if (userId == null || clientType == null) {
            log.warn("[WebSocket] 连接参数缺失，关闭连接: sessionId={}", session.getId());
            session.close(CloseStatus.BAD_DATA);
            return;
        }

        sessionManager.addSession(session, userId, clientType, tenantId);
        lastPingTime.put(session.getId(), System.currentTimeMillis());

        sendMessage(session, WebSocketMessage.create(
            WebSocketMessageType.DATA_CHANGED,
            Map.of("message", "连接成功", "userId", userId, "clientType", clientType)
        ));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload = message.getPayload();
        String sessionId = session.getId();
        sessionManager.updateActivity(sessionId);

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
        String exMsg = exception.getMessage();
        if (isClientDisconnect(exception, exMsg)) {
            log.debug("[WebSocket] 客户端断开连接: sessionId={}, reason={}", session.getId(), exMsg);
        } else {
            log.warn("[WebSocket] 传输错误: sessionId={}, type={}, msg={}",
                    session.getId(), exception.getClass().getSimpleName(), exMsg);
        }
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
     * 广播消息给同一租户内其他客户端（不包括发送者）
     * 修复：仅向发送者所在租户的会话广播，防止跨租户数据泄露
     */
    private void broadcastToOthers(WebSocketSession senderSession, WebSocketMessage<?> message) {
        String senderUserId = sessionManager.getUserIdBySession(senderSession.getId());
        String senderType = sessionManager.getClientTypeBySession(senderSession.getId());
        Long senderTenantId = sessionManager.getTenantIdBySession(senderSession.getId());

        if (senderTenantId != null) {
            Set<WebSocketSession> tenantSessions = sessionManager.getTenantSessions(senderTenantId);
            int count = 0;
            for (WebSocketSession session : tenantSessions) {
                if (session.getId().equals(senderSession.getId()) || !session.isOpen()) {
                    continue;
                }
                sendMessage(session, message);
                count++;
            }
            log.info("[WebSocket] 租户内广播: type={}, from={}({}), tenantId={}, to {} sessions",
                    message.getType(), senderUserId, senderType, senderTenantId, count);
        } else {
            log.warn("[WebSocket] 拒绝无租户ID的广播请求: type={}, from={}({}), 已跳过以防止跨租户泄露",
                    message.getType(), senderUserId, senderType);
        }
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
        } catch (Exception e) {
            if (isClientDisconnect(e, e.getMessage())) {
                log.warn("[WebSocket] 发送消息时客户端已断开: sessionId={}, reason={}", session.getId(), e.getMessage());
            } else {
                log.error("[WebSocket] 发送消息失败: sessionId={}", session.getId(), e);
            }
            sessionManager.removeSession(session.getId());
            lastPingTime.remove(session.getId());
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
        log.warn("[WebSocket] broadcast() 全局广播被调用，存在跨租户泄露风险！type={}, 调用栈已记录",
                message.getType());
        Set<WebSocketSession> allSessions = sessionManager.getAllSessions();

        for (WebSocketSession session : allSessions) {
            if (session.isOpen()) {
                sendMessage(session, message);
            }
        }
    }

    public void broadcastToTenant(Long tenantId, WebSocketMessage<?> message) {
        if (tenantId == null) {
            log.warn("[WebSocket] broadcastToTenant called with null tenantId, skipping");
            return;
        }
        Set<WebSocketSession> sessions = sessionManager.getTenantSessions(tenantId);
        for (WebSocketSession session : sessions) {
            sendMessage(session, message);
        }
        log.info("[WebSocket] 租户广播: type={}, tenantId={}, to {} sessions",
                message.getType(), tenantId, sessions.size());
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

    private boolean isClientDisconnect(Throwable exception, String exMsg) {
        if (exception instanceof java.io.EOFException) return true;
        if (exception instanceof java.net.SocketException) return true;
        if (exMsg == null) return false;
        return exMsg.contains("Connection reset")
                || exMsg.contains("Broken pipe")
                || exMsg.contains("closed")
                || exMsg.contains("closing")
                || exMsg.contains("CloseStatus")
                || exMsg.contains("EOF")
                || exMsg.contains("AsyncRequestNotUsableException")
                || exMsg.contains("ServletOutputStream failed to write")
                || exMsg.contains("The client aborted")
                || exMsg.contains("forcibly closed")
                || exMsg.contains("断开的管道")
                || exMsg.contains("Connection timed out")
                || exMsg.contains("No route to host")
                || exMsg.contains("Network is unreachable")
                || exMsg.contains("Invalid Upgrade header");
    }
}
