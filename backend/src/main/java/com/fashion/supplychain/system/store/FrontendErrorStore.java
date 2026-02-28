package com.fashion.supplychain.system.store;

import com.fashion.supplychain.system.dto.FrontendErrorDTO;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

/**
 * 前端异常内存队列
 * 最多保留最近 200 条，超出后自动淘汰最旧的一条。
 * 不写数据库，重启后清空 —— 仅用于超管实时诊断，生命周期与容器相同。
 * 独立 Store，不与任何 Service/Orchestrator 有依赖关系，仅被 Controller 和 Orchestrator 注入。
 */
@Component
public class FrontendErrorStore {

    private static final int MAX_SIZE = 200;
    private final Deque<FrontendErrorDTO> buffer = new ArrayDeque<>(MAX_SIZE);

    /** 写入一条前端异常（线程安全） */
    public synchronized void add(FrontendErrorDTO error) {
        if (buffer.size() >= MAX_SIZE) {
            buffer.pollFirst(); // 淘汰最旧的
        }
        buffer.addLast(error);
    }

    /** 获取最近 N 条（按时间从旧到新） */
    public synchronized List<FrontendErrorDTO> getRecent(int limit) {
        List<FrontendErrorDTO> all = new ArrayList<>(buffer);
        int start = Math.max(0, all.size() - limit);
        return new ArrayList<>(all.subList(start, all.size()));
    }

    /** 队列中当前总条数 */
    public synchronized int size() {
        return buffer.size();
    }

    /**
     * 统计 since 时间之后上报的条数
     * occurredAt 格式：ISO 8601（前端 new Date().toISOString()）
     */
    public synchronized long countSince(LocalDateTime since) {
        DateTimeFormatter fmt = DateTimeFormatter.ISO_DATE_TIME;
        return buffer.stream().filter(e -> {
            if (e.getOccurredAt() == null) return false;
            try {
                // ISO string 末尾可能带 'Z'，替换为 '+00:00' 后解析
                String raw = e.getOccurredAt().replace("Z", "");
                LocalDateTime t = LocalDateTime.parse(raw, fmt);
                return !t.isBefore(since);
            } catch (Exception ex) {
                return false;
            }
        }).count();
    }
}
