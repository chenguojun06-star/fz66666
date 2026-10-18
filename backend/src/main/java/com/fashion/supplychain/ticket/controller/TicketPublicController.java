package com.fashion.supplychain.ticket.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.ticket.dto.TicketData;
import com.fashion.supplychain.ticket.orchestration.TicketOrchestrator;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 电子小票公开接口（免登录，/api/public/** 已在安全白名单）。
 *
 * <p><b>安全模型</b>：43 位 Base64url 随机 token 即唯一凭证，不可遍历；
 * 多租户 tenant_id 从小票行取（不信任任何入参）；聚合数据不含成本/利润字段。
 */
@RestController
@RequestMapping("/api/public/ticket")
@RequiredArgsConstructor
public class TicketPublicController {

    private final TicketOrchestrator ticketOrchestrator;

    /** 扫码打开电子小票（H5 免登录）。 */
    @GetMapping("/{token}")
    public Result<TicketData> getByToken(@PathVariable("token") String token) {
        TicketData data = ticketOrchestrator.getByToken(token);
        if (data == null) {
            return Result.fail("小票不存在或已作废");
        }
        return Result.success(data);
    }

    /** 客户确认收货（幂等：重复签收返回成功）。 */
    @PostMapping("/{token}/sign")
    public Result<Boolean> sign(@PathVariable("token") String token, @RequestBody(required = false) SignReq body) {
        String signedBy = body == null ? null : body.getSignedBy();
        boolean ok;
        try {
            ok = ticketOrchestrator.signTicket(token, signedBy);
        } catch (IllegalStateException e) {
            return Result.fail(e.getMessage());
        }
        if (!ok) {
            return Result.fail("小票不存在或已作废");
        }
        return Result.success(Boolean.TRUE);
    }

    @Data
    public static class SignReq {
        /** 签收人（客户自填姓名，可空） */
        private String signedBy;
    }
}
