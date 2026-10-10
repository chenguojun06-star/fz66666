package com.fashion.supplychain.pos.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.payment.orchestration.PaymentConfigOrchestrator;
import com.fashion.supplychain.pos.orchestration.PosSaleOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 收银台（POS 开单）接口。
 *
 * <p>业务全在 {@link PosSaleOrchestrator}，本控制器只做参数解析与 Result 包装
 * （规则6：Controller 不直接依赖多个 Service）。
 *
 * <p>权限：走登录态 + 现有菜单权限（不做匿名入口）——
 * 收银台动的是库存与应收，绝不能像 C 端店铺页那样免登录。
 */
@Slf4j
@RestController
@RequestMapping("/api/pos")
public class PosController {

    private final PosSaleOrchestrator posSaleOrchestrator;

    private final PaymentConfigOrchestrator paymentConfigOrchestrator;

    public PosController(PosSaleOrchestrator posSaleOrchestrator,
                         PaymentConfigOrchestrator paymentConfigOrchestrator) {
        this.posSaleOrchestrator = posSaleOrchestrator;
        this.paymentConfigOrchestrator = paymentConfigOrchestrator;
    }

    /**
     * 各在线收款渠道是否可用（收银台据此决定微信/支付宝按钮能不能点）。
     *
     * <p>未配置的渠道按钮会置灰并提示去「收款设置」配置 ——
     * 而不是让收银员点了才发现报错。
     */
    @GetMapping("/channels")
    public Result<?> channels() {
        return Result.success(paymentConfigOrchestrator.channelReadiness());
    }

    /**
     * 查询待支付单的支付状态（收银台轮询用）。
     *
     * <p>会主动向渠道查询并就地确认：支付结果不能只等回调，回调可能丢。
     */
    @GetMapping("/sales/{saleNo}/pay-state")
    public Result<?> payState(@PathVariable String saleNo) {
        try {
            return Result.success(posSaleOrchestrator.payState(saleNo));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        } catch (IllegalStateException e) {
            return Result.fail(409, e.getMessage());
        }
    }

    /** 取消待支付单（收银员取消 / 顾客不买了）：先关渠道单，再置本地为已取消 */
    @PostMapping("/sales/{saleNo}/cancel-pay")
    public Result<?> cancelPay(@PathVariable String saleNo,
                               @RequestBody(required = false) Map<String, Object> body) {
        try {
            Object reason = body == null ? null : body.get("reason");
            posSaleOrchestrator.cancelPending(saleNo,
                    reason == null ? null : String.valueOf(reason));
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        } catch (IllegalStateException e) {
            return Result.fail(409, e.getMessage());
        }
    }

    /**
     * 扫码 / 关键字找货。
     *
     * <p>扫码枪就是键盘：输入条码或 SKU 编码后回车。精确命中的排最前。
     */
    @GetMapping("/skus")
    public Result<?> searchSkus(@RequestParam String keyword,
                               @RequestParam(defaultValue = "30") int limit) {
        return Result.success(posSaleOrchestrator.searchSkus(keyword, limit));
    }

    /** 按手机号带出客户与「上次成交价」（批发档口报价基准） */
    @GetMapping("/customer")
    public Result<?> customer(@RequestParam String phone) {
        return Result.success(posSaleOrchestrator.customer(phone));
    }

    /**
     * 开单：算价 → 校验库存 → 出库 → 收款或挂账。
     *
     * <p>body: {items:[{skuId,quantity,unitPrice?}], payMethod, discount, roundOff,
     * customerName, customerPhone, remark}
     */
    @PostMapping("/checkout")
    public Result<?> checkout(@RequestBody Map<String, Object> body) {
        try {
            return Result.success(posSaleOrchestrator.checkout(body));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        } catch (IllegalStateException e) {
            // 例如"发起支付失败"：单据已自动取消，收银员可以重试
            return Result.fail(409, e.getMessage());
        }
    }

    /** 今日汇总（交班对账）：单数/件数/金额/挂账金额 + 按收款方式拆分 + 最近单据 */
    @GetMapping("/today")
    public Result<?> today() {
        return Result.success(posSaleOrchestrator.today());
    }
}
