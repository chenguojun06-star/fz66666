package com.fashion.supplychain.common.cache;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class DataSyncAspect {

    private final UnifiedCacheManager cacheManager;
    private final RealTimePushService pushService;
    private final ObjectMapper objectMapper;

    @Around("@annotation(dataSync)")
    public Object around(ProceedingJoinPoint joinPoint, DataSync dataSync) throws Throwable {
        Object result = joinPoint.proceed();

        try {
            handleDataSync(joinPoint, dataSync, result);
        } catch (Exception e) {
            log.warn("[Sync] Data sync handling failed", e);
        }

        return result;
    }

    private void handleDataSync(ProceedingJoinPoint joinPoint, DataSync dataSync, Object result) {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        String methodName = signature.getName();

        Long tenantIdLong = UserContext.tenantId();
        String tenantId = tenantIdLong != null ? String.valueOf(tenantIdLong) : null;

        String cacheName = dataSync.cacheName();
        String entityType = dataSync.entityType();
        String eventType = dataSync.eventType();

        if (dataSync.evictCache() && !cacheName.isEmpty()) {
            String entityId = extractEntityId(result);
            if (entityId != null) {
                cacheManager.evict(cacheName, entityId);
                log.debug("[Sync] Evicted cache, cacheName={}, entityId={}", cacheName, entityId);
            } else {
                cacheManager.evictAll(cacheName);
                log.debug("[Sync] Evicted all cache, cacheName={}", cacheName);
            }
        }

        if (dataSync.pushEvent() && !eventType.isEmpty()) {
            String entityId = extractEntityId(result);
            Map<String, Object> data = convertToMap(result);

            DataSyncEvent event = DataSyncEvent.builder()
                    .eventType(eventType)
                    .entityType(entityType)
                    .entityId(entityId)
                    .tenantId(tenantId)
                    .data(data)
                    .source("backend")
                    .timestamp(System.currentTimeMillis())
                    .build();

            pushService.publishDataSync(event);
            log.debug("[Sync] Pushed event, eventType={}, entityId={}", eventType, entityId);
        }
    }

    private String extractEntityId(Object result) {
        if (result == null) {
            return null;
        }

        try {
            Map<String, Object> map = objectMapper.convertValue(result, Map.class);

            if (map.containsKey("id")) {
                return String.valueOf(map.get("id"));
            }

            if (map.containsKey("orderId")) {
                return String.valueOf(map.get("orderId"));
            }

            if (map.containsKey("scanId")) {
                return String.valueOf(map.get("scanId"));
            }
        } catch (Exception e) {
            log.debug("[Sync] Extract entityId failed", e);
        }

        return null;
    }

    private Map<String, Object> convertToMap(Object result) {
        if (result == null) {
            return new HashMap<>();
        }

        try {
            return objectMapper.convertValue(result, Map.class);
        } catch (Exception e) {
            log.debug("[Sync] Convert to map failed", e);
            return new HashMap<>();
        }
    }
}
