package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleOperationLog;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

/**
 * 款式操作日志辅助类
 * 统一封装 style/pattern/sample/maintenance 四种业务类型的日志记录
 */
@Slf4j
@Component
public class StyleLogHelper {

    @Autowired
    private StyleOperationLogService styleOperationLogService;

    /**
     * 通用日志保存方法
     */
    public void saveLog(Long styleId, String bizType, String action, String remark) {
        try {
            StyleOperationLog operationLog = new StyleOperationLog();
            operationLog.setStyleId(styleId);
            operationLog.setBizType(bizType);
            operationLog.setAction(action);
            UserContext ctx = UserContext.get();
            operationLog.setOperator(ctx != null && StringUtils.hasText(ctx.getUsername()) ? ctx.getUsername() : "系统管理员");
            operationLog.setRemark(remark);
            operationLog.setCreateTime(LocalDateTime.now());
            styleOperationLogService.save(operationLog);
        } catch (Exception e) {
            log.warn("Failed to save {} log: styleId={}, action={}", bizType, styleId, action, e);
        }
    }

    public void saveStyleLog(Long styleId, String action, String remark) {
        saveLog(styleId, "style", action, remark);
    }

    public void savePatternLog(Long styleId, String action, String remark) {
        saveLog(styleId, "pattern", action, remark);
    }

    public void saveSampleLog(Long styleId, String action, String remark) {
        saveLog(styleId, "sample", action, remark);
    }

    /**
     * maintenance 日志：对 remark 做 trim 处理，空字符串置为 null
     */
    public void saveMaintenanceLog(Long styleId, String action, String remark) {
        String r = remark == null ? null : remark.trim();
        saveLog(styleId, "maintenance", action, r != null && !r.isEmpty() ? r : null);
    }
}
