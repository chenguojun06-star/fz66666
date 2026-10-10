package com.fashion.supplychain.pos.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.payment.PaymentBusinessHandler;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

/**
 * 收银台支付业务处理器：把"渠道确认收到钱"落到销售单上。
 *
 * <p>注册为 {@link PaymentBusinessHandler} 后，支付回调与收银台轮询都会走到这里，
 * 由 {@code PosSaleWriteService.settle} 完成「出库 + 状态落定」（幂等）。
 *
 * <p><b>为什么要临时设置租户上下文</b>：支付回调来自微信/支付宝服务器，
 * 请求里没有登录用户。而库存出库、台账落库都要用当前租户来填 tenant_id、
 * 记操作人。租户从**支付流水对应的销售单**上取（不是从请求参数取），
 * 所以不存在"伪造租户"的风险。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PosPaymentHandler implements PaymentBusinessHandler {

    /** 与 t_payment_record.order_type 一致 */
    public static final String BIZ_TYPE = "POS_SALE";

    private final PosSaleOrchestrator posSaleOrchestrator;
    private final PosSaleMapper saleMapper;

    @Override
    public String bizType() {
        return BIZ_TYPE;
    }

    @Override
    public void onPaid(Long tenantId, String bizNo, String channel, String channelTradeNo, long paidFen) {
        runAsTenant(tenantId, () -> posSaleOrchestrator.confirmPaid(bizNo, channel, channelTradeNo, paidFen));
    }

    @Override
    public void onClosed(Long tenantId, String bizNo) {
        runAsTenant(tenantId, () -> {
            PosSale sale = saleMapper.selectOne(new LambdaQueryWrapper<PosSale>()
                    .eq(PosSale::getSaleNo, bizNo)
                    .last("LIMIT 1"));
            if (sale != null && "PAYING".equals(sale.getPayStatus())) {
                PosSale patch = new PosSale();
                patch.setId(sale.getId());
                patch.setPayStatus("CANCELLED");
                saleMapper.updateById(patch);
                log.info("[POS] 支付关闭，单据已取消 saleNo={}", bizNo);
            }
        });
    }

    /** 以指定租户身份执行（回调无登录上下文，结束后恢复） */
    private void runAsTenant(Long tenantId, Runnable action) {
        UserContext previous = UserContext.get();
        try {
            UserContext ctx = new UserContext();
            ctx.setTenantId(tenantId);
            ctx.setUserId("payment-callback");
            ctx.setUsername("支付回调");
            UserContext.set(ctx);
            action.run();
        } finally {
            if (previous != null) {
                UserContext.set(previous);
            } else {
                UserContext.clear();
            }
        }
    }
}
