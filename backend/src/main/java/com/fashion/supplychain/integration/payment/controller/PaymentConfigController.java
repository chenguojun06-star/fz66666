package com.fashion.supplychain.integration.payment.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.integration.payment.orchestration.PaymentConfigOrchestrator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 收款设置（商家配置自己的微信/支付宝商户参数）。
 *
 * <p>需要登录：这是商户的收款凭据，绝不能匿名访问。
 * 业务全在 {@link PaymentConfigOrchestrator}，控制器只做参数解析与 Result 包装（规则6）。
 */
@Slf4j
@RestController
@RequestMapping("/api/payment/config")
@RequiredArgsConstructor
public class PaymentConfigController {

    private final PaymentConfigOrchestrator configOrchestrator;

    /** 各渠道配置状态（含"密钥是否已设置"，**不含密钥内容**） */
    @GetMapping("/status")
    public Result<?> status() {
        return Result.success(configOrchestrator.status());
    }

    /** 渠道可用性：收银台据此决定哪些收款方式可点 */
    @GetMapping("/readiness")
    public Result<?> readiness() {
        return Result.success(configOrchestrator.channelReadiness());
    }

    /**
     * 保存某渠道配置。
     *
     * <p>密钥字段：不传 = 保持原值；传 {@code "-"} = 清空；其余 = 覆盖。
     * 这样前端不必回显密钥也能安全地改其它字段。
     */
    @PostMapping("/{channel}")
    public Result<?> save(@PathVariable String channel, @RequestBody Map<String, Object> body) {
        try {
            configOrchestrator.save(channel, body);
            return Result.success(null);
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }

    /** 连通性验证（用一个不存在的单号去查询，鉴权通过即算通过，不产生资金动作） */
    @PostMapping("/{channel}/verify")
    public Result<?> verify(@PathVariable String channel) {
        try {
            return Result.success(configOrchestrator.verify(channel));
        } catch (IllegalArgumentException e) {
            return Result.fail(400, e.getMessage());
        }
    }
}
