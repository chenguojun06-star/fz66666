package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import org.springframework.stereotype.Service;

/**
 * 圆通速递适配器（<b>待接入真实 API</b>）
 *
 * <p>开放平台：https://open.yto.net.cn
 * <p>接口文档：https://open.yto.net.cn/interfaceDocument/menu250/submenu358
 * <p>能力：订单创建（自动分配取件员上门揽件）、物流轨迹主动推送
 *
 * <p>当前继承 {@link AbstractLogisticsAdapter} 的 fail-closed 默认实现：
 * 下单/取消/查轨迹/运费一律抛"未接入"异常，不会返回任何编造数据。
 * 接入步骤见基类注释（实现真实调用 + 覆写 {@code isRealImplementation()} 返回 true）。
 */
@Service
public class YTOAdapter extends AbstractLogisticsAdapter {

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
}
