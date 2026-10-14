package com.fashion.supplychain.intelligence.mapper;

import com.fashion.supplychain.intelligence.service.AiJobRunLogService;
import org.apache.ibatis.annotations.Select;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code AiJobRunLogMapper} SQL 契约测试。
 *
 * <p>守护的核心契约：<b>这张系统级日志表的查询不得再带上 tenant_id 过滤</b>。
 *
 * <p>事故背景（D-542）：本表由 {@code JobRunObservabilityAspect} 写入，取的是
 * {@code UserContext.tenantId()}；而**定时任务是后台线程、没有 HTTP 上下文**，
 * 该值恒为 null → 表里 221.9 万行 tenant_id **全部为 NULL**。
 * 2026-04-14 有人为"多租户合规"给查询加上了 {@code WHERE tenant_id = #{tenantId}}，
 * 而 SQL 里 {@code = NULL} 恒为 unknown → **接口从此永远返回空**；
 * 又因前端从未接入，这个静默失效**持续了 5 个多月才被发现**。
 *
 * <p>所以这里用"读注解 SQL 做断言"的方式把它钉住 —— 这是少数几个
 * 「删掉一个条件才是正确行为」的场景，不写测试极容易被后人"修复"回去。
 */
@DisplayName("AiJobRunLogMapper - 系统级日志查询不得按租户过滤")
class AiJobRunLogMapperSqlTest {

    private final AiJobRunLogService service = new AiJobRunLogService();

    private static String sqlOf(String methodName, Class<?>... paramTypes) throws Exception {
        Method m = AiJobRunLogMapper.class.getMethod(methodName, paramTypes);
        Select select = m.getAnnotation(Select.class);
        assertThat(select).as("%s 应有 @Select 注解", methodName).isNotNull();
        return String.join(" ", select.value());
    }

    @Test
    @DisplayName("selectRecent 不得含 tenant_id（回归：加了就会永远查不到数据）")
    void selectRecentMustNotFilterByTenant() throws Exception {
        String sql = sqlOf("selectRecent", int.class);
        assertThat(sql)
                .as("一旦出现 tenant_id 过滤，接口会因 tenant_id 全为 NULL 而永远返回空（D-542）")
                .doesNotContain("tenant_id");
        assertThat(sql).contains("ORDER BY start_time DESC");
    }

    @Test
    @DisplayName("selectRecentByStatus 不得含 tenant_id，且必须是等值条件（不能用 IS NULL OR，那会让索引失效）")
    void selectRecentByStatusMustNotFilterByTenant() throws Exception {
        String sql = sqlOf("selectRecentByStatus", int.class, String.class);
        assertThat(sql)
                .as("一旦出现 tenant_id 过滤，接口会因 tenant_id 全为 NULL 而永远返回空（D-542）")
                .doesNotContain("tenant_id");
        assertThat(sql)
                .as("必须是等值条件，优化器才能用上 V202710140002 补的 (status, start_time) 复合索引")
                .contains("WHERE status = #{status}");
        assertThat(sql)
                .as("(status IS NULL OR status = ?) 这种 OR 谓词会让索引失效 —— 2026-10-14 在 250 万行的"
                        + "表上实测全表扫 + filesort，慢日志一天出现 16 次。"
                        + "「不传 status」的兼容应由 Service 层分流到 selectRecent，不要塞进 SQL")
                .doesNotContain("IS NULL OR");
    }

    @Test
    @DisplayName("统计类查询同样不得含 tenant_id，且别名必须是 camelCase（Map 结果不受下划线转换影响）")
    void statsQueriesMustNotFilterByTenantAndUseCamelCaseAliases() throws Exception {
        String stats = sqlOf("selectStats", int.class);
        assertThat(stats).doesNotContain("tenant_id");
        assertThat(stats).contains("AS totalRuns").contains("AS failedRuns").contains("AS jobCount");

        String slow = sqlOf("selectSlowestJobs", int.class, int.class);
        assertThat(slow).doesNotContain("tenant_id");
        assertThat(slow).contains("AS jobName").contains("AS avgMs").contains("AS maxMs");

        String fail = sqlOf("selectFailureTop", int.class, int.class);
        assertThat(fail).doesNotContain("tenant_id");
        assertThat(fail).contains("AS failCount").contains("AS lastError");
    }

    @Test
    @DisplayName("时间范围查询用 start_time（有索引）而非 created_at（无索引）")
    void timeRangeQueriesUseIndexedColumn() throws Exception {
        // created_at 上没有索引；start_time 上有 idx_start_time（V202709240004 补回）
        assertThat(sqlOf("selectStats", int.class)).contains("start_time >=");
        assertThat(sqlOf("selectSlowestJobs", int.class, int.class)).contains("start_time >=");
        assertThat(sqlOf("selectFailureTop", int.class, int.class)).contains("start_time >=");
    }

    // ==================== Service 层分流 ====================

    @Test
    @DisplayName("不传 status 时必须走 selectRecent —— 可选筛选的兼容放 Service 层，不塞进 SQL")
    void queryRecentRoutesBlankStatusToSelectRecent() {
        AiJobRunLogMapper mapper = mock(AiJobRunLogMapper.class);
        when(mapper.selectRecent(anyInt())).thenReturn(List.of());
        AiJobRunLogService spy = org.mockito.Mockito.spy(service);
        doReturn(mapper).when(spy).getBaseMapper();

        spy.queryRecent(50, null);
        spy.queryRecent(50, "   ");

        verify(mapper, times(2)).selectRecent(50);
        verify(mapper, never()).selectRecentByStatus(anyInt(), any());
    }

    @Test
    @DisplayName("传了 status 才走 selectRecentByStatus（走新补的 (status,start_time) 复合索引）")
    void queryRecentRoutesStatusToSelectRecentByStatus() {
        AiJobRunLogMapper mapper = mock(AiJobRunLogMapper.class);
        when(mapper.selectRecentByStatus(anyInt(), any())).thenReturn(List.of());
        AiJobRunLogService spy = org.mockito.Mockito.spy(service);
        doReturn(mapper).when(spy).getBaseMapper();

        spy.queryRecent(30, "  FAILED  ");

        verify(mapper).selectRecentByStatus(30, "FAILED");
        verify(mapper, never()).selectRecent(anyInt());
    }
}
