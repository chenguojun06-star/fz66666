package com.fashion.supplychain.integration.logistics.callback;

import com.fashion.supplychain.integration.config.SFExpressProperties;
import com.fashion.supplychain.integration.config.STOProperties;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.integration.record.entity.IntegrationCallbackLog;
import com.fashion.supplychain.integration.record.service.IntegrationRecordService;
import com.fashion.supplychain.integration.util.SignatureUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
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
    private final EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    @Value("${spring.profiles.active:dev}")
    private String activeProfile;

    @Autowired(required = false)
    private SFExpressProperties sfExpressProperties;

    @Autowired(required = false)
    private STOProperties stoProperties;

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
            // Step 1: 验证签名
            String appKey = sfExpressProperties != null ? sfExpressProperties.getAppKey() : null;
            String appSecret = sfExpressProperties != null ? sfExpressProperties.getAppSecret() : null;
            if (appKey != null && appSecret != null && !appKey.isEmpty() && !appSecret.isEmpty()) {
                // 顺丰签名 = Base64(MD5(msgData + timestamp + 客户校验码))，appKey 不参与
                String expectedDigest = SignatureUtils.buildSFSignature(msgData, timestamp, appSecret);
                if (!expectedDigest.equals(msgDigest)) {
                    log.warn("[顺丰回调] 签名验证失败");
                    recordService.updateCallbackResult(cbLog.getId(), false, false, null, "签名验证失败");
                    return "error";
                }
            } else if (isProdProfile()) {
                log.error("[顺丰回调] 生产环境密钥未配置，拒绝请求");
                recordService.updateCallbackResult(cbLog.getId(), false, false, null, "生产环境密钥未配置");
                return "error";
            } else {
                log.warn("[顺丰回调] 密钥未配置，跳过签名验证（仅限开发环境）");
            }

            // Step 2: 解析推送类型
            // handled=false 表示"报文收到且签名通过，但没有真正处理业务"——必须如实标记，
            // 否则 processed=1 会让这条回调日志看起来一切正常，掩盖"轨迹从未更新"的事实，
            // 也剥夺了 IntegrationCallbackLog 设计的"processed=0 可人工补跑"能力。
            boolean handled;
            if ("EXP_RECE_PUSH_ROUTE_EVNET".equals(msgType)) {
                handled = handleSFRouteEvent(msgData);
            } else if ("EXP_RECE_WAYBILL_CANCEL".equals(msgType)) {
                handled = handleSFCancelEvent(msgData);
            } else {
                log.info("[顺丰回调] 未处理的消息类型: {}", msgType);
                handled = false;
            }

            if (handled) {
                recordService.updateCallbackResult(cbLog.getId(), true, true, null, null);
            } else {
                log.warn("[顺丰回调] 报文已接收但未产生业务处理 | msgType={}（需接入顺丰SDK后补跑）", msgType);
                recordService.updateCallbackResult(cbLog.getId(), true, false, null,
                        "处理器未接入（顺丰SDK），本次未更新任何物流状态");
            }
            // 无论是否处理，都回 "success"：顺丰以响应体判定成败，
            // 回 error 会触发无意义的重推；未处理的记录已落库待人工补跑。
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
        String sign = String.valueOf(body.getOrDefault("sign", ""));

        log.info("[申通回调] 收到推送 | trackingNo={} status={}", trackingNumber, status);

        // 先记录原始回调日志
        IntegrationCallbackLog cbLog = recordService.saveCallbackLog("LOGISTICS", "STO", body.toString(), null);

        try {
            // Step 1: 验证签名
            String stoAppKey = stoProperties != null ? stoProperties.getAppKey() : null;
            String stoAppSecret = stoProperties != null ? stoProperties.getAppSecret() : null;
            if (stoAppKey != null && stoAppSecret != null && !stoAppKey.isEmpty() && !stoAppSecret.isEmpty()) {
                String content = body.get("data") != null ? body.get("data").toString() : "";
                String expectedSign = SignatureUtils.buildSTOSignature(content, stoAppKey, stoAppSecret);
                if (!expectedSign.equals(sign)) {
                    log.warn("[申通回调] 签名验证失败");
                    recordService.updateCallbackResult(cbLog.getId(), false, false, null, "签名验证失败");
                    return Map.of("code", "FAIL", "message", "签名错误");
                }
            } else if (isProdProfile()) {
                log.error("[申通回调] 生产环境密钥未配置，拒绝请求");
                recordService.updateCallbackResult(cbLog.getId(), false, false, null, "生产环境密钥未配置");
                return Map.of("code", "FAIL", "message", "密钥未配置");
            } else {
                log.warn("[申通回调] 密钥未配置，跳过签名验证（仅限开发环境）");
            }

            // Step 2: 处理状态更新
            // 返回 null = 完整处理；返回字符串 = 未完整处理的原因（verified=true 但 processed=false）
            String unhandledReason = handleSTOStatusUpdate(trackingNumber, status, body);

            if (unhandledReason == null) {
                recordService.updateCallbackResult(cbLog.getId(), true, true, trackingNumber, null);
            } else {
                log.warn("[申通回调] 报文已接收但未完整处理 | trackingNo={} status={} reason={}",
                        trackingNumber, status, unhandledReason);
                recordService.updateCallbackResult(cbLog.getId(), true, false, trackingNumber, unhandledReason);
            }
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
     * 接入顺丰OpenAPI SDK 后实现：
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
     *
     * @return 是否真正完成了业务处理。当前<b>恒为 false</b>：顺丰 SDK 未接入，
     *         msgData 无法解密，拿不到运单号与状态码，因此不做任何状态更新，
     *         也不把回调日志标成"已处理"。
     */
    private boolean handleSFRouteEvent(String msgData) {
        log.warn("[顺丰路由事件] 收到推送但处理器未接入，未更新任何物流状态 | msgDataLength={}",
                msgData == null ? 0 : msgData.length());
        // 接入顺丰OpenAPI SDK 后，替换以下占位逻辑：
        // 1. 用 SF SDK 解密 msgData，获取 waybillNo（运单号）、opCode（状态码）、opTime
        // 2. 将 opCode 映射为系统状态（1=IN_TRANSIT, 40=IN_TRANSIT, 80=DELIVERED）
        // 3. 调用 updateLogisticsStatus 写 DB
        //
        // 示例骨架（SDK 接入后取消注释，并把本方法改为 return true）：
        // SFRouteEventData event = SFSdkUtils.decryptRouteEvent(msgData, sfExpressProperties.getAppSecret());
        // String trackingNumber = event.getWaybillNo();
        // String status = event.getOpCode() == 80 ? "DELIVERED" : "IN_TRANSIT";
        // LocalDateTime eventTime = event.getOpTime();
        // recordService.updateLogisticsStatus(trackingNumber, status, "顺丰路由: " + event.getOpCode(), eventTime);
        // if ("DELIVERED".equals(status)) {
        //     ecommerceOrderOrchestrator.onLogisticsDelivered(trackingNumber, "SF", eventTime);
        // }
        // return true;
        return false;
    }

    /**
     * 处理顺丰取消事件
     *
     * @return 是否真正完成了业务处理。当前恒为 false（同上，SDK 未接入）。
     */
    private boolean handleSFCancelEvent(String msgData) {
        log.warn("[顺丰取消事件] 收到推送但处理器未接入，未标记任何运单取消 | msgDataLength={}",
                msgData == null ? 0 : msgData.length());
        return false;
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
     *
     * @return {@code null} 表示已完整处理（运单状态已写、签收时电商侧也已回写）；
     *         非 null 表示未完整处理的原因——调用方据此把回调日志标为 processed=false，
     *         保留人工补跑的可能，而不是假装成功。
     */
    private String handleSTOStatusUpdate(String trackingNumber, String status,
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
        if (mappedStatus == null) {
            return "未识别的申通状态码: " + status;
        }
        if (trackingNumber == null || trackingNumber.isEmpty()) {
            return "报文缺少运单号(billCode)";
        }
        recordService.updateLogisticsStatus(
                trackingNumber, mappedStatus, "申通状态: " + status, LocalDateTime.now());
        if ("DELIVERED".equals(mappedStatus)) {
            try {
                int updated = ecommerceOrderOrchestrator.onLogisticsDeliveredByTrackingNo(
                        trackingNumber, "STO", LocalDateTime.now());
                log.info("[申通签收] 已更新 {} 个电商订单状态", updated);
            } catch (Exception e) {
                // 运单状态已写入，但电商侧回写失败——链路只走了一半，必须如实上报
                log.error("[申通签收] 回写电商订单状态失败 | trackingNo={}", trackingNumber, e);
                return "运单状态已更新，但电商订单回写失败: " + e.getMessage();
            }
        }
        return null;
    }

    private boolean isProdProfile() {
        return activeProfile != null && activeProfile.contains("prod");
    }
}
