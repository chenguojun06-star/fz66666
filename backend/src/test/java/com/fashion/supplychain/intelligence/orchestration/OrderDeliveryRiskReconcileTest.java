package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskResponse;
import com.fashion.supplychain.intelligence.dto.DeliveryRiskResponse.DeliveryRiskItem;
import com.fashion.supplychain.intelligence.entity.OrderRiskTracking;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 风险表自维护（D-879）。
 *
 * <p>背景：原实现每次交期评估都给同一订单插一条新的 pending 风险——评估由行动中心 /
 * 小云 / 接口随时触发，同一订单能堆几十条重复记录；风险解除后旧记录永远 pending，
 * 统计里的处理率恒为 0。
 *
 * <p>本测试锁住四条规则：
 * <ol>
 *   <li>已有未闭环风险 → 不重复插入（等级变了只刷新）</li>
 *   <li>历史已闭环 + 再次出险 → 重开原记录（保留「反复出险」历史），不插新记录</li>
 *   <li>本次评估里回到 safe/warning 且有未闭环风险 → 自动解除，处理人记「系统(自动)」</li>
 *   <li>不在本次评估结果里的订单 → 一律不动（assess 支持过滤，没查它 ≠ 风险解除）</li>
 * </ol>
 */
@DisplayName("风险表自维护：去重 / 复现重开 / 自动解除")
class OrderDeliveryRiskReconcileTest {

    private OrderRiskTrackingOrchestrator tracking;
    private OrderDeliveryRiskOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("1001");
        ctx.setUsername("张三");
        UserContext.set(ctx);

        tracking = mock(OrderRiskTrackingOrchestrator.class);
        orchestrator = new OrderDeliveryRiskOrchestrator();
        ReflectionTestUtils.setField(orchestrator, "orderRiskTrackingOrchestrator", tracking);
    }

    private DeliveryRiskItem item(String orderNo, String level) {
        DeliveryRiskItem it = new DeliveryRiskItem();
        it.setOrderNo(orderNo);
        it.setRiskLevel(level);
        it.setRiskDescription("预测完工晚于交期");
        return it;
    }

    private OrderRiskTracking risk(Long id, String orderNo, String status, String level) {
        OrderRiskTracking r = new OrderRiskTracking();
        r.setId(id);
        r.setOrderNo(orderNo);
        r.setHandlingStatus(status);
        r.setRiskLevel(level);
        return r;
    }

    @Test
    @DisplayName("已有未闭环风险且等级没变 → 不插入、不刷新（彻底止住重复堆积）")
    void existingOpenRiskIsNotDuplicated() {
        when(tracking.listOpenRisks()).thenReturn(List.of(risk(1L, "PO1", "pending", "danger")));

        DeliveryRiskResponse response = new DeliveryRiskResponse();
        response.getOrders().add(item("PO1", "danger"));
        orchestrator.reconcileRiskTracking(response);

        verify(tracking, never()).createRisk(anyString(), anyString(), any(), any());
        verify(tracking, never()).refreshOpenRisk(any(), anyString(), any());
        verify(tracking, never()).resolveRisk(any(), anyString(), anyString(), anyString());
    }

    @Test
    @DisplayName("等级升级（danger→overdue）→ 刷新原记录，不插新记录")
    void levelChangeRefreshesOpenRisk() {
        when(tracking.listOpenRisks()).thenReturn(List.of(risk(1L, "PO1", "pending", "danger")));

        DeliveryRiskResponse response = new DeliveryRiskResponse();
        response.getOrders().add(item("PO1", "overdue"));
        orchestrator.reconcileRiskTracking(response);

        verify(tracking).refreshOpenRisk(eq(1L), eq("overdue"), any());
        verify(tracking, never()).createRisk(anyString(), anyString(), any(), any());
    }

    @Test
    @DisplayName("历史已闭环 + 再次出险 → 重开原记录，不插新记录（保留反复出险历史）")
    void recurrenceReopensClosedRisk() {
        when(tracking.listOpenRisks()).thenReturn(List.of());
        when(tracking.findLatestByOrderNo("PO1"))
                .thenReturn(risk(7L, "PO1", "resolved", "danger"));

        DeliveryRiskResponse response = new DeliveryRiskResponse();
        response.getOrders().add(item("PO1", "danger"));
        orchestrator.reconcileRiskTracking(response);

        ArgumentCaptor<String> reason = ArgumentCaptor.forClass(String.class);
        verify(tracking).reopenRisk(eq(7L), reason.capture());
        assertEquals("风险复现：danger", reason.getValue());
        verify(tracking, never()).createRisk(anyString(), anyString(), any(), any());
    }

    @Test
    @DisplayName("首次出险 → 正常创建")
    void firstRiskIsCreated() {
        when(tracking.listOpenRisks()).thenReturn(List.of());
        when(tracking.findLatestByOrderNo("PO1")).thenReturn(null);

        DeliveryRiskResponse response = new DeliveryRiskResponse();
        response.getOrders().add(item("PO1", "danger"));
        orchestrator.reconcileRiskTracking(response);

        verify(tracking).createRisk(eq("PO1"), eq("danger"), any(), isNull());
    }

    @Test
    @DisplayName("本次评估里回到安全区间 → 自动解除，处理人必须是「系统(自动)」")
    void clearedRiskIsAutoResolved() {
        when(tracking.listOpenRisks()).thenReturn(List.of(risk(3L, "PO1", "pending", "danger")));

        DeliveryRiskResponse response = new DeliveryRiskResponse();
        response.getOrders().add(item("PO1", "safe"));
        orchestrator.reconcileRiskTracking(response);

        verify(tracking).resolveRisk(eq(3L), eq("自动解除"), anyString(), eq("系统(自动)"));
    }

    @Test
    @DisplayName("不在本次评估结果里的订单 → 一律不动（过滤查询不等于风险解除）")
    void ordersOutsideResponseAreUntouched() {
        when(tracking.listOpenRisks()).thenReturn(List.of(
                risk(5L, "PO-OTHER", "pending", "danger")));

        DeliveryRiskResponse response = new DeliveryRiskResponse();
        response.getOrders().add(item("PO1", "safe"));
        orchestrator.reconcileRiskTracking(response);

        // PO-OTHER 没出现在结果里：既不能被解除，也不能被重开/新建
        verify(tracking, never()).resolveRisk(eq(5L), anyString(), anyString(), anyString());
        verify(tracking, never()).reopenRisk(eq(5L), anyString());
    }
}
