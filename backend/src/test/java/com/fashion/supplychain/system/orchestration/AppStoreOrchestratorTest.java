package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.openapi.orchestration.TenantAppOrchestrator;
import com.fashion.supplychain.system.entity.AppStore;
import com.fashion.supplychain.system.entity.TenantSubscription;
import com.fashion.supplychain.system.service.AppOrderService;
import com.fashion.supplychain.system.service.AppStoreService;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.TenantSubscriptionService;
import com.fashion.supplychain.system.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AppStoreOrchestratorTest {

    @InjectMocks
    private AppStoreOrchestrator orchestrator;

    @Mock private AppStoreService appStoreService;
    @Mock private AppOrderService appOrderService;
    @Mock private TenantSubscriptionService tenantSubscriptionService;
    @Mock private TenantAppOrchestrator tenantAppOrchestrator;
    @Mock private TenantService tenantService;
    @Mock private UserService userService;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setUserId("u1");
        ctx.setUsername("testUser");
        ctx.setTenantId(1L);
        ctx.setRole("user");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ── calculatePrice ───────────────────────────────────────────────

    @Test
    void calculatePrice_trial_returnsZero() {
        AppStore app = buildApp(new BigDecimal("199"), new BigDecimal("1990"), new BigDecimal("5000"));
        BigDecimal price = orchestrator.calculatePrice(app, "TRIAL");
        assertThat(price).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    void calculatePrice_monthly_returnsPriceMonthly() {
        AppStore app = buildApp(new BigDecimal("199"), new BigDecimal("1990"), new BigDecimal("5000"));
        BigDecimal price = orchestrator.calculatePrice(app, "MONTHLY");
        assertThat(price).isEqualByComparingTo(new BigDecimal("199"));
    }

    @Test
    void calculatePrice_yearly_returnsPriceYearly() {
        AppStore app = buildApp(new BigDecimal("199"), new BigDecimal("1990"), new BigDecimal("5000"));
        BigDecimal price = orchestrator.calculatePrice(app, "YEARLY");
        assertThat(price).isEqualByComparingTo(new BigDecimal("1990"));
    }

    @Test
    void calculatePrice_perpetual_returnsPriceOnce() {
        AppStore app = buildApp(new BigDecimal("199"), new BigDecimal("1990"), new BigDecimal("5000"));
        BigDecimal price = orchestrator.calculatePrice(app, "PERPETUAL");
        assertThat(price).isEqualByComparingTo(new BigDecimal("5000"));
    }

    @Test
    void calculatePrice_nullPriceMonthly_returnsZero() {
        AppStore app = buildApp(null, null, null);
        assertThat(orchestrator.calculatePrice(app, "MONTHLY")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(orchestrator.calculatePrice(app, "YEARLY")).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(orchestrator.calculatePrice(app, "PERPETUAL")).isEqualByComparingTo(BigDecimal.ZERO);
    }

    // ── startTrial – error paths ─────────────────────────────────────

    @Test
    void startTrial_appNotFound_throwsRuntimeException() {
        when(appStoreService.getById(anyLong())).thenReturn(null);
        assertThatThrownBy(() -> orchestrator.startTrial(99L, 1L, null, null))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("应用不存在");
    }

    @Test
    void startTrial_noTrialDays_throwsRuntimeException() {
        AppStore app = buildApp(null, null, null);
        app.setTrialDays(0);
        when(appStoreService.getById(anyLong())).thenReturn(app);
        assertThatThrownBy(() -> orchestrator.startTrial(1L, 1L, null, null))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("不支持免费试用");
    }

    @Test
    void startTrial_alreadyTrialed_throwsRuntimeException() {
        AppStore app = buildApp(null, null, null);
        app.setTrialDays(14);
        app.setAppCode("ORDER_SYNC");
        app.setAppName("订单同步");
        when(appStoreService.getById(anyLong())).thenReturn(app);
        when(tenantSubscriptionService.count(any())).thenReturn(1L);

        assertThatThrownBy(() -> orchestrator.startTrial(1L, 1L, null, null))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("已试用过");
    }

    @Test
    void startTrial_alreadyActiveSubscription_throwsRuntimeException() {
        AppStore app = buildApp(null, null, null);
        app.setTrialDays(14);
        app.setAppCode("ORDER_SYNC");
        app.setAppName("订单同步");
        when(appStoreService.getById(anyLong())).thenReturn(app);
        // first count (TRIAL check) → 0, second count (ACTIVE check) → 1
        when(tenantSubscriptionService.count(any()))
                .thenReturn(0L)
                .thenReturn(1L);

        assertThatThrownBy(() -> orchestrator.startTrial(1L, 1L, null, null))
                .isInstanceOf(RuntimeException.class)
                .hasMessageContaining("已有该应用的有效订阅");
    }

    // ── getApiEndpointsForModule ──────────────────────────────────────

    @Test
    void getApiEndpointsForModule_orderSync_returnsFourEndpoints() {
        List<Map<String, String>> endpoints = orchestrator.getApiEndpointsForModule("ORDER_SYNC");
        assertThat(endpoints).hasSize(4);
        assertThat(endpoints.get(0)).containsKey("method");
    }

    @Test
    void getApiEndpointsForModule_unknownCode_returnsEmpty() {
        assertThat(orchestrator.getApiEndpointsForModule("UNKNOWN_CODE")).isEmpty();
    }

    // ── helpers ──────────────────────────────────────────────────────

    private AppStore buildApp(BigDecimal monthly, BigDecimal yearly, BigDecimal once) {
        AppStore app = new AppStore();
        app.setId(1L);
        app.setPriceMonthly(monthly);
        app.setPriceYearly(yearly);
        app.setPriceOnce(once);
        return app;
    }
}
