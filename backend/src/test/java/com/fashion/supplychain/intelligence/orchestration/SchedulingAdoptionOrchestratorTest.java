package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.SchedulingAdoptionRequest;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.ProductionOrderLogAppendHelper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import com.fashion.supplychain.system.service.FactoryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;

import java.time.LocalDateTime;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * {@code SchedulingSuggestionOrchestrator.adopt}（D-754 P4 排产建议一键采纳）契约测试。
 *
 * <p>守护四条契约：
 * <ol>
 *   <li><b>多租户隔离</b>：跨租户订单必须拦截（P0 铁律 4）；</li>
 *   <li><b>写回正确</b>：工厂 + 计划开始/完成日期按方案落地（开始 00:00:00、完成 23:59:59）；</li>
 *   <li><b>采纳留痕</b>：每次采纳都追加操作日志（谁/何时由 Helper 自动补充）；</li>
 *   <li><b>可不改日期</b>：未传日期时保留订单原值，不写入空值。</li>
 * </ol>
 */
@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
@DisplayName("SchedulingSuggestionOrchestrator - 排产建议采纳闭环")
class SchedulingAdoptionOrchestratorTest {

    private static final Long TENANT = 9527L;

    @Mock
    private FactoryService factoryService;
    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private ScanRecordService scanRecordService;
    @Mock
    private ProductionOrderLogAppendHelper productionOrderLogAppendHelper;

    @InjectMocks
    private SchedulingSuggestionOrchestrator orchestrator;

    @BeforeEach
    void bindTenant() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(TENANT);
        ctx.setUsername("planner");
        ctx.setUserId("planner");
        UserContext.set(ctx);
    }

    @AfterEach
    void clearTenant() {
        UserContext.clear();
    }

    private ProductionOrder existingOrder(Long tenantId) {
        ProductionOrder order = new ProductionOrder();
        order.setId("O1001");
        order.setOrderNo("PO-2026-001");
        order.setTenantId(tenantId);
        order.setFactoryName("旧工厂");
        order.setPlannedStartDate(LocalDateTime.of(2026, 9, 1, 0, 0));
        order.setPlannedEndDate(LocalDateTime.of(2026, 9, 20, 23, 59, 59));
        return order;
    }

    private SchedulingAdoptionRequest fullRequest() {
        SchedulingAdoptionRequest req = new SchedulingAdoptionRequest();
        req.setOrderId("O1001");
        req.setFactoryName("宁波一厂");
        req.setFactoryId("F88");
        req.setPlannedStartDate("2026-10-08");
        req.setPlannedEndDate("2026-10-25");
        req.setMatchScore(87);
        req.setReason("产能充裕且交期达成率高");
        return req;
    }

    @Test
    @DisplayName("采纳：工厂 + 计划起止写回订单，并追加采纳留痕")
    void adoptWritesBackFactoryAndPlanDates() {
        ProductionOrder order = existingOrder(TENANT);
        when(productionOrderService.getById("O1001")).thenReturn(order);

        Map<String, Object> result = orchestrator.adopt(fullRequest());

        assertThat(order.getFactoryName()).isEqualTo("宁波一厂");
        assertThat(order.getFactoryId()).isEqualTo("F88");
        assertThat(order.getPlannedStartDate()).isEqualTo(LocalDateTime.of(2026, 10, 8, 0, 0));
        assertThat(order.getPlannedEndDate()).isEqualTo(LocalDateTime.of(2026, 10, 25, 23, 59, 59));

        verify(productionOrderService).updateById(order);
        verify(productionOrderLogAppendHelper).appendOperation(eq("O1001"), eq("采纳排产建议"), anyString());

        assertThat(result).containsEntry("adopted", true);
        assertThat(result).containsEntry("factoryName", "宁波一厂");
        assertThat(result).containsEntry("plannedStartDate", "2026-10-08");
        assertThat(result).containsEntry("plannedEndDate", "2026-10-25");
        assertThat(result).containsEntry("operator", "planner");
    }

    @Test
    @DisplayName("采纳：未传计划日期时保留订单原值，且不触发空值覆盖")
    void adoptKeepsOriginalDatesWhenAbsent() {
        ProductionOrder order = existingOrder(TENANT);
        when(productionOrderService.getById("O1001")).thenReturn(order);

        SchedulingAdoptionRequest req = fullRequest();
        req.setPlannedStartDate(null);
        req.setPlannedEndDate(null);
        req.setMatchScore(null);
        req.setReason(null);

        orchestrator.adopt(req);

        assertThat(order.getPlannedStartDate()).isEqualTo(LocalDateTime.of(2026, 9, 1, 0, 0));
        assertThat(order.getPlannedEndDate()).isEqualTo(LocalDateTime.of(2026, 9, 20, 23, 59, 59));
        verify(productionOrderService).updateById(order);
    }

    @Test
    @DisplayName("采纳：跨租户订单被拦截（P0 铁律 4）")
    void adoptRejectsCrossTenantOrder() {
        ProductionOrder foreign = existingOrder(8888L);
        when(productionOrderService.getById("O1001")).thenReturn(foreign);

        assertThatThrownBy(() -> orchestrator.adopt(fullRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("无权操作");

        verify(productionOrderService, never()).updateById(any());
        verify(productionOrderLogAppendHelper, never()).appendOperation(any(), any(), any());
    }

    @Test
    @DisplayName("采纳：订单不存在时报错且不写库")
    void adoptRejectsUnknownOrder() {
        when(productionOrderService.getById("O1001")).thenReturn(null);

        assertThatThrownBy(() -> orchestrator.adopt(fullRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("订单不存在");

        verify(productionOrderService, never()).updateById(any());
    }

    @Test
    @DisplayName("采纳：缺少订单ID / 工厂名时拒绝")
    void adoptRejectsMissingRequiredFields() {
        SchedulingAdoptionRequest noOrder = fullRequest();
        noOrder.setOrderId(" ");
        assertThatThrownBy(() -> orchestrator.adopt(noOrder))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("订单ID不能为空");

        SchedulingAdoptionRequest noFactory = fullRequest();
        noFactory.setFactoryName(null);
        assertThatThrownBy(() -> orchestrator.adopt(noFactory))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("缺少工厂信息");
    }

    @Test
    @DisplayName("采纳：日期格式非法时拒绝（防止脏数据写入）")
    void adoptRejectsBadDateFormat() {
        ProductionOrder order = existingOrder(TENANT);
        when(productionOrderService.getById("O1001")).thenReturn(order);

        SchedulingAdoptionRequest req = fullRequest();
        req.setPlannedEndDate("2026/10/25");

        assertThatThrownBy(() -> orchestrator.adopt(req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("yyyy-MM-dd");
    }

    @Test
    @DisplayName("采纳：缺少租户上下文时拒绝")
    void adoptRequiresTenantContext() {
        UserContext.clear();
        assertThatThrownBy(() -> orchestrator.adopt(fullRequest()))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("租户上下文");
    }
}