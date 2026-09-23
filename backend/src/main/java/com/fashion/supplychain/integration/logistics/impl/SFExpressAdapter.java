package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import org.springframework.stereotype.Service;

/**
 * 顺丰速运适配器（<b>待接入真实 API</b>，骨架最全，建议首个做通）
 *
 * <p>开放平台：https://open.sf-express.com （LaaS / 丰桥）
 * <p>接入指引：https://open.sf-express.com/developSupport/195960
 * <p>沙箱地址：https://sfapi-sbox.sf-express.com/std/service
 * <p>配置项：{@code sf-express.*}（见 {@code SFExpressProperties}）
 * <p>回调地址：{@code https://{域名}/api/webhook/logistics/sf}
 * <p>签名：{@code SignatureUtils.buildSFSignature(msgData, timestamp, checkWord)}
 * = {@code Base64(MD5(msgData + timestamp + checkWord))}，<b>appKey 不参与</b>
 *
 * <p><b>接入步骤</b>：
 * <ol>
 *   <li>注入 {@code SFExpressProperties} 与 {@code IntegrationHttpClient}；</li>
 *   <li>实现 {@link #createShipment}（EXP_RECE_CREATE_ORDER）与
 *       {@link #trackShipment}（EXP_RECE_SEARCH_ROUTES）——
 *       请求为 form 表单：{@code partnerID / requestID / serviceCode / timestamp / msgData / msgDigest}；
 *       <b>必须解析响应体的 success 与 errorCode 再判定成败</b>（HTTP 200 ≠ 成功）；</li>
 *   <li>覆写 {@link #isRealImplementation()} 返回 {@code true} 放行。</li>
 * </ol>
 *
 * <p>当前继承 {@link AbstractLogisticsAdapter} 的 fail-closed 默认实现：
 * 下单/取消/查轨迹/运费一律抛"未接入"异常，不会返回任何编造数据。
 */
@Service
public class SFExpressAdapter extends AbstractLogisticsAdapter {

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
}
