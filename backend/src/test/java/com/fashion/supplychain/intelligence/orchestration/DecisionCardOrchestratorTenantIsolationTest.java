package com.fashion.supplychain.intelligence.orchestration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiDecisionCard;
import com.fashion.supplychain.intelligence.mapper.AiDecisionCardMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

/**
 * D-858：决策卡的用户反馈 / 列表查询必须做显式租户校验。
 *
 * <p>背景：D-853/D-854 刚把 AI 建议从「后端有方法、前端看不到」接通，
 * 反馈与列表都是新暴露的入口。TenantInterceptor 会给 SQL 自动补 tenant_id，
 * 但 {@code updateById} 命中 0 行不会报错 —— 前端仍显示采纳成功，形成「静默无效」；
 * 而 UserContext 整体为空的后台线程会被拦截器直接放行。两条路径都需要显式判空/归属。
 */
@ExtendWith(MockitoExtension.class)
class DecisionCardOrchestratorTenantIsolationTest {

    @Mock
    private AiDecisionCardMapper cardMapper;

    @InjectMocks
    private DecisionCardOrchestrator orchestrator;

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private void bindTenant(Long tenantId) {
        UserContext ctx = new UserContext();
        ctx.setTenantId(tenantId);
        UserContext.set(ctx);
    }

    private AiDecisionCard card(Long id, Long tenantId) {
        AiDecisionCard c = new AiDecisionCard();
        c.setId(id);
        c.setTenantId(tenantId);
        return c;
    }

    @Test
    @DisplayName("查不到的卡片（跨租户被过滤）→ 不得 updateById")
    void feedbackRejectsInvisibleCard() {
        bindTenant(2L);
        when(cardMapper.selectById(1L)).thenReturn(null);

        orchestrator.feedback(1L, 1, "同意", 5);

        verify(cardMapper, never()).updateById(any(AiDecisionCard.class));
    }

    @Test
    @DisplayName("归属租户不符 → 显式拒绝，而不是 updateById 静默命中 0 行")
    void feedbackRejectsDifferentTenantCard() {
        bindTenant(2L);
        when(cardMapper.selectById(1L)).thenReturn(card(1L, 106L));

        orchestrator.feedback(1L, 1, null, 5);

        verify(cardMapper, never()).updateById(any(AiDecisionCard.class));
    }

    @Test
    @DisplayName("同租户卡片 → 正常更新")
    void feedbackUpdatesOwnTenantCard() {
        bindTenant(2L);
        when(cardMapper.selectById(1L)).thenReturn(card(1L, 2L));

        orchestrator.feedback(1L, 1, null, 5);

        verify(cardMapper).updateById(any(AiDecisionCard.class));
    }

    @Test
    @DisplayName("无租户上下文 → 返回空且完全不查库（防后台线程全表扫描）")
    void recentReturnsEmptyWithoutTenant() {
        UserContext.clear();

        assertThat(orchestrator.recentForCurrentTenant(10)).isEmpty();

        verifyNoInteractions(cardMapper);
    }
}
