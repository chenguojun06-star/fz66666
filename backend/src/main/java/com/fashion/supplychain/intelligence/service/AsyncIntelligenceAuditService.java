package com.fashion.supplychain.intelligence.service;

import com.fashion.supplychain.intelligence.entity.IntelligenceAuditLog;
import com.fashion.supplychain.intelligence.mapper.IntelligenceAuditLogMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;

@Service
@Slf4j
public class AsyncIntelligenceAuditService {

    private static final int BATCH_SIZE = 50;
    private static final int MAX_QUEUE_SIZE = 500;

    private final ConcurrentLinkedQueue<IntelligenceAuditLog> insertQueue = new ConcurrentLinkedQueue<>();
    private final ConcurrentLinkedQueue<IntelligenceAuditLog> updateQueue = new ConcurrentLinkedQueue<>();

    @Autowired
    private IntelligenceAuditLogMapper auditLogMapper;

    public void asyncInsert(IntelligenceAuditLog logEntry) {
        if (insertQueue.size() >= MAX_QUEUE_SIZE) {
            log.warn("[AsyncAudit] 插入队列已满({})，降级为同步写入", insertQueue.size());
            auditLogMapper.insert(logEntry);
            return;
        }
        insertQueue.offer(logEntry);
    }

    public void asyncUpdate(IntelligenceAuditLog logEntry) {
        if (updateQueue.size() >= MAX_QUEUE_SIZE) {
            log.warn("[AsyncAudit] 更新队列已满({})，降级为同步写入", updateQueue.size());
            auditLogMapper.updateById(logEntry);
            return;
        }
        updateQueue.offer(logEntry);
    }

    @Scheduled(fixedDelay = 2000, initialDelay = 5000)
    public void flush() {
        try {
            flushInserts();
            flushUpdates();
        } catch (Exception e) {
            log.error("[AsyncAudit] 定时刷盘异常 inserts={} updates={}: {}",
                    insertQueue.size(), updateQueue.size(), e.getMessage(), e);
        }
    }

    private void flushInserts() {
        List<IntelligenceAuditLog> batch = new ArrayList<>(BATCH_SIZE);
        IntelligenceAuditLog entry;
        while ((entry = insertQueue.poll()) != null) {
            batch.add(entry);
            if (batch.size() >= BATCH_SIZE) {
                doInsertBatch(batch);
                batch = new ArrayList<>(BATCH_SIZE);
            }
        }
        if (!batch.isEmpty()) {
            doInsertBatch(batch);
        }
    }

    private void flushUpdates() {
        List<IntelligenceAuditLog> batch = new ArrayList<>(BATCH_SIZE);
        IntelligenceAuditLog entry;
        while ((entry = updateQueue.poll()) != null) {
            batch.add(entry);
            if (batch.size() >= BATCH_SIZE) {
                doUpdateBatch(batch);
                batch = new ArrayList<>(BATCH_SIZE);
            }
        }
        if (!batch.isEmpty()) {
            doUpdateBatch(batch);
        }
    }

    private void doInsertBatch(List<IntelligenceAuditLog> batch) {
        try {
            for (IntelligenceAuditLog logEntry : batch) {
                auditLogMapper.insert(logEntry);
            }
            log.debug("[AsyncAudit] 批量插入{}条审计日志", batch.size());
        } catch (Exception e) {
            log.warn("[AsyncAudit] 批量插入失败，尝试逐条写入: {}", e.getMessage());
            for (IntelligenceAuditLog logEntry : batch) {
                try {
                    auditLogMapper.insert(logEntry);
                } catch (Exception ex) {
                    log.warn("[AsyncAudit] 单条插入失败 commandId={}: {}", logEntry.getCommandId(), ex.getMessage());
                }
            }
        }
    }

    private void doUpdateBatch(List<IntelligenceAuditLog> batch) {
        try {
            for (IntelligenceAuditLog logEntry : batch) {
                auditLogMapper.updateById(logEntry);
            }
            log.debug("[AsyncAudit] 批量更新{}条审计日志", batch.size());
        } catch (Exception e) {
            log.warn("[AsyncAudit] 批量更新失败，尝试逐条写入: {}", e.getMessage());
            for (IntelligenceAuditLog logEntry : batch) {
                try {
                    auditLogMapper.updateById(logEntry);
                } catch (Exception ex) {
                    log.warn("[AsyncAudit] 单条更新失败 id={}: {}", logEntry.getId(), ex.getMessage());
                }
            }
        }
    }

    public int pendingInsertCount() {
        return insertQueue.size();
    }

    public int pendingUpdateCount() {
        return updateQueue.size();
    }
}
