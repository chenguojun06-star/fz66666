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
public class EMSAdapter implements LogisticsService {

    @Override
    public String getCompanyName() {
        return "中国邮政";
    }

    @Override
    public String getCompanyCode() {
        return "EMS";
    }

    @Override
    public LogisticsType getLogisticsType() {
        return LogisticsType.EMS;
    }

    @Override
    public ShippingResponse createShipment(ShippingRequest request) throws LogisticsException {
        String mockNo = "EM" + System.currentTimeMillis();
        log.info("[EMS] Mock模式 创建运单 | orderId={} trackingNo={}", request.getOrderId(), mockNo);
        return ShippingResponse.success(request.getOrderId(), mockNo, "EMS");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        log.info("[EMS] Mock模式 取消运单 | trackingNumber={}", trackingNumber);
        return true;
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        log.info("[EMS] Mock模式 查询轨迹 | trackingNumber={}", trackingNumber);
        return mockTrackingData("北京处理中心→广州");
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        log.info("[EMS] Mock模式 运费估算 | orderId={}", request.getOrderId());
        return 2000L;
    }

    @Override
    public boolean validateAddress(String province, String city, String district) {
        return true;
    }

    private List<TrackingInfo> mockTrackingData(String route) {
        List<TrackingInfo> tracks = new ArrayList<>();
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(3))
                .description("邮件已从处理中心发出，路线：" + route)
                .location("北京市")
                .status(TrackingInfo.TrackingStatus.IN_TRANSIT)
                .build());
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(1))
                .description("邮件已到达投递局")
                .location("广州市")
                .status(TrackingInfo.TrackingStatus.OUT_FOR_DELIVERY)
                .build());
        return tracks;
    }
}