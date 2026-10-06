package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.extension.conditions.query.LambdaQueryChainWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code DeliveryCalibrationOrchestrator}（D-754 P3 交期偏差回扫自校准）契约测试。
 *
 * <p>守护三条契约：
 * <ol>
 *   <li><b>多租户隔离</b>：所有 SQL 必须带 {@code tenant_id = ?}（P0 铁律 4）；</li>
 *   <li><b>偏差口径</b>：偏差天数=实际完工−承诺交期；偏差倍数=实际周期÷计划允许周期；</li>
 *   <li><b>反哺优先级</b>：工厂×品类 &gt; 工厂 &gt; 品类，且样本不足（&lt;2）不得生效。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("DeliveryCalibrationOrchestrator - 交期偏差回扫自校准")
class DeliveryCalibrationOrchestratorTest {

    private static final Long TENANT = 9527L;

    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private DeliveryCalibrationOrchestrator orchestrator;

    @BeforeEach
    void bindTenant() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(TENANT);
        ctx.setUsername("tester");
        ctx.setUserId("tester");
        UserContext.set(ctx);
    }

    @AfterEach
    void clearTenant() {
        UserContext.clear();
    }

    private Map<String, Object> calibRow(int sample, double onTimeRate, double multiple) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("sample_count", sample);
        r.put("on_time_count", sample);
        r.put("on_time_rate", onTimeRate);
        r.put("avg_deviation_days", 3.5);
        r.put("deviation_multiple", multiple);
        r.put("avg_lead_days", 18.0);
        return r;
    }

    // ==================== 多租户隔离 ====================

    @Test
    @DisplayName("listAll 必须带 tenant_id = ? —— 回归：漏租户过滤会跨租户泄漏（P0 铁律 4）")
    void listAllFiltersByTenant() {
        when(jdbcTemplate.queryForList(anyString(), eq(TENANT))).thenReturn(List.of());

        orchestrator.listAll();

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(sqlCaptor.capture(), eq(TENANT));
        assertThat(sqlCaptor.getValue()).contains("t_delivery_calibration_stat").contains("tenant_id = ?");
    }

    @Test
    @DisplayName("lookup 的统计查询必须同时带 tenant_id / dimension_type / dimension_key")
    void lookupFiltersByTenantAndDimension() {
        when(jdbcTemplate.queryForList(anyString(), eq(TENANT), anyString(), anyString()))
                .thenReturn(List.of(calibRow(5, 80.0, 1.1)));

        orchestrator.lookup("甲厂", null);

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(sqlCaptor.capture(), eq(TENANT), anyString(), anyString());
        assertThat(sqlCaptor.getValue()).contains("tenant_id = ?").contains("dimension_key = ?");
    }

    // ==================== 偏差口径 ====================

    @Test
    @DisplayName("偏差天数=实际完工−承诺交期；偏差倍数=实际周期÷计划周期")
    void accumulateComputesDeviationAndMultiple() {
        ProductionOrder o = new ProductionOrder();
        o.setFactoryName("甲厂");
        o.setProductCategory("上衣");
        o.setActualStartDate(LocalDateTime.of(2026, 1, 1, 0, 0));
        o.setPlannedEndDate(LocalDateTime.of(2026, 1, 11, 0, 0));
        o.setActualEndDate(LocalDateTime.of(2026, 1, 16, 0, 0));

        Map<String, Object> accs = new HashMap<>();
        ReflectionTestUtils.invokeMethod(orchestrator, "accumulate", accs, o);

        assertThat(accs).containsKeys("FACTORY|甲厂", "CATEGORY|上衣", "FACTORY_CATEGORY|甲厂|上衣");
        Object factoryAcc = accs.get("FACTORY|甲厂");
        assertThat(((Number) ReflectionTestUtils.getField(factoryAcc, "sampleCount")).intValue()).isEqualTo(1);
        assertThat(((Number) ReflectionTestUtils.getField(factoryAcc, "onTimeCount")).intValue()).isEqualTo(0);
        assertThat(((Number) ReflectionTestUtils.getField(factoryAcc, "sumDeviation")).doubleValue()).isEqualTo(5.0);
        assertThat(((Number) ReflectionTestUtils.getField(factoryAcc, "sumMultiple")).doubleValue()).isEqualTo(1.5);
    }

    @Test
    @DisplayName("实际完工 ≤ 承诺交期 计为准交")
    void accumulateCountsOnTime() {
        ProductionOrder o = new ProductionOrder();
        o.setFactoryName("乙厂");
        o.setActualStartDate(LocalDateTime.of(2026, 2, 1, 0, 0));
        o.setPlannedEndDate(LocalDateTime.of(2026, 2, 20, 0, 0));
        o.setActualEndDate(LocalDateTime.of(2026, 2, 15, 0, 0));

        Map<String, Object> accs = new HashMap<>();
        ReflectionTestUtils.invokeMethod(orchestrator, "accumulate", accs, o);

        Object acc = accs.get("FACTORY|乙厂");
        assertThat(((Number) ReflectionTestUtils.getField(acc, "onTimeCount")).intValue()).isEqualTo(1);
        assertThat(((Number) ReflectionTestUtils.getField(acc, "sumDeviation")).doubleValue()).isEqualTo(-5.0);
    }

    @Test
    @DisplayName("偏差倍数被夹在 [0.5, 2.5]，防止极端样本污染建议")
    void clampBoundsMultiple() {
        assertThat((double) ReflectionTestUtils.invokeMethod(orchestrator, "clamp", 9.0)).isEqualTo(2.5);
        assertThat((double) ReflectionTestUtils.invokeMethod(orchestrator, "clamp", 0.1)).isEqualTo(0.5);
        assertThat((double) ReflectionTestUtils.invokeMethod(orchestrator, "clamp", 0.0)).isEqualTo(1.0);
    }

    // ==================== 反哺优先级 ====================

    @Test
    @DisplayName("工厂×品类样本充足时优先于工厂维度")
    void lookupPrefersFactoryCategory() {
        when(jdbcTemplate.queryForList(anyString(), eq(TENANT), anyString(), anyString()))
                .thenReturn(List.of(calibRow(6, 60.0, 1.4)));

        DeliveryCalibrationOrchestrator.DeliveryCalibration c = orchestrator.lookup("甲厂", "上衣");

        assertThat(c).isNotNull();
        assertThat(c.getDimensionType()).isEqualTo("FACTORY_CATEGORY");
        assertThat(c.getDeviationMultiple()).isEqualTo(1.4);
    }

    @Test
    @DisplayName("工厂×品类样本不足时回退到工厂维度")
    void lookupFallsBackToFactory() {
        when(jdbcTemplate.queryForList(anyString(), eq(TENANT), eq("FACTORY_CATEGORY"), anyString()))
                .thenReturn(List.of(calibRow(1, 100.0, 1.0)));
        when(jdbcTemplate.queryForList(anyString(), eq(TENANT), eq("FACTORY"), anyString()))
                .thenReturn(List.of(calibRow(8, 75.0, 1.2)));

        DeliveryCalibrationOrchestrator.DeliveryCalibration c = orchestrator.lookup("甲厂", "上衣");

        assertThat(c).isNotNull();
        assertThat(c.getDimensionType()).isEqualTo("FACTORY");
    }

    @Test
    @DisplayName("所有维度样本均不足时返回 null（不生效，保持原始建议）")
    void lookupReturnsNullWhenSampleTooSmall() {
        when(jdbcTemplate.queryForList(anyString(), eq(TENANT), anyString(), anyString()))
                .thenReturn(List.of(calibRow(1, 100.0, 0.9)));

        assertThat(orchestrator.lookup("甲厂", "上衣")).isNull();
    }

    @Test
    @DisplayName("查询异常时降级为 null（不抛错，避免交期建议 500）")
    void lookupDegradesOnError() {
        when(jdbcTemplate.queryForList(anyString(), eq(TENANT), anyString(), anyString()))
                .thenThrow(new RuntimeException("table missing"));

        assertThat(orchestrator.lookup("甲厂", "上衣")).isNull();
    }

    @SuppressWarnings("unchecked")
    @Test
    @DisplayName("无完工订单时返回可读摘要而非报错")
    void calibrateEmptyOrders() {
        LambdaQueryChainWrapper<ProductionOrder> chain = mock(LambdaQueryChainWrapper.class);
        when(productionOrderService.lambdaQuery()).thenReturn(chain);
        when(chain.eq(any(), any())).thenReturn(chain);
        when(chain.isNotNull(any())).thenReturn(chain);
        when(chain.ge(any(), any())).thenReturn(chain);
        when(chain.list()).thenReturn(Collections.emptyList());
        when(jdbcTemplate.queryForList(anyString(), eq(TENANT))).thenReturn(new ArrayList<>());

        Map<String, Object> resp = orchestrator.calibrate();

        assertThat(resp).containsKeys("summary", "orderCount");
        assertThat(String.valueOf(resp.get("summary"))).contains("暂无已完工订单");
    }
}