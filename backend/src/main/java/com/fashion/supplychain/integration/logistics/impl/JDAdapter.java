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
public class JDAdapter implements LogisticsService {

    @Override
    public String getCompanyName() {
        return "京东物流";
    }

    @Override
    public String getCompanyCode() {
        return "JD";
    }

    @Override
    public LogisticsType getLogisticsType() {
        return LogisticsType.JD;
    }

    @Override
    public ShippingResponse createShipment(ShippingRequest request) throws LogisticsException {
        String mockNo = "JD" + System.currentTimeMillis();
        log.info("[京东] Mock模式 创建运单 | orderId={} trackingNo={}", request.getOrderId(), mockNo);
        return ShippingResponse.success(request.getOrderId(), mockNo, "JD");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        log.info("[京东] Mock模式 取消运单 | trackingNumber={}", trackingNumber);
        return true;
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        log.info("[京东] Mock模式 查询轨迹 | trackingNumber={}", trackingNumber);
        return mockTrackingData("北京亚洲一号→广州黄埔");
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        log.info("[京东] Mock模式 运费估算 | orderId={}", request.getOrderId());
        return 1600L;
    }

    @Override
    public boolean validateAddress(String province, String city, String district) {
        return true;
    }

    private List<TrackingInfo> mockTrackingData(String route) {
        List<TrackingInfo> tracks = new ArrayList<>();
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(2))
                .description("包裹已从仓库出库，路线：" + route)
                .location("北京市")
                .status(TrackingInfo.TrackingStatus.IN_TRANSIT)
                .build());
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(1))
                .description("包裹已到达配送站，快递员正在派送")
                .location("广州市")
                .status(TrackingInfo.TrackingStatus.OUT_FOR_DELIVERY)
                .build());
        return tracks;
    }
}