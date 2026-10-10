package com.fashion.supplychain.integration.payment.orchestration;

import com.fashion.supplychain.integration.payment.PaymentBusinessHandler;
import com.fashion.supplychain.integration.record.entity.PaymentRecord;
import com.fashion.supplychain.integration.record.mapper.PaymentRecordMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 支付确认编排：**全链路唯一的"钱到账"入口**（回调和主动查询都走这里）。
 *
 * <p><b>幂等怎么保证</b>：先对支付流水做条件更新
 * （{@code WHERE status = 'PENDING'} → {@code SUCCESS}）。
 * 影响行数为 1 才说明"本次调用完成了状态跃迁"，此时才执行下游业务落账；
 * 为 0 表示已被处理过（渠道重复推送）或流水不存在 → 直接返回，不重复落账。
 *
 * <p><b>为什么状态跃迁与业务落账必须同一个事务</b>：如果先标记已支付、再出库，
 * 出库失败就会变成"钱收了、货没出"且不会再重试。放在一个事务里，
 * 业务失败会连带把支付流水退回 PENDING，渠道重推时再走一遍。
 */
@Slf4j
@Service
public class PaymentConfirmOrchestrator {

    private final PaymentRecordMapper paymentRecordMapper;
    private final Map<String, PaymentBusinessHandler> handlers;

    public PaymentConfirmOrchestrator(PaymentRecordMapper paymentRecordMapper,
                                      List<PaymentBusinessHandler> handlerList) {
        this.paymentRecordMapper = paymentRecordMapper;
        Map<String, PaymentBusinessHandler> map = new HashMap<>();
        for (PaymentBusinessHandler h : handlerList) {
            map.put(h.bizType(), h);
        }
        this.handlers = map;
        log.info("[支付] 已注册业务处理器: {}", map.keySet());
    }

    /**
     * 确认支付成功并落业务账。
     *
     * @return true = 本次调用完成了确认；false = 已处理过 / 无此流水（调用方据此决定是否重复处理）
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean confirmPaid(Long tenantId, String channel, String bizNo,
                               String channelTradeNo, long paidFen) {
        if (tenantId == null || !StringUtils.hasText(bizNo)) {
            return false;
        }
        PaymentRecord record = paymentRecordMapper.findLatest(tenantId, bizNo, channel);
        if (record == null) {
            // 签名有效的回调却找不到流水：属数据异常（不是伪造，因为验签已过）。
            // 不重推（重推也修不好），但必须留下刺眼的错误日志，交给运维核对渠道账单。
            log.error("[支付确认] 找不到支付流水！tenant={} channel={} bizNo={} channelTradeNo={} —— "
                    + "请核对渠道账单，确认是否有未入账的收款", tenantId, channel, bizNo, channelTradeNo);
            return false;
        }

        int rows = paymentRecordMapper.casMarkPaid(tenantId, bizNo, channel, channelTradeNo, paidFen);
        if (rows == 0) {
            log.info("[支付确认] 幂等跳过（已处理过）tenant={} channel={} bizNo={}", tenantId, channel, bizNo);
            return false;
        }

        PaymentBusinessHandler handler = handlers.get(record.getOrderType());
        if (handler == null) {
            log.warn("[支付确认] 没有匹配的业务处理器 orderType={} bizNo={}（流水已置成功，业务需人工处理）",
                    record.getOrderType(), bizNo);
            return true;
        }
        handler.onPaid(tenantId, bizNo, channel, channelTradeNo, paidFen);
        log.info("[支付确认] 完成 tenant={} channel={} bizNo={} 实付={}分", tenantId, channel, bizNo, paidFen);
        return true;
    }

    /** 确认支付关闭（超时/取消）：把流水置关闭并通知业务释放资源 */
    @Transactional(rollbackFor = Exception.class)
    public void confirmClosed(Long tenantId, String channel, String bizNo, String reason) {
        if (tenantId == null || !StringUtils.hasText(bizNo)) {
            return;
        }
        PaymentRecord record = paymentRecordMapper.findLatest(tenantId, bizNo, channel);
        if (record == null) {
            return;
        }
        int rows = paymentRecordMapper.casMarkClosed(tenantId, bizNo, channel, reason);
        if (rows == 0) {
            return;
        }
        PaymentBusinessHandler handler = handlers.get(record.getOrderType());
        if (handler != null) {
            handler.onClosed(tenantId, bizNo);
        }
    }

    /** 已注册的业务类型（诊断用） */
    public List<String> registeredBizTypes() {
        return handlers.keySet().stream().sorted().collect(Collectors.toList());
    }
}
