package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import com.fashion.supplychain.integration.logistics.ShippingRequest;
import com.fashion.supplychain.integration.logistics.ShippingResponse;
import com.fashion.supplychain.integration.logistics.TrackingInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * 极兔速递适配器（Mock 模式）
 * 后续对接真实 API 时，替换 trackShipment / createShipment 实现即可。
 */
@Slf4j
@Service
public class JTAdapter implements LogisticsService {

    @Override
    public String getCompanyName() {
        return "极兔速递";
    }

    @Override
    public String getCompanyCode() {
        return "JT";
    }

    @Override
    public LogisticsType getLogisticsType() {
        return LogisticsType.JT;
    }

    @Override
    public ShippingResponse createShipment(ShippingRequest request) throws LogisticsException {
        String mockNo = "JT" + System.currentTimeMillis();
        log.info("[极兔] Mock模式 创建运单 | orderId={} trackingNo={}", request.getOrderId(), mockNo);
        return ShippingResponse.success(request.getOrderId(), mockNo, "JT");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        log.info("[极兔] Mock模式 取消运单 | trackingNumber={}", trackingNumber);
        return true;
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        log.info("[极兔] Mock模式 查询轨迹 | trackingNumber={}", trackingNumber);
        return mockTrackingData("上海转运中心→深圳");
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        log.info("[极兔] Mock模式 运费估算 | orderId={}", request.getOrderId());
        return 650L;
    }

    @Override
    public boolean validateAddress(String province, String city, String district) {
        return true;
    }

    private List<TrackingInfo> mockTrackingData(String route) {
        List<TrackingInfo> tracks = new ArrayList<>();
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(2))
                .description("快件已从转运中心发出，路线：" + route)
                .location("上海市")
                .status(TrackingInfo.TrackingStatus.IN_TRANSIT)
                .build());
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(1))
                .description("快件已到达目的地网点")
                .location("深圳市")
                .status(TrackingInfo.TrackingStatus.ARRIVED_AT_STATION)
                .build());
        return tracks;
    }
}
