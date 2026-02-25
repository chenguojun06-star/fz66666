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
 * 申通快递适配器
 *
 * 后期接入步骤：
 * 1. 申请申通开放平台账号（http://open.sto.cn）
 * 2. 获取API密钥（AppKey、AppSecret）
 * 3. 在 application.yml 配置密钥信息
 * 4. 实现下面的方法逻辑
 *
 * 参考文档：http://open.sto.cn/api-doc
 */
@Slf4j
@Service
public class STOAdapter implements LogisticsService {

    // TODO: 后期从配置文件注入
    // @Value("${sto.app-key}")
    // private String appKey;

    // @Value("${sto.app-secret}")
    // private String appSecret;

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
        log.info("[申通] 创建运单: orderId={}", request.getOrderId());

        // TODO: 实现申通下单逻辑
        // 1. 构建电子面单请求
        // 2. 签名并调用申通API
        // 3. 解析返回的运单号

        // 临时返回模拟数据
        log.warn("[申通] 当前为模拟实现，需接入真实API");
        String mockTrackingNumber = "STO" + System.currentTimeMillis();
        return ShippingResponse.success(request.getOrderId(), mockTrackingNumber, "STO");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        log.info("[申通] 取消运单: trackingNumber={}, reason={}", trackingNumber, reason);

        // TODO: 实现申通取消运单逻辑

        // 临时返回模拟数据
        log.warn("[申通] 当前为模拟实现，需接入真实API");
        return true;
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        log.info("[申通] 查询物流轨迹: trackingNumber={}", trackingNumber);

        // TODO: 实现申通路由查询逻辑

        // 临时返回模拟数据
        log.warn("[申通] 当前为模拟实现，需接入真实API");
        List<TrackingInfo> tracks = new ArrayList<>();
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(3))
                .description("您的快件已由【上海转运中心】发出")
                .location("上海市")
                .status(TrackingInfo.TrackingStatus.IN_TRANSIT)
                .build());
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(1))
                .description("快件已到达【杭州分拨中心】")
                .location("杭州市")
                .status(TrackingInfo.TrackingStatus.ARRIVED_AT_STATION)
                .build());
        return tracks;
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        log.info("[申通] 运费估算: orderId={}", request.getOrderId());

        // TODO: 实现申通运费计算逻辑

        // 临时返回模拟数据（10元）
        log.warn("[申通] 当前为模拟实现，需接入真实API");
        return 1000L;
    }

    @Override
    public boolean validateAddress(String province, String city, String district) {
        log.info("[申通] 验证地址: {}-{}-{}", province, city, district);

        // TODO: 实现申通地址校验逻辑

        // 临时返回true
        log.warn("[申通] 当前为模拟实现，需接入真实API");
        return true;
    }
}
