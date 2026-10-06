package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
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

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code StageBottleneckHeatmapOrchestrator}（D-754 P2 环节瓶颈热力）契约测试。
 *
 * <p>守护两条契约：
 * <ol>
 *   <li><b>多租户隔离</b>：环节耗时统计 SQL 必须带 {@code tenant_id = ?}（P0 铁律 4）；</li>
 *   <li><b>分级口径</b>：≥3 天=严重（要动人力）、≥1 天=关注、无耗时统计时不得给天数结论。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("StageBottleneckHeatmapOrchestrator - 环节瓶颈热力")
class StageBottleneckHeatmapOrchestratorTest {

    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private ScanRecordMapper scanRecordMapper;
    @Mock
    private ScanRecordService scanRecordService;
    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private StageBottleneckHeatmapOrchestrator orchestrator;

    @SuppressWarnings("unchecked")
    private Map<String, Double> loadStageMinutes(Long tenantId) {
        return (Map<String, Double>) ReflectionTestUtils.invokeMethod(orchestrator, "loadStageMinutes", tenantId);
    }

    private String buildHint(String stage, long backlog, Double estDays, int workers) {
        return ReflectionTestUtils.invokeMethod(orchestrator, "buildHint", stage, backlog, estDays, workers);
    }

    private String buildSummary(List<Map<String, Object>> rows) {
        return ReflectionTestUtils.invokeMethod(orchestrator, "buildSummary", rows);
    }

    private Map<String, Object> row(String factory, String upstream, String stage, long backlog, String level) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("factoryName", factory);
        r.put("upstreamStage", upstream);
        r.put("stage", stage);
        r.put("backlogQty", backlog);
        r.put("level", level);
        return r;
    }

    // ==================== 多租户隔离 ====================

    @Test
    @DisplayName("环节耗时 SQL 必须带 tenant_id = ? —— 回归：漏租户过滤会跨租户泄漏（P0 铁律 4）")
    void stageMinutesSqlFiltersByTenant() {
        when(jdbcTemplate.queryForList(anyString(), eq(9527L))).thenReturn(List.of());

        loadStageMinutes(9527L);

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(sqlCaptor.capture(), eq(9527L));
        String sql = sqlCaptor.getValue();
        assertThat(sql).contains("t_intelligence_process_stats");
        assertThat(sql).contains("tenant_id = ?");
    }

    @Test
    @DisplayName("环节耗时统计按 stage_name 归并并解析为分钟数")
    void stageMinutesParsed() {
        Map<String, Object> r1 = new LinkedHashMap<>();
        r1.put("stage_name", "车缝");
        r1.put("avg_minutes", 12.5);
        Map<String, Object> r2 = new LinkedHashMap<>();
        r2.put("stage_name", "质检");
        r2.put("avg_minutes", null);
        when(jdbcTemplate.queryForList(anyString(), eq(1L))).thenReturn(List.of(r1, r2));

        Map<String, Double> minutes = loadStageMinutes(1L);

        assertThat(minutes).containsEntry("车缝", 12.5);
        assertThat(minutes.get("质检")).isNull();
    }

    @Test
    @DisplayName("统计表读取异常时降级为空（不抛错，避免整块看板 500）")
    void stageMinutesDegradesOnError() {
        when(jdbcTemplate.queryForList(anyString(), eq(1L))).thenThrow(new RuntimeException("table missing"));

        assertThat(loadStageMinutes(1L)).isEmpty();
    }

    // ==================== 分级口径 ====================

    @Test
    @DisplayName("消化 ≥3 天提示补人/外发/调排产")
    void hintCriticalSuggestsAction() {
        String hint = buildHint("车缝", 800, 4.2, 10);
        assertThat(hint).contains("车缝").contains("800").contains("4.2").contains("补人");
    }

    @Test
    @DisplayName("消化 ≥1 天但 <3 天提示关注即可")
    void hintWarningAsksAttention() {
        String hint = buildHint("质检", 120, 1.5, 6);
        assertThat(hint).contains("关注即可");
    }

    @Test
    @DisplayName("无该环节耗时统计时不得编造天数")
    void hintWithoutStatsHasNoDays() {
        String hint = buildHint("入库", 60, null, 4);
        assertThat(hint).contains("无法折算天数");
        assertThat(hint).doesNotContain("天可消化");
    }

    // ==================== 汇总 ====================

    @Test
    @DisplayName("无积压时汇总为流转顺畅")
    void summaryEmpty() {
        assertThat(buildSummary(new ArrayList<>())).contains("流转顺畅");
    }

    @Test
    @DisplayName("汇总取积压最大处并统计严重数量")
    void summaryPicksWorst() {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.add(row("甲厂", "裁剪", "车缝", 900, "CRITICAL"));
        rows.add(row("乙厂", "车缝", "质检", 300, "WARNING"));

        String summary = buildSummary(rows);

        assertThat(summary).contains("甲厂").contains("裁剪").contains("车缝").contains("900").contains("1");
    }
}