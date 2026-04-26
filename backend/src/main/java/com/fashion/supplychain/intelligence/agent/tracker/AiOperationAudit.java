package com.fashion.supplychain.intelligence.agent.tracker;

import com.fashion.supplychain.common.UserContext;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.context.annotation.RequestScope;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Component
@RequestScope
public class AiOperationAudit {

    private final Map<String, AuditEntry> entries = new ConcurrentHashMap<>();
    private final List<String> order = Collections.synchronizedList(new ArrayList<>());

    public String recordStart(String toolName, Map<String, Object> arguments) {
        String auditId = UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        AuditEntry entry = new AuditEntry();
        entry.setAuditId(auditId);
        entry.setToolName(toolName);
        entry.setOperatorId(UserContext.userId());
        entry.setOperatorName(UserContext.username());
        entry.setTenantId(UserContext.tenantId());
        entry.setFactoryId(UserContext.factoryId());
        entry.setStartTime(LocalDateTime.now());
        entry.setBusinessTarget(extractBusinessTarget(toolName, arguments));
        entries.put(auditId, entry);
        order.add(auditId);
        log.debug("[Audit] AI操作开始: id={}, tool={}, operator={}, target={}",
                auditId, toolName, entry.getOperatorName(), entry.getBusinessTarget());
        return auditId;
    }

    public void recordComplete(String auditId, boolean success, String summary) {
        AuditEntry entry = entries.get(auditId);
        if (entry == null) {
            log.warn("[Audit] 未找到审计记录: id={}", auditId);
            return;
        }
        entry.setSuccess(success);
        entry.setEndTime(LocalDateTime.now());
        entry.setSummary(truncate(summary, 200));
        log.info("[Audit] AI操作完成: id={}, tool={}, operator={}, target={}, success={}",
                auditId, entry.getToolName(), entry.getOperatorName(),
                entry.getBusinessTarget(), success);
    }

    public List<AuditEntry> getEntries() {
        return order.stream().map(entries::get).filter(Objects::nonNull).toList();
    }

    public List<AuditEntry> getFailedEntries() {
        return getEntries().stream().filter(e -> !Boolean.TRUE.equals(e.getSuccess())).toList();
    }

    public String buildAuditSummary() {
        List<AuditEntry> all = getEntries();
        long successCount = all.stream().filter(e -> Boolean.TRUE.equals(e.getSuccess())).count();
        long failCount = all.size() - successCount;

        StringBuilder sb = new StringBuilder();
        sb.append(String.format("【AI操作审计】共%d次操作 | 成功%d | 失败%d\n", all.size(), successCount, failCount));

        for (AuditEntry e : all) {
            String icon = Boolean.TRUE.equals(e.getSuccess()) ? "✅" : "❌";
            sb.append(String.format("  %s %s → %s (操作人: %s)\n",
                    icon, e.getToolName(), e.getBusinessTarget(), e.getOperatorName()));
        }
        return sb.toString();
    }

    private String extractBusinessTarget(String toolName, Map<String, Object> arguments) {
        if (arguments == null) return "-";
        String orderNo = str(arguments.get("orderNo"));
        if (orderNo != null) return "订单:" + orderNo;
        String scanCode = str(arguments.get("scanCode"));
        if (scanCode != null) return "菲号:" + scanCode;
        String styleNo = str(arguments.get("styleNo"));
        if (styleNo != null) return "款号:" + styleNo;
        String bundleId = str(arguments.get("bundleId"));
        if (bundleId != null) return "菲号ID:" + bundleId;
        return "-";
    }

    private String str(Object val) {
        return val != null && !val.toString().isBlank() ? val.toString().trim() : null;
    }

    private String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() > max ? s.substring(0, max) + "..." : s;
    }

    @Data
    public static class AuditEntry {
        private String auditId;
        private String toolName;
        private String operatorId;
        private String operatorName;
        private Long tenantId;
        private String factoryId;
        private String businessTarget;
        private LocalDateTime startTime;
        private LocalDateTime endTime;
        private Boolean success;
        private String summary;
    }
}
