package com.fashion.supplychain.production.executor;

import com.fashion.supplychain.common.SpringContextHolder;
import com.fashion.supplychain.config.WebSocketHandshakeInterceptor;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.websocket.*;
import jakarta.websocket.server.PathParam;
import jakarta.websocket.server.ServerEndpoint;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * 订单进度 WebSocket 推送端点
 *
 * 实现说明：
 * 本类标注 {@link ServerEndpoint}，实例由 Tomcat 容器创建，不走 Spring 注入。
 * 因此 {@link ObjectMapper} 等依赖通过 {@link SpringContextHolder#getBean} 静态获取，
 * 禁止再用 @Autowired（历史教训：2026-07-09 注入为 null 导致 500）。
 *
 * 注意：本类虽然标了 @Component，但 Tomcat 创建的实例并非该 Spring Bean。
 * @Component 仅用于让 Spring 扫描到本类以便其他组件通过注入调用 broadcastOrderProgressFromOrder。
 * 实际推送方法通过 Spring 管理的 Bean 调用，内部读 static tenantSessions（线程安全）。
 */
@ServerEndpoint(value = "/ws/order-progress/{tenantId}", configurator = WebSocketHandshakeInterceptor.class)
@Component
@Slf4j
public class OrderProgressWebSocketServer {

    private static final Map<Long, CopyOnWriteArraySet<Session>> tenantSessions = new ConcurrentHashMap<>();

    @OnOpen
    public void onOpen(Session session, @PathParam("tenantId") String tenantIdStr) {
        try {
            Long tenantId = Long.parseLong(tenantIdStr.trim());
            tenantSessions.computeIfAbsent(tenantId, k -> new CopyOnWriteArraySet<>()).add(session);
            log.info("[WS] 连接建立: tenantId={}, sessionId={}, 当前连接数={}",
                    tenantId, session.getId(), tenantSessions.get(tenantId).size());
        } catch (NumberFormatException e) {
            log.warn("[WS] 无效租户ID: {}", tenantIdStr);
            try {
                session.close(new CloseReason(CloseReason.CloseCodes.VIOLATED_POLICY, "无效租户ID"));
            } catch (IOException ignored) {}
        }
    }

    @OnClose
    public void onClose(Session session, @PathParam("tenantId") String tenantIdStr) {
        try {
            Long tenantId = Long.parseLong(tenantIdStr.trim());
            CopyOnWriteArraySet<Session> sessions = tenantSessions.get(tenantId);
            if (sessions != null) {
                sessions.remove(session);
                log.info("[WS] 连接关闭: tenantId={}, sessionId={}, 剩余连接数={}",
                        tenantId, session.getId(), sessions.size());
            }
        } catch (NumberFormatException ignored) {}
    }

    @OnError
    public void onError(Session session, Throwable error, @PathParam("tenantId") String tenantIdStr) {
        // WebSocket 连接断开时 error.getMessage() 可能为 null（正常关闭/心跳超时）
        // 降级为 warn，避免日志噪音；仅在有真实异常消息时才记 error
        String errMsg = (error != null && error.getMessage() != null) ? error.getMessage() : "连接关闭（无异常消息）";
        if (error != null && error.getMessage() != null) {
            log.error("[WS] 错误: tenantId={}, sessionId={}, error={}", tenantIdStr, session.getId(), errMsg);
        } else {
            log.warn("[WS] 连接断开: tenantId={}, sessionId={}", tenantIdStr, session.getId());
        }
    }

    @OnMessage
    public void onMessage(String message, @PathParam("tenantId") String tenantIdStr) {
        log.debug("[WS] 收到消息: tenantId={}, message={}", tenantIdStr, message);
    }

    public void broadcastOrderProgress(Long tenantId, String orderId, String orderNo, Integer progress, String stage) {
        CopyOnWriteArraySet<Session> sessions = tenantSessions.get(tenantId);
        if (sessions == null || sessions.isEmpty()) {
            log.debug("[WS] 无在线连接: tenantId={}", tenantId);
            return;
        }

        try {
            // ObjectMapper 由 SpringContextHolder 静态获取（@ServerEndpoint 实例非 Spring 管理）
            ObjectMapper objectMapper = SpringContextHolder.getBean(ObjectMapper.class);

            ProgressMessage msg = new ProgressMessage();
            msg.setOrderId(orderId);
            msg.setOrderNo(orderNo);
            msg.setProgress(progress != null ? progress : 0);
            msg.setStage(stage);
            msg.setTimestamp(System.currentTimeMillis());

            String json = objectMapper.writeValueAsString(msg);
            int successCount = 0;
            int failCount = 0;

            for (Session session : sessions) {
                if (session.isOpen()) {
                    try {
                        session.getBasicRemote().sendText(json);
                        successCount++;
                    } catch (IOException e) {
                        failCount++;
                        log.warn("[WS] 发送失败: sessionId={}, error={}", session.getId(), e.getMessage());
                    }
                }
            }

            log.info("[WS] 进度通知发送: tenantId={}, orderNo={}, progress={}, 成功={}, 失败={}",
                    tenantId, orderNo, progress, successCount, failCount);
        } catch (Exception e) {
            log.error("[WS] 构建消息失败: tenantId={}, orderId={}", tenantId, orderId, e);
        }
    }

    public void broadcastOrderProgressFromOrder(ProductionOrder order) {
        if (order == null || order.getTenantId() == null || !org.springframework.util.StringUtils.hasText(order.getId())) {
            log.warn("[WS] 订单信息不完整，跳过推送: order={}", order);
            return;
        }
        broadcastOrderProgress(order.getTenantId(), order.getId(), order.getOrderNo(),
                order.getProductionProgress(), null);
    }

    public static int getConnectedCount(Long tenantId) {
        CopyOnWriteArraySet<Session> sessions = tenantSessions.get(tenantId);
        return sessions != null ? sessions.size() : 0;
    }

    @Data
    public static class ProgressMessage {
        private String orderId;
        private String orderNo;
        private Integer progress;
        private String stage;
        private Long timestamp;
    }
}
