package com.fashion.supplychain.common.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.websocket.RealTimeWebSocketHandler;
import com.fashion.supplychain.websocket.dto.WebSocketMessage;
import com.fashion.supplychain.websocket.enums.WebSocketMessageType;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class RealTimePushService {

    private final RedisTemplate<String, Object> redisTemplate;
    private final RealTimeWebSocketHandler webSocketHandler;
    private final ObjectMapper objectMapper;

    private static final String REDIS_SYNC_CHANNEL = "fashion:sync";

    public void publishDataSync(DataSyncEvent event) {
        try {
            event.setTimestamp(System.currentTimeMillis());

            redisTemplate.convertAndSend(REDIS_SYNC_CHANNEL, event);

            pushToWebSocket(event);

            log.debug("[Push] Published data sync event, type={}, entityId={}",
                    event.getEventType(), event.getEntityId());
        } catch (Exception e) {
            log.warn("[Push] Publish data sync failed", e);
        }
    }

    public void publishCacheEviction(CacheEvictionEvent event) {
        try {
            event.setTimestamp(System.currentTimeMillis());

            redisTemplate.convertAndSend(REDIS_SYNC_CHANNEL, event);

            log.debug("[Push] Published cache eviction, cacheName={}", event.getCacheName());
        } catch (Exception e) {
            log.warn("[Push] Publish cache eviction failed", e);
        }
    }

    public void pushOrderUpdate(String orderId, Map<String, Object> orderData, String tenantId) {
        DataSyncEvent event = DataSyncEvent.builder()
                .eventType(DataSyncEvent.TYPE_ORDER_UPDATE)
                .entityType("order")
                .entityId(orderId)
                .tenantId(tenantId)
                .data(orderData)
                .source("backend")
                .build();
        publishDataSync(event);
    }

    public void pushScanCreate(String scanId, Map<String, Object> scanData, String tenantId) {
        DataSyncEvent event = DataSyncEvent.builder()
                .eventType(DataSyncEvent.TYPE_SCAN_CREATE)
                .entityType("scan")
                .entityId(scanId)
                .tenantId(tenantId)
                .data(scanData)
                .source("backend")
                .build();
        publishDataSync(event);
    }

    public void pushProgressUpdate(String orderId, Integer progress, String stage, String tenantId) {
        Map<String, Object> data = new HashMap<>();
        data.put("orderId", orderId);
        data.put("progress", progress);
        data.put("stage", stage);

        DataSyncEvent event = DataSyncEvent.builder()
                .eventType(DataSyncEvent.TYPE_PROGRESS_UPDATE)
                .entityType("order")
                .entityId(orderId)
                .tenantId(tenantId)
                .data(data)
                .source("backend")
                .build();
        publishDataSync(event);
    }

    public void pushStockChange(String materialId, Map<String, Object> stockData, String tenantId) {
        DataSyncEvent event = DataSyncEvent.builder()
                .eventType(DataSyncEvent.TYPE_STOCK_CHANGE)
                .entityType("stock")
                .entityId(materialId)
                .tenantId(tenantId)
                .data(stockData)
                .source("backend")
                .build();
        publishDataSync(event);
    }

    private void pushToWebSocket(DataSyncEvent event) {
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("eventType", event.getEventType());
            payload.put("entityType", event.getEntityType());
            payload.put("entityId", event.getEntityId());
            payload.put("data", event.getData());
            payload.put("timestamp", event.getTimestamp());

            WebSocketMessage<?> message = WebSocketMessage.create(
                    WebSocketMessageType.DATA_CHANGED,
                    payload
            );

            if (event.getTenantId() != null) {
                try {
                    Long tenantId = Long.parseLong(event.getTenantId());
                    webSocketHandler.broadcastToTenant(tenantId, message);
                } catch (NumberFormatException e) {
                    log.warn("[WebSocket] Invalid tenantId format: {}", event.getTenantId());
                }
            }

            log.debug("[WebSocket] Pushed, eventType={}, tenantId={}", event.getEventType(), event.getTenantId());
        } catch (Exception e) {
            log.warn("[WebSocket] Push failed", e);
        }
    }
}
