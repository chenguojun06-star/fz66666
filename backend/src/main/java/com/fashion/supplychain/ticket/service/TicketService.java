package com.fashion.supplychain.ticket.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.pos.entity.SalesTicket;
import com.fashion.supplychain.pos.mapper.SalesTicketMapper;
import com.fashion.supplychain.ticket.TicketTypes;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Base64;

/**
 * 电子小票基础服务：编号、扫码凭证、幂等 ensure、签收、浏览计数。
 *
 * <p>不依赖 HTTP 上下文，tenantId 一律由调用方显式传入（公开接口从 ticket 行取）。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TicketService {

    private final SalesTicketMapper ticketMapper;

    private final SecureRandom random = new SecureRandom();

    /** 签收人最大长度（与 t_sales_ticket.signed_by VARCHAR(64) 对齐，超长直接截断而非报错） */
    private static final int MAX_SIGNED_BY = 64;

    /** 按 token 查小票（唯一）。 */
    public SalesTicket findByToken(String token) {
        if (token == null || token.length() != 43) {
            return null;
        }
        return ticketMapper.selectOne(new LambdaQueryWrapper<SalesTicket>()
                .eq(SalesTicket::getSignToken, token)
                .last("LIMIT 1"));
    }

    /**
     * 幂等 ensure：同租户 + 同源单据只产生一张小票。
     * 并发兜底靠 uk_ticket_biz 唯一键，撞键后回读已有行。
     */
    public SalesTicket ensureTicket(Long tenantId, String sourceBizType, String sourceBizId, String sourceBizNo) {
        SalesTicket existing = findByBiz(tenantId, sourceBizType, sourceBizId);
        if (existing != null) {
            return existing;
        }
        for (int attempt = 0; attempt < 3; attempt++) {
            SalesTicket t = new SalesTicket();
            t.setTenantId(tenantId);
            t.setTicketNo(nextTicketNo(tenantId));
            t.setSourceBizType(sourceBizType);
            t.setSourceBizId(sourceBizId);
            t.setSourceBizNo(sourceBizNo);
            t.setSignToken(newToken());
            t.setStatus(TicketTypes.STATUS_UNSIGNED);
            t.setViewCount(0);
            t.setCreateTime(LocalDateTime.now());
            t.setUpdateTime(LocalDateTime.now());
            try {
                ticketMapper.insert(t);
                return t;
            } catch (DuplicateKeyException e) {
                existing = findByBiz(tenantId, sourceBizType, sourceBizId);
                if (existing != null) {
                    return existing;
                }
                log.warn("[小票] 编号/凭证撞键重试 attempt={} tenant={} biz={}", attempt, tenantId, sourceBizNo);
            }
        }
        throw new IllegalStateException("电子小票生成重试 3 次仍失败: " + sourceBizNo);
    }

    /**
     * 签收：UNSIGNED → SIGNED；已签收幂等返回 true；作废拒绝。返回 false 表示小票不存在。
     *
     * <p><b>为什么 UPDATE 必须带 {@code status='UNSIGNED'} 条件</b>（P0，2026-10-17 修）：
     * 原实现是 read-then-write —— {@code findByToken} 读到 UNSIGNED 后直接
     * {@code updateById(patch)}，UPDATE 没有状态条件。于是两个并发请求
     * （顾客连点两下、两口子各扫一次）都读到 UNSIGNED、都写成功，
     * <b>{@code signed_by}/{@code signed_time} 被后到者覆盖</b>。
     * 签收凭证的全部意义就是"谁、什么时候确认的"，被覆盖它就是假凭证。
     *
     * <p>设计文档写的"幂等拒绝重复签收"原先只做到了<b>读时</b>幂等；
     * 现在写时也用状态条件兜住，affected rows = 0 即视为并发下已被别人先签收，
     * 回读确认后幂等返回 true。与 {@code PayrollSettlementMapper#atomicAddPaidAmount}
     * 的乐观条件写法同一个思路。
     */
    public boolean signTicket(String token, String signedBy) {
        SalesTicket t = findByToken(token);
        if (t == null) {
            return false;
        }
        if (TicketTypes.STATUS_SIGNED.equals(t.getStatus())) {
            return true;
        }
        if (TicketTypes.STATUS_VOID.equals(t.getStatus())) {
            throw new IllegalStateException("小票已作废，无法签收: " + t.getTicketNo());
        }
        String signer = normalizeSignedBy(signedBy);
        SalesTicket patch = new SalesTicket();
        patch.setId(t.getId());
        patch.setStatus(TicketTypes.STATUS_SIGNED);
        patch.setSignedTime(LocalDateTime.now());
        patch.setSignedBy(signer);
        patch.setUpdateTime(LocalDateTime.now());
        int affected = ticketMapper.update(patch, new LambdaUpdateWrapper<SalesTicket>()
                .eq(SalesTicket::getId, t.getId())
                .eq(SalesTicket::getStatus, TicketTypes.STATUS_UNSIGNED));
        if (affected == 0) {
            // 并发下已被另一个请求先签收：回读确认，按幂等返回
            SalesTicket now = findByToken(token);
            return now != null && TicketTypes.STATUS_SIGNED.equals(now.getStatus());
        }
        return true;
    }

    /**
     * 签收人归一化：{@code signed_by} 是<b>客户自填、暴露在公网</b>的输入，
     * 必须在入库前清洗，否则：
     * <ul>
     *   <li>超长 → MySQL 严格模式直接报错，sign 接口 500（它不在 try-catch 里，会冒泡）；</li>
     *   <li>控制字符 → 污染小票 H5 渲染；</li>
     *   <li>首尾空白 → 落库成 {@code "张三 "}，列表搜索对不上。</li>
     * </ul>
     */
    static String normalizeSignedBy(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.replaceAll("[\\p{Cntrl}]", "").trim();
        if (s.isEmpty()) {
            return null;   // 全空白按 null，不留空串占位
        }
        return s.length() > MAX_SIGNED_BY ? s.substring(0, MAX_SIGNED_BY) : s;
    }

    /** 浏览计数 +1（失败只记日志，不影响主流程）。 */
    public void incrementView(Long ticketId) {
        try {
            ticketMapper.update(null, new LambdaUpdateWrapper<SalesTicket>()
                    .eq(SalesTicket::getId, ticketId)
                    .setSql("view_count = view_count + 1"));
        } catch (Exception e) {
            log.warn("[小票] 浏览计数失败 ticketId={}", ticketId, e);
        }
    }

    /** 分页查询（内部登录接口用，tenantId 强制）。 */
    public com.baomidou.mybatisplus.extension.plugins.pagination.Page<SalesTicket> page(
            Long tenantId, long pageNum, long pageSize, String keyword) {
        LambdaQueryWrapper<SalesTicket> w = new LambdaQueryWrapper<SalesTicket>()
                .eq(SalesTicket::getTenantId, tenantId)
                .orderByDesc(SalesTicket::getId);
        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.trim();
            w.and(q -> q.like(SalesTicket::getTicketNo, kw)
                    .or().like(SalesTicket::getSourceBizNo, kw)
                    .or().like(SalesTicket::getSignedBy, kw));
        }
        return ticketMapper.selectPage(new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>(pageNum, pageSize), w);
    }

    /**
     * 按来源单据查小票（登录态惰性补建前先查它：命中即免建票；
     * 未命中时调用方必须先校验来源单据归属，防止给不存在的单据建空壳票）。
     */
    public SalesTicket findByBiz(Long tenantId, String sourceBizType, String sourceBizId) {
        return ticketMapper.selectOne(new LambdaQueryWrapper<SalesTicket>()
                .eq(SalesTicket::getTenantId, tenantId)
                .eq(SalesTicket::getSourceBizType, sourceBizType)
                .eq(SalesTicket::getSourceBizId, sourceBizId)
                .last("LIMIT 1"));
    }

    /** 小票号 T + 日期 + 当日租户内序号（唯一键 tenant_id+ticket_no）。 */
    private String nextTicketNo(Long tenantId) {
        String date = LocalDate.now().toString().replace("-", "");
        String prefix = "T" + date;
        Long count = ticketMapper.selectCount(new LambdaQueryWrapper<SalesTicket>()
                .eq(SalesTicket::getTenantId, tenantId)
                .likeRight(SalesTicket::getTicketNo, prefix));
        return prefix + String.format("%04d", count + 1);
    }

    /** 43 位 Base64url 随机凭证（32 字节熵，不可遍历）。 */
    private String newToken() {
        byte[] buf = new byte[32];
        random.nextBytes(buf);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(buf);
    }
}
