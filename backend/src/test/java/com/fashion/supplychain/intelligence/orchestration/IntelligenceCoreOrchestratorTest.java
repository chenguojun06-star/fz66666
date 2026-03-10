package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.intelligence.dto.AnomalyDetectionResponse;
import com.fashion.supplychain.intelligence.dto.FactoryLeaderboardResponse;
import com.fashion.supplychain.intelligence.dto.HealthIndexResponse;
import com.fashion.supplychain.intelligence.dto.LivePulseResponse;
import com.fashion.supplychain.intelligence.dto.MaterialShortageResponse;
import com.fashion.supplychain.production.mapper.MaterialStockMapper;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.style.mapper.StyleBomMapper;
import com.fashion.supplychain.system.service.FactoryService;
import java.util.Collections;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

/**
 * 智能运营核心编排器单元测试
 *
 * <p>覆盖：AnomalyDetectionOrchestrator / HealthIndexOrchestrator /
 * FactoryLeaderboardOrchestrator / LivePulseOrchestrator / MaterialShortageOrchestrator
 *
 * <p>策略：空数据驱动早返回路径，验证防崩溃能力与响应对象完整性。
 */
@ExtendWith(MockitoExtension.class)
class IntelligenceCoreOrchestratorTest {

    // ===== AnomalyDetectionOrchestrator =====
    @InjectMocks
    private AnomalyDetectionOrchestrator anomalyDetection;

    @Mock
    private ScanRecordMapper scanRecordMapper;

    // ===== HealthIndexOrchestrator =====
    @InjectMocks
    private HealthIndexOrchestrator healthIndex;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    private ScanRecordService scanRecordService;

    @Mock
    private MaterialStockService materialStockService;

    @Mock
    private DashboardQueryService dashboardQueryService;

    // ===== FactoryLeaderboardOrchestrator =====
    @InjectMocks
    private FactoryLeaderboardOrchestrator factoryLeaderboard;

    @Mock
    private FactoryService factoryService;

    // ===== LivePulseOrchestrator =====
    @InjectMocks
    private LivePulseOrchestrator livePulse;

    // ===== MaterialShortageOrchestrator =====
    @InjectMocks
    private MaterialShortageOrchestrator materialShortage;

    @Mock
    private ProductionOrderMapper productionOrderMapper;

    @Mock
    @SuppressWarnings("unused")
    private StyleBomMapper styleBomMapper;

    @Mock
    @SuppressWarnings("unused")
    private MaterialStockMapper materialStockMapper;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    // ─────────────────────────── AnomalyDetectionOrchestrator ───────────────────────────

    @Test
    void anomaly_withNoScans_returnsEmptyAnomalies() {
        when(scanRecordMapper.selectList(any())).thenReturn(Collections.emptyList());

        AnomalyDetectionResponse resp = anomalyDetection.detect();

        assertThat(resp).isNotNull();
        assertThat(resp.getAnomalies()).isEmpty();
    }

    @Test
    void anomaly_withNoScans_totalCheckedIsNonNegative() {
        when(scanRecordMapper.selectList(any())).thenReturn(Collections.emptyList());

        AnomalyDetectionResponse resp = anomalyDetection.detect();

        assertThat(resp.getTotalChecked()).isGreaterThanOrEqualTo(0);
    }

    // ─────────────────────────── HealthIndexOrchestrator ───────────────────────────

    @Test
    void healthIndex_withNoOrders_returnsValidResponse() {
        // 空数据：list→空触发 productionScore 兜底 20；count→0 触发 deliveryScore 兜底 20
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(productionOrderService.count(any())).thenReturn(0L);
        // scanRecordService.count() 默认 0L → qualityScore 兜底 20，buildTrend 各日 index=0

        HealthIndexResponse resp = healthIndex.calculate();

        assertThat(resp).isNotNull();
        assertThat(resp.getHealthIndex()).isBetween(0, 100);
    }

    @Test
    void healthIndex_withNoData_gradeIsA() {
        // 空数据：各维度无数据时均兜底满分 20 → 合计 100 → "A"
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(productionOrderService.count(any())).thenReturn(0L);

        HealthIndexResponse resp = healthIndex.calculate();

        assertThat(resp.getGrade()).isEqualTo("A");
        assertThat(resp.getHealthIndex()).isEqualTo(100);
    }

    @Test
    void healthIndex_withNoData_trendHasSevenPoints() {
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(productionOrderService.count(any())).thenReturn(0L);

        HealthIndexResponse resp = healthIndex.calculate();

        assertThat(resp.getTrend()).hasSize(7);
    }

    // ─────────────────────────── FactoryLeaderboardOrchestrator ───────────────────────────

    @Test
    void factoryLeaderboard_withNoFactories_returnsEmptyRankings() {
        when(factoryService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        FactoryLeaderboardResponse resp = factoryLeaderboard.rank();

        assertThat(resp).isNotNull();
        assertThat(resp.getRankings()).isEmpty();
        assertThat(resp.getTotalFactories()).isEqualTo(0);
    }

    // ─────────────────────────── LivePulseOrchestrator ───────────────────────────

    @Test
    void livePulse_withNoScans_returnsZeroActiveWorkers() {
        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        LivePulseResponse resp = livePulse.pulse();

        assertThat(resp).isNotNull();
        assertThat(resp.getActiveWorkers()).isEqualTo(0);
        assertThat(resp.getTodayScanQty()).isEqualTo(0L);
    }

    @Test
    void livePulse_withNoScans_returnsTimelinePoints() {
        // 即使无扫码数据，脉搏时序应有 12 个 10 分钟分桶（120分钟窗口）
        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        LivePulseResponse resp = livePulse.pulse();

        assertThat(resp.getTimeline()).isNotNull().hasSize(12);
    }

    // ─────────────────────────── MaterialShortageOrchestrator ───────────────────────────

    @Test
    void materialShortage_withNoActiveOrders_returnsSummaryMessage() {
        when(productionOrderMapper.selectList(any())).thenReturn(Collections.emptyList());

        MaterialShortageResponse resp = materialShortage.predict();

        assertThat(resp).isNotNull();
        assertThat(resp.getSummary()).isEqualTo("当前无在产订单，无需预测");
    }

    @Test
    void materialShortage_withNoActiveOrders_returnsEmptyShortageItems() {
        when(productionOrderMapper.selectList(any())).thenReturn(Collections.emptyList());

        MaterialShortageResponse resp = materialShortage.predict();

        assertThat(resp.getShortageItems()).isEmpty();
        assertThat(resp.getCoveredOrderCount()).isEqualTo(0);
    }
}
