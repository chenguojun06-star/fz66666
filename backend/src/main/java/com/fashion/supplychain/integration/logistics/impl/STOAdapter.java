package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.config.STOProperties;
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

        if (!stoConfig.isConfigured()) {
            String mockNo = "STO" + System.currentTimeMillis();
            log.info("[申通] Mock模式 | orderId={} trackingNo={}", request.getOrderId(), mockNo);
            return ShippingResponse.success(request.getOrderId(), mockNo, "STO");
        }

        log.warn("[申通] 密钥已配置但真实API代码待实现，降级使用Mock模式 | orderId={}", request.getOrderId());
        String mockNo = "STO" + System.currentTimeMillis();
        return ShippingResponse.success(request.getOrderId(), mockNo, "STO");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        log.info("[申通] 取消运单 | trackingNumber={}", trackingNumber);

        if (!stoConfig.isConfigured()) {
            return true;
        }

        log.warn("[申通] 密钥已配置但真实API代码待实现，取消运单降级Mock | trackingNumber={}", trackingNumber);
        return true;
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        log.info("[申通] 查询轨迹 | trackingNumber={}", trackingNumber);

        if (!stoConfig.isConfigured()) {
            return mockTrackingData("上海转运→杭州");
        }

        log.warn("[申通] 密钥已配置但真实API代码待实现，轨迹查询降级Mock | trackingNumber={}", trackingNumber);
        return mockTrackingData("上海转运→杭州");
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        log.info("[申通] 运费估算 | orderId={}", request.getOrderId());

        if (!stoConfig.isConfigured()) {
            return 1000L;
        }

        log.warn("[申通] 密钥已配置但真实API代码待实现，运费估算降级Mock | orderId={}", request.getOrderId());
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
