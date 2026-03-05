package com.fashion.supplychain.dashboard.orchestration;

import static org.assertj.core.api.Assertions.assertThat;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.dashboard.service.DashboardQueryService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

/**
 * DailyBriefOrchestrator 单元测试
 * 验证日报数据聚合逻辑的基本路径
 */
@ExtendWith(MockitoExtension.class)
class DailyBriefOrchestratorTest {

    @Mock
    private DashboardQueryService dashboardQueryService;

    @Mock
    private ProductionOrderService productionOrderService;

    @InjectMocks
    private DailyBriefOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        when(dashboardQueryService.countWarehousingBetween(any(), any())).thenReturn(3L);
        when(dashboardQueryService.sumWarehousingQuantityBetween(any(), any())).thenReturn(120L);
        when(dashboardQueryService.countScansBetween(any(), any())).thenReturn(50L);
        when(dashboardQueryService.countOverdueOrders()).thenReturn(2L);
        when(productionOrderService.list(any(LambdaQueryWrapper.class))).thenReturn(List.of());
    }

    @Test
    void getBrief_returnsNonNullMap() {
        Map<String, Object> brief = orchestrator.getBrief();
        assertThat(brief).isNotNull();
    }

    @Test
    void getBrief_containsExpectedKeys() {
        Map<String, Object> brief = orchestrator.getBrief();
        assertThat(brief).containsKey("date");
        assertThat(brief).containsKey("yesterdayWarehousingCount");
        assertThat(brief).containsKey("yesterdayWarehousingQuantity");
        assertThat(brief).containsKey("todayScanCount");
        assertThat(brief).containsKey("overdueOrderCount");
    }

    @Test
    void getBrief_yesterdayWarehousingCountMatchesMock() {
        Map<String, Object> brief = orchestrator.getBrief();
        // countWarehousingBetween 在昨日和本周各调用一次，任一 stub 返回 3L
        assertThat(brief.get("yesterdayWarehousingCount")).isEqualTo(3L);
    }

    @Test
    void getBrief_overdueCountMatchesMock() {
        Map<String, Object> brief = orchestrator.getBrief();
        assertThat(brief.get("overdueOrderCount")).isEqualTo(2L);
    }

    @Test
    void getBrief_todayScanCountMatchesMock() {
        Map<String, Object> brief = orchestrator.getBrief();
        assertThat(brief.get("todayScanCount")).isEqualTo(50L);
    }
}
