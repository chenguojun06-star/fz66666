package com.fashion.supplychain.system.helper;

import com.fashion.supplychain.system.service.TenantSubscriptionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Component
@Slf4j
public class TenantSubscriptionGrantHelper {

    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private TenantSubscriptionService tenantSubscriptionService;

    public void autoGrantFinanceTaxFreebie(Long tenantId, String tenantName) {
        final String APP_CODE = "FINANCE_TAX";
        try {
            List<Map<String, Object>> appRows = jdbcTemplate.queryForList(
                "SELECT id, app_name FROM t_app_store WHERE app_code = ? AND status = 'PUBLISHED' LIMIT 1",
                APP_CODE);
            if (appRows.isEmpty()) {
                log.warn("[新开户赠送] t_app_store 中 {} 不存在，跳过自动赠送", APP_CODE);
                return;
            }
            Long appId = ((Number) appRows.get(0).get("id")).longValue();
            String appName = (String) appRows.get(0).get("app_name");

            List<Map<String, Object>> existing = jdbcTemplate.queryForList(
                "SELECT id FROM t_tenant_subscription WHERE tenant_id = ? AND app_code = ? AND status IN ('ACTIVE','TRIAL') LIMIT 1",
                tenantId, APP_CODE);
            if (!existing.isEmpty()) {
                log.info("[新开户赠送] 租户{}({}) 已有有效 {} 订阅，跳过", tenantName, tenantId, APP_CODE);
                return;
            }

            LocalDateTime now = LocalDateTime.now();
            LocalDateTime endTime = now.plusYears(1);
            String subNo = tenantSubscriptionService.generateSubscriptionNo();
            jdbcTemplate.update(
                "INSERT INTO t_tenant_subscription " +
                "(subscription_no, tenant_id, tenant_name, app_id, app_code, app_name, " +
                "subscription_type, price, user_count, start_time, end_time, status, auto_renew, created_by, remark, create_time, delete_flag) " +
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                subNo, tenantId, tenantName, appId, APP_CODE, appName,
                "FREE", 0, 999, now, endTime, "ACTIVE", false, "system", "新开户赠送", now, 0);
            log.info("[新开户赠送] 租户{}({}) 已自动激活 {} 有效期至 {}", tenantName, tenantId, APP_CODE, endTime.toLocalDate());
        } catch (Exception e) {
            log.warn("[新开户赠送] 租户{}({}) 自动激活 {} 失败（不影响开户）: {}", tenantName, tenantId, APP_CODE, e.getMessage());
        }
    }
}
