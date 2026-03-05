package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.system.dto.SystemIssueSummaryDTO;
import com.fashion.supplychain.system.store.FrontendErrorStore;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class SystemIssueCollectorOrchestratorTest {

    @InjectMocks
    private SystemIssueCollectorOrchestrator orchestrator;

    @Mock private JdbcTemplate jdbcTemplate;
    @Mock private FrontendErrorStore frontendErrorStore;

    // collect() 中所有 private checker 都被 safeCheck(try-catch) 包裹，
    // safeCheck 会吞掉所有异常，所以 mock 不 stub 时 NPE 被静默忽略。
    // frontendErrorStore.size() 在 checkFrontendErrors 中直接调用（不在 safeCheck 内的 map 之前），
    // 需要 stub 以避免 NPE 影响结果。

    @Test
    void collect_returnsNonNullDTO() {
        when(frontendErrorStore.size()).thenReturn(0);
        SystemIssueSummaryDTO result = orchestrator.collect();
        assertThat(result).isNotNull();
    }

    @Test
    void collect_returnsDtoWithNonNullIssueList() {
        when(frontendErrorStore.size()).thenReturn(0);
        SystemIssueSummaryDTO result = orchestrator.collect();
        assertThat(result.getIssues()).isNotNull();
    }

    @Test
    void collect_returnsNonNullCollectedAt() {
        when(frontendErrorStore.size()).thenReturn(0);
        SystemIssueSummaryDTO result = orchestrator.collect();
        assertThat(result.getCheckedAt()).isNotNull();
    }

    @Test
    void collect_databaseError_addsErrorItem() {
        when(jdbcTemplate.queryForObject(eq("SELECT 1"), eq(Integer.class)))
                .thenThrow(new RuntimeException("DB connection refused"));
        when(frontendErrorStore.size()).thenReturn(0);

        SystemIssueSummaryDTO result = orchestrator.collect();

        assertThat(result).isNotNull();
        assertThat(result.getErrorCount()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void collect_manyFrontendErrors_addsWarnItem() {
        when(frontendErrorStore.size()).thenReturn(100);
        when(frontendErrorStore.countSince(any())).thenReturn(50L);

        SystemIssueSummaryDTO result = orchestrator.collect();

        assertThat(result).isNotNull();
        // 有大量前端错误时 warn/error count 应有值
        assertThat(result.getWarnCount() + result.getErrorCount()).isGreaterThanOrEqualTo(1);
    }

    @Test
    void collect_noFrontendErrors_noFrontendIssue() {
        when(frontendErrorStore.size()).thenReturn(0);

        SystemIssueSummaryDTO result = orchestrator.collect();

        boolean hasFrontendIssue = result.getIssues().stream()
                .anyMatch(i -> i.getCategory() != null && i.getCategory().contains("FRONTEND"));
        assertThat(hasFrontendIssue).isFalse();
    }

    @Test
    void collect_countsMatchIssueList() {
        when(frontendErrorStore.size()).thenReturn(0);

        SystemIssueSummaryDTO result = orchestrator.collect();

        long errors = result.getIssues().stream()
                .filter(i -> "ERROR".equals(i.getLevel())).count();
        long warns = result.getIssues().stream()
                .filter(i -> "WARN".equals(i.getLevel())).count();
        long infos = result.getIssues().stream()
                .filter(i -> "INFO".equals(i.getLevel())).count();

        assertThat(result.getErrorCount()).isEqualTo((int) errors);
        assertThat(result.getWarnCount()).isEqualTo((int) warns);
        assertThat(result.getInfoCount()).isEqualTo((int) infos);
    }
}
