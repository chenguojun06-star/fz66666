package com.fashion.supplychain.integration.payment.orchestration;

import com.fashion.supplychain.integration.payment.PaymentBusinessHandler;
import com.fashion.supplychain.integration.record.entity.PaymentRecord;
import com.fashion.supplychain.integration.record.mapper.PaymentRecordMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.Mockito;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 支付确认单测（钱到账的唯一入口）。
 *
 * <p>要守住的核心是**幂等**：微信/支付宝都会重复推送回调，
 * 而"出库 / 记账"重复执行等于凭空多发一次货、多记一笔账。
 * 幂等靠支付流水的条件更新（只有 PENDING → SUCCESS 的那一次才执行业务落账）。
 */
class PaymentConfirmOrchestratorTest {

    private static final long TENANT = 7L;

    /** 记录业务落账是否被调用 */
    private static class RecordingHandler implements PaymentBusinessHandler {
        int paidCount;
        int closedCount;
        String lastBizNo;
        long lastPaidFen;

        @Override
        public String bizType() {
            return "POS_SALE";
        }

        @Override
        public void onPaid(Long tenantId, String bizNo, String channel, String channelTradeNo, long paidFen) {
            paidCount++;
            lastBizNo = bizNo;
            lastPaidFen = paidFen;
        }

        @Override
        public void onClosed(Long tenantId, String bizNo) {
            closedCount++;
        }
    }

    /**
     * 造一个只吐指定处理器的 ObjectProvider。
     *
     * <p>生产里由 Spring 注入；测试里用 Mockito 桩掉 {@code orderedStream()} 即可
     * （编排器只调用这一个方法）。
     */
    @SuppressWarnings("unchecked")
    private static org.springframework.beans.factory.ObjectProvider<PaymentBusinessHandler>
            providerOf(PaymentBusinessHandler... items) {
        org.springframework.beans.factory.ObjectProvider<PaymentBusinessHandler> provider =
                Mockito.mock(org.springframework.beans.factory.ObjectProvider.class);
        Mockito.when(provider.orderedStream())
                .thenReturn(java.util.Arrays.stream(items));
        return provider;
    }

    private PaymentRecord record(String orderType, String status) {
        PaymentRecord r = new PaymentRecord();
        r.setId(1L);
        r.setTenantId(TENANT);
        r.setOrderId("POS202610100001");
        r.setOrderType(orderType);
        r.setChannel("ALIPAY");
        r.setAmount(168000L);
        r.setStatus(status);
        return r;
    }

    @Test
    @DisplayName("① 首次确认：状态跃迁成功 → 业务落账被调用一次")
    void firstConfirmRunsBusiness() {
        PaymentRecordMapper mapper = mock(PaymentRecordMapper.class);
        RecordingHandler handler = new RecordingHandler();
        PaymentConfirmOrchestrator orchestrator =
                new PaymentConfirmOrchestrator(mapper, providerOf(handler));

        when(mapper.findLatest(TENANT, "POS202610100001", "ALIPAY"))
                .thenReturn(record("POS_SALE", "PENDING"));
        when(mapper.casMarkPaid(eq(TENANT), eq("POS202610100001"), eq("ALIPAY"),
                eq("4200001234"), eq(168000L))).thenReturn(1);

        boolean done = orchestrator.confirmPaid(TENANT, "ALIPAY", "POS202610100001", "4200001234", 168000L);

        assertTrue(done);
        assertEquals(1, handler.paidCount);
        assertEquals("POS202610100001", handler.lastBizNo);
        assertEquals(168000L, handler.lastPaidFen);
    }

    @Test
    @DisplayName("② 重复回调：状态跃迁影响 0 行 → 不再执行业务（否则会重复出库）")
    void duplicateCallbackIsIgnored() {
        PaymentRecordMapper mapper = mock(PaymentRecordMapper.class);
        RecordingHandler handler = new RecordingHandler();
        PaymentConfirmOrchestrator orchestrator =
                new PaymentConfirmOrchestrator(mapper, providerOf(handler));

        when(mapper.findLatest(TENANT, "POS202610100001", "ALIPAY"))
                .thenReturn(record("POS_SALE", "SUCCESS"));
        when(mapper.casMarkPaid(anyLong(), anyString(), anyString(), anyString(), anyLong()))
                .thenReturn(0);

        boolean done = orchestrator.confirmPaid(TENANT, "ALIPAY", "POS202610100001", "4200001234", 168000L);

        assertFalse(done, "已处理过应返回 false（本次没落账）");
        assertEquals(0, handler.paidCount, "重复回调绝不能再出一次库");
    }

    @Test
    @DisplayName("③ 找不到支付流水：不落账、不抛异常（验签已过，属数据异常，留错误日志人工核对）")
    void unknownOrderDoesNotThrow() {
        PaymentRecordMapper mapper = mock(PaymentRecordMapper.class);
        RecordingHandler handler = new RecordingHandler();
        PaymentConfirmOrchestrator orchestrator =
                new PaymentConfirmOrchestrator(mapper, providerOf(handler));

        when(mapper.findLatest(anyLong(), anyString(), anyString())).thenReturn(null);

        assertFalse(orchestrator.confirmPaid(TENANT, "ALIPAY", "UNKNOWN", "x", 1L));
        assertEquals(0, handler.paidCount);
        verify(mapper, never()).casMarkPaid(anyLong(), anyString(), anyString(), anyString(), anyLong());
    }

    @Test
    @DisplayName("④ 没有匹配的业务处理器：流水仍置成功（钱确实到了），但明确告警需人工处理")
    void noHandlerStillMarksPaid() {
        PaymentRecordMapper mapper = mock(PaymentRecordMapper.class);
        PaymentConfirmOrchestrator orchestrator =
                new PaymentConfirmOrchestrator(mapper, providerOf());

        when(mapper.findLatest(TENANT, "POS202610100001", "ALIPAY"))
                .thenReturn(record("SOME_OTHER_BIZ", "PENDING"));
        when(mapper.casMarkPaid(anyLong(), anyString(), anyString(), anyString(), anyLong()))
                .thenReturn(1);

        assertTrue(orchestrator.confirmPaid(TENANT, "ALIPAY", "POS202610100001", "4200001234", 168000L));
    }

    @Test
    @DisplayName("⑤ 支付关闭：跃迁成功才通知业务释放资源")
    void confirmClosed() {
        PaymentRecordMapper mapper = mock(PaymentRecordMapper.class);
        RecordingHandler handler = new RecordingHandler();
        PaymentConfirmOrchestrator orchestrator =
                new PaymentConfirmOrchestrator(mapper, providerOf(handler));

        when(mapper.findLatest(TENANT, "POS202610100001", "ALIPAY"))
                .thenReturn(record("POS_SALE", "PENDING"));
        when(mapper.casMarkClosed(anyLong(), anyString(), anyString(), anyString())).thenReturn(1);

        orchestrator.confirmClosed(TENANT, "ALIPAY", "POS202610100001", "超时");

        assertEquals(1, handler.closedCount);

        // 再关一次（影响 0 行）→ 不再通知
        when(mapper.casMarkClosed(anyLong(), anyString(), anyString(), anyString())).thenReturn(0);
        orchestrator.confirmClosed(TENANT, "ALIPAY", "POS202610100001", "超时");
        assertEquals(1, handler.closedCount);
    }

    @Test
    @DisplayName("⑥ 业务处理器按 bizType 注册（支付模块不反向依赖业务模块）")
    void handlersRegisteredByBizType() {
        PaymentRecordMapper mapper = mock(PaymentRecordMapper.class);
        // 处理器是**首次使用时才解析**的（懒解析打破循环依赖），所以注册表要在
        // 第一次调用 registeredBizTypes() 时才建立 —— 这里直接断言它即可触发解析。
        PaymentConfirmOrchestrator orchestrator =
                new PaymentConfirmOrchestrator(mapper, providerOf(new RecordingHandler()));

        assertEquals(List.of("POS_SALE"), orchestrator.registeredBizTypes());
    }
}
