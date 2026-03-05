package com.fashion.supplychain.integration;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.orchestration.EcSalesRevenueOrchestrator;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.service.PlatformNotifyService;
import com.fashion.supplychain.integration.openapi.dto.TenantAppRequest;
import com.fashion.supplychain.integration.openapi.entity.TenantApp;
import com.fashion.supplychain.integration.openapi.entity.TenantAppLog;
import com.fashion.supplychain.integration.openapi.orchestration.TenantAppOrchestrator;
import com.fashion.supplychain.integration.openapi.service.TenantAppLogService;
import com.fashion.supplychain.integration.openapi.service.TenantAppService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

/**
 * 集成模块编排器单元测试
 * 覆盖：EcommerceOrderOrchestrator / TenantAppOrchestrator
 */
@ExtendWith(MockitoExtension.class)
class IntegrationOrchestratorTest {

    // ===== EcommerceOrderOrchestrator =====

    @InjectMocks
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    @Mock
    private EcommerceOrderService ecOrderService;

    @Mock
    private EcSalesRevenueOrchestrator ecSalesRevenueOrchestrator;

    @Mock
    private PlatformNotifyService platformNotifyService;

    @Mock
    private ProductionOrderService productionOrderService;

    // ===== TenantAppOrchestrator =====

    @InjectMocks
    private TenantAppOrchestrator tenantAppOrchestrator;

    @Mock
    private TenantAppService tenantAppService;

    @Mock
    private TenantAppLogService tenantAppLogService;

    @BeforeEach
    void setUp() {
        UserContext.clear();
    }

    private void setTenant(long id) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(id);
        UserContext.set(ctx);
    }

    // ─────────────────────────── EcommerceOrderOrchestrator ───────────────────────────

    @Test
    void receiveOrder_withMissingPlatformOrderNo_throwsIllegalArgument() {
        setTenant(1L);
        Map<String, Object> body = new HashMap<>();
        // 不含 platformOrderNo 字段

        assertThatThrownBy(() -> ecommerceOrderOrchestrator.receiveOrder("TAOBAO", body))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("平台订单号不能为空");
    }

    @Test
    void receiveOrder_withDuplicateOrder_returnsDuplicateFlag() {
        setTenant(1L);
        EcommerceOrder existing = new EcommerceOrder();
        existing.setId(99L);
        existing.setOrderNo("EC202600001");
        when(ecOrderService.getOne(any(), eq(false))).thenReturn(existing);

        Map<String, Object> body = new HashMap<>();
        body.put("platformOrderNo", "TB-12345");

        Map<String, Object> result = ecommerceOrderOrchestrator.receiveOrder("TAOBAO", body);

        assertThat(result).containsKey("duplicate");
        assertThat(result.get("duplicate")).isEqualTo(true);
        assertThat(result.get("id")).isEqualTo(99L);
    }

    @Test
    void listOrders_withEmptyData_returnsEmptyPage() {
        setTenant(1L);
        when(ecOrderService.page(any(), any())).thenReturn(new Page<>());

        Map<String, Object> params = new HashMap<>();
        params.put("page", "1");
        params.put("pageSize", "20");

        IPage<?> result = ecommerceOrderOrchestrator.listOrders(params);

        assertThat(result).isNotNull();
        assertThat(result.getRecords()).isEmpty();
    }

    @Test
    void linkProductionOrder_withNonExistentEcOrder_throwsIllegalArgument() {
        setTenant(1L);
        when(ecOrderService.getById(anyLong())).thenReturn(null);

        assertThatThrownBy(() -> ecommerceOrderOrchestrator.linkProductionOrder(1L, "PO2026001"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    // ─────────────────────────── TenantAppOrchestrator ───────────────────────────

    @Test
    void getAppTypes_returnsAllSupportedTypes() {
        List<Map<String, String>> types = tenantAppOrchestrator.getAppTypes();

        assertThat(types).isNotNull().isNotEmpty();
        // 至少包含核心类型
        boolean hasOrderSync = types.stream().anyMatch(m -> "ORDER_SYNC".equals(m.get("value")));
        assertThat(hasOrderSync).isTrue();
    }

    @Test
    void getStats_withNoApps_returnsZeroStats() {
        when(tenantAppService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        Map<String, Object> stats = tenantAppOrchestrator.getStats(1L);

        assertThat(stats).isNotNull();
        assertThat(stats.get("total")).isEqualTo(0);
        assertThat(stats.get("active")).isEqualTo(0L);
    }

    @Test
    void getStats_withActiveApps_countsCorrectly() {
        TenantApp app1 = new TenantApp();
        app1.setStatus("active");
        app1.setAppType("ORDER_SYNC");
        app1.setTotalCalls(100L);

        TenantApp app2 = new TenantApp();
        app2.setStatus("disabled");
        app2.setAppType("LOGISTICS_SYNC");
        app2.setTotalCalls(50L);

        when(tenantAppService.list(any(Wrapper.class))).thenReturn(List.of(app1, app2));

        Map<String, Object> stats = tenantAppOrchestrator.getStats(1L);

        assertThat(stats.get("total")).isEqualTo(2);
        assertThat(stats.get("active")).isEqualTo(1L);
        assertThat(stats.get("disabled")).isEqualTo(1L);
        assertThat(stats.get("totalCalls")).isEqualTo(150L);
    }

    @Test
    void createApp_withInvalidAppType_throwsIllegalArgument() {
        TenantAppRequest request = new TenantAppRequest();
        request.setAppType("UNSUPPORTED_TYPE");
        request.setAppName("测试应用");

        assertThatThrownBy(() -> tenantAppOrchestrator.createApp(1L, request))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不支持的应用类型");
    }

    @Test
    void createApp_withValidAppType_savesAndReturnsSecret() {
        TenantAppRequest request = new TenantAppRequest();
        request.setAppType("ORDER_SYNC");
        request.setAppName("订单对接App");

        // tenantAppService.save() 返回 void，不需要 stub
        // 只需要 save 不抛出异常即可
        when(tenantAppService.save(any())).thenReturn(true);

        com.fashion.supplychain.integration.openapi.dto.TenantAppResponse resp =
                tenantAppOrchestrator.createApp(1L, request);

        assertThat(resp).isNotNull();
        // appSecret 明文返回（仅创建时）
        assertThat(resp.getAppSecret()).isNotBlank();
        assertThat(resp.getAppKey()).isNotBlank();
    }

    @Test
    void getAppDetail_withNonExistentApp_throwsIllegalArgument() {
        when(tenantAppService.getById(any())).thenReturn(null);

        assertThatThrownBy(() -> tenantAppOrchestrator.getAppDetail("app-001", 1L))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("应用不存在");
    }

    @Test
    void listApps_withNoApps_returnsEmptyPage() {
        when(tenantAppService.page(any(), any())).thenReturn(new Page<>());

        Page<com.fashion.supplychain.integration.openapi.dto.TenantAppResponse> result =
                tenantAppOrchestrator.listApps(1L, null, null, 1, 20);

        assertThat(result).isNotNull();
        assertThat(result.getRecords()).isEmpty();
    }

    @Test
    void getIntegrationOverview_withNoApps_returnsStructuredResult() {
        when(tenantAppService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(tenantAppLogService.page(any(), any())).thenReturn(new Page<>());

        Map<String, Object> overview = tenantAppOrchestrator.getIntegrationOverview(1L);

        assertThat(overview).isNotNull();
        assertThat(overview).containsKey("modules");
        assertThat(overview.get("totalApps")).isEqualTo(0);
        assertThat(overview.get("activeApps")).isEqualTo(0L);
    }
}
