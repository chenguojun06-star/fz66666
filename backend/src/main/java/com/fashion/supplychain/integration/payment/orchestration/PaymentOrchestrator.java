package com.fashion.supplychain.integration.payment.orchestration;

import com.fashion.supplychain.integration.payment.PaymentGateway;
import com.fashion.supplychain.integration.payment.PaymentManager;
import com.fashion.supplychain.integration.payment.PaymentRequest;
import com.fashion.supplychain.integration.payment.PaymentResponse;
import com.fashion.supplychain.integration.payment.config.PaymentChannelConfig;
import com.fashion.supplychain.integration.record.entity.PaymentRecord;
import com.fashion.supplychain.integration.record.mapper.PaymentRecordMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 支付编排：发起（主扫二维码）、主动查询、关单。
 *
 * <p><b>状态机</b>：{@code PENDING → SUCCESS / CANCELLED / REFUNDED}，
 * 所有跃迁都走 Mapper 的条件更新（CAS），保证重复回调/并发查询只生效一次。
 * 「确认已支付」的落库与业务落账统一在 {@link PaymentConfirmOrchestrator}，
 * 本类只负责渠道交互，不重复实现确认逻辑。
 *
 * <p><b>为什么发起时不重新下单</b>：同一业务单已有待支付二维码时**直接复用**。
 * 微信/支付宝对同一 {@code out_trade_no} 重复下单的行为不完全一致
 * （可能报"订单已存在"），复用二维码既避开这个坑，也不会让顾客看到两个不同的码。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class PaymentOrchestrator {

    /** 二维码有效期（秒）：与渠道侧的超时口径一致，前端据此倒计时 */
    public static final int PREPAY_EXPIRE_SECONDS = 15 * 60;

    private final PaymentManager paymentManager;
    private final PaymentRecordMapper paymentRecordMapper;
    private final PaymentConfirmOrchestrator confirmOrchestrator;

    /* ── 发起支付 ─────────────────────────────────────────────────────────── */

    /**
     * 发起主扫支付，返回二维码内容。
     *
     * @param bizType   业务类型（写入 order_type，回调据此找处理器）
     * @param bizNo     业务单号（作为 out_trade_no）
     * @param amountFen 金额（分）
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> prepay(Long tenantId, String bizType, String bizNo,
                                      long amountFen, String subject,
                                      PaymentGateway.PaymentType channel) {
        if (tenantId == null || !StringUtils.hasText(bizNo)) {
            throw new IllegalArgumentException("缺少支付业务单号");
        }
        if (amountFen <= 0) {
            throw new IllegalArgumentException("支付金额必须大于 0");
        }
        // 未配置/参数不全在这里就抛可读异常（绝不会走到"模拟成功"）
        PaymentChannelConfig cfg = paymentManager.requireConfig(tenantId, channel);

        PaymentRecord existing = paymentRecordMapper.findLatest(tenantId, bizNo, channel.name());
        if (existing != null && "SUCCESS".equals(existing.getStatus())) {
            throw new IllegalStateException("该单已支付成功，请勿重复发起");
        }
        if (existing != null && "PENDING".equals(existing.getStatus())
                && StringUtils.hasText(existing.getQrCode())) {
            log.info("[支付] 复用已有待支付二维码 tenant={} bizNo={} channel={}", tenantId, bizNo, channel);
            return describe(existing, true);
        }

        PaymentRequest request = PaymentRequest.builder()
                .orderId(bizNo)
                .amount(amountFen)
                .subject(StringUtils.hasText(subject) ? subject : "收银台消费")
                .paymentType(channel)
                .notifyUrl(cfg.getNotifyUrl())
                .build();

        PaymentResponse resp = paymentManager.createPayment(tenantId, request);
        if (resp == null || !StringUtils.hasText(resp.getQrCode())) {
            throw new IllegalStateException("支付渠道未返回二维码，请稍后重试");
        }

        if (existing != null && "PENDING".equals(existing.getStatus())) {
            paymentRecordMapper.fillPrepayInfo(existing.getId(), resp.getQrCode(),
                    resp.getPayUrl(), resp.getThirdPartyOrderId());
            return describe(patchOf(existing, resp.getQrCode()), false);
        }

        PaymentRecord row = new PaymentRecord();
        row.setTenantId(tenantId);
        row.setOrderId(bizNo);
        row.setOrderType(bizType);
        row.setChannel(channel.name());
        row.setAmount(amountFen);
        row.setStatus("PENDING");
        row.setThirdPartyOrderId(resp.getThirdPartyOrderId());
        row.setQrCode(resp.getQrCode());
        row.setPayUrl(resp.getPayUrl());
        paymentRecordMapper.insert(row);
        return describe(row, false);
    }

    /* ── 主动查询 ─────────────────────────────────────────────────────────── */

    /**
     * 主动向渠道查询，若已支付则**就地确认**（与回调同一套幂等逻辑）。
     *
     * <p>支付结果**不能只等回调**：回调可能因网络、发布重启、地址配错而丢失，
     * 表现就是"顾客付了钱、系统还是待支付"。收银台轮询时走这里兜底。
     */
    public Map<String, Object> queryAndConfirm(Long tenantId, String bizNo,
                                              PaymentGateway.PaymentType channel) {
        PaymentRecord record = paymentRecordMapper.findLatest(tenantId, bizNo, channel.name());
        if (record == null) {
            throw new IllegalArgumentException("未找到该单的支付记录");
        }
        if (!"PENDING".equals(record.getStatus())) {
            return describe(record, false);
        }
        PaymentResponse resp = paymentManager.queryPayment(tenantId, bizNo,
                record.getThirdPartyOrderId(), channel);

        if (resp.getStatus() == PaymentResponse.PaymentStatus.SUCCESS) {
            long paidFen = resp.getActualAmount() == null ? record.getAmount() : resp.getActualAmount();
            confirmOrchestrator.confirmPaid(tenantId, channel.name(), bizNo,
                    resp.getThirdPartyOrderId(), paidFen);
            PaymentRecord after = paymentRecordMapper.findLatest(tenantId, bizNo, channel.name());
            return describe(after == null ? record : after, false);
        }
        if (resp.getStatus() == PaymentResponse.PaymentStatus.CLOSED) {
            confirmOrchestrator.confirmClosed(tenantId, channel.name(), bizNo, "渠道已关闭");
            PaymentRecord after = paymentRecordMapper.findLatest(tenantId, bizNo, channel.name());
            return describe(after == null ? record : after, false);
        }
        return describe(record, false);
    }

    /* ── 关单 ─────────────────────────────────────────────────────────────── */

    /**
     * 关单（收银员取消 / 超时）。
     *
     * <p>先向渠道查询确认"确实还没付"，再关渠道单，最后把本地流水置为已关闭。
     * 已支付的单不允许关单，只能走退款 —— 否则会出现"钱收了、单没了"。
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancel(Long tenantId, String bizNo, PaymentGateway.PaymentType channel, String reason) {
        PaymentRecord record = paymentRecordMapper.findLatest(tenantId, bizNo, channel.name());
        if (record == null || !"PENDING".equals(record.getStatus())) {
            return;
        }
        PaymentResponse resp = null;
        try {
            resp = paymentManager.queryPayment(tenantId, bizNo, record.getThirdPartyOrderId(), channel);
        } catch (RuntimeException e) {
            // 查不到就按"未支付"继续关单（渠道异常时不该卡住收银员）
            log.warn("[支付] 关单前查询失败，按未支付处理 bizNo={} err={}", bizNo, e.getMessage());
        }
        if (resp != null && resp.getStatus() == PaymentResponse.PaymentStatus.SUCCESS) {
            throw new IllegalStateException("该单已支付成功，无法取消，请走退款");
        }
        try {
            paymentManager.closeOrder(tenantId, bizNo, channel);
        } catch (RuntimeException e) {
            // 渠道侧关单失败不影响本地状态：渠道侧订单本身有超时时间
            log.warn("[支付] 渠道关单失败（本地仍置关闭）bizNo={} err={}", bizNo, e.getMessage());
        }
        confirmOrchestrator.confirmClosed(tenantId, channel.name(), bizNo,
                StringUtils.hasText(reason) ? reason : "收银员取消");
    }

    /* ── 内部 ─────────────────────────────────────────────────────────────── */

    private static PaymentRecord patchOf(PaymentRecord src, String qrCode) {
        PaymentRecord r = new PaymentRecord();
        r.setId(src.getId());
        r.setTenantId(src.getTenantId());
        r.setOrderId(src.getOrderId());
        r.setChannel(src.getChannel());
        r.setStatus(src.getStatus());
        r.setAmount(src.getAmount());
        r.setQrCode(qrCode);
        return r;
    }

    private Map<String, Object> describe(PaymentRecord record, boolean reused) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("status", record.getStatus());
        out.put("paid", "SUCCESS".equals(record.getStatus()));
        out.put("qrCode", record.getQrCode());
        out.put("amountFen", record.getAmount());
        out.put("channel", record.getChannel());
        out.put("bizNo", record.getOrderId());
        out.put("reused", reused);
        out.put("expireSeconds", PREPAY_EXPIRE_SECONDS);
        return out;
    }
}
