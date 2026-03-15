package com.fashion.supplychain.integration.ecommerce.service;

import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 电商平台物流回调服务（框架层）
 *
 * 各平台 API 接入说明：
 *   - 淘宝/天猫 (TB/TM) → 开放平台 logistic.offline.send，需 AppKey + AppSecret
 *   - 京东 (JD) → 京麦开放平台 order.deliverEorder，需 accessToken
 *   - 拼多多 (PDD) → 云平台 pdd.logistics.ship，需 client_id + client_secret
 *   - 抖音 (DY) → 开放平台 /ship/mark，需 app_id + app_secret
 *   以上均未申请资质，实际对接时在各 notifyXxx 方法内补充 HTTP 调用即可。
 *
 * 使用方式：
 *   注入本服务后调用 notifyShipped(order)，框架自动路由到对应平台逻辑。
 */
@Slf4j
@Service
public class PlatformNotifyService {

    /**
     * 向对应平台回传物流信息（主入口）。
     * 若平台不支持或密钥未配置，记录 WARN 日志，不抛异常。
     */
    public void notifyShipped(EcommerceOrder order) {
        if (order == null || order.getTrackingNo() == null) {
            log.debug("[物流回调] 快递单号为空，跳过回调 ecOrderNo={}", order != null ? order.getOrderNo() : null);
            return;
        }
        String platform = order.getSourcePlatformCode();
        try {
            switch (platform == null ? "" : platform) {
                case "TAOBAO", "TMALL" -> notifyTaobao(order);
                case "JD"              -> notifyJd(order);
                case "PINDUODUO"       -> notifyPdd(order);
                case "DOUYIN"          -> notifyDouyin(order);
                case "XIAOHONGSHU"     -> notifyXhs(order);
                case "WECHAT_SHOP"     -> notifyWechat(order);
                default -> log.info("[物流回调] 平台={} 暂不支持自动回传，快递单号={} 需人工处理",
                        platform, order.getTrackingNo());
            }
        } catch (Exception e) {
            // 物流回调失败不影响主业务
            log.warn("[物流回调] 回传失败 平台={} ecOrderNo={} 原因={}",
                    platform, order.getOrderNo(), e.getMessage());
        }
    }

    // ──────────────────────────────────────────────
    // 各平台实现（待接入资质后填充 HTTP 调用）
    // ──────────────────────────────────────────────

    private void notifyTaobao(EcommerceOrder order) {
        // 待接入：POST https://eco.taobao.com/router/rest → method=logistic.offline.send
        // 参数: tid={platformOrderNo}, out_sid={trackingNo}, company_name={expressCompany}
        // 需配置: TAOBAO_APP_KEY / TAOBAO_APP_SECRET / TAOBAO_SESSION_KEY
        log.info("[物流回调][淘宝/天猫] 待接入 platformOrderNo={} trackingNo={}",
                order.getPlatformOrderNo(), order.getTrackingNo());
    }

    private void notifyJd(EcommerceOrder order) {
        // 待接入：POST https://api.jd.com/routerjson → method=jingdong.order.deliverEorder
        // 参数: jdOrderId={platformOrderNo}, venderOrderId={orderNo}, logisticsId={trackingNo}
        // 需配置: JD_APP_KEY / JD_ACCESS_TOKEN
        log.info("[物流回调][京东] 待接入 platformOrderNo={} trackingNo={}",
                order.getPlatformOrderNo(), order.getTrackingNo());
    }

    private void notifyPdd(EcommerceOrder order) {
        // 待接入：POST https://gw-api.pinduoduo.com/api/router → type=pdd.logistics.ship
        // 参数: order_sn={platformOrderNo}, logistics_name={expressCompany},
        //       tracking_number={trackingNo}
        // 需配置: PDD_CLIENT_ID / PDD_CLIENT_SECRET
        log.info("[物流回调][拼多多] 待接入 platformOrderNo={} trackingNo={}",
                order.getPlatformOrderNo(), order.getTrackingNo());
    }

    private void notifyDouyin(EcommerceOrder order) {
        // 待接入：POST https://open-api.douyin.com/api/trade/v1/ship/mark
        // 参数: order_id={platformOrderNo}, delivey_id={trackingNo}
        // 需配置: DY_APP_ID / DY_APP_SECRET / DY_ACCESS_TOKEN
        log.info("[物流回调][抖音] 待接入 platformOrderNo={} trackingNo={}",
                order.getPlatformOrderNo(), order.getTrackingNo());
    }

    private void notifyXhs(EcommerceOrder order) {
        // 待接入：小红书开放平台 → 物流发货接口（需申请资质）
        log.info("[物流回调][小红书] 待接入 platformOrderNo={} trackingNo={}",
                order.getPlatformOrderNo(), order.getTrackingNo());
    }

    private void notifyWechat(EcommerceOrder order) {
        // 待接入：微信小商店 → POST https://api.weixin.qq.com/shop/aftersale/updatemchaftersale
        // 需微信商家授权 access_token
        log.info("[物流回调][微信小店] 待接入 platformOrderNo={} trackingNo={}",
                order.getPlatformOrderNo(), order.getTrackingNo());
    }
}
