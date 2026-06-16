package com.fashion.supplychain.common.audit;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 操作审计上下文
 * 
 * <p>在请求生命周期内收集操作审计信息，用于记录关键操作日志。
 * 
 * <p>使用方式：
 * <pre>{@code
 * @Autowired
 * private OperationAuditContext auditContext;
 * 
 * public void someMethod() {
 *     auditContext.record("CREATE_ORDER", "创建生产订单", orderId);
 *     // ... 业务逻辑
 *     auditContext.success();
 * }
 * }</pre>
 */
@Slf4j
@Component
@RequestScope
@Data
@JsonInclude(JsonInclude.Include.NON_NULL)
public class OperationAuditContext {

    private String traceId;
    private Long tenantId;
    private Long userId;
    private String userName;
    private String ipAddress;
    
    private String operationType;
    private String operationName;
    private String targetId;
    private String targetType;
    
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private boolean success;
    private String errorMessage;
    
    private final List<AuditDetail> details = new ArrayList<>();

    public OperationAuditContext() {
        this.traceId = UUID.randomUUID().toString().substring(0, 8);
        this.startTime = LocalDateTime.now();
    }

    /**
     * 记录操作开始
     */
    public void record(String operationType, String operationName, String targetId) {
        this.operationType = operationType;
        this.operationName = operationName;
        this.targetId = targetId;
        log.debug("[Audit] 操作开始: {} - {} - {}", operationType, operationName, targetId);
    }

    /**
     * 记录操作详情
     */
    public void addDetail(String key, Object value) {
        this.details.add(new AuditDetail(key, value != null ? value.toString() : null));
    }

    /**
     * 标记操作成功
     */
    public void success() {
        this.success = true;
        this.endTime = LocalDateTime.now();
        log.info("[Audit] 操作成功: {} - {} - {} (耗时: {}ms)", 
                operationType, operationName, targetId, getDurationMs());
    }

    /**
     * 标记操作失败
     */
    public void failure(String errorMessage) {
        this.success = false;
        this.errorMessage = errorMessage;
        this.endTime = LocalDateTime.now();
        log.warn("[Audit] 操作失败: {} - {} - {} - {} (耗时: {}ms)", 
                operationType, operationName, targetId, errorMessage, getDurationMs());
    }

    /**
     * 获取操作耗时（毫秒）
     */
    public long getDurationMs() {
        if (startTime == null || endTime == null) {
            return 0;
        }
        return java.time.Duration.between(startTime, endTime).toMillis();
    }

    /**
     * 是否为敏感操作
     */
    public boolean isSensitiveOperation() {
        if (operationType == null) return false;
        return operationType.startsWith("DELETE") 
            || operationType.startsWith("BATCH_DELETE")
            || operationType.contains("PASSWORD")
            || operationType.contains("PERMISSION")
            || operationType.contains("ROLE")
            || operationType.contains("PAYROLL");
    }

    /**
     * 获取审计摘要
     */
    public String getSummary() {
        return String.format("%s:%s:%s:%s", 
                tenantId, userId, operationType, targetId);
    }

    /**
     * 审计详情
     */
    @Data
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public static class AuditDetail {
        private String key;
        private String value;
        
        public AuditDetail(String key, String value) {
            this.key = key;
            this.value = value;
        }
    }
}
