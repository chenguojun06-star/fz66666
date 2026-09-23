package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import org.springframework.stereotype.Service;

/**
 * 京东物流适配器（<b>待接入真实 API</b>）
 *
 * <p>开放平台：https://open.jdl.com （= cloud.jdl.com）
 * <p>接入指引：https://iopen.jdl.com/#/open-business-document/access-guide/82
 * <p>资质三选一：ISV（须有限责任公司且有软件著作权）/ 自研商家（须已签约且有 KH 合同号）/ 合作伙伴
 *
 * <p>⚠️ 勿与 {@code JdPlatformAdapter} 混淆：那个走的是<b>京东商家开放平台</b>
 * （https://open.jd.com ，原宙斯，商品/库存/订单），本类走的是<b>京东物流</b>开放平台。
 *
 * <p>当前继承 {@link AbstractLogisticsAdapter} 的 fail-closed 默认实现：
 * 下单/取消/查轨迹/运费一律抛"未接入"异常，不会返回任何编造数据。
 * 接入步骤见基类注释（实现真实调用 + 覆写 {@code isRealImplementation()} 返回 true）。
 */
@Service
public class JDAdapter extends AbstractLogisticsAdapter {

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
}
