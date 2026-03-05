package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.BottleneckDetectionRequest;
import com.fashion.supplychain.intelligence.dto.BottleneckDetectionResponse;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskRequest;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskResponse;
import com.fashion.supplychain.intelligence.dto.WorkerEfficiencyResponse;
import com.fashion.supplychain.intelligence.service.ProcessStatsEngine;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
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
 * 智能运营扩展编排器单元测试
 *
 * <p>覆盖：WorkerEfficiencyOrchestrator / BottleneckDetectionOrchestrator /
 * OrderDeliveryRiskOrchestrator
 *
 * <p>策略：空数据触发早返回，验证防崩与响应字段正确性。
 */
@ExtendWith(MockitoExtension.class)
class IntelligenceExtendedOrchestratorTest {

    // ===== WorkerEfficiencyOrchestrator =====
    @InjectMocks
    private WorkerEfficiencyOrchestrator workerEfficiency;

    @Mock
    private ScanRecordService scanRecordService;

    // ===== BottleneckDetectionOrchestrator =====
    @InjectMocks
    private BottleneckDetectionOrchestrator bottleneckDetection;

    @Mock
    private ProductionOrderService productionOrderService;

    @Mock
    @SuppressWarnings("unused")
    private ScanRecordMapper scanRecordMapper;

    // ===== OrderDeliveryRiskOrchestrator =====
    @InjectMocks
    private OrderDeliveryRiskOrchestrator orderDeliveryRisk;

    @Mock
    @SuppressWarnings("unused")
    private ProcessStatsEngine processStatsEngine;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    // ─────────────────────────── WorkerEfficiencyOrchestrator ───────────────────────────

    @Test
    void workerEfficiency_withNoRecords_returnsEmptyWorkerList() {
        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        WorkerEfficiencyResponse resp = workerEfficiency.evaluate();

        assertThat(resp).isNotNull();
        assertThat(resp.getWorkers()).isEmpty();
    }

    @Test
    void workerEfficiency_withNoRecords_totalEvaluatedIsZero() {
        when(scanRecordService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        WorkerEfficiencyResponse resp = workerEfficiency.evaluate();

        assertThat(resp.getTotalEvaluated()).isEqualTo(0);
    }

    // ─────────────────────────── BottleneckDetectionOrchestrator ───────────────────────────

    @Test
    void bottleneck_withNoOrders_returnsSummaryMessage() {
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        BottleneckDetectionResponse resp = bottleneckDetection.detect(new BottleneckDetectionRequest());

        assertThat(resp).isNotNull();
        assertThat(resp.getSummary()).isEqualTo("暂无进行中的订单");
    }

    @Test
    void bottleneck_withNoOrders_hasNoBottlenecks() {
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        BottleneckDetectionResponse resp = bottleneckDetection.detect(new BottleneckDetectionRequest());

        assertThat(resp.getBottlenecks()).isEmpty();
    }

    // ─────────────────────────── OrderDeliveryRiskOrchestrator ───────────────────────────

    @Test
    void orderDeliveryRisk_withNoOrders_returnsEmptyOrdersList() {
        when(productionOrderService.list(any(Wrapper.class))).thenReturn(Collections.emptyList());

        DeliveryRiskResponse resp = orderDeliveryRisk.assess(new DeliveryRiskRequest());

        assertThat(resp).isNotNull();
        assertThat(resp.getOrders()).isEmpty();
    }
}
