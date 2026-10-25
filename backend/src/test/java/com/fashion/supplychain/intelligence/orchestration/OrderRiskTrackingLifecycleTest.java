package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.OrderRiskTracking;
import com.fashion.supplychain.intelligence.mapper.OrderRiskTrackingMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 订单风险生命周期（D-879）。
 *
 * <p>背景：这四个方法此前全后端零调用——风险被写入后没有任何出口，
 * 表只增不减、统计恒 0。D-879 接线后由评估引擎自动调用 + 控制器承接人工动作。
 *
 * <p>重点验证状态机与审计字段：resolved / escalated / cancelled / pending 的
 * 字段组合必须互斥正确，否则前端按状态过滤会串。
 */
@DisplayName("订单风险生命周期：处理/升级/撤销/重开")
class OrderRiskTrackingLifecycleTest {

    @Mock
    private OrderRiskTrackingMapper riskTrackingMapper;

    @InjectMocks
    private OrderRiskTrackingOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("1001");
        ctx.setUsername("张三");
        UserContext.set(ctx);
    }

    private OrderRiskTracking pendingRisk() {
        OrderRiskTracking r = new OrderRiskTracking();
        r.setId(1L);
        r.setTenantId(2L);
        r.setOrderNo("PO20261025001");
        r.setRiskLevel("danger");
        r.setHandlingStatus("pending");
        return r;
    }

    @Test
    @DisplayName("处理风险：状态 resolved，处理人/时间/动作/结果全部落库")
    void resolveRiskFillsAuditFields() {
        when(riskTrackingMapper.selectById(1L)).thenReturn(pendingRisk());

        assertTrue(orchestrator.resolveRisk(1L, "催单", "已加急，预计周五完成"));

        OrderRiskTracking saved = captureUpdate();
        assertEquals("resolved", saved.getHandlingStatus());
        assertEquals("催单", saved.getHandlingAction());
        assertEquals("已加急，预计周五完成", saved.getHandlingResult());
        assertEquals("张三", saved.getHandledBy());
        assertNotNull(saved.getHandledAt());
    }

    @Test
    @DisplayName("自动解除：处理人必须记「系统(自动)」，不能记成碰巧在看页面的用户")
    void resolveRiskBySystemUsesSystemAsHandler() {
        when(riskTrackingMapper.selectById(1L)).thenReturn(pendingRisk());

        orchestrator.resolveRisk(1L, "自动解除", "已回到安全区间", "系统(自动)");

        assertEquals("系统(自动)", captureUpdate().getHandledBy());
    }

    @Test
    @DisplayName("记录不存在返回 false（不抛异常，调用方靠返回值判断）")
    void resolveMissingRiskReturnsFalse() {
        when(riskTrackingMapper.selectById(9L)).thenReturn(null);
        assertFalse(orchestrator.resolveRisk(9L, "催单", ""));
        verify(riskTrackingMapper, never()).updateById(any(OrderRiskTracking.class));
    }

    @Test
    @DisplayName("升级风险：状态 escalated + 新处理人；原处理动作不受影响")
    void escalateRiskSetsAssignee() {
        when(riskTrackingMapper.selectById(1L)).thenReturn(pendingRisk());

        assertTrue(orchestrator.escalateRisk(1L, "厂长"));

        OrderRiskTracking saved = captureUpdate();
        assertEquals("escalated", saved.getHandlingStatus());
        assertEquals("厂长", saved.getAssignedTo());
    }

    @Test
    @DisplayName("撤销风险：状态 cancelled，撤销人/时间/原因齐全（AI 误判留痕）")
    void clearRiskFillsCancelFields() {
        when(riskTrackingMapper.selectById(1L)).thenReturn(pendingRisk());

        assertTrue(orchestrator.clearRisk(1L, "AI 误判：该单已提前完工"));

        OrderRiskTracking saved = captureUpdate();
        assertEquals("cancelled", saved.getHandlingStatus());
        assertEquals("张三", saved.getCancelledBy());
        assertNotNull(saved.getCancelledAt());
        assertEquals("AI 误判：该单已提前完工", saved.getCancelReason());
    }

    @Test
    @DisplayName("重开风险：状态回 pending，处理字段必须清空（否则前端仍显示「已处理」）")
    void reopenRiskClearsHandlingFields() {
        OrderRiskTracking resolved = pendingRisk();
        resolved.setHandlingStatus("resolved");
        resolved.setHandlingAction("催单");
        resolved.setHandlingResult("已加急");
        resolved.setHandledBy("张三");
        resolved.setHandledAt(java.time.LocalDateTime.now());
        when(riskTrackingMapper.selectById(1L)).thenReturn(resolved);

        assertTrue(orchestrator.reopenRisk(1L, "处理有误，风险仍在"));

        OrderRiskTracking saved = captureUpdate();
        assertEquals("pending", saved.getHandlingStatus());
        assertNull(saved.getHandlingAction());
        assertNull(saved.getHandlingResult());
        assertNull(saved.getHandledBy());
        assertNull(saved.getHandledAt());
    }

    @Test
    @DisplayName("刷新等级：只刷新未闭环记录；已闭环的保留处理时原貌")
    void refreshOpenRiskOnlyTouchesOpenRecords() {
        OrderRiskTracking open = pendingRisk();
        when(riskTrackingMapper.selectById(1L)).thenReturn(open);
        assertTrue(orchestrator.refreshOpenRisk(1L, "overdue", List.of("已逾期 3 天")));
        assertEquals("overdue", captureUpdate().getRiskLevel());

        OrderRiskTracking resolved = pendingRisk();
        resolved.setHandlingStatus("resolved");
        when(riskTrackingMapper.selectById(2L)).thenReturn(resolved);
        assertFalse(orchestrator.refreshOpenRisk(2L, "overdue", List.of("已逾期")));
    }

    @Test
    @DisplayName("无租户上下文时列表返回空（后台线程/定时任务兜底，不查全租户）")
    void listOpenRisksWithoutTenantReturnsEmpty() {
        UserContext.clear();
        assertTrue(orchestrator.listOpenRisks().isEmpty());
        verify(riskTrackingMapper, never()).selectList(any());
    }

    private OrderRiskTracking captureUpdate() {
        org.mockito.ArgumentCaptor<OrderRiskTracking> captor =
                org.mockito.ArgumentCaptor.forClass(OrderRiskTracking.class);
        verify(riskTrackingMapper, times(1)).updateById(captor.capture());
        return captor.getValue();
    }
}
