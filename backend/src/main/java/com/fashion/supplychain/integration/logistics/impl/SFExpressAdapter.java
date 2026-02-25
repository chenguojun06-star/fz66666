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
 * 顺丰速运适配器
 *
 * 后期接入步骤：
 * 1. 申请顺丰开放平台账号（https://open.sf-express.com）
 * 2. 获取API密钥（AppKey、AppSecret）
 * 3. 引入顺丰SDK或使用HTTP客户端
 * 4. 在 application.yml 配置密钥信息
 * 5. 实现下面的方法逻辑
 *
 * 参考文档：https://open.sf-express.com/developSupport/734349
 */
@Slf4j
@Service
public class SFExpressAdapter implements LogisticsService {

    // TODO: 后期从配置文件注入
    // @Value("${sf.app-key}")
    // private String appKey;

    // @Value("${sf.app-secret}")
    // private String appSecret;

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
        log.info("[顺丰] 创建运单: orderId={}", request.getOrderId());

        // TODO: 实现顺丰下单逻辑
        // 1. 构建下单请求（BSP标准接口）
        // 2. 签名并调用顺丰API
        // 3. 解析返回的运单号

        // 临时返回模拟数据
        log.warn("[顺丰] 当前为模拟实现，需接入真实API");
        String mockTrackingNumber = "SF" + System.currentTimeMillis();
        return ShippingResponse.success(request.getOrderId(), mockTrackingNumber, "SF");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        log.info("[顺丰] 取消运单: trackingNumber={}, reason={}", trackingNumber, reason);

        // TODO: 实现顺丰取消运单逻辑
        // 调用顺丰取消接口

        // 临时返回模拟数据
        log.warn("[顺丰] 当前为模拟实现，需接入真实API");
        return true;
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        log.info("[顺丰] 查询物流轨迹: trackingNumber={}", trackingNumber);

        // TODO: 实现顺丰路由查询逻辑
        // 调用顺丰路由查询接口

        // 临时返回模拟数据
        log.warn("[顺丰] 当前为模拟实现，需接入真实API");
        List<TrackingInfo> tracks = new ArrayList<>();
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(2))
                .description("快件已被【广州中转场】签收")
                .location("广州市")
                .status(TrackingInfo.TrackingStatus.IN_TRANSIT)
                .build());
        tracks.add(TrackingInfo.builder()
                .time(LocalDateTime.now().minusHours(1))
                .description("快件已到达【深圳福田区】")
                .location("深圳市")
                .status(TrackingInfo.TrackingStatus.ARRIVED_AT_STATION)
                .build());
        return tracks;
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        log.info("[顺丰] 运费估算: orderId={}", request.getOrderId());

        // TODO: 实现顺丰运费计算逻辑
        // 调用顺丰运费查询接口

        // 临时返回模拟数据（15元）
        log.warn("[顺丰] 当前为模拟实现，需接入真实API");
        return 1500L;
    }

    @Override
    public boolean validateAddress(String province, String city, String district) {
        log.info("[顺丰] 验证地址: {}-{}-{}", province, city, district);

        // TODO: 实现顺丰地址校验逻辑
        // 调用顺丰地址库接口

        // 临时返回true（假设都可达）
        log.warn("[顺丰] 当前为模拟实现，需接入真实API");
        return true;
    }
}
