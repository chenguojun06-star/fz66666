package com.fashion.supplychain.finance.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 工资支付审计接线（D-878）。
 *
 * <p>背景：D-877 复核发现工资支付有 6 个资金动作**零操作日志**——取消支付、退回付款、
 * 驳回应付、确认线下支付、创建待付工资单、保存收款账户；而同模块的「发起支付 /
 * 确认收款 / 停用账户」早就在记。审计断档意味着钱动了查不到人。
 *
 * <p>两层验证：
 * <ol>
 *   <li>行为层：helper 方法写出的日志 action / targetId 是否正确（targetId 必须是被操作
 *       的单据/账户主键，不能是 payeeId——否则日志挂错对象）</li>
 *   <li>接线层：编排器源码里必须真的调用了这 6 个方法（helper 写好了没人调 = 本次要修的
 *       那类缺陷本身，光测 helper 测不出来）</li>
 * </ol>
 */
@DisplayName("工资支付审计接线（D-878）：6 个资金动作不再静默")
class WagePaymentLogAppendHelperTest {

    private OperationLogService operationLogService;
    private WagePaymentLogAppendHelper helper;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("1001");
        ctx.setUsername("测试主管");
        UserContext.set(ctx);

        operationLogService = mock(OperationLogService.class);
        // OperationLogAppendUtil 通过实例 setter 写静态引用，测试里直接替换成 mock
        new OperationLogAppendUtil().setOperationLogService(operationLogService);

        helper = new WagePaymentLogAppendHelper();
    }

    private OperationLog captureSingle() {
        ArgumentCaptor<OperationLog> captor = ArgumentCaptor.forClass(OperationLog.class);
        verify(operationLogService, times(1)).createOperationLog(captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("取消支付：action=取消支付，targetId=支付单主键，明细带单号与原因")
    void cancelPaymentIsAudited() {
        helper.appendCancelPayment("pay-1", "WP20261025001", "客户改期");

        OperationLog log = captureSingle();
        assertEquals("工资支付", log.getModule());
        assertEquals("取消支付", log.getOperation());
        assertEquals("pay-1", log.getTargetId(), "targetId 必须是支付单主键");
        assertTrue(log.getDetails().contains("WP20261025001"), "明细要能定位到单号");
        assertTrue(log.getDetails().contains("客户改期"), "明细要带取消原因");
        assertEquals(2L, log.getTenantId(), "日志必须带租户，跨租户不可见");
    }

    @Test
    @DisplayName("退回付款：action=退回付款，明细带原因")
    void refundPaymentIsAudited() {
        helper.appendRefundPayment("pay-2", "WP20261025002", "多付退回");

        OperationLog log = captureSingle();
        assertEquals("退回付款", log.getOperation());
        assertEquals("pay-2", log.getTargetId());
        assertTrue(log.getDetails().contains("多付退回"));
    }

    @Test
    @DisplayName("确认线下支付：action=确认线下支付")
    void confirmOfflinePaymentIsAudited() {
        helper.appendConfirmOfflinePayment("pay-3", "WP20261025003");

        OperationLog log = captureSingle();
        assertEquals("确认线下支付", log.getOperation());
        assertEquals("pay-3", log.getTargetId());
        assertTrue(log.getDetails().contains("WP20261025003"));
    }

    @Test
    @DisplayName("创建待付工资单：action=创建待付工资单，明细带金额")
    void createPendingPayableIsAudited() {
        helper.appendCreatePendingPayable("pay-4", "8800.00");

        OperationLog log = captureSingle();
        assertEquals("创建待付工资单", log.getOperation());
        assertEquals("pay-4", log.getTargetId(), "targetId 必须是支付单主键，不是收款人");
        assertTrue(log.getDetails().contains("8800.00"));
    }

    @Test
    @DisplayName("驳回待付款：action=拒绝付款，明细带原因")
    void rejectPayableIsAudited() {
        helper.appendRejectPayable("pay-5", "金额与对账单不符");

        OperationLog log = captureSingle();
        assertEquals("拒绝付款", log.getOperation());
        assertEquals("pay-5", log.getTargetId());
        assertTrue(log.getDetails().contains("金额与对账单不符"));
    }

    @Test
    @DisplayName("保存收款账户：新增/修改要能区分，targetId=账户主键而不是收款人")
    void saveAccountDistinguishesCreateAndUpdate() {
        helper.appendSaveAccount("acc-1", "FACTORY", "BANK", false);
        helper.appendSaveAccount("acc-1", "FACTORY", "BANK", true);

        ArgumentCaptor<OperationLog> captor = ArgumentCaptor.forClass(OperationLog.class);
        verify(operationLogService, times(2)).createOperationLog(captor.capture());
        List<OperationLog> logs = captor.getAllValues();

        assertEquals("新增收款账户", logs.get(0).getOperation());
        assertEquals("修改收款账户", logs.get(1).getOperation(),
                "同一接口既新增又修改，动作必须区分，否则审计看不出是建还是改");
        assertEquals("acc-1", logs.get(0).getTargetId(),
                "targetId 必须是账户主键——传 ownerId 会把日志挂到收款人身上");
    }

    @Test
    @DisplayName("空主键不写日志（避免产生无主审计行）")
    void nullIdWritesNothing() {
        helper.appendCancelPayment(null, "WP20261025009", "原因");
        verify(operationLogService, never()).createOperationLog(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("接线守护：编排器源码必须真的调用这 6 个方法（写好了没人调 = 缺陷本身）")
    void orchestratorsActuallyCallTheAuditMethods() throws Exception {
        Path root = Paths.get("src/main/java/com/fashion/supplychain/finance");
        String wageOrchestrator = Files.readString(
                root.resolve("orchestration/WagePaymentOrchestrator.java"), StandardCharsets.UTF_8);
        String payableHelper = Files.readString(
                root.resolve("orchestration/PayableAggregationHelper.java"), StandardCharsets.UTF_8);

        String[][] expectations = {
                {"WagePaymentOrchestrator", wageOrchestrator, "appendSaveAccount("},
                {"WagePaymentOrchestrator", wageOrchestrator, "appendConfirmOfflinePayment("},
                {"WagePaymentOrchestrator", wageOrchestrator, "appendCancelPayment("},
                {"WagePaymentOrchestrator", wageOrchestrator, "appendRefundPayment("},
                {"PayableAggregationHelper", payableHelper, "appendCreatePendingPayable("},
                {"PayableAggregationHelper", payableHelper, "appendRejectPayable("},
        };

        for (String[] e : expectations) {
            if (!e[1].contains(e[2])) {
                fail(e[0] + " 未调用 " + e[2] + "——审计方法定义了但没接线，正是 D-877 查出的那类缺陷");
            }
        }
    }
}
