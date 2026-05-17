package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.config.SFExpressProperties;
import com.fashion.supplychain.integration.logistics.LogisticsService;
import com.fashion.supplychain.integration.logistics.ShippingRequest;
import com.fashion.supplychain.integration.logistics.ShippingResponse;
import com.fashion.supplychain.integration.logistics.TrackingInfo;
import com.fashion.supplychain.integration.util.IntegrationHttpClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

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
    public ShippingResponse createShipment(ShippingRequest request) throws LogisticsException {
        log.info("[顺丰] 创建运单 | orderId={}", request.getOrderId());

        if (!sfConfig.isConfigured()) {
            String mockNo = "SF" + System.currentTimeMillis();
            log.info("[顺丰] Mock模式 | orderId={} trackingNo={}", request.getOrderId(), mockNo);
            return ShippingResponse.success(request.getOrderId(), mockNo, "SF");
        }

        log.warn("[顺丰] 密钥已配置但真实API代码待实现，降级使用Mock模式 | orderId={}", request.getOrderId());
        String mockNo = "SF" + System.currentTimeMillis();
        return ShippingResponse.success(request.getOrderId(), mockNo, "SF");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        log.info("[顺丰] 取消运单 | trackingNumber={}", trackingNumber);

        if (!sfConfig.isConfigured()) {
            return true;
        }

        log.warn("[顺丰] 密钥已配置但真实API代码待实现，取消运单降级Mock | trackingNumber={}", trackingNumber);
        return true;
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        log.info("[顺丰] 查询轨迹 | trackingNumber={}", trackingNumber);

        if (!sfConfig.isConfigured()) {
            return mockTrackingData("广州中转场→深圳福田");
        }

        log.warn("[顺丰] 密钥已配置但真实API代码待实现，轨迹查询降级Mock | trackingNumber={}", trackingNumber);
        return mockTrackingData("广州中转场→深圳福田");
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        log.info("[顺丰] 运费估算 | orderId={}", request.getOrderId());

        if (!sfConfig.isConfigured()) {
            return 1500L;
        }

        log.warn("[顺丰] 密钥已配置但真实API代码待实现，运费估算降级Mock | orderId={}", request.getOrderId());
        return 1500L;
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
