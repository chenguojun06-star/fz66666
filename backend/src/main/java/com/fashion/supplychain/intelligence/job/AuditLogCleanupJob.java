package com.fashion.supplychain.intelligence.job;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
public class AuditLogCleanupJob {

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Scheduled(cron = "0 0 4 * * ?")
    public void cleanupOldAuditLogs() {
        try {
            int retentionDays = 90;
            try {
                String val = jdbcTemplate.queryForObject(
                        "SELECT config_value FROM t_param_config WHERE config_key = 'system.auditLog.retentionDays' AND delete_flag = 0 LIMIT 1",
                        String.class);
                if (val != null) retentionDays = Integer.parseInt(val);
            } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }

            int deleted = jdbcTemplate.update(
                    "DELETE FROM t_intelligence_audit_log WHERE create_time < DATE_SUB(NOW(), INTERVAL ? DAY)",
                    retentionDays);
            if (deleted > 0) {
                log.info("[AuditLogCleanup] 清理{}天前审计日志: 删除{}条", retentionDays, deleted);
            }
        } catch (Exception e) {
            log.warn("[AuditLogCleanup] 审计日志清理失败: {}", e.getMessage());
        }
    }
}
