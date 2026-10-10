package com.fashion.supplychain.integration.payment;

/**
 * 支付业务处理器：把"收到钱"落到具体业务上。
 *
 * <p><b>为什么要有这层</b>：支付模块不应该知道"收银台"或"店铺订单"是什么。
 * 各业务模块实现本接口并注册为 Spring Bean，支付回调按
 * {@code t_payment_record.order_type} 找到对应处理器 —— 依赖方向是
 * 「业务 → 支付」，支付模块不反向依赖任何业务模块。
 *
 * <p><b>实现约定</b>：
 * <ul>
 *   <li>{@link #onPaid} 会被支付回调**在同一事务内**调用，且只会被调用一次
 *       （幂等由支付流水状态跃迁保证），实现里不必自己再去重；</li>
 *   <li>实现里做的事要能重复执行而不产生副作用（如"标记已支付 + 出库"应先判断状态）；</li>
 *   <li>抛异常会让整个事务回滚、支付流水退回 PENDING，渠道会重推 ——
 *       这正是我们要的：宁可重试，也不能"钱收了货没出"。</li>
 * </ul>
 */
public interface PaymentBusinessHandler {

    /** 业务类型标识，与 {@code t_payment_record.order_type} 一致（如 POS_SALE） */
    String bizType();

    /**
     * 支付成功。
     *
     * @param tenantId       租户
     * @param bizNo          业务单号（= 支付时的 out_trade_no）
     * @param channel        渠道代码（ALIPAY / WECHAT_PAY）
     * @param channelTradeNo 渠道交易号（用于对账）
     * @param paidFen        实付金额（分）
     */
    void onPaid(Long tenantId, String bizNo, String channel, String channelTradeNo, long paidFen);

    /** 支付关闭（超时/取消）：释放业务侧占用的资源。默认什么都不做。 */
    default void onClosed(Long tenantId, String bizNo) {
    }
}
