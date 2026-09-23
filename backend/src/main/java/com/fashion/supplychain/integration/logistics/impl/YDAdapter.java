package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import org.springframework.stereotype.Service;

/**
 * 韵达快递适配器（<b>待接入真实 API</b>）
 *
 * <p>开放平台：http://open.yundaex.com
 * <p>接口文档：https://yundaex.apifox.cn
 *
 * <p>当前继承 {@link AbstractLogisticsAdapter} 的 fail-closed 默认实现：
 * 下单/取消/查轨迹/运费一律抛"未接入"异常，不会返回任何编造数据。
 * 接入步骤见基类注释（实现真实调用 + 覆写 {@code isRealImplementation()} 返回 true）。
 */
@Service
public class YDAdapter extends AbstractLogisticsAdapter {

    @Override
    public String getCompanyName() {
        return "韵达快递";
    }

    @Override
    public String getCompanyCode() {
        return "YD";
    }

    @Override
    public LogisticsType getLogisticsType() {
        return LogisticsType.YD;
    }
}
