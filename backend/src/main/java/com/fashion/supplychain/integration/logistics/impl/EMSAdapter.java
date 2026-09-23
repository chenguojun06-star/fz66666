package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import org.springframework.stereotype.Service;

/**
 * 中国邮政 / EMS 适配器（<b>待接入真实 API</b>）
 *
 * <p>开放平台：https://api.ems.com.cn （国内协议客户 API 开放平台）
 * <p>前置条件：需先成为<b>邮政 EMS 协议客户</b>（签约）才能获得接口权限。
 *
 * <p>当前继承 {@link AbstractLogisticsAdapter} 的 fail-closed 默认实现：
 * 下单/取消/查轨迹/运费一律抛"未接入"异常，不会返回任何编造数据。
 * 接入步骤见基类注释（实现真实调用 + 覆写 {@code isRealImplementation()} 返回 true）。
 */
@Service
public class EMSAdapter extends AbstractLogisticsAdapter {

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
}
