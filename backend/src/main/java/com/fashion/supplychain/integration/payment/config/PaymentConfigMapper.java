package com.fashion.supplychain.integration.payment.config;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.fashion.supplychain.integration.payment.entity.PaymentConfig;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

/**
 * 收款配置 Mapper（带 tenant_id，走租户隔离）。
 *
 * <p>回调链路没有 UserContext（第三方服务器直接调用），租户一律由**显式条件**定位：
 * 支付宝用 {@code app_id}（全局唯一）反查，微信用回调 URL 上的 tenantId —— 见
 * {@code PaymentCallbackController}。
 */
@Mapper
public interface PaymentConfigMapper extends BaseMapper<PaymentConfig> {

    /** 按租户 + 渠道取配置 */
    @Select("SELECT * FROM t_payment_config WHERE tenant_id = #{tenantId} AND channel = #{channel} LIMIT 1")
    PaymentConfig findByTenantAndChannel(@Param("tenantId") Long tenantId,
                                        @Param("channel") String channel);

    /**
     * 按支付宝 AppID 反查配置（回调验签用）。
     *
     * <p>用 AppID 而不是 out_trade_no 定位租户：AppID 全局唯一，
     * 而业务单号理论上可能在不同租户间重复。
     */
    @Select("SELECT * FROM t_payment_config WHERE channel = 'ALIPAY' AND app_id = #{appId} LIMIT 1")
    PaymentConfig findByAlipayAppId(@Param("appId") String appId);
}
