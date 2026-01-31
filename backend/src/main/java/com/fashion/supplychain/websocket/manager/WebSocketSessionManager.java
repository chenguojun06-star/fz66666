package com.fashion.supplychain.websocket.manager;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * WebSocket会话管理器
 * 管理所有WebSocket连接，支持按用户ID和客户端类型分组
 */
@Slf4j
@Component
public class WebSocketSessionManager {

    /**
     * 所有会话：sessionId -> session
     */
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    /**
     * 用户会话：userId -> sessionIds
     */
    private final Map<String, Set<String>> userSessions = new ConcurrentHashMap<>();

    /**
     * 会话用户信息：sessionId -> userId
     */
    private final Map<String, String> sessionUserMap = new ConcurrentHashMap<>();

    /**
     * 会话客户端类型：sessionId -> clientType (miniprogram/pc)
     */
    private final Map<String, String> sessionClientTypeMap = new ConcurrentHashMap<>();

    /**
     * 添加会话
     */
    public void addSession(WebSocketSession session, String userId, String clientType) {
        String sessionId = session.getId();
        
        sessions.put(sessionId, session);
        sessionUserMap.put(sessionId, userId);
        sessionClientTypeMap.put(sessionId, clientType);
        
        userSessions.computeIfAbsent(userId, k -> new CopyOnWriteArraySet<>()).add(sessionId);
        
        log.info("[WebSocket] 会话连接成功: sessionId={}, userId={}, clientType={}", 
                sessionId, userId, clientType);
    }

    /**
     * 移除会话
     */
    public void removeSession(String sessionId) {
        WebSocketSession session = sessions.remove(sessionId);
        String userId = sessionUserMap.remove(sessionId);
        String clientType = sessionClientTypeMap.remove(sessionId);
        
        if (userId != null) {
            Set<String> userSessionIds = userSessions.get(userId);
            if (userSessionIds != null) {
                userSessionIds.remove(sessionId);
                if (userSessionIds.isEmpty()) {
                    userSessions.remove(userId);
                }
            }
        }
        
        if (session != null && session.isOpen()) {
            try {
                session.close();
            } catch (IOException e) {
                log.error("[WebSocket] 关闭会话失败: sessionId={}", sessionId, e);
            }
        }
        
        log.info("[WebSocket] 会话断开: sessionId={}, userId={}, clientType={}", 
                sessionId, userId, clientType);
    }

    /**
     * 获取会话
     */
    public WebSocketSession getSession(String sessionId) {
        return sessions.get(sessionId);
    }

    /**
     * 获取用户的所有会话
     */
    public Set<WebSocketSession> getUserSessions(String userId) {
        Set<String> sessionIds = userSessions.get(userId);
        if (sessionIds == null) {
            return Set.of();
        }
        
        Set<WebSocketSession> result = new CopyOnWriteArraySet<>();
        for (String sessionId : sessionIds) {
            WebSocketSession session = sessions.get(sessionId);
            if (session != null && session.isOpen()) {
                result.add(session);
            }
        }
        return result;
    }

    /**
     * 获取用户的指定类型会话
     */
    public Set<WebSocketSession> getUserSessionsByType(String userId, String clientType) {
        Set<String> sessionIds = userSessions.get(userId);
        if (sessionIds == null) {
            return Set.of();
        }
        
        Set<WebSocketSession> result = new CopyOnWriteArraySet<>();
        for (String sessionId : sessionIds) {
            WebSocketSession session = sessions.get(sessionId);
            String type = sessionClientTypeMap.get(sessionId);
            if (session != null && session.isOpen() && clientType.equals(type)) {
                result.add(session);
            }
        }
        return result;
    }

    /**
     * 获取所有会话
     */
    public Set<WebSocketSession> getAllSessions() {
        return Set.copyOf(sessions.values());
    }

    /**
     * 获取所有在线用户ID
     */
    public Set<String> getAllOnlineUsers() {
        return Set.copyOf(userSessions.keySet());
    }

    /**
     * 获取会话数量
     */
    public int getSessionCount() {
        return sessions.size();
    }

    /**
     * 获取用户会话数量
     */
    public int getUserSessionCount(String userId) {
        Set<String> sessionIds = userSessions.get(userId);
        return sessionIds == null ? 0 : sessionIds.size();
    }

    /**
     * 判断是否在线
     */
    public boolean isOnline(String userId) {
        return userSessions.containsKey(userId);
    }

    /**
     * 获取会话的用户ID
     */
    public String getUserIdBySession(String sessionId) {
        return sessionUserMap.get(sessionId);
    }

    /**
     * 获取会话的客户端类型
     */
    public String getClientTypeBySession(String sessionId) {
        return sessionClientTypeMap.get(sessionId);
    }
}
