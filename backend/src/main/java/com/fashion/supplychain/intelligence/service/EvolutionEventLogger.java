package com.fashion.supplychain.intelligence.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardOpenOption;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 进化事件审计日志（append-only events.jsonl）。
 *
 * <p>设计借鉴 Hermes Self-Evolution 的可观测性要求：所有进化事件必须可审计、可追溯。
 * 解决痛点：自我进化组件散落各处，无统一审计日志，"自我进化空转"无法被发现。
 *
 * <p>事件类型：
 * <ul>
 *   <li>{@code SKILL_CRYSTALLIZED} — 技能结晶化</li>
 *   <li>{@code SKILL_EVOLVED} — 技能进化</li>
 *   <li>{@code PROMPT_OPTIMIZED} — prompt 优化</li>
 *   <li>{@code CONSTRAINT_GATE_FAILED} — 门控失败</li>
 *   <li>{@code CONVERGENCE_STOPPED} — 收敛停止</li>
 * </ul>
 *
 * <p>存储格式：每行一个 JSON：{@code {"timestamp":..., "tenantId":..., "eventType":..., "payload":...}}
 * 文件按天滚动：{@code logs/evolution-events-2026-06-20.jsonl}
 *
 * <p>设计原则：
 * <ul>
 *   <li>append-only，绝不修改历史记录</li>
 *   <li>写入失败不抛异常，仅记录 WARN（审计日志不应阻断业务）</li>
 *   <li>查询时倒序读取最后 N 行（避免全文件扫描）</li>
 *   <li>多租户隔离：payload 中可携带 tenantId，查询时按 tenantId 过滤</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
public class EvolutionEventLogger {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter TS_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    @Value("${xiaoyun.evolution.event-log-dir:logs}")
    private String logDir;

    /**
     * 进化事件 DTO（不可变）。
     */
    public static final class EvolutionEvent {
        private final String timestamp;
        private final Long tenantId;
        private final String eventType;
        private final Map<String, Object> payload;

        private EvolutionEvent(String timestamp, Long tenantId, String eventType, Map<String, Object> payload) {
            this.timestamp = timestamp;
            this.tenantId = tenantId;
            this.eventType = eventType;
            this.payload = payload != null ? payload : Collections.emptyMap();
        }

        public static EvolutionEvent of(Long tenantId, String eventType, Map<String, Object> payload) {
            return new EvolutionEvent(LocalDateTime.now().format(TS_FMT), tenantId, eventType, payload);
        }

        public Long getTenantId() { return tenantId; }
        public String getEventType() { return eventType; }
        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("timestamp", timestamp);
            m.put("tenantId", tenantId);
            m.put("eventType", eventType);
            m.put("payload", payload);
            return m;
        }
    }

    /**
     * 追加事件到 events.jsonl（按天滚动）。
     */
    public void log(EvolutionEvent event) {
        if (event == null) return;
        try {
            Path path = resolveDailyPath();
            String json = MAPPER.writeValueAsString(event.toMap()) + "\n";
            Files.write(path, json.getBytes(StandardCharsets.UTF_8),
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            log.warn("[EvolutionEvent] 写入失败 eventType={} err={}", event.getEventType(), e.getMessage());
        }
    }

    /**
     * 查询事件（倒序，按 tenantId + eventType 过滤）。
     */
    public List<EvolutionEvent> queryEvents(Long tenantId, String eventType, int limit) {
        if (limit <= 0) limit = 100;
        Path path = resolveDailyPath();
        if (!Files.exists(path)) return Collections.emptyList();
        try {
            List<String> lines = Files.readAllLines(path, StandardCharsets.UTF_8);
            List<EvolutionEvent> matched = new ArrayList<>();
            for (int i = lines.size() - 1; i >= 0 && matched.size() < limit; i--) {
                EvolutionEvent ev = parseLine(lines.get(i));
                if (ev != null && matchesFilter(ev, tenantId, eventType)) matched.add(ev);
            }
            return matched;
        } catch (IOException e) {
            log.warn("[EvolutionEvent] 读取失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * 统计今日事件总数（用于 EvolutionOrchestrator 健康巡检）。
     */
    public long countTodayEvents() {
        Path path = resolveDailyPath();
        if (!Files.exists(path)) return 0L;
        try {
            return Files.lines(path, StandardCharsets.UTF_8).count();
        } catch (IOException e) {
            return 0L;
        }
    }

    // ==================== 私有方法 ====================

    private Path resolveDailyPath() {
        String today = LocalDate.now().format(DATE_FMT);
        return Paths.get(logDir, "evolution-events-" + today + ".jsonl");
    }

    private EvolutionEvent parseLine(String line) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = MAPPER.readValue(line, Map.class);
            Long tid = m.get("tenantId") instanceof Number n ? n.longValue() : null;
            String etype = (String) m.get("eventType");
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = (Map<String, Object>) m.get("payload");
            return new EvolutionEvent((String) m.get("timestamp"), tid, etype, payload);
        } catch (Exception e) {
            return null;
        }
    }

    private boolean matchesFilter(EvolutionEvent ev, Long tenantId, String eventType) {
        if (tenantId != null && !tenantId.equals(ev.getTenantId())) return false;
        if (eventType != null && !eventType.equals(ev.getEventType())) return false;
        return true;
    }
}
