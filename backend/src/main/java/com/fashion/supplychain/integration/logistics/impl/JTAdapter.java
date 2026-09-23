package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import org.springframework.stereotype.Service;

/**
 * 极兔速递适配器（<b>待接入真实 API</b>）
 *
 * <p>开放平台：https://open.jtexpress.com.cn
 * <p>注意：极兔开放平台<b>以商务对接为主</b>，需先联系客户经理开通接口权限。
 * <p>商务联系：ISV/平台业务 ennis.wu@jtexpress.com ；品牌客户 jtscbd@jtexpress.com
 *
 * <p>当前继承 {@link AbstractLogisticsAdapter} 的 fail-closed 默认实现：
 * 下单/取消/查轨迹/运费一律抛"未接入"异常，不会返回任何编造数据。
 * 接入步骤见基类注释（实现真实调用 + 覆写 {@code isRealImplementation()} 返回 true）。
 */
@Service
public class JTAdapter extends AbstractLogisticsAdapter {

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
}
