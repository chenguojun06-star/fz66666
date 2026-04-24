package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.intelligence.dto.ActionCenterResponse;
import com.fashion.supplychain.intelligence.dto.ActionTaskFeedbackItem;
import com.fashion.supplychain.intelligence.dto.ActionTaskFeedbackRequest;
import com.fashion.supplychain.intelligence.entity.IntelligenceActionTaskFeedback;
import com.fashion.supplychain.intelligence.service.IntelligenceActionTaskFeedbackService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ActionTaskFeedbackOrchestrator {

    @Autowired
    private IntelligenceActionTaskFeedbackService feedbackService;

    public Result<ActionTaskFeedbackItem> submitFeedback(ActionTaskFeedbackRequest request) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("无法获取租户信息");
        }
        if (request == null || !StringUtils.hasText(request.getTaskCode())) {
            return Result.fail("taskCode不能为空");
        }

        String feedbackStatus = normalizeStatus(request.getFeedbackStatus());
        if (feedbackStatus == null) {
            return Result.fail("feedbackStatus仅支持 PROCESSING/COMPLETED/REJECTED");
        }

        IntelligenceActionTaskFeedback record = new IntelligenceActionTaskFeedback();
        record.setTenantId(tenantId);
        record.setTaskCode(request.getTaskCode().trim());
        record.setRelatedOrderNo(trimToNull(request.getRelatedOrderNo()));
        record.setFeedbackStatus(feedbackStatus);
        record.setFeedbackReason(trimToNull(request.getFeedbackReason()));
        record.setCompletionNote(trimToNull(request.getCompletionNote()));
        record.setSourceSignal(trimToNull(request.getSourceSignal()));
        record.setNextReviewAt(trimToNull(request.getNextReviewAt()));
        record.setOperatorId(UserContext.userId());
        record.setOperatorName(UserContext.username());
        record.setCreateTime(LocalDateTime.now());
        record.setUpdateTime(LocalDateTime.now());
        record.setDeleteFlag(0);

        feedbackService.save(record);
        return Result.success(toItem(record));
    }

    public List<ActionTaskFeedbackItem> listRecent(Integer limit) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return List.of();
        }
        int safeLimit = limit == null ? 20 : Math.min(Math.max(limit, 1), 100);

        List<IntelligenceActionTaskFeedback> rows = feedbackService.list(
                new LambdaQueryWrapper<IntelligenceActionTaskFeedback>()
                        .eq(IntelligenceActionTaskFeedback::getTenantId, tenantId)
                        .eq(IntelligenceActionTaskFeedback::getDeleteFlag, 0)
                        .orderByDesc(IntelligenceActionTaskFeedback::getCreateTime)
                        .last("LIMIT " + safeLimit)
        );

        List<ActionTaskFeedbackItem> items = new ArrayList<>();
        for (IntelligenceActionTaskFeedback row : rows) {
            items.add(toItem(row));
        }
        return items;
    }

    public void applyTaskFeedbackState(List<ActionCenterResponse.ActionTask> tasks) {
        if (tasks == null || tasks.isEmpty()) {
            return;
        }
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return;
        }

        List<IntelligenceActionTaskFeedback> rows = feedbackService.list(
                new LambdaQueryWrapper<IntelligenceActionTaskFeedback>()
                        .eq(IntelligenceActionTaskFeedback::getTenantId, tenantId)
                        .eq(IntelligenceActionTaskFeedback::getDeleteFlag, 0)
                        .orderByDesc(IntelligenceActionTaskFeedback::getCreateTime)
                        .last("LIMIT 300")
        );

        Map<String, IntelligenceActionTaskFeedback> latestByKey = new HashMap<>();
        for (IntelligenceActionTaskFeedback row : rows) {
            String key = taskKey(row.getTaskCode(), row.getRelatedOrderNo());
            latestByKey.putIfAbsent(key, row);
        }

        for (ActionCenterResponse.ActionTask task : tasks) {
            IntelligenceActionTaskFeedback feedback = latestByKey.get(taskKey(task.getTaskCode(), task.getRelatedOrderNo()));
            if (feedback == null) {
                continue;
            }
            task.setFeedbackStatus(feedback.getFeedbackStatus());
            task.setFeedbackReason(feedback.getFeedbackReason());
            task.setCompletionNote(feedback.getCompletionNote());
            task.setFeedbackTime(formatDateTime(feedback.getCreateTime()));
            if (!StringUtils.hasText(task.getSourceSignal())) {
                task.setSourceSignal(feedback.getSourceSignal());
            }
            if (!StringUtils.hasText(task.getNextReviewAt())) {
                task.setNextReviewAt(feedback.getNextReviewAt());
            }
        }
    }

    private ActionTaskFeedbackItem toItem(IntelligenceActionTaskFeedback row) {
        ActionTaskFeedbackItem item = new ActionTaskFeedbackItem();
        item.setTaskCode(row.getTaskCode());
        item.setRelatedOrderNo(row.getRelatedOrderNo());
        item.setFeedbackStatus(row.getFeedbackStatus());
        item.setFeedbackReason(row.getFeedbackReason());
        item.setCompletionNote(row.getCompletionNote());
        item.setSourceSignal(row.getSourceSignal());
        item.setNextReviewAt(row.getNextReviewAt());
        item.setOperatorId(row.getOperatorId());
        item.setOperatorName(row.getOperatorName());
        item.setFeedbackTime(formatDateTime(row.getCreateTime()));
        return item;
    }

    private String normalizeStatus(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        if ("PROCESSING".equals(normalized) || "COMPLETED".equals(normalized) || "REJECTED".equals(normalized)) {
            return normalized;
        }
        return null;
    }

    private String trimToNull(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private String taskKey(String taskCode, String relatedOrderNo) {
        return (taskCode == null ? "" : taskCode.trim()) + "::" + (relatedOrderNo == null ? "" : relatedOrderNo.trim());
    }

    private String formatDateTime(LocalDateTime time) {
        if (time == null) {
            return null;
        }
        return time.format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"));
    }
}
