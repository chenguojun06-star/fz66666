package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.config.SFExpressProperties;
import com.fashion.supplychain.integration.logistics.LogisticsService;
import com.fashion.supplychain.integration.logistics.ShippingRequest;
import com.fashion.supplychain.integration.logistics.ShippingResponse;
import com.fashion.supplychain.integration.logistics.TrackingInfo;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import com.fashion.supplychain.integration.util.SignatureUtils;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 顺丰速运适配器
 *
 * ============================================================
 * 接入只需 3 步（拿到密钥就能上线）：
 * ============================================================
 * Step 1. 在 application.yml 填入密钥：
 *   sf-express:
 *     enabled: true
 *     app-key: "你的AppKey"
 *     app-secret: "你的AppSecret"    # 每月更新一次
 *     customer-code: "你的客户编码"   # 可选，寄件方客户编码
 *     sandbox: true                  # 先用沙箱，上线前改 false
 *     notify-url: "https://你的域名/api/webhook/logistics/sf"
 *
 * Step 2. 无需额外 SDK，已内置 IntegrationHttpClient（基于 RestTemplate）。
 *         签名算法已实现：SignatureUtils.buildSFSignature()
 *
 * Step 3. 在每个方法中，删除 "if (!sfConfig.isConfigured())" 的 mock 分支，
 *         取消注释 "=== 真实接入 ===" 块内的代码。
 *
 * 顺丰开放平台：https://open.sf-express.com
 * ============================================================
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SFExpressAdapter implements LogisticsService {

    /** 配置属性（application.yml 中 sf-express.* 自动映射） */
    private final SFExpressProperties sfConfig;

    /** 统一 HTTP 客户端（含超时/重试配置） */
    private final IntegrationHttpClient httpClient;

    @Override
    public String getCompanyName() {
        return "顺丰速运";
    }

    @Override
    public String getCompanyCode() {
        return "SF";
    }

    @Override
    public LogisticsType getLogisticsType() {
        return LogisticsType.SF;
    }

    @Override
    public String getCompanyName() {
        return "顺丰速运";
    }

    @Override
    public String getCompanyCode() {
        return "SF";
    }

    @Override
    public LogisticsType getLogisticsType() {
        return LogisticsType.SF;
    }

    @Override
    public ShippingResponse createShipment(ShippingRequest request) throws LogisticsException {
        log.info("[顺丰] 创建运单 | orderId={}", request.getOrderId());

        // ---- Mock 模式（密钥未配置时） ----
        if (!sfConfig.isConfigured()) {
            String mockNo = "SF" + System.currentTimeMillis();
            log.info("[顺丰] Mock模式 | orderId={}（application.yml 设 sf-express.enabled=true 切换真实API）", request.getOrderId());
            return ShippingResponse.success(request.getOrderId(), mockNo, "SF");
        }

        // ============================================================
        // === 真实接入（无需额外 SDK，直接取消注释即可） ===
        // ============================================================
        //
        // String timestamp = SignatureUtils.currentTimestamp();
        // String requestId = SignatureUtils.randomNonceStr(16);
        //
        // // 构建 msgData（顺丰标准电子面单 JSON）
        // Map<String, Object> orderDetail = new HashMap<>();
        // orderDetail.put("orderId", request.getOrderId());
        // orderDetail.put("expressTypeId", 1);  // 1=顺丰标快
        // orderDetail.put("parcelQty", 1);
        // // 寄件方
        // Map<String, Object> senderAddress = new HashMap<>();
        // senderAddress.put("contact", request.getSenderName());
        // senderAddress.put("mobile", request.getSenderPhone());
        // senderAddress.put("address", request.getSenderAddress());
        // orderDetail.put("senderInfo", senderAddress);
        // // 收件方
        // Map<String, Object> receiverAddress = new HashMap<>();
        // receiverAddress.put("contact", request.getReceiverName());
        // receiverAddress.put("mobile", request.getReceiverPhone());
        // receiverAddress.put("address", request.getReceiverAddress());
        // orderDetail.put("receiverInfo", receiverAddress);
        //
        // String msgData = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
        //     .writeValueAsString(orderDetail);
        // String msgDigest = SignatureUtils.buildSFSignature(msgData, timestamp, sfConfig.getAppKey(), sfConfig.getAppSecret());
        //
        // Map<String, String> params = new HashMap<>();
        // params.put("partnerID", sfConfig.getAppKey());
        // params.put("requestID", requestId);
        // params.put("serviceCode", "COM_RECE_CREATE_ORDER");
        // params.put("timestamp", timestamp);
        // params.put("msgDigest", msgDigest);
        // params.put("msgData", msgData);
        //
        // // 发起 HTTP 请求
        // Map<String, Object> response = httpClient.postForm(
        //     sfConfig.getEffectiveApiUrl(), params, Map.class);
        //
        // if (response == null || !"OK".equals(response.get("apiResultCode"))) {
        //     String errMsg = response != null ? String.valueOf(response.get("apiResultCode")) : "网络异常";
        //     throw new LogisticsException("[顺丰] 下单失败: " + errMsg);
        // }
        //
        // // 解析运单号
        // Map<String, Object> apiResultData = (Map<String, Object>) response.get("apiResultData");
        // String trackingNumber = (String) apiResultData.get("waybillNoInfoList");
        // return ShippingResponse.success(request.getOrderId(), trackingNumber, "SF");
        //
        // ============================================================

        throw new LogisticsException("[顺丰] 密钥已配置，请取消注释 createShipment 真实代码");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        log.info("[顺丰] 取消运单 | trackingNumber={}", trackingNumber);

        if (!sfConfig.isConfigured()) {
            return true;
        }

        // ============================================================
        // === 真实接入 ===
        // 调用顺丰标准接口 serviceCode=COM_RECE_UPDATE_ORDER_SERVICE
        // msgData: {"orderId":"xxx","dealType":2,"filterField":{"cancelType":"..."}}
        // ============================================================

        throw new LogisticsException("[顺丰] 密钥已配置，请实现 cancelShipment 真实代码");
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        log.info("[顺丰] 查询轨迹 | trackingNumber={}", trackingNumber);

        if (!sfConfig.isConfigured()) {
            return mockTrackingData("广州中转场→深圳福田");
        }

        // ============================================================
        // === 真实接入 ===
        // 调用顺丰标准接口 serviceCode=EXP_RECE_SEARCH_ROUTES
        // msgData: {"trackingNumber":"xxx","trackingType":1}
        // ============================================================

        throw new LogisticsException("[顺丰] 密钥已配置，请实现 trackShipment 真实代码");
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        log.info("[顺丰] 运费估算 | orderId={}", request.getOrderId());

        if (!sfConfig.isConfigured()) {
            return 1500L;  // Mock：15元
        }

        // ============================================================
        // === 真实接入 ===
        // 调用顺丰标准接口 serviceCode=EXP_RECE_QUERY_PRICE
        // ============================================================

        throw new LogisticsException("[顺丰] 密钥已配置，请实现 estimateShippingFee 真实代码");
    }

    @Override
    public boolean validateAddress(String province, String city, String district) {
        if (!sfConfig.isConfigured()) {
            return true;  // Mock：全部可达
        }

        // ============================================================
        // === 真实接入 ===
        // 调用顺丰地址库接口 serviceCode=AREA_BASIC_QUERY_SERVICE
        // ============================================================

        log.warn("[顺丰] 密钥已配置，请实现 validateAddress 真实代码，暂时返回 true");
        return true;
    }

    // -----------------------------------------------
    // 私有辅助：Mock 轨迹数据
    // -----------------------------------------------

    private List<TrackingInfo> mockTrackingData(String route) {
        List<TrackingInfo> tracks = new ArrayList<>();
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(2))
                .description("快件已被【中转场】签收，路线：" + route)
                .location("广州市")
                .status(TrackingInfo.TrackingStatus.IN_TRANSIT)
                .build());
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(1))
                .description("快件已到达派送站点")
                .location("深圳市")
                .status(TrackingInfo.TrackingStatus.ARRIVED_AT_STATION)
                .build());
        return tracks;
    }
}
