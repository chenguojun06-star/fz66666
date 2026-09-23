package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import org.springframework.stereotype.Service;

/**
 * 中通快递适配器（<b>待接入真实 API</b>）
 *
 * <p>开放平台：https://open.zto.com
 * <p>接口文档：https://open.zto.com/zopdoc/c.html
 *
 * <p>当前继承 {@link AbstractLogisticsAdapter} 的 fail-closed 默认实现：
 * 下单/取消/查轨迹/运费一律抛"未接入"异常，不会返回任何编造数据。
 * 接入步骤见基类注释（实现真实调用 + 覆写 {@code isRealImplementation()} 返回 true）。
 */
@Service
public class ZTOAdapter extends AbstractLogisticsAdapter {

    @Override
    public String getCompanyName() {
        return "中通快递";
    }

    @Override
    public String getCompanyCode() {
        return "ZTO";
    }

    @Override
    public LogisticsType getLogisticsType() {
        return LogisticsType.ZTO;
    }
}
