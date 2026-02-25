package com.fashion.supplychain.integration.logistics.callback;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import com.fashion.supplychain.integration.record.entity.IntegrationCallbackLog;
import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import com.fashion.supplychain.integration.util.SignatureUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 物流回调统一控制器（运单状态推送接收）
 *
 * ============================================================
 * 配置到物流平台的回调地址：
 * ============================================================
 * 顺丰路由推送：https://你的域名/api/webhook/logistics/sf
 * 申通状态推送：https://你的域名/api/webhook/logistics/sto
 *
 * 重要须知：
 * - 物流公司主动推送运单状态变更事件
 * - 收到推送后更新系统中的物流状态
 * - 签名验证防止伪造推送
 * ============================================================
 */
@Slf4j
@RestController
@RequestMapping("/api/webhook/logistics")
@RequiredArgsConstructor
public class LogisticsCallbackController {

    private final IntegrationRecordService recordService;

    // =====================================================
    // 顺丰路由事件推送
    // =====================================================

    /**
     * 顺丰路由事件推送（EXP_RECE_PUSH_ROUTE_EVNET）
     *
     * 顺丰推送格式（POST JSON/Form）：
     * {
     *   "msgType": "EXP_RECE_PUSH_ROUTE_EVNET",
     *   "msgData": "加密JSON...",
     *   "timestamp": "1234567890",
     *   "msgDigest": "签名"
     * }
     *
     * 成功返回："success"
     */
    @PostMapping("/sf")
    public String sfCallback(
            @RequestParam(required = false) String msgType,
            @RequestParam(required = false) String msgData,
            @RequestParam(required = false) String timestamp,
            @RequestParam(required = false) String msgDigest,
            @RequestBody(required = false) Map<String, Object> body) {

        // 兼容 Form 和 JSON 两种方式
        if (body != null && !body.isEmpty()) {
            msgType = String.valueOf(body.getOrDefault("msgType", ""));
            msgData = String.valueOf(body.getOrDefault("msgData", ""));
            timestamp = String.valueOf(body.getOrDefault("timestamp", ""));
            msgDigest = String.valueOf(body.getOrDefault("msgDigest", ""));
        }

        log.info("[顺丰回调] 收到推送 | msgType={} timestamp={}", msgType, timestamp);

        // 先记录原始回调日志
        IntegrationCallbackLog cbLog = recordService.saveCallbackLog("LOGISTICS", "SF", msgData, null);

        try {
            // Step 1: 验证签名（接入后取消注释）
            // String appKey = sfExpressProperties.getAppKey();
            // String appSecret = sfExpressProperties.getAppSecret();
            // String expectedDigest = SignatureUtils.buildSFSignature(msgData, timestamp, appKey, appSecret);
            // if (!expectedDigest.equals(msgDigest)) {
            //     log.warn("[顺丰回调] 签名验证失败");
            //     return "error";
            // }

            // Step 2: 解析推送类型
            if ("EXP_RECE_PUSH_ROUTE_EVNET".equals(msgType)) {
                handleSFRouteEvent(msgData);
            } else if ("EXP_RECE_WAYBILL_CANCEL".equals(msgType)) {
                handleSFCancelEvent(msgData);
            } else {
                log.info("[顺丰回调] 未处理的消息类型: {}", msgType);
            }

            recordService.updateCallbackResult(cbLog.getId(), true, true, null, null);
            return "success";
        } catch (Exception e) {
            log.error("[顺丰回调] 处理异常 | msgType={}", msgType, e);
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, e.getMessage());
            return "error";
        }
    }

    // =====================================================
    // 申通状态推送
    // =====================================================

    /**
     * 申通物流状态推送
     */
    @PostMapping("/sto")
    public Map<String, Object> stoCallback(@RequestBody Map<String, Object> body) {
        String trackingNumber = String.valueOf(body.getOrDefault("billCode", ""));
        String status = String.valueOf(body.getOrDefault("lastStatus", ""));
        String appKey = String.valueOf(body.getOrDefault("appKey", ""));
        String sign = String.valueOf(body.getOrDefault("sign", ""));

        log.info("[申通回调] 收到推送 | trackingNo={} status={}", trackingNumber, status);

        // 先记录原始回调日志
        IntegrationCallbackLog cbLog = recordService.saveCallbackLog("LOGISTICS", "STO", body.toString(), null);

        try {
            // Step 1: 验证签名（接入后取消注释）
            // String content = JSON.toJSONString(body.get("data"));
            // String expectedSign = SignatureUtils.buildSTOSignature(content, stoProperties.getAppKey(), stoProperties.getAppSecret());
            // if (!expectedSign.equals(sign)) {
            //     log.warn("[申通回调] 签名验证失败");
            //     return Map.of("code", "FAIL", "message", "签名错误");
            // }

            // Step 2: 处理状态更新
            handleSTOStatusUpdate(trackingNumber, status, body);

            recordService.updateCallbackResult(cbLog.getId(), true, true, trackingNumber, null);
            return Map.of("code", "SUCCESS", "message", "OK");
        } catch (Exception e) {
            log.error("[申通回调] 处理异常 | trackingNo={}", trackingNumber, e);
            recordService.updateCallbackResult(cbLog.getId(), false, false, null, e.getMessage());
            return Map.of("code", "FAIL", "message", e.getMessage());
        }
    }

    // =====================================================
    // 业务处理方法（接入后在这里实现）
    // =====================================================

    /**
     * 处理顺丰路由事件（运单状态变化）
     *
     * TODO: 接入后实现：
     * 1. 解析 msgData JSON（含运单号、路由节点、操作时间）
     * 2. 更新系统中对应运单的物流状态
     * 3. 如果状态是"已签收"，更新订单状态
     * 4. 发送物流更新通知给客户
     *
     * 顺丰路由状态码参考：
     * 1  = 揽收
     * 30 = 运输中
     * 36 = 到达目的地
     * 40 = 投递中
     * 80 = 已签收
     */
    private void handleSFRouteEvent(String msgData) {
        log.info("[顺丰路由事件] msgData={}", msgData);
        // 接入顺丰SDK后解析 msgData 获取运单号和状态，然后调用:
        // String trackingNumber = ...; String status = ...; LocalDateTime eventTime = ...;
        // recordService.updateLogisticsStatus(trackingNumber, "IN_TRANSIT", "顺丰路由更新", eventTime);
        // TODO: 解析 msgData，调用业务服务更新物流状态
        // ShipmentTrackService.updateTracking(trackingNumber, status, currentCity, operateTime);
    }

    /**
     * 处理顺丰取消事件
     */
    private void handleSFCancelEvent(String msgData) {
        log.info("[顺丰取消事件] msgData={}", msgData);
        // TODO: 标记运单为已取消
    }

    /**
     * 处理申通状态更新
     *
     * 申通状态码参考：
     * ACCEPT       = 已揽收
     * TRANSIT      = 运输中
     * DELIVERING   = 派送中
     * SIGNED       = 已签收
     * REJECTED     = 拒收
     */
    private void handleSTOStatusUpdate(String trackingNumber, String status,
                                        Map<String, Object> rawData) {
        log.info("[申通状态] trackingNo={} status={}", trackingNumber, status);
        // 将申通状态码映射为系统状态并保存
        String mappedStatus = switch (status) {
            case "ACCEPT" -> "IN_TRANSIT";
            case "TRANSIT" -> "IN_TRANSIT";
            case "DELIVERING" -> "IN_TRANSIT";
            case "SIGNED" -> "DELIVERED";
            case "REJECTED" -> "CANCELLED";
            default -> null;
        };
        if (mappedStatus != null && trackingNumber != null && !trackingNumber.isEmpty()) {
            recordService.updateLogisticsStatus(
                    trackingNumber, mappedStatus, "申通状态: " + status, LocalDateTime.now());
        }
        // TODO: 调用业务服务更新物流状态
    }
}
