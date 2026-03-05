package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.service.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class TenantOrchestratorTest {

    @InjectMocks
    private TenantOrchestrator orchestrator;

    @Mock private TenantService tenantService;
    @Mock private UserService userService;
    @Mock private RoleService roleService;
    @Mock private RolePermissionService rolePermissionService;
    @Mock private TenantPermissionCeilingService ceilingService;
    @Mock private UserPermissionOverrideService overrideService;
    @Mock private PermissionService permissionService;
    @Mock private PermissionCalculationEngine permissionEngine;
    @Mock private TenantBillingRecordService billingRecordService;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setSuperAdmin(true);
        ctx.setUserId("admin");
        ctx.setUsername("superadmin");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private void switchToNonSuperAdmin() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setRole("user");
        UserContext.set(ctx);
    }

    // ── createTenant – access control ────────────────────────────────

    @Test
    void createTenant_withoutSuperAdmin_throwsAccessDeniedException() {
        switchToNonSuperAdmin();
        assertThatThrownBy(() ->
                orchestrator.createTenant("租户A", "TC001", "联系人", "13800000000",
                        "owner1", "pass123456", "Owner", 50, "STANDARD"))
                .isInstanceOf(AccessDeniedException.class)
                .hasMessageContaining("超级管理员");
    }

    @Test
    void createTenant_duplicateTenantCode_throwsIllegalArgumentException() {
        Tenant existing = new Tenant();
        existing.setTenantCode("TC001");
        when(tenantService.findByTenantCode("TC001")).thenReturn(existing);

        assertThatThrownBy(() ->
                orchestrator.createTenant("租户A", "TC001", "联系人", "13800000000",
                        "owner1", "pass123456", "Owner", 50, "STANDARD"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("租户编码已存在");
    }

    // ── applyForTenant – validation ──────────────────────────────────

    @Test
    void applyForTenant_emptyTenantName_throwsIllegalArgumentException() {
        assertThatThrownBy(() ->
                orchestrator.applyForTenant("", "联系人", "13800000000", "user1", "pass123456"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("工厂名称不能为空");
    }

    @Test
    void applyForTenant_emptyUsername_throwsIllegalArgumentException() {
        assertThatThrownBy(() ->
                orchestrator.applyForTenant("工厂名", "联系人", "13800000000", "", "pass123456"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("申请账号不能为空");
    }

    @Test
    void applyForTenant_shortPassword_throwsIllegalArgumentException() {
        assertThatThrownBy(() ->
                orchestrator.applyForTenant("工厂名", "联系人", "13800000000", "user1", "abc"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("密码长度不能少于6位");
    }

    @Test
    void applyForTenant_nullPassword_throwsIllegalArgumentException() {
        assertThatThrownBy(() ->
                orchestrator.applyForTenant("工厂名", "联系人", "13800000000", "user1", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("密码长度不能少于6位");
    }

    // ── getPlanDefinitions ────────────────────────────────────────────

    @Test
    void getPlanDefinitions_returnsFourPlans() {
        List<Map<String, Object>> plans = orchestrator.getPlanDefinitions();
        assertThat(plans).hasSize(4);
        List<String> keys = plans.stream()
                .map(p -> (String) p.get("code"))
                .toList();
        assertThat(keys).containsExactlyInAnyOrder("TRIAL", "BASIC", "PRO", "ENTERPRISE");
    }

    // ── PLAN_DEFINITIONS constant ─────────────────────────────────────

    @Test
    void planDefinitions_trialFeesAreZero() {
        Map<String, Object> trial = TenantOrchestrator.PLAN_DEFINITIONS.get("TRIAL");
        assertThat(trial).isNotNull();
        assertThat(((java.math.BigDecimal) trial.get("monthlyFee")).compareTo(java.math.BigDecimal.ZERO)).isZero();
    }

    @Test
    void planDefinitions_containsExpectedPlans() {
        assertThat(TenantOrchestrator.PLAN_DEFINITIONS).containsKeys("TRIAL", "BASIC", "PRO", "ENTERPRISE");
    }

    // ── deleteTenant – access control ────────────────────────────────

    @Test
    void deleteTenant_withoutSuperAdmin_throwsAccessDeniedException() {
        switchToNonSuperAdmin();
        assertThatThrownBy(() -> orchestrator.deleteTenant(1L))
                .isInstanceOf(AccessDeniedException.class);
    }

    // ── rejectApplication – access control ───────────────────────────

    @Test
    void rejectApplication_withoutSuperAdmin_throwsAccessDeniedException() {
        switchToNonSuperAdmin();
        assertThatThrownBy(() -> orchestrator.rejectApplication(1L, "理由"))
                .isInstanceOf(AccessDeniedException.class);
    }
}
