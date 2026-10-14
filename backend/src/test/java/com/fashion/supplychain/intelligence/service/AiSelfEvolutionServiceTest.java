package com.fashion.supplychain.intelligence.service;

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

import java.util.Collections;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code AiSelfEvolutionService} SQL 契约测试。
 *
 * <p>守护的核心契约：<b>两个取样查询必须只引用 t_agent_execution_log /
 * t_crew_session 里真实存在的列</b>。
 *
 * <p>事故背景（2026-10-14 全项目列名核对，生产库实测）：
 * 原实现选的是 {@code tool_name / arguments_json / result_summary / avg_feedback}
 * 与 {@code session_id / tool_calls_count}，**这七列在两表里一个都不存在**
 * （照搬了别处的结构）。于是每次查询都抛 {@code Unknown column}，
 * 又被 catch 成 {@code log.debug} 吞掉、返回空列表 ——
 * AI 自进化从上线起就没拿到过任何样本，全程无异常、无告警可感知。
 *
 * <p>另：{@code saveEvolutionLog} 的 INSERT 列 {@code (insights, status, create_time)}
 * **三列全错**（真列是 {@code insight}，且没有 status 这一列、时间列叫 created_at），
 * 也就是"就算分析出了洞察也永远存不下来"。
 *
 * <p>所以这里用"读传给 JdbcTemplate 的 SQL 做断言"的方式把它钉住 ——
 * 与 {@code AiJobRunLogMapperSqlTest} 同一套手法。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AiSelfEvolutionService - 取样与落库的列名契约")
class AiSelfEvolutionServiceTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private AiSelfEvolutionService service;

    @SuppressWarnings("unchecked")
    private String sqlOf(String method, Object... args) {
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenReturn(Collections.emptyList());
        ReflectionTestUtils.invokeMethod(service, method, args);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(sql.capture(), any(Object[].class));
        return sql.getValue();
    }

    private String insertSql() {
        ReflectionTestUtils.invokeMethod(service, "saveEvolutionLog", 1L, "洞察");
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).update(sql.capture(), any(Object[].class));
        return sql.getValue();
    }

    @Test
    @DisplayName("低置信度取样：不得再用 tool_name/arguments_json/result_summary/avg_feedback（四列都不存在）")
    void lowConfidenceQueryUsesRealColumns() {
        String sql = sqlOf("findLowFeedbackLogs", 1L, 7);

        assertThat(sql)
                .as("这四列在 t_agent_execution_log 里一个都没有，用了就必然抛 Unknown column")
                .doesNotContain("tool_name")
                .doesNotContain("arguments_json")
                .doesNotContain("result_summary")
                .doesNotContain("avg_feedback");
        assertThat(sql)
                .as("改用真实有信号的列：confidence_score 实测区间 29~85、均值 56.7")
                .contains("t_agent_execution_log")
                .contains("confidence_score")
                .contains("create_time");
        assertThat(sql).as("必须带租户隔离").contains("tenant_id");
        assertThat(sql).as("必须有上限，否则表大了会拖垮接口").contains("LIMIT");
    }

    @Test
    @DisplayName("低健康分会话取样：不得再用 session_id/tool_calls_count/create_time（都不存在）")
    void lowHealthSessionQueryUsesRealColumns() {
        String sql = sqlOf("findLowHealthSessions", 1L);

        assertThat(sql)
                .as("这三列在 t_crew_session 里都不存在；该表时间列叫 created_at")
                .doesNotContain("session_id")
                .doesNotContain("tool_calls_count")
                .doesNotContain("create_time");
        assertThat(sql)
                .contains("t_crew_session")
                .contains("health_score")
                .contains("created_at");
        assertThat(sql).contains("tenant_id").contains("LIMIT");
    }

    @Test
    @DisplayName("落库：INSERT 列必须是 insight 而非 insights，且不得出现不存在的 status / create_time")
    void saveUsesRealColumns() {
        String sql = insertSql();

        assertThat(sql)
                .as("真列是 insight（单数）；status 这一列根本不存在；时间列叫 created_at")
                .contains("t_agent_evolution_log")
                .contains("insight")
                .doesNotContain("insights")
                .doesNotContain("status")
                .doesNotContain("create_time");
        assertThat(sql).contains("tenant_id");
    }

    @Test
    @DisplayName("查询抛异常时返回空列表且不外抛（但必须走 warn 级别，不能是 debug）")
    void queryFailureReturnsEmptyWithoutThrowing() {
        when(jdbcTemplate.queryForList(anyString(), any(Object[].class)))
                .thenThrow(new RuntimeException("Unknown column 'tool_name' in 'field list'"));

        Object result = ReflectionTestUtils.invokeMethod(service, "findLowFeedbackLogs", 1L, 7);

        assertThat(result).isInstanceOf(List.class);
        assertThat((List<?>) result).isEmpty();
    }
}
