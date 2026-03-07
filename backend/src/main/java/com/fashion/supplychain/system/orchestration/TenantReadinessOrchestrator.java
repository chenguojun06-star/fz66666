package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.dto.TenantReadinessReportResponse;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.TenantBillingRecord;
import com.fashion.supplychain.system.entity.TenantSubscription;
import com.fashion.supplychain.system.service.TenantBillingRecordService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.TenantSubscriptionService;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;

/**
 * 租户运营健康编排器（独立能力）
 */
@Slf4j
@Service
public class TenantReadinessOrchestrator {

    @Autowired
    private TenantService tenantService;

    @Autowired
    private TenantBillingRecordService tenantBillingRecordService;

    @Autowired
    private TenantSubscriptionService tenantSubscriptionService;

    @Autowired(required = false)
    private JdbcTemplate jdbcTemplate;

    public TenantReadinessReportResponse getMyReadiness() {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalArgumentException("当前账号不属于租户");
        }
        return buildReport(tenantId);
    }

    public TenantReadinessReportResponse getTenantReadiness(Long tenantId) {
        assertSuperAdmin();
        return buildReport(tenantId);
    }

    public List<TenantReadinessReportResponse> listTopRisks(int limit) {
        assertSuperAdmin();
        int safeLimit = Math.max(1, Math.min(limit, 100));

        QueryWrapper<Tenant> wrapper = new QueryWrapper<>();
        wrapper.eq("status", "active").orderByAsc("id").last("LIMIT " + (safeLimit * 4));
        List<Tenant> tenants = tenantService.list(wrapper);

        List<TenantReadinessReportResponse> reports = new ArrayList<>();
        for (Tenant tenant : tenants) {
            try {
                reports.add(buildReport(tenant.getId()));
            } catch (Exception e) {
                log.warn("[租户健康] 生成报告失败 tenantId={}: {}", tenant.getId(), e.getMessage());
            }
        }
        reports.sort(Comparator.comparingInt(TenantReadinessReportResponse::getReadinessScore));
        return reports.size() > safeLimit ? reports.subList(0, safeLimit) : reports;
    }

    private TenantReadinessReportResponse buildReport(Long tenantId) {
        Tenant tenant = tenantService.getById(tenantId);
        if (tenant == null) {
            throw new IllegalArgumentException("租户不存在: " + tenantId);
        }

        TenantReadinessReportResponse report = new TenantReadinessReportResponse();
        report.setTenantId(tenant.getId());
        report.setTenantName(tenant.getTenantName());
        report.setTenantStatus(tenant.getStatus());
        report.setPaidStatus(tenant.getPaidStatus());
        report.setPlanType(tenant.getPlanType());
        report.setExpireTime(tenant.getExpireTime());
        report.setGeneratedAt(LocalDateTime.now());

        int score = 100;

        if (!"active".equalsIgnoreCase(String.valueOf(tenant.getStatus()))) {
            score -= addRisk(report, "TENANT_STATUS",
                    "租户状态异常",
                    "租户当前状态为 " + tenant.getStatus() + "，可能影响业务可用性",
                    40);
        }

        score -= checkTenantExpiry(report, tenant);
        score -= checkUserQuota(report, tenant);
        score -= checkStorageQuota(report, tenant);
        score -= checkBillingRisk(report, tenantId);
        score -= checkSubscriptionRisk(report, tenantId);
        score -= checkOrderScanConsistency(report, tenantId);

        score = Math.max(0, score);
        report.setReadinessScore(score);
        report.setReadinessLevel(score >= 85 ? "HEALTHY" : score >= 65 ? "WARNING" : "CRITICAL");

        report.getRisks().sort(Comparator.comparingInt(TenantReadinessReportResponse.RiskItem::getPenalty).reversed());
        report.setHighlights(buildHighlights(report));
        return report;
    }

    private int checkTenantExpiry(TenantReadinessReportResponse report, Tenant tenant) {
        if (tenant.getExpireTime() == null) {
            return 0;
        }
        long daysLeft = ChronoUnit.DAYS.between(LocalDateTime.now(), tenant.getExpireTime());
        if (daysLeft < 0) {
            return addRisk(report, "TENANT_EXPIRED", "租户已过期", "租户服务已过期，需尽快续费恢复", 35);
        }
        if (daysLeft <= 7) {
            return addRisk(report, "TENANT_EXPIRING_7D", "租户即将过期", "剩余 " + daysLeft + " 天到期，建议立即续费", 20);
        }
        if (daysLeft <= 30) {
            return addRisk(report, "TENANT_EXPIRING_30D", "租户30天内到期", "剩余 " + daysLeft + " 天到期，请提前安排续费", 10);
        }
        return 0;
    }

    private int checkUserQuota(TenantReadinessReportResponse report, Tenant tenant) {
        Integer maxUsers = tenant.getMaxUsers();
        if (maxUsers == null || maxUsers <= 0) {
            report.getMetrics().setUserUsagePercent(0);
            return 0;
        }

        int currentUsers = tenantService.countTenantUsers(tenant.getId());
        int usagePercent = (int) Math.round(currentUsers * 100.0 / maxUsers);
        report.getMetrics().setUserUsagePercent(usagePercent);

        if (usagePercent >= 100) {
            return addRisk(report, "USER_QUOTA_FULL", "用户数已超限", "当前用户数 " + currentUsers + "/" + maxUsers + "，建议升级套餐", 18);
        }
        if (usagePercent >= 90) {
            return addRisk(report, "USER_QUOTA_HIGH", "用户数接近上限", "当前用户数 " + currentUsers + "/" + maxUsers + "，建议预留扩容", 8);
        }
        return 0;
    }

    private int checkStorageQuota(TenantReadinessReportResponse report, Tenant tenant) {
        Long quota = tenant.getStorageQuotaMb();
        Long used = tenant.getStorageUsedMb();
        if (quota == null || quota <= 0) {
            report.getMetrics().setStorageUsagePercent(0);
            return 0;
        }
        int usagePercent = (int) Math.round((used == null ? 0L : used) * 100.0 / quota);
        report.getMetrics().setStorageUsagePercent(usagePercent);

        if (usagePercent >= 100) {
            return addRisk(report, "STORAGE_QUOTA_FULL", "存储已超限", "存储使用率 " + usagePercent + "%，请清理或扩容", 15);
        }
        if (usagePercent >= 90) {
            return addRisk(report, "STORAGE_QUOTA_HIGH", "存储接近上限", "存储使用率 " + usagePercent + "%，建议提前扩容", 6);
        }
        return 0;
    }

    private int checkBillingRisk(TenantReadinessReportResponse report, Long tenantId) {
        LocalDateTime threshold = LocalDateTime.now().minusDays(7);
        LambdaQueryWrapper<TenantBillingRecord> query = new LambdaQueryWrapper<>();
        query.eq(TenantBillingRecord::getTenantId, tenantId)
                .in(TenantBillingRecord::getStatus, "PENDING", "OVERDUE")
                .lt(TenantBillingRecord::getCreateTime, threshold);
        int staleBills = Math.toIntExact(tenantBillingRecordService.count(query));
        report.getMetrics().setStalePendingBills(staleBills);

        if (staleBills <= 0) {
            return 0;
        }
        int penalty = Math.min(25, staleBills * 5);
        return addRisk(report, "BILLING_STALE", "存在逾期账单风险", "超过7天未处理账单 " + staleBills + " 条", penalty);
    }

    private int checkSubscriptionRisk(TenantReadinessReportResponse report, Long tenantId) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime near = now.plusDays(30);

        LambdaQueryWrapper<TenantSubscription> expiringQ = new LambdaQueryWrapper<>();
        expiringQ.eq(TenantSubscription::getTenantId, tenantId)
                .in(TenantSubscription::getStatus, "ACTIVE", "TRIAL")
                .ge(TenantSubscription::getEndTime, now)
                .le(TenantSubscription::getEndTime, near);
        int expiring = Math.toIntExact(tenantSubscriptionService.count(expiringQ));
        report.getMetrics().setExpiringSubscriptions(expiring);

        LambdaQueryWrapper<TenantSubscription> expiredQ = new LambdaQueryWrapper<>();
        expiredQ.eq(TenantSubscription::getTenantId, tenantId)
                .in(TenantSubscription::getStatus, "ACTIVE", "TRIAL")
                .lt(TenantSubscription::getEndTime, now);
        int expired = Math.toIntExact(tenantSubscriptionService.count(expiredQ));
        report.getMetrics().setExpiredSubscriptions(expired);

        int penalty = 0;
        if (expiring > 0) {
            penalty += addRisk(report, "SUBSCRIPTION_EXPIRING", "应用订阅即将到期", "30天内到期订阅 " + expiring + " 个", Math.min(20, expiring * 4));
        }
        if (expired > 0) {
            penalty += addRisk(report, "SUBSCRIPTION_EXPIRED", "存在已过期订阅", "已过期但仍标记有效的订阅 " + expired + " 个", Math.min(20, expired * 5));
        }
        return penalty;
    }

    private int checkOrderScanConsistency(TenantReadinessReportResponse report, Long tenantId) {
        if (jdbcTemplate == null) {
            return addRisk(report, "CONSISTENCY_UNCHECKED", "一致性检查未启用", "数据库一致性检查不可用，无法评估订单与扫码偏差", 6);
        }
        String sql = "SELECT COUNT(*) FROM (" +
                " SELECT o.order_no " +
                " FROM t_production_order o " +
                " LEFT JOIN t_scan_record s ON o.order_no = s.order_no " +
                "   AND (s.delete_flag = 0 OR s.delete_flag IS NULL) " +
                " WHERE o.tenant_id = ? AND o.delete_flag = 0 " +
                " GROUP BY o.order_no, o.order_quantity " +
                " HAVING ABS(COALESCE(SUM(CASE WHEN s.request_id IS NULL OR s.request_id NOT LIKE 'system-%' THEN s.quantity ELSE 0 END), 0) - o.order_quantity) > 10 " +
                ") t";
        int inconsistent = queryInt(sql, tenantId);
        report.getMetrics().setInconsistentOrders(inconsistent);
        if (inconsistent <= 0) {
            return 0;
        }
        return addRisk(report, "ORDER_SCAN_MISMATCH", "订单扫码数据不一致", "订单与扫码数量偏差超阈值的订单有 " + inconsistent + " 条", Math.min(30, inconsistent * 3));
    }

    private int addRisk(TenantReadinessReportResponse report, String code, String title, String detail, int penalty) {
        String severity = penalty >= 20 ? "HIGH" : penalty >= 10 ? "MEDIUM" : "LOW";
        report.getRisks().add(TenantReadinessReportResponse.RiskItem.of(code, title, detail, penalty, severity));
        return penalty;
    }

    private List<String> buildHighlights(TenantReadinessReportResponse report) {
        List<String> highlights = new ArrayList<>();
        highlights.add("健康分 " + report.getReadinessScore() + "（" + report.getReadinessLevel() + "）");
        if (report.getRisks().isEmpty()) {
            highlights.add("当前未发现高优先级风险");
            return highlights;
        }
        int top = Math.min(3, report.getRisks().size());
        for (int i = 0; i < top; i++) {
            TenantReadinessReportResponse.RiskItem risk = report.getRisks().get(i);
            highlights.add(risk.getTitle() + "：" + risk.getDetail());
        }
        return highlights;
    }

    private int queryInt(String sql, Object... args) {
        try {
            Integer value = jdbcTemplate.queryForObject(sql, Integer.class, args);
            return value == null ? 0 : value;
        } catch (Exception e) {
            log.warn("[租户健康] SQL执行失败: {}", e.getMessage());
            return 0;
        }
    }

    private void assertSuperAdmin() {
        if (!UserContext.isSuperAdmin()) {
            throw new AccessDeniedException("仅超级管理员可访问该接口");
        }
    }
}
