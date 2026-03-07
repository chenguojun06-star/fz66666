package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.dto.TenantReadinessReportResponse;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.TenantBillingRecordService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.TenantSubscriptionService;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TenantReadinessOrchestratorTest {

    @InjectMocks
    private TenantReadinessOrchestrator orchestrator;

    @Mock
    private TenantService tenantService;

    @Mock
    private TenantBillingRecordService tenantBillingRecordService;

    @Mock
    private TenantSubscriptionService tenantSubscriptionService;

    @Mock
    private JdbcTemplate jdbcTemplate;

    private Tenant tenant;

    @BeforeEach
    void setUp() {
        tenant = new Tenant();
        tenant.setId(1L);
        tenant.setTenantName("测试租户");
        tenant.setStatus("active");
        tenant.setPaidStatus("PAID");
        tenant.setPlanType("PRO");
        tenant.setMaxUsers(100);
        tenant.setStorageQuotaMb(1000L);
        tenant.setStorageUsedMb(200L);
        tenant.setExpireTime(LocalDateTime.now().plusDays(60));

    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void getMyReadiness_whenHealthy_returnsHighScore() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
        when(tenantService.getById(1L)).thenReturn(tenant);
        when(tenantService.countTenantUsers(1L)).thenReturn(50);
        when(tenantBillingRecordService.count(any())).thenReturn(0L);
        when(tenantSubscriptionService.count(any())).thenReturn(0L);

        TenantReadinessReportResponse report = orchestrator.getMyReadiness();

        assertThat(report.getReadinessScore()).isEqualTo(100);
        assertThat(report.getReadinessLevel()).isEqualTo("HEALTHY");
        assertThat(report.getRisks()).isEmpty();
    }

    @Test
    void getMyReadiness_whenNoTenantContext_throwsIllegalArgument() {
        UserContext.clear();

        assertThatThrownBy(() -> orchestrator.getMyReadiness())
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不属于租户");
    }

    @Test
    void getTenantReadiness_withoutSuperAdmin_throwsAccessDenied() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setSuperAdmin(false);
        UserContext.set(ctx);

        assertThatThrownBy(() -> orchestrator.getTenantReadiness(1L))
                .isInstanceOf(AccessDeniedException.class);
    }

    @Test
    @SuppressWarnings("unchecked")
    void listTopRisks_whenSuperAdmin_returnsSortedReports() {
        UserContext ctx = new UserContext();
        ctx.setSuperAdmin(true);
        UserContext.set(ctx);

        Tenant riskTenant = new Tenant();
        riskTenant.setId(2L);
        riskTenant.setTenantName("高风险租户");
        riskTenant.setStatus("active");
        riskTenant.setPaidStatus("TRIAL");
        riskTenant.setPlanType("TRIAL");
        riskTenant.setMaxUsers(10);
        riskTenant.setStorageQuotaMb(100L);
        riskTenant.setStorageUsedMb(100L);
        riskTenant.setExpireTime(LocalDateTime.now().minusDays(2));

        when(tenantService.getById(2L)).thenReturn(riskTenant);
        when(tenantService.getById(1L)).thenReturn(tenant);
        when(tenantService.countTenantUsers(1L)).thenReturn(50);
        when(tenantService.countTenantUsers(2L)).thenReturn(12);
        when(tenantService.list(any(QueryWrapper.class))).thenReturn(List.of(tenant, riskTenant));
        when(tenantBillingRecordService.count(any())).thenReturn(1L);
        when(tenantSubscriptionService.count(any())).thenReturn(1L);

        List<TenantReadinessReportResponse> reports = orchestrator.listTopRisks(2);

        assertThat(reports).hasSize(2);
        assertThat(reports.get(0).getTenantName()).isEqualTo("高风险租户");
        assertThat(reports.get(0).getReadinessScore()).isLessThan(reports.get(1).getReadinessScore());
    }
}
