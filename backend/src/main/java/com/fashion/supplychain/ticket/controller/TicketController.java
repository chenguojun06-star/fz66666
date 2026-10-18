package com.fashion.supplychain.ticket.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.pos.entity.SalesTicket;
import com.fashion.supplychain.ticket.dto.TicketData;
import com.fashion.supplychain.ticket.orchestration.TicketOrchestrator;
import lombok.RequiredArgsConstructor;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * 电子小票登录态接口：按单据取小票（惰性补建）、分页列表。
 */
@RestController
@RequestMapping("/api/ticket")
@RequiredArgsConstructor
public class TicketController {

    private final TicketOrchestrator ticketOrchestrator;

    /**
     * 按来源单据取小票聚合数据（不存在则幂等补建，兼容历史单据入口）。
     * tenantId 强制取当前登录租户，不信任前端。
     */
    @GetMapping
    public Result<TicketData> getByBiz(@RequestParam("sourceBizType") String sourceBizType,
                                       @RequestParam("sourceBizId") String sourceBizId,
                                       @RequestParam(value = "sourceBizNo", required = false) String sourceBizNo) {
        TicketData data = ticketOrchestrator.getByBiz(UserContext.tenantId(), sourceBizType, sourceBizId, sourceBizNo);
        return Result.success(data);
    }

    /** 全部小票列表（分页 + 关键字：小票号/单据号/签收人）。 */
    @GetMapping("/page")
    public Result<Page<SalesTicket>> page(@RequestParam(value = "pageNum", defaultValue = "1") long pageNum,
                                          @RequestParam(value = "pageSize", defaultValue = "20") long pageSize,
                                          @RequestParam(value = "keyword", required = false) String keyword) {
        Page<SalesTicket> page = ticketOrchestrator.page(
                UserContext.tenantId(),
                Math.max(pageNum, 1),
                Math.min(Math.max(pageSize, 1), 100),
                StringUtils.hasText(keyword) ? keyword.trim() : null);
        return Result.success(page);
    }
}
