package com.fashion.supplychain.ticket.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.pos.entity.SalesTicket;
import com.fashion.supplychain.ticket.TicketTypes;
import com.fashion.supplychain.ticket.dto.TicketData;
import com.fashion.supplychain.ticket.service.TicketAssembler;
import com.fashion.supplychain.ticket.service.TicketService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 电子小票编排层：ensure 幂等入口、扫码读取、签收回写、租户内查询。
 *
 * <p>调用方（PosSaleWriteService / ShopOrderOrchestrator / OutstockReceivableHelper）
 * 必须 try-catch 包裹 ensureTicket——小票失败绝不能阻断开单/出库主交易。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TicketOrchestrator {

    private final TicketService ticketService;
    private final TicketAssembler ticketAssembler;

    /** 幂等生成小票（同租户 + 同源单据唯一）。 */
    public SalesTicket ensureTicket(Long tenantId, String sourceBizType, String sourceBizId, String sourceBizNo) {
        return ticketService.ensureTicket(tenantId, sourceBizType, sourceBizId, sourceBizNo);
    }

    /** 扫码读取（免登录）：按 token 聚合小票数据，view_count 自增。token 无效/作废返回 null。 */
    public TicketData getByToken(String token) {
        SalesTicket ticket = ticketService.findByToken(token);
        if (ticket == null || TicketTypes.STATUS_VOID.equals(ticket.getStatus())) {
            return null;
        }
        ticketService.incrementView(ticket.getId());
        return ticketAssembler.assemble(ticket);
    }

    /** 确认收货：UNSIGNED → SIGNED（幂等）；token 无效返回 false；作废抛错。 */
    public boolean signTicket(String token, String signedBy) {
        return ticketService.signTicket(token, signedBy);
    }

    /**
     * 登录态按来源单据取小票（惰性补建，兼容历史单据），并聚合数据。
     *
     * <p>P1-2（2026-10-20 冒烟实测）：补建前必须校验来源单据存在且归属本租户——
     * 否则任意登录用户可对不存在的 sourceBizId 建出空壳小票（带真实 signToken，
     * 脏数据入库且可被扫码访问）。
     */
    public TicketData getByBiz(Long tenantId, String sourceBizType, String sourceBizId, String sourceBizNo) {
        if (ticketService.findByBiz(tenantId, sourceBizType, sourceBizId) == null
                && !ticketAssembler.sourceExists(tenantId, sourceBizType, sourceBizId)) {
            throw new IllegalArgumentException("来源单据不存在或不属于当前租户: " + sourceBizType + "#" + sourceBizId);
        }
        SalesTicket ticket = ticketService.ensureTicket(tenantId, sourceBizType, sourceBizId, sourceBizNo);
        return ticketAssembler.assemble(ticket);
    }

    /** 登录态分页查询小票列表。 */
    public Page<SalesTicket> page(Long tenantId, long pageNum, long pageSize, String keyword) {
        return ticketService.page(tenantId, pageNum, pageSize, keyword);
    }
}
