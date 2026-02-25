package com.fashion.supplychain.integration.record.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.integration.record.entity.IntegrationCallbackLog;
import com.fashion.supplychain.integration.record.entity.LogisticsRecord;
import com.fashion.supplychain.integration.record.entity.PaymentRecord;
import com.fashion.supplychain.integration.record.mapper.IntegrationCallbackLogMapper;
import com.fashion.supplychain.integration.record.mapper.LogisticsRecordMapper;
import com.fashion.supplychain.integration.record.mapper.PaymentRecordMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 集成跟踪记录服务
 *
 * 管理三张跟踪表：
 *  - t_payment_record       - 支付流水
 *  - t_logistics_record     - 物流运单
 *  - t_integration_callback_log - 第三方回调日志
 *
 * 由 PaymentManager 和 LogisticsManager 在每次调用前后自动写入，
 * 业务层不需要手动调用。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IntegrationRecordService {

    private final PaymentRecordMapper paymentRecordMapper;
    private final LogisticsRecordMapper logisticsRecordMapper;
    private final IntegrationCallbackLogMapper callbackLogMapper;

    // =========================================================
    // 支付流水
    // =========================================================

    /**
     * 保存支付发起记录（createPayment 调用后写入）
     */
    public PaymentRecord savePaymentRecord(Long tenantId, String orderId, String channel,
                                           Long amount, String thirdPartyOrderId,
                                           String payUrl, String qrCode) {
        PaymentRecord record = PaymentRecord.builder()
                .tenantId(tenantId)
                .orderId(orderId)
                .channel(channel)
                .amount(amount)
                .status("PENDING")
                .thirdPartyOrderId(thirdPartyOrderId)
                .payUrl(payUrl)
                .qrCode(qrCode)
                .build();
        paymentRecordMapper.insert(record);
        log.info("[支付追踪] 创建支付记录 | orderId={} channel={} amount={}分", orderId, channel, amount);
        return record;
    }

    /**
     * 支付失败时记录（createPayment 异常后写入）
     */
    public void savePaymentFailure(Long tenantId, String orderId, String channel,
                                   Long amount, String errorMessage) {
        PaymentRecord record = PaymentRecord.builder()
                .tenantId(tenantId)
                .orderId(orderId)
                .channel(channel)
                .amount(amount)
                .status("FAILED")
                .errorMessage(errorMessage)
                .build();
        paymentRecordMapper.insert(record);
        log.warn("[支付追踪] 支付失败记录 | orderId={} error={}", orderId, errorMessage);
    }

    /**
     * 回调通知后更新支付状态（PaymentCallbackController 调用）
     *
     * @param thirdPartyOrderId 第三方交易号
     * @param status            新状态：SUCCESS / FAILED / REFUNDED
     * @param actualAmount      实付金额（分，SUCCESS时传入）
     */
    public void updatePaymentStatus(String thirdPartyOrderId, String status, Long actualAmount) {
        LambdaUpdateWrapper<PaymentRecord> update = new LambdaUpdateWrapper<PaymentRecord>()
                .eq(PaymentRecord::getThirdPartyOrderId, thirdPartyOrderId)
                .set(PaymentRecord::getStatus, status)
                .set(actualAmount != null, PaymentRecord::getActualAmount, actualAmount)
                .set("SUCCESS".equals(status), PaymentRecord::getPaidTime, LocalDateTime.now());
        int rows = paymentRecordMapper.update(null, update);
        log.info("[支付追踪] 更新支付状态 | thirdPartyOrderId={} status={} 影响{}行", thirdPartyOrderId, status, rows);
    }

    /** 查询某笔业务订单的所有支付记录（可能有多次发起） */
    public List<PaymentRecord> getPaymentRecords(Long tenantId, String orderId) {
        return paymentRecordMapper.findByOrderId(tenantId, orderId);
    }

    // =========================================================
    // 物流运单
    // =========================================================

    /**
     * 保存物流下单记录（createShipment 调用后写入）
     */
    public LogisticsRecord saveLogisticsRecord(Long tenantId, String orderId,
                                               String companyCode, String companyName,
                                               String trackingNumber,
                                               String senderName, String senderPhone, String senderAddress,
                                               String receiverName, String receiverPhone, String receiverAddress) {
        LogisticsRecord record = LogisticsRecord.builder()
                .tenantId(tenantId)
                .orderId(orderId)
                .companyCode(companyCode)
                .companyName(companyName)
                .trackingNumber(trackingNumber)
                .status("CREATED")
                .senderName(senderName)
                .senderPhone(senderPhone)
                .senderAddress(senderAddress)
                .receiverName(receiverName)
                .receiverPhone(receiverPhone)
                .receiverAddress(receiverAddress)
                .build();
        logisticsRecordMapper.insert(record);
        log.info("[物流追踪] 创建运单记录 | orderId={} company={} trackingNo={}", orderId, companyCode, trackingNumber);
        return record;
    }

    /**
     * 物流下单失败时记录
     */
    public void saveLogisticsFailure(Long tenantId, String orderId,
                                     String companyCode, String companyName, String errorMessage) {
        LogisticsRecord record = LogisticsRecord.builder()
                .tenantId(tenantId)
                .orderId(orderId)
                .companyCode(companyCode)
                .companyName(companyName)
                .status("FAILED")
                .errorMessage(errorMessage)
                .build();
        logisticsRecordMapper.insert(record);
        log.warn("[物流追踪] 下单失败记录 | orderId={} error={}", orderId, errorMessage);
    }

    /**
     * 物流回调推送后更新状态（LogisticsCallbackController 调用）
     *
     * @param trackingNumber 运单号
     * @param status         新状态：IN_TRANSIT / ARRIVED / DELIVERED / CANCELLED
     * @param eventDesc      事件描述
     * @param eventTime      事件时间
     */
    public void updateLogisticsStatus(String trackingNumber, String status,
                                      String eventDesc, LocalDateTime eventTime) {
        boolean isDelivered = "DELIVERED".equals(status);
        LambdaUpdateWrapper<LogisticsRecord> update = new LambdaUpdateWrapper<LogisticsRecord>()
                .eq(LogisticsRecord::getTrackingNumber, trackingNumber)
                .set(LogisticsRecord::getStatus, status)
                .set(eventDesc != null, LogisticsRecord::getLastEvent, eventDesc)
                .set(eventTime != null, LogisticsRecord::getLastEventTime, eventTime)
                .set(isDelivered, LogisticsRecord::getDeliveredTime, LocalDateTime.now());
        int rows = logisticsRecordMapper.update(null, update);
        log.info("[物流追踪] 更新运单状态 | trackingNo={} status={} 影响{}行", trackingNumber, status, rows);
    }

    /** 查询某笔业务订单的所有物流记录 */
    public List<LogisticsRecord> getLogisticsRecords(Long tenantId, String orderId) {
        return logisticsRecordMapper.findByOrderId(tenantId, orderId);
    }

    // =========================================================
    // 回调日志
    // =========================================================

    /**
     * 保存原始回调报文（Webhook 收到任何请求时立即记录）
     */
    public IntegrationCallbackLog saveCallbackLog(String type, String channel,
                                                  String rawBody, String headers) {
        IntegrationCallbackLog log1 = IntegrationCallbackLog.builder()
                .type(type)
                .channel(channel)
                .rawBody(rawBody)
                .headers(headers)
                .verified(false)
                .processed(false)
                .build();
        callbackLogMapper.insert(log1);
        log.info("[回调日志] 收到{}回调 | channel={} id={}", type, channel, log1.getId());
        return log1;
    }

    /**
     * 回调处理完成后更新状态
     *
     * @param id             回调日志ID
     * @param verified       签名验证是否通过
     * @param processed      业务处理是否成功
     * @param relatedOrderId 关联业务订单号
     * @param errorMessage   如果失败，填写原因
     */
    public void updateCallbackResult(Long id, boolean verified, boolean processed,
                                     String relatedOrderId, String errorMessage) {
        LambdaUpdateWrapper<IntegrationCallbackLog> update = new LambdaUpdateWrapper<IntegrationCallbackLog>()
                .eq(IntegrationCallbackLog::getId, id)
                .set(IntegrationCallbackLog::getVerified, verified)
                .set(IntegrationCallbackLog::getProcessed, processed)
                .set(relatedOrderId != null, IntegrationCallbackLog::getRelatedOrderId, relatedOrderId)
                .set(errorMessage != null, IntegrationCallbackLog::getErrorMessage, errorMessage);
        callbackLogMapper.update(null, update);
    }

    /** 查询未处理的回调日志（用于补偿/重跑） */
    public List<IntegrationCallbackLog> getUnprocessedCallbacks(int limit) {
        return callbackLogMapper.findUnprocessed(limit);
    }

    // =========================================================
    // 面板分页查询（IntegrationDashboardController 调用）
    // =========================================================

    /** 支付流水分页（前端传 page / pageSize / channel / status / orderId） */
    public IPage<PaymentRecord> getPaymentRecordsPage(Map<String, Object> params) {
        int page = parseIntParam(params, "page", 1);
        int pageSize = parseIntParam(params, "pageSize", 10);
        LambdaQueryWrapper<PaymentRecord> wrapper = new LambdaQueryWrapper<PaymentRecord>()
                .eq(notBlank(params, "channel"), PaymentRecord::getChannel, params.get("channel"))
                .eq(notBlank(params, "status"), PaymentRecord::getStatus, params.get("status"))
                .like(notBlank(params, "orderId"), PaymentRecord::getOrderId, params.get("orderId"))
                .orderByDesc(PaymentRecord::getCreatedTime);
        return paymentRecordMapper.selectPage(new Page<>(page, pageSize), wrapper);
    }

    /** 物流运单分页（前端传 page / pageSize / companyCode / status / orderId） */
    public IPage<LogisticsRecord> getLogisticsRecordsPage(Map<String, Object> params) {
        int page = parseIntParam(params, "page", 1);
        int pageSize = parseIntParam(params, "pageSize", 10);
        LambdaQueryWrapper<LogisticsRecord> wrapper = new LambdaQueryWrapper<LogisticsRecord>()
                .eq(notBlank(params, "companyCode"), LogisticsRecord::getCompanyCode, params.get("companyCode"))
                .eq(notBlank(params, "status"), LogisticsRecord::getStatus, params.get("status"))
                .like(notBlank(params, "orderId"), LogisticsRecord::getOrderId, params.get("orderId"))
                .orderByDesc(LogisticsRecord::getCreatedTime);
        return logisticsRecordMapper.selectPage(new Page<>(page, pageSize), wrapper);
    }

    /** 回调日志分页（前端传 page / pageSize / type / channel / processed） */
    public IPage<IntegrationCallbackLog> getCallbackLogsPage(Map<String, Object> params) {
        int page = parseIntParam(params, "page", 1);
        int pageSize = parseIntParam(params, "pageSize", 10);
        Object processedParam = params.get("processed");
        Boolean processed = processedParam != null ? Boolean.parseBoolean(String.valueOf(processedParam)) : null;
        LambdaQueryWrapper<IntegrationCallbackLog> wrapper = new LambdaQueryWrapper<IntegrationCallbackLog>()
                .eq(notBlank(params, "type"), IntegrationCallbackLog::getType, params.get("type"))
                .eq(notBlank(params, "channel"), IntegrationCallbackLog::getChannel, params.get("channel"))
                .eq(processed != null, IntegrationCallbackLog::getProcessed, processed)
                .orderByDesc(IntegrationCallbackLog::getCreatedTime);
        return callbackLogMapper.selectPage(new Page<>(page, pageSize), wrapper);
    }

    /** 面板统计数据（近7天流水量 + 未处理回调数） */
    public Map<String, Object> getDashboardStats() {
        LocalDateTime since = LocalDateTime.now().minusDays(7);
        long paymentCount = paymentRecordMapper.selectCount(
                new LambdaQueryWrapper<PaymentRecord>().ge(PaymentRecord::getCreatedTime, since));
        long logisticsCount = logisticsRecordMapper.selectCount(
                new LambdaQueryWrapper<LogisticsRecord>().ge(LogisticsRecord::getCreatedTime, since));
        long unprocessed = callbackLogMapper.selectCount(
                new LambdaQueryWrapper<IntegrationCallbackLog>().eq(IntegrationCallbackLog::getProcessed, false));
        Map<String, Object> stats = new HashMap<>();
        stats.put("paymentCount7d", paymentCount);
        stats.put("logisticsCount7d", logisticsCount);
        stats.put("unprocessedCallbacks", unprocessed);
        return stats;
    }

    // =========================================================
    // 工具方法
    // =========================================================

    private boolean notBlank(Map<String, Object> params, String key) {
        Object v = params.get(key);
        return v != null && !String.valueOf(v).isBlank();
    }

    private int parseIntParam(Map<String, Object> params, String key, int defaultVal) {
        try {
            Object v = params.get(key);
            return v != null ? Integer.parseInt(String.valueOf(v)) : defaultVal;
        } catch (NumberFormatException e) {
            return defaultVal;
        }
    }
}
