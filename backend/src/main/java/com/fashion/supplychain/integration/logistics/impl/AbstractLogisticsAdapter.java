package com.fashion.supplychain.integration.logistics.impl;

import com.fashion.supplychain.integration.logistics.LogisticsService;
import com.fashion.supplychain.integration.logistics.ShippingRequest;
import com.fashion.supplychain.integration.logistics.ShippingResponse;
import com.fashion.supplychain.integration.logistics.TrackingInfo;
import lombok.extern.slf4j.Slf4j;

import java.util.List;

/**
 * 物流适配器基类 —— <b>未实现即"显式不可用"，绝不返回编造数据</b>。
 *
 * <p><b>为什么要有这个基类</b>：本项目 8 家快递适配器曾长期是 Mock 实现——
 * 运单号 {@code "SF"+时间戳} 拼的、运费写死常量、轨迹编造固定路线、取消永远返回 true。
 * 这些假数据一旦进入业务链路，会被当成真实结果使用：
 * <ul>
 *   <li>假运单号回传电商平台 → 污染平台侧真实订单；</li>
 *   <li>假取消成功 → 用户以为已取消，实际快递仍在途；</li>
 *   <li>假运费报价 → 比价决策失真。</li>
 * </ul>
 * 因此这里把默认行为定成 <b>fail-closed（失败即关闭）</b>：凡是没真正实现的能力，
 * 一律抛异常明确报"不可用"，而不是返回一个"看起来正常"的值。
 *
 * <p><b>如何接入一家真实快递</b>（三步）：
 * <ol>
 *   <li>在本类子类中注入该渠道的 {@code XxxProperties} 与 {@code IntegrationHttpClient}；</li>
 *   <li>覆写需要用到的方法（下单/取消/查轨迹/运费），走真实 HTTP 并<b>校验业务响应</b>
 *       （HTTP 200 不等于成功，平台会在响应体里返回错误码，详见 CLAUDE.md 铁律）；</li>
 *   <li>把 {@link #isRealImplementation()} 覆写为返回 {@code true}——
 *       这会让 {@code LogisticsManager} 的守卫自动放行该渠道，无需改动管理器代码。</li>
 * </ol>
 *
 * <p><b>注意</b>：第 3 步是"声明式开关"，必须与第 2 步同时完成。
 * 只改 {@code isRealImplementation()} 而没实现真实调用，会把假数据重新放出去——
 * 这也是本基类不根据"密钥是否配置"自动推断真伪的原因：
 * 配好密钥 ≠ 写好代码。
 */
@Slf4j
public abstract class AbstractLogisticsAdapter implements LogisticsService {

    /**
     * 是否已接入真实第三方 API。默认 {@code false}（fail-closed）。
     *
     * <p>子类真正实现完真实调用后，覆写本方法返回 {@code true} 即可放行。
     */
    @Override
    public boolean isRealImplementation() {
        return false;
    }

    @Override
    public ShippingResponse createShipment(ShippingRequest request) throws LogisticsException {
        throw notImplemented("自动下单寄件");
    }

    @Override
    public boolean cancelShipment(String trackingNumber, String reason) throws LogisticsException {
        throw notImplemented("自动取消运单");
    }

    @Override
    public List<TrackingInfo> trackShipment(String trackingNumber) throws LogisticsException {
        throw notImplemented("自动查询物流轨迹");
    }

    @Override
    public Long estimateShippingFee(ShippingRequest request) throws LogisticsException {
        throw notImplemented("自动获取运费报价");
    }

    /**
     * 地址可达校验。
     *
     * <p>未接入真实地址库时<b>不能声称"可达"</b>——那是编造结论，可能导致货发到送不到的地方。
     * 接口签名为 boolean、无"未知"态，故此处保守返回 {@code false}，让调用方走人工确认。
     */
    @Override
    public boolean validateAddress(String province, String city, String district) {
        log.warn("[物流] 渠道未接入真实API，无法校验地址可达性 | company={} province={} city={} district={}",
                getCompanyName(), province, city, district);
        return false;
    }

    /** 构造统一的"未接入"异常（含渠道名与动作），供子类复用 */
    protected LogisticsException notImplemented(String action) {
        String message = "快递渠道「" + getCompanyName() + "」尚未接入真实第三方API，无法" + action
                + "；请在快递公司后台人工操作后，将真实结果录入系统";
        log.warn("[物流] 已拒绝未实现的渠道调用 | company={} action={}", getCompanyName(), action);
        return new LogisticsException(message);
    }
}
