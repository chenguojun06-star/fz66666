package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import org.springframework.stereotype.Service;

/**
 * 申通快递适配器（<b>待接入真实 API</b>，回调链路已可用）
 *
 * <p>开放平台：https://open.sto.cn
 * <p>配置项：{@code sto-express.*}（见 {@code STOProperties}）
 * <p>回调地址：{@code https://{域名}/api/webhook/logistics/sto}
 * <p>签名：{@code SignatureUtils.buildSTOSignature(content, appKey, appSecret)}
 *
 * <p><b>已可用部分</b>：回调控制器 {@code LogisticsCallbackController.stoCallback} 已完整实现
 * （验签 → 状态码映射 → 写库 → 签收时回写电商订单），配好密钥即可接收申通推送。
 *
 * <p><b>接入步骤</b>：
 * <ol>
 *   <li>注入 {@code STOProperties} 与 {@code IntegrationHttpClient}；</li>
 *   <li>实现下单/取消/查轨迹/运费四个方法，走真实 HTTP 并校验业务响应；</li>
 *   <li>覆写 {@link #isRealImplementation()} 返回 {@code true} 放行。</li>
 * </ol>
 *
 * <p>⚠️ {@code buildSTOSignature} 的签名规则本次未在官方文档查到明确说明，
 * 拿到账号后须逐字核对——签名不对会被静默拒绝。
 *
 * <p>当前继承 {@link AbstractLogisticsAdapter} 的 fail-closed 默认实现：
 * 下单/取消/查轨迹/运费一律抛"未接入"异常，不会返回任何编造数据。
 */
@Service
public class STOAdapter extends AbstractLogisticsAdapter {

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
}
