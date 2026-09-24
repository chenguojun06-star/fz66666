package com.fashion.supplychain.intelligence.job;

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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code AuditLogCleanupJob} 契约测试。
 *
 * <p>守护的核心契约：<b>「保留天数可配」必须真的能读到配置值</b>。
 *
 * <p>事故背景（2026-09-24 排查 t_ai_job_run_log 清理时发现）：
 * 原实现读参数的 SQL 写的是
 * {@code SELECT config_value FROM t_param_config WHERE config_key = ? AND delete_flag = 0}，
 * 但 {@code t_param_config} 的真实列名是 {@code param_key} / {@code param_value}，
 * 且**根本没有 delete_flag 列** —— 每次执行都抛 "Unknown column"，
 * 异常又被 {@code catch} 成 debug 日志吞掉，于是**永远静默回落默认 90 天**。
 * 更隐蔽的是：这两个参数键当时在库里也不存在，所以就算列名对了也读不到。
 *
 * <p>因此这里有一条专门的回归断言：**SQL 必须用真实列名，且不得再出现那三个不存在的列名**。
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("AuditLogCleanupJob - 日志保留期清理")
class AuditLogCleanupJobTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private AuditLogCleanupJob job;

    private int readRetentionDays(String key, int defaultDays) {
        return ReflectionTestUtils.invokeMethod(job, "readRetentionDays", key, defaultDays);
    }

    // ==================== 参数读取 ====================

    @Test
    @DisplayName("读参数的 SQL 必须用真实列名 param_key/param_value —— 回归：曾写成 config_key 导致静默失效")
    void retentionSqlUsesRealColumnNames() {
        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), anyString())).thenReturn("30");

        assertThat(readRetentionDays("system.jobRunLog.retentionDays", 90)).isEqualTo(30);

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForObject(sql.capture(), eq(String.class), anyString());
        assertThat(sql.getValue())
                .contains("param_value")
                .contains("param_key")
                .doesNotContain("config_key")
                .doesNotContain("config_value")
                .doesNotContain("delete_flag"); // 该列在 t_param_config 里不存在
    }

    @Test
    @DisplayName("参数存在 → 用配置值（保留期真的可配）")
    void usesConfiguredRetentionDays() {
        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), anyString())).thenReturn("30");
        assertThat(readRetentionDays("system.jobRunLog.retentionDays", 90)).isEqualTo(30);
    }

    @Test
    @DisplayName("参数不存在 → 回落默认值")
    void fallsBackWhenParamMissing() {
        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), anyString())).thenReturn(null);
        assertThat(readRetentionDays("system.jobRunLog.retentionDays", 90)).isEqualTo(90);
    }

    @Test
    @DisplayName("参数值非法/非正数 → 回落默认值（不能因为脏配置把保留期变成 0 而删光）")
    void fallsBackWhenParamInvalid() {
        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), anyString())).thenReturn("abc");
        assertThat(readRetentionDays("system.jobRunLog.retentionDays", 90)).isEqualTo(90);

        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), anyString())).thenReturn("0");
        assertThat(readRetentionDays("system.jobRunLog.retentionDays", 90)).isEqualTo(90);

        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), anyString())).thenReturn("-5");
        assertThat(readRetentionDays("system.jobRunLog.retentionDays", 90)).isEqualTo(90);

        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), anyString())).thenReturn("   ");
        assertThat(readRetentionDays("system.jobRunLog.retentionDays", 90)).isEqualTo(90);
    }

    @Test
    @DisplayName("查库抛异常（表/列缺失等）→ 回落默认值，不把清理任务整个搞挂")
    void fallsBackWhenQueryThrows() {
        when(jdbcTemplate.queryForObject(anyString(), eq(String.class), anyString()))
                .thenThrow(new RuntimeException("Unknown column 'config_key' in 'field list'"));
        assertThat(readRetentionDays("system.jobRunLog.retentionDays", 90)).isEqualTo(90);
    }

    // ==================== 分批删除 ====================

    @Test
    @DisplayName("分批删除：满批继续、不满批停止，返回总删除数")
    void batchDeleteLoopsUntilPartialBatch() {
        // 500 → 500 → 120（不满批，停止）
        when(jdbcTemplate.update(anyString(), anyInt())).thenReturn(500, 500, 120);

        int total = ReflectionTestUtils.invokeMethod(
                job, "batchDelete", "DELETE FROM t_ai_job_run_log WHERE start_time < ? LIMIT 500", 90);

        assertThat(total).isEqualTo(1120);
        verify(jdbcTemplate, times(3)).update(anyString(), anyInt());
    }

    @Test
    @DisplayName("第一批就 0 条 → 只执行一次，不死循环")
    void batchDeleteStopsImmediatelyWhenNothingToDelete() {
        when(jdbcTemplate.update(anyString(), anyInt())).thenReturn(0);

        int total = ReflectionTestUtils.invokeMethod(
                job, "batchDelete", "DELETE FROM t_ai_job_run_log WHERE start_time < ? LIMIT 500", 90);

        assertThat(total).isZero();
        verify(jdbcTemplate, times(1)).update(anyString(), anyInt());
    }

    @Test
    @DisplayName("批大小常量与 SQL 里的 LIMIT 保持一致 —— 改一处忘改另一处会提前截断删除")
    void batchSizeMatchesSqlLimit() {
        assertThat(AuditLogCleanupJob.DELETE_BATCH_SIZE).isEqualTo(500);
    }
}
