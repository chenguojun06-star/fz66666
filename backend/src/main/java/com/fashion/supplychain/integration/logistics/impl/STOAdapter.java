package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.config.STOProperties;
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
 * 申通快递适配器
 *
 * ============================================================
 * 接入只需 3 步（拿到密钥就能上线）：
 * ============================================================
 * Step 1. 在 application.yml 填入密钥：
 *   sto-express:
 *     enabled: true
 *     app-key: "你的AppKey"
 *     app-secret: "你的AppSecret"
 *     partner-id: "你的partnerId"  # 可选
 *     sandbox: true
 *     notify-url: "https://你的域名/api/webhook/logistics/sto"
 *
 * Step 2. 无需额外 SDK，已内置 IntegrationHttpClient（基于 RestTemplate）。
 *         签名算法已实现：SignatureUtils.buildSTOSignature()
 *
 * Step 3. 在每个方法中，删除 "if (!stoConfig.isConfigured())" 的 mock 分支，
 *         取消注释 "=== 真实接入 ===" 块内的代码。
 *
 * 申通开放平台：https://open.sto.cn
 * ============================================================
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class STOAdapter implements LogisticsService {

    /** 配置属性（application.yml 中 sto-express.* 自动映射） */
    private final STOProperties stoConfig;

    /** 统一 HTTP 客户端（含超时/重试配置） */
    private final IntegrationHttpClient httpClient;

    @Override
    public String getCompanyName() {
        return "申通快递";
    }

    @Override
    public String getCompanyCode() {
        return "STO";
    }

    @Override
    public LogisticsType getLogisticsType() {
        return LogisticsType.STO;
    }

    @Override
    public ShippingResponse createShipment(ShippingRequest request) throws LogisticsException {
        log.info("[申通] 创建运单 | orderId={}", request.getOrderId());

        // ---- Mock 模式（密钥未配置时） ----
        if (!stoConfig.isConfigured()) {
            String mockNo = "STO" + System.currentTimeMillis();
            log.info("[申通] Mock模式 | orderId={}（application.yml 设 sto-express.enabled=true 切换真实API）", request.getOrderId());
            return ShippingResponse.success(request.getOrderId(), mockNo, "STO");
        }

        // ============================================================
        // === 真实接入（无需额外 SDK，直接取消注释即可） ===
        // ============================================================
        //
        // String timestamp = SignatureUtils.currentTimestamp();
        //
        // // 构建申通订单报文（电子面单接口）
        // Map<String, Object> orderContent = new HashMap<>();
        // orderContent.put("order_id", request.getOrderId());
        // orderContent.put("express_type", "标准快递");
        // // 寄件方
        // Map<String, String> fromInfo = new HashMap<>();
        // fromInfo.put("name", request.getSenderName());
        // fromInfo.put("mobile", request.getSenderPhone());
        // fromInfo.put("address", request.getSenderAddress());
        // orderContent.put("from", fromInfo);
        // // 收件方
        // Map<String, String> toInfo = new HashMap<>();
        // toInfo.put("name", request.getReceiverName());
        // toInfo.put("mobile", request.getReceiverPhone());
        // toInfo.put("address", request.getReceiverAddress());
        // orderContent.put("to", toInfo);
        //
        // String content = com.fasterxml.jackson.databind.json.JsonMapper.builder().build()
        //     .writeValueAsString(orderContent);
        // String sign = SignatureUtils.buildSTOSignature(content, stoConfig.getAppKey(), stoConfig.getAppSecret());
        //
        // Map<String, String> params = new HashMap<>();
        // params.put("from_appkey", stoConfig.getAppKey());
        // params.put("to_appkey", "sto_to_wms");
        // params.put("to_session_key", "sto_to_wms_session");
        // params.put("logistics_interface", content);
        // params.put("data_digest", sign);
        //
        // Map<String, Object> response = httpClient.postForm(
        //     stoConfig.getEffectiveApiUrl() + "getElectrLabel", params, Map.class);
        //
        // if (response == null || !"200".equals(String.valueOf(response.get("resultCode")))) {
        //     String errMsg = response != null ? String.valueOf(response.get("message")) : "网络异常";
        //     throw new LogisticsException("[申通] 下单失败: " + errMsg);
        // }
        //
        // // 解析运单号
        // Map<String, Object> resultData = (Map<String, Object>) response.get("resultData");
        // String trackingNumber = (String) resultData.get("bigPencel");
        // return ShippingResponse.success(request.getOrderId(), trackingNumber, "STO");
        //
        // ============================================================

        throw new LogisticsException("[申通] 密钥已配置，请取消注释 createShipment 真实代码");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        log.info("[申通] 取消运单 | trackingNumber={}", trackingNumber);

        if (!stoConfig.isConfigured()) {
            return true;
        }

        // ============================================================
        // === 真实接入 ===
        // 调用申通取消运单接口：cancelOrder
        // params: from_appkey, logistics_interface (含 orderNo), data_digest
        // ============================================================

        throw new LogisticsException("[申通] 密钥已配置，请实现 cancelShipment 真实代码");
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        log.info("[申通] 查询轨迹 | trackingNumber={}", trackingNumber);

        if (!stoConfig.isConfigured()) {
            return mockTrackingData("上海转运→杭州");
        }

        // ============================================================
        // === 真实接入 ===
        // 调用申通路由查询接口：queryOrderResult
        // params: from_appkey, logistics_interface (含 billCode), data_digest
        // ============================================================

        throw new LogisticsException("[申通] 密钥已配置，请实现 trackShipment 真实代码");
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        log.info("[申通] 运费估算 | orderId={}", request.getOrderId());

        if (!stoConfig.isConfigured()) {
            return 1000L;  // Mock：10元
        }

        // ============================================================
        // === 真实接入 ===
        // 申通暂不提供标准运费估算接口，可根据区域和重量自行计算
        // ============================================================

        log.warn("[申通] 密钥已配置，运费估算暂用固定值，请根据实际情况实现");
        return 1000L;
    }

    @Override
    public boolean validateAddress(String province, String city, String district) {
        if (!stoConfig.isConfigured()) {
            return true;
        }

        // ============================================================
        // === 真实接入 ===
        // 申通暂不提供公开地址验证接口，可维护内部区域表
        // ============================================================

        return true;
    }

    // -----------------------------------------------
    // 私有辅助：Mock 轨迹数据
    // -----------------------------------------------

    private List<TrackingInfo> mockTrackingData(String route) {
        List<TrackingInfo> tracks = new ArrayList<>();
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(3))
                .description("您的快件已由转运中心发出，路线：" + route)
                .location("上海市")
                .status(TrackingInfo.TrackingStatus.IN_TRANSIT)
                .build());
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(1))
                .description("快件已到达分拨中心，等待派送")
                .location("杭州市")
                .status(TrackingInfo.TrackingStatus.ARRIVED_AT_STATION)
                .build());
        return tracks;
    }
}
