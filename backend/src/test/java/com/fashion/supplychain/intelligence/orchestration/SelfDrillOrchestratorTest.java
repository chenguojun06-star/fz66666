package com.fashion.supplychain.intelligence.orchestration;

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
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code SelfDrillOrchestrator} 取活跃租户的 SQL 契约测试。
 *
 * <p>守护的核心契约：<b>筛租户的 SQL 必须只引用 t_tenant 真实存在的列，
 * 且状态取值必须与库里真实值一致</b>。
 *
 * <p>事故背景（2026-10-14 全项目列名核对，生产库实测）：原实现是
 * {@code WHERE status NOT IN ('DISABLED','SUSPENDED') AND delete_flag = 0}，
 * **两个条件都是错的**：
 * <ol>
 *   <li>{@code t_tenant} 没有 {@code delete_flag} 列 → 每次查询直接抛
 *       {@code Unknown column}，被 catch 成 warn 后返回空列表；
 *       而调用方只是 {@code for (Long tenantId : activeTenants)} 遍历空列表，
 *       **于是自演练一个租户都不跑就"正常结束"了**，全程无异常可感知；</li>
 *   <li>就算去掉 delete_flag，大写那两组状态值在库里一个都不存在 ——
 *       实测 t_tenant.status 只有小写的 {@code active}（7 个）/ {@code inactive}（1 个），
 *       所以 NOT IN 筛不掉任何租户，会把 inactive 的也拖进来推演。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SelfDrillOrchestrator - 取活跃租户的列名与状态值契约")
class SelfDrillOrchestratorTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    @InjectMocks
    private SelfDrillOrchestrator orchestrator;

    @SuppressWarnings("unchecked")
    private String activeTenantsSql() {
        when(jdbcTemplate.queryForList(anyString(), eq(Long.class)))
                .thenReturn(Collections.emptyList());
        ReflectionTestUtils.invokeMethod(orchestrator, "getActiveTenants");
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbcTemplate).queryForList(sql.capture(), eq(Long.class));
        return sql.getValue();
    }

    @Test
    @DisplayName("不得再引用 t_tenant.delete_flag（该列不存在，一用就整段查询失败）")
    void doesNotReferenceMissingDeleteFlag() {
        String sql = activeTenantsSql();

        assertThat(sql)
                .as("t_tenant 没有 delete_flag —— 用了就抛 Unknown column，"
                        + "调用方遍历空列表，自演练静默空转")
                .doesNotContain("delete_flag");
    }

    @Test
    @DisplayName("状态取值必须是库里真实的小写 active，不能是 DISABLED/SUSPENDED")
    void usesRealStatusValues() {
        String sql = activeTenantsSql();

        assertThat(sql)
                .as("实测 t_tenant.status 只有小写 active/inactive，大写那两组值一个都不存在")
                .doesNotContain("DISABLED")
                .doesNotContain("SUSPENDED")
                .doesNotContain("NOT IN");
        assertThat(sql).contains("t_tenant").contains("status = 'active'");
    }

    @Test
    @DisplayName("查询失败时返回空列表且不外抛")
    void returnsEmptyOnFailure() {
        when(jdbcTemplate.queryForList(anyString(), eq(Long.class)))
                .thenThrow(new RuntimeException("Unknown column 'delete_flag' in 'where clause'"));

        Object result = ReflectionTestUtils.invokeMethod(orchestrator, "getActiveTenants");

        assertThat(result).isInstanceOf(List.class);
        assertThat((List<?>) result).isEmpty();
    }
}
