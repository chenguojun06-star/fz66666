package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Slf4j
@Component
public class StyleOperationAppendHelper {

    @Autowired
    private StyleLogHelper styleLogHelper;

    @Autowired
    private StyleInfoService styleInfoService;

    public void appendOperation(Long styleId, String action, String detail) {
        if (styleId == null) {
            return;
        }
        styleLogHelper.saveStyleLog(styleId, action, detail);
    }

    public void appendOperation(StyleInfo style, String action, String detail) {
        if (style == null || style.getId() == null) {
            return;
        }
        styleLogHelper.saveStyleLog(style.getId(), action, detail);
    }

    public void appendSaveProductionRequirements(Long styleId) {
        if (styleId == null) {
            return;
        }
        styleLogHelper.saveStyleLog(styleId, "PRODUCTION_REQUIREMENTS_SAVE", null);
    }

    public void appendRollbackProductionRequirements(Long styleId, String reason) {
        if (styleId == null) {
            return;
        }
        styleLogHelper.saveMaintenanceLog(styleId, "PRODUCTION_REQUIREMENTS_ROLLBACK", reason);
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
