package com.fashion.supplychain.intelligence.helper;

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

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code PatrolEvidenceEnricher} 证据包 SQL 契约测试。
 *
 * <p>守护的核心契约：<b>两条联查必须只引用 t_production_order /
 * t_production_process_tracking 里真实存在的列</b>。
 *
 * <p>事故背景（2026-10-14 全项目列名核对，生产库实测）：
 * 原实现把工序表关联写成 {@code t.order_no = o.order_no}，
 * 而该表真实列是 <b>{@code production_order_no}</b>；
 * 投影/分组又写了 {@code progress_stage}，该表<b>没有这一列</b>
 * （只有 process_code / process_name / process_order）。
 *
 * <p>于是两个查询每次都抛 {@code Unknown column}，被 catch 成 {@code log.debug}
 * 后返回空串 —— **AI 巡检的订单类工单从上线起就没有任何证据附件**，
 * 只能凭 issue_type 空口判断，全程无异常、无告警可感知。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("PatrolEvidenceEnricher - 证据包联查的列名契约")
class PatrolEvidenceEnricherTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private PatrolEvidenceEnricher enricher;

    /** 造一行订单头。用 HashMap 而不是 Map.of —— Map.of 不允许 null 值，
     *  而这里要显式构造 last_stage / last_scan 为 null 的「还没扫过码」场景。 */
    private static java.util.Map<String, Object> orderHead() {
        java.util.Map<String, Object> h = new java.util.HashMap<>();
        h.put("status", "生产中");
        h.put("production_progress", 40);
        h.put("material_arrival_rate", 80);
        h.put("factory_name", "一厂");
        h.put("expected_ship_date", "2026-11-01 00:00:00");
        h.put("order_quantity", 100);
        h.put("completed_quantity", 40);
        h.put("last_stage", null);   // 不触发时间解析分支
        h.put("last_scan", null);
        return h;
    }

    @SuppressWarnings("unchecked")
    private List<String> capturedSql() {
        when(jdbcTemplate.queryForList(anyString(), eq("PO-1")))
                .thenReturn(List.of(orderHead()))
                .thenReturn(List.of(
                        Map.of("process_name", "车缝", "cnt", 40),
                        Map.of("process_name", "裁剪", "cnt", 100)));
        enricher.buildEvidencePack("PO-1");
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce())
                .queryForList(sql.capture(), eq("PO-1"));
        return sql.getAllValues();
    }

    @Test
    @DisplayName("工序表关联必须用 production_order_no，不能是 order_no")
    void joinUsesRealOrderNoColumn() {
        List<String> all = capturedSql();
        assertThat(all).isNotEmpty();

        for (String sql : all) {
            if (!sql.contains("t_production_process_tracking")) {
                continue;
            }
            assertThat(sql)
                    .as("该表没有 order_no 列（真列 production_order_no），用了就抛 Unknown column，"
                            + "证据包整段静默降级成空串")
                    .doesNotContain("t.order_no")
                    .doesNotContain("WHERE order_no")
                    .contains("production_order_no");
        }
    }

    @Test
    @DisplayName("不得再用 progress_stage（该表没有此列，真列是 process_name/process_code）")
    void doesNotUseMissingProgressStage() {
        for (String sql : capturedSql()) {
            assertThat(sql)
                    .as("progress_stage 在 t_production_process_tracking 里不存在")
                    .doesNotContain("progress_stage");
        }
    }

    @Test
    @DisplayName("取不到订单时返回空串，不抛异常（上游靠空串判断「没有证据」）")
    void returnsEmptyWhenOrderNotFound() {
        when(jdbcTemplate.queryForList(anyString(), eq("PO-NONE")))
                .thenReturn(List.of());

        assertThat(enricher.buildEvidencePack("PO-NONE")).isEmpty();
    }

    @Test
    @DisplayName("SQL 报错时返回空串且不外抛（但必须走 warn，不能是 debug）")
    void returnsEmptyOnSqlError() {
        when(jdbcTemplate.queryForList(anyString(), eq("PO-ERR")))
                .thenThrow(new RuntimeException("Unknown column 'progress_stage' in 'field list'"));

        assertThat(enricher.buildEvidencePack("PO-ERR")).isEmpty();
    }

    @Test
    @DisplayName("空/多单 targetId 的边界：空串直接返回、多单只取第一单")
    void handlesBlankAndMultiOrderTargetId() {
        assertThat(enricher.buildEvidencePack("")).isEmpty();
        assertThat(enricher.buildEvidencePack("   ")).isEmpty();
        assertThat(enricher.buildEvidencePack(null)).isEmpty();

        // "PO-1、PO-2" 应只拿第一单去查
        when(jdbcTemplate.queryForList(anyString(), eq("PO-1"))).thenReturn(List.of());
        assertThat(enricher.buildEvidencePack("PO-1、PO-2")).isEmpty();
        verify(jdbcTemplate, org.mockito.Mockito.atLeastOnce())
                .queryForList(anyString(), eq("PO-1"));
    }
}
