package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.intelligence.dto.ExecutableCommand;
import com.fashion.supplychain.intelligence.dto.ExecutionDecision;
import com.fashion.supplychain.intelligence.dto.ExecutionResult;
import com.fashion.supplychain.intelligence.orchestration.ExecutionEngineOrchestrator.BusinessException;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * ExecutionEngineOrchestrator 单元测试
 *
 * 覆盖：命令执行、异常处理、撤回(undo)机制
 */
@ExtendWith(MockitoExtension.class)
class ExecutionEngineOrchestratorTest {

    @InjectMocks
    private ExecutionEngineOrchestrator engine;

    @Mock
    private CommandExecutorHelper commandExecutor;

    @Mock
    private ProductionOrderService productionOrderService;
    @Mock
    private MaterialStockService materialStockService;
    @Mock
    private StyleInfoService styleInfoService;
    @Mock
    private FinishedProductSettlementService finishedProductSettlementService;
    @Mock
    private MaterialPurchaseService materialPurchaseService;
    @Mock
    private AuditTrailOrchestrator auditTrail;
    @Mock
    private PermissionDecisionOrchestrator permissionDecision;
    @Mock
    private SmartNotificationOrchestrator smartNotification;
    @Mock
    private SmartWorkflowOrchestrator smartWorkflow;

    private static final Long EXECUTOR_ID = 100L;

    @BeforeEach
    void setUp() {
        // smartWorkflow 默认返回 0 级联
        lenient().when(smartWorkflow.generatePostExecutionWorkflow(any(), any())).thenReturn(0);
        lenient().when(permissionDecision.decide(any(), any())).thenReturn(
            ExecutionDecision.builder()
                .decision(ExecutionDecision.ExecutionDecisionType.AUTO_EXECUTE)
                .reason("允许自动执行")
                .build()
        );
    }

    // ─────────────── order:hold ───────────────

    @Test
    void orderHold_success_setsStatusToDelayed() {
        ProductionOrder order = buildOrder("production");
        doAnswer(invocation -> {
            order.setStatus("delayed");
            return null;
        }).when(commandExecutor).takePreExecutionSnapshot(any(), eq(EXECUTOR_ID));
        when(commandExecutor.executeOrderHold(any(), eq(EXECUTOR_ID))).thenAnswer(invocation -> {
            order.setStatus("delayed");
            return order;
        });

        ExecutionResult<?> result = engine.execute(buildCmd("order:hold", "PO001"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isTrue();
        assertThat(order.getStatus()).isEqualTo("delayed");
        verify(commandExecutor).executeOrderHold(any(), eq(EXECUTOR_ID));
    }

    @Test
    void orderHold_completedOrder_fails() {
        doThrow(new BusinessException("订单状态 completed 不允许暂停"))
            .when(commandExecutor).executeOrderHold(any(), eq(EXECUTOR_ID));

        ExecutionResult<?> result = engine.execute(buildCmd("order:hold", "PO001"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getErrorMessage()).contains("不允许暂停");
    }

    @Test
    void orderHold_orderNotFound_fails() {
        doThrow(new BusinessException("订单不存在: NOPE"))
            .when(commandExecutor).executeOrderHold(any(), eq(EXECUTOR_ID));

        ExecutionResult<?> result = engine.execute(buildCmd("order:hold", "NOPE"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getErrorMessage()).contains("订单不存在");
    }

    // ─────────────── order:expedite ───────────────

    @Test
    void orderExpedite_success_setsUrgencyLevel() {
        ProductionOrder order = buildOrder("production");
        when(commandExecutor.executeOrderExpedite(any(), eq(EXECUTOR_ID))).thenAnswer(invocation -> {
            order.setUrgencyLevel("URGENT");
            return order;
        });

        ExecutionResult<?> result = engine.execute(buildCmd("order:expedite", "PO001"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isTrue();
        assertThat(order.getUrgencyLevel()).isEqualTo("URGENT");
    }

    // ─────────────── order:resume ───────────────

    @Test
    void orderResume_fromDelayed_success() {
        ProductionOrder order = buildOrder("delayed");
        when(commandExecutor.executeOrderResume(any(), eq(EXECUTOR_ID))).thenAnswer(invocation -> {
            order.setStatus("production");
            return order;
        });

        ExecutionResult<?> result = engine.execute(buildCmd("order:resume", "PO001"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isTrue();
        assertThat(order.getStatus()).isEqualTo("production");
    }

    @Test
    void orderResume_fromProduction_fails() {
        doThrow(new BusinessException("订单当前状态为 production，不支持恢复（仅 delayed 状态可恢复）"))
            .when(commandExecutor).executeOrderResume(any(), eq(EXECUTOR_ID));

        ExecutionResult<?> result = engine.execute(buildCmd("order:resume", "PO001"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getErrorMessage()).contains("不支持恢复");
    }

    // ─────────────── order:approve ───────────────

    @Test
    void orderApprove_fromPending_success() {
        ProductionOrder order = buildOrder("pending");
        when(commandExecutor.executeOrderApprove(any(), eq(EXECUTOR_ID))).thenAnswer(invocation -> {
            order.setStatus("production");
            return order;
        });

        ExecutionResult<?> result = engine.execute(buildCmd("order:approve", "PO001"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isTrue();
        assertThat(order.getStatus()).isEqualTo("production");
    }

    // ─────────────── style:approve ───────────────

    @Test
    void styleApprove_success() {
        StyleInfo style = new StyleInfo();
        style.setId(9001L);
        when(commandExecutor.executeStyleApprove(any(), eq(EXECUTOR_ID))).thenAnswer(invocation -> {
            style.setSampleReviewStatus("PASS");
            return style;
        });

        ExecutionResult<?> result = engine.execute(buildCmd("style:approve", "9001"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isTrue();
        assertThat(style.getSampleReviewStatus()).isEqualTo("PASS");
    }

    // ─────────────── settlement:approve ───────────────

    @Test
    void settlementApprove_success() {
        FinishedProductSettlement s = new FinishedProductSettlement();
        s.setStatus("pending");
        when(commandExecutor.executeSettlementApprove(any(), eq(EXECUTOR_ID))).thenAnswer(invocation -> {
            s.setStatus("approved");
            return s;
        });

        ExecutionResult<?> result = engine.execute(buildCmd("settlement:approve", "ST001"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isTrue();
        assertThat(s.getStatus()).isEqualTo("approved");
    }

    @Test
    void settlementApprove_alreadyApproved_fails() {
        doThrow(new BusinessException("结算单已审批，无需重复操作"))
            .when(commandExecutor).executeSettlementApprove(any(), eq(EXECUTOR_ID));

        ExecutionResult<?> result = engine.execute(buildCmd("settlement:approve", "ST001"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getErrorMessage()).contains("已审批");
    }

    // ─────────────── unknown command ───────────────

    @Test
    void unknownCommand_fails() {
        ExecutionResult<?> result = engine.execute(buildCmd("foo:bar", "X"), EXECUTOR_ID);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getErrorMessage()).contains("未知的命令类型");
    }

    // ─────────────── undo ───────────────

    @Test
    void undoLast_afterHold_restoresOriginalStatus() {
        ProductionOrder order = buildOrder("production");
        when(commandExecutor.executeOrderHold(any(), eq(EXECUTOR_ID))).thenAnswer(invocation -> {
            order.setStatus("delayed");
            return order;
        });
        when(commandExecutor.executeUndoLast(EXECUTOR_ID)).thenAnswer(invocation -> {
            order.setStatus("production");
            return Map.of("restored", true);
        });

        // Execute hold
        engine.execute(buildCmd("order:hold", "PO001"), EXECUTOR_ID);
        assertThat(order.getStatus()).isEqualTo("delayed");

        // Execute undo
        ExecutionResult<?> undoResult = engine.execute(buildCmd("undo:last", ""), EXECUTOR_ID);

        assertThat(undoResult.isSuccess()).isTrue();
        // After undo, status should be restored to "production"
        assertThat(order.getStatus()).isEqualTo("production");
    }

    @Test
    void undoLast_withNoSnapshot_fails() {
        doThrow(new BusinessException("没有可撤回的操作"))
            .when(commandExecutor).executeUndoLast(EXECUTOR_ID);

        ExecutionResult<?> result = engine.execute(buildCmd("undo:last", ""), EXECUTOR_ID);

        assertThat(result.isSuccess()).isFalse();
        assertThat(result.getErrorMessage()).contains("没有可撤回的操作");
    }

    @Test
    void undoLast_calledTwice_secondFails() {
        when(commandExecutor.executeOrderHold(any(), eq(EXECUTOR_ID))).thenReturn(buildOrder("delayed"));
        when(commandExecutor.executeUndoLast(EXECUTOR_ID))
            .thenReturn(Map.of("restored", true))
            .thenThrow(new BusinessException("没有可撤回的操作"));

        engine.execute(buildCmd("order:hold", "PO001"), EXECUTOR_ID);

        // First undo succeeds
        ExecutionResult<?> undo1 = engine.execute(buildCmd("undo:last", ""), EXECUTOR_ID);
        assertThat(undo1.isSuccess()).isTrue();

        // Second undo fails (snapshot already consumed)
        ExecutionResult<?> undo2 = engine.execute(buildCmd("undo:last", ""), EXECUTOR_ID);
        assertThat(undo2.isSuccess()).isFalse();
    }

    // ─────────────── audit trail invocation ───────────────

    @Test
    void execute_callsAuditTrailOnSuccess() {
        when(commandExecutor.executeOrderExpedite(any(), eq(EXECUTOR_ID))).thenReturn(buildOrder("production"));

        engine.execute(buildCmd("order:expedite", "PO001"), EXECUTOR_ID);

        verify(auditTrail).logCommandStart(any(), eq(EXECUTOR_ID));
        verify(auditTrail).logCommandSuccess(any(), any(), eq(EXECUTOR_ID), anyLong());
        verify(auditTrail, never()).logCommandFailure(any(), any(), any(), anyLong());
    }

    @Test
    void execute_callsAuditTrailOnFailure() {
        doThrow(new BusinessException("订单不存在: NOPE"))
            .when(commandExecutor).executeOrderHold(any(), eq(EXECUTOR_ID));

        engine.execute(buildCmd("order:hold", "NOPE"), EXECUTOR_ID);

        verify(auditTrail).logCommandStart(any(), eq(EXECUTOR_ID));
        verify(auditTrail).logCommandFailure(any(), any(BusinessException.class), eq(EXECUTOR_ID), anyLong());
    }

    // ─────────────── helpers ───────────────

    private ProductionOrder buildOrder(String status) {
        ProductionOrder order = new ProductionOrder();
        order.setId("PO001");
        order.setOrderNo("PO001");
        order.setStatus(status);
        return order;
    }

    private ExecutableCommand buildCmd(String action, String targetId) {
        return ExecutableCommand.builder()
            .commandId("CMD-" + System.nanoTime())
            .action(action)
            .targetId(targetId)
            .params(Map.of())
            .reason("测试原因")
            .riskLevel(3)
            .requiresApproval(false)
            .build();
    }
}
