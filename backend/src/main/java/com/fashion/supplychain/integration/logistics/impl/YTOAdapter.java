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

@Slf4j
@Service
public class YTOAdapter implements LogisticsService {

    @Override
    public String getCompanyName() {
        return "圆通速递";
    }

    @Override
    public String getCompanyCode() {
        return "YTO";
    }

    @Override
    public LogisticsType getLogisticsType() {
        return LogisticsType.YTO;
    }

    @Override
    public ShippingResponse createShipment(ShippingRequest request) throws LogisticsException {
        String mockNo = "YT" + System.currentTimeMillis();
        log.info("[圆通] Mock模式 创建运单 | orderId={} trackingNo={}", request.getOrderId(), mockNo);
        return ShippingResponse.success(request.getOrderId(), mockNo, "YTO");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        log.info("[圆通] Mock模式 取消运单 | trackingNumber={}", trackingNumber);
        return true;
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        log.info("[圆通] Mock模式 查询轨迹 | trackingNumber={}", trackingNumber);
        return mockTrackingData("上海转运中心→杭州");
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        log.info("[圆通] Mock模式 运费估算 | orderId={}", request.getOrderId());
        return 1200L;
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
                .description("快件已到达目的地分拨中心")
                .location("杭州市")
                .status(TrackingInfo.TrackingStatus.ARRIVED_AT_STATION)
                .build());
        return tracks;
    }
}