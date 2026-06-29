package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
public class StyleOperationAppendHelper {

    @Autowired
    private StyleInfoService styleInfoService;

    private static final DateTimeFormatter FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public void appendOperation(Long styleId, String action, String detail) {
        if (styleId == null) {
            return;
        }
        try {
            StyleInfo style = styleInfoService.getById(styleId);
            if (style != null) {
                appendToDescription(style, action, detail);
                styleInfoService.updateById(style);
            }
        } catch (Exception e) {
            log.warn("Failed to append operation log to style description: styleId={}, action={}", styleId, action, e);
        }
    }

    public void appendOperation(StyleInfo style, String action, String detail) {
        if (style == null || style.getId() == null) {
            return;
        }
        try {
            appendToDescription(style, action, detail);
            styleInfoService.updateById(style);
        } catch (Exception e) {
            log.warn("Failed to append operation log to style description: styleId={}, action={}", style.getId(), action, e);
        }
    }

    private void appendToDescription(StyleInfo style, String action, String detail) {
        String operator = getOperator();
        String time = LocalDateTime.now().format(FORMATTER);
        
        StringBuilder logEntry = new StringBuilder();
        logEntry.append("[").append(time).append("] ");
        logEntry.append(operator).append(" ");
        logEntry.append(action);
        if (StringUtils.hasText(detail)) {
            logEntry.append("：").append(detail);
        }
        
        String existing = style.getDescription();
        if (StringUtils.hasText(existing)) {
            style.setDescription(logEntry.toString() + "\n" + existing);
        } else {
            style.setDescription(logEntry.toString());
        }
    }

    private String getOperator() {
        UserContext ctx = UserContext.get();
        if (ctx != null && StringUtils.hasText(ctx.getUsername())) {
            return ctx.getUsername();
        }
        return "系统管理员";
    }

    public void appendCreate(Long styleId) {
        appendOperation(styleId, "创建款式", null);
    }

    public void appendUpdate(Long styleId, String fieldNames) {
        appendOperation(styleId, "修改款式", "更新字段：" + fieldNames);
    }

    public void appendUpdate(StyleInfo style, String fieldNames) {
        appendOperation(style, "修改款式", "更新字段：" + fieldNames);
    }

    public void appendSubmit(Long styleId) {
        appendOperation(styleId, "提交审核", null);
    }

    public void appendApprove(Long styleId, String reviewer) {
        appendOperation(styleId, "审核通过", "审核人：" + reviewer);
    }

    public void appendReject(Long styleId, String reviewer, String reason) {
        StringBuilder detail = new StringBuilder("审核人：" + reviewer);
        if (StringUtils.hasText(reason)) {
            detail.append("，驳回原因：").append(reason);
        }
        appendOperation(styleId, "审核驳回", detail.toString());
    }

    public void appendAssign(Long styleId, String stageName, String assignee) {
        appendOperation(styleId, "分配任务", stageName + " → " + assignee);
    }

    public void appendComplete(Long styleId, String stageName) {
        appendOperation(styleId, "完成任务", stageName);
    }

    public void appendStart(Long styleId, String stageName) {
        appendOperation(styleId, "开始任务", stageName);
    }

    public void appendSampleReview(Long styleId, String status, String reviewer, String comment) {
        StringBuilder detail = new StringBuilder("状态：" + status + "，审核人：" + reviewer);
        if (StringUtils.hasText(comment)) {
            detail.append("，评语：").append(comment);
        }
        appendOperation(styleId, "样衣审核", detail.toString());
    }

    public void appendScrap(Long styleId, String remark) {
        appendOperation(styleId, "报废款式", remark);
    }

    public void appendPushToOrder(Long styleId, String pushedBy) {
        appendOperation(styleId, "推送到下单管理", "推送人：" + pushedBy);
    }

    public void appendCopy(Long styleId, String newStyleNo) {
        appendOperation(styleId, "复制款式", "新款式：" + newStyleNo);
    }
}
