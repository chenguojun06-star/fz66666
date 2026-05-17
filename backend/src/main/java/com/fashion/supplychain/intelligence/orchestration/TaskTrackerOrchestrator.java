package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.fashion.supplychain.intelligence.entity.AiTaskTracker;
import com.fashion.supplychain.intelligence.mapper.AiTaskTrackerMapper;
import com.fashion.supplychain.common.UserContext;
import java.time.LocalDateTime;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * AI任务追踪器 — 把AI"说"变成"做+追踪"。
 * 每次工具执行写操作时自动记录任务，定时检查完成状态。
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class TaskTrackerOrchestrator {

    private final AiTaskTrackerMapper mapper;

    /**
     * 工具执行后记录追踪任务。
     * @return 任务ID，后续用于标记完成
     */
    public Long recordTask(String toolName, String taskType, String targetType,
                           String targetId, String summary, String assignedTo) {
        AiTaskTracker t = new AiTaskTracker()
                .setTenantId(UserContext.tenantId())
                .setTaskSourceTool(toolName)
                .setTaskType(taskType)
                .setTargetType(targetType)
                .setTargetId(targetId)
                .setTaskSummary(summary)
                .setStatus("PENDING")
                .setAssignedTo(assignedTo)
                .setCreatedAt(LocalDateTime.now());
        mapper.insert(t);
        log.info("[TaskTracker] {} → {}: {}", toolName, targetId, summary);
        return t.getId();
    }

    /**
     * 标记任务完成。
     */
    public void completeTask(Long taskId, String resultSummary) {
        mapper.update(null, new UpdateWrapper<AiTaskTracker>()
                .set("status", "COMPLETED")
                .set("completed_at", LocalDateTime.now())
                .set("result_summary", resultSummary)
                .eq("id", taskId));
        log.info("[TaskTracker] 任务 #{} 完成: {}", taskId, resultSummary);
    }

    /**
     * 定时扫描超时未完成的任务（默认超过24小时标记为EXPIRED）。
     */
    public void expireStaleTasks() {
        LocalDateTime threshold = LocalDateTime.now().minusHours(24);
        long count = mapper.selectCount(new QueryWrapper<AiTaskTracker>()
                .eq("status", "PENDING")
                .lt("created_at", threshold));
        if (count > 0) {
            mapper.update(null, new UpdateWrapper<AiTaskTracker>()
                    .set("status", "EXPIRED")
                    .eq("status", "PENDING")
                    .lt("created_at", threshold));
            log.warn("[TaskTracker] 超时过期任务: {} 条", count);
        }
    }
}