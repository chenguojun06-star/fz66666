package com.fashion.supplychain.pos.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.pos.orchestration.PosSaleOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
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

    public PosController(PosSaleOrchestrator posSaleOrchestrator) {
        this.posSaleOrchestrator = posSaleOrchestrator;
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
        }
    }

    /** 今日汇总（交班对账）：单数/件数/金额/挂账金额 + 按收款方式拆分 + 最近单据 */
    @GetMapping("/today")
    public Result<?> today() {
        return Result.success(posSaleOrchestrator.today());
    }
}
