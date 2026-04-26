package com.fashion.supplychain.intelligence.agent.sse;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
public class SseEmitterHelper {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final AtomicInteger EVENT_SEQ = new AtomicInteger(0);

    private static final ScheduledExecutorService HEARTBEAT_SCHEDULER = new ScheduledThreadPoolExecutor(2, r -> {
        Thread t = new Thread(r, "sse-heartbeat");
        t.setDaemon(true);
        return t;
    });

    public static void send(SseEmitter emitter, SseEvent event) {
        if (emitter == null) return;
        try {
            String jsonData = MAPPER.writeValueAsString(event.getData());
            SseEmitter.SseEventBuilder builder = SseEmitter.event()
                    .id(String.valueOf(EVENT_SEQ.incrementAndGet()))
                    .name(event.getEvent())
                    .data(jsonData);
            if (event.getRetry() != null) {
                builder.reconnectTime(event.getRetry());
            }
            emitter.send(builder);
        } catch (IOException e) {
            log.debug("[SSE] 发送失败(客户端可能已断开): event={}", event.getEvent());
        } catch (Exception e) {
            log.warn("[SSE] 发送异常: event={}, error={}", event.getEvent(), e.getMessage());
        }
    }

    public static void sendComment(SseEmitter emitter, String comment) {
        if (emitter == null) return;
        try {
            emitter.send(SseEmitter.event().comment(comment));
        } catch (IOException e) {
            log.debug("[SSE] comment发送失败");
        }
    }

    public static void complete(SseEmitter emitter) {
        if (emitter == null) return;
        try {
            emitter.complete();
        } catch (Exception e) {
            log.debug("[SSE] complete异常: {}", e.getMessage());
        }
    }

    public static void completeWithError(SseEmitter emitter, Throwable ex) {
        if (emitter == null) return;
        try {
            emitter.completeWithError(ex);
        } catch (Exception e) {
            log.debug("[SSE] completeWithError异常: {}", e.getMessage());
        }
    }

    public static void startHeartbeat(SseEmitter emitter, long intervalSeconds) {
        HEARTBEAT_SCHEDULER.scheduleAtFixedRate(() -> {
            try {
                sendComment(emitter, "heartbeat " + System.currentTimeMillis());
            } catch (Exception e) {
                log.debug("[SSE] 心跳发送失败，可能连接已断开");
            }
        }, intervalSeconds, intervalSeconds, TimeUnit.SECONDS);
    }

    public static SseEmitter createEmitter(long timeoutMs) {
        SseEmitter emitter = new SseEmitter(timeoutMs);
        emitter.onCompletion(() -> log.debug("[SSE] 连接完成"));
        emitter.onTimeout(() -> {
            log.debug("[SSE] 连接超时");
            complete(emitter);
        });
        emitter.onError(ex -> {
            log.debug("[SSE] 连接错误: {}", ex.getMessage());
            completeWithError(emitter, ex);
        });
        return emitter;
    }
}
