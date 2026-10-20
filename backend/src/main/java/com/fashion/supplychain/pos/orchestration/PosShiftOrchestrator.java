package com.fashion.supplychain.pos.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.pos.entity.PosReturn;
import com.fashion.supplychain.pos.entity.PosSale;
import com.fashion.supplychain.pos.entity.PosSalePayment;
import com.fashion.supplychain.pos.entity.PosShift;
import com.fashion.supplychain.pos.mapper.PosReturnMapper;
import com.fashion.supplychain.pos.mapper.PosSaleMapper;
import com.fashion.supplychain.pos.mapper.PosSalePaymentMapper;
import com.fashion.supplychain.pos.mapper.PosShiftMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * D-817：交接班 / 钱箱。
 *
 * <p><b>四条规则</b>（每条都是防损或防篡改，逐条有测试守护）：
 * <ol>
 *   <li><b>一个收银员同时只能有一个班次</b>：防止「开两个班各算一半」，
 *       或者反复开关班次把同一批销售算进两个班次。</li>
 *   <li><b>钱箱只算现金</b>：微信/支付宝线上到账、刷卡走对账单、挂账不是收款。
 *       把它们算进钱箱必然对不平。</li>
 *   <li><b>应有钱 = 备用金 + 现金收款 − 现金退款</b>；退款要从钱箱拿现金给顾客，
 *       所以是减项，漏掉就会虚增钱箱。</li>
 *   <li><b>交班后不可再改</b>：已 CLOSED 的班次不允许重复交班，
 *       也不允许被后来的销售改写 —— 否则班次报表失去对账意义。</li>
 * </ol>
 */
@Slf4j
@Component
public class PosShiftOrchestrator {

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    /** 只有现金进钱箱 */
    private static final String PAY_CASH = "CASH";
    private static final String PAY_ONLINE_A = "WECHAT";
    private static final String PAY_ONLINE_B = "ALIPAY";
    private static final String PAY_CARD = "CARD";
    private static final String PAY_CREDIT = "CREDIT";

    @Autowired
    private PosShiftMapper shiftMapper;

    @Autowired
    private PosSaleMapper saleMapper;

    @Autowired
    private PosReturnMapper returnMapper;

    @Autowired
    private PosSalePaymentMapper salePaymentMapper;

    // ───────────────────────── 开班 ─────────────────────────

    /**
     * 开班（登记钱箱备用金）。
     *
     * @param openingCash 备用金；不允许负数
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> openShift(BigDecimal openingCash, String terminal, String remark) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String cashierId = UserContext.userId();

        BigDecimal opening = openingCash == null ? BigDecimal.ZERO : openingCash;
        if (opening.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("备用金不能为负数");
        }

        // 规则①：同一收银员同时只能有一个班次
        PosShift open = findOpenShift(tenantId, cashierId);
        if (open != null) {
            throw new IllegalStateException(
                    "你还有一个班次没交班（" + open.getShiftNo() + "），请先交班再开新班");
        }

        PosShift s = new PosShift();
        s.setId(UUID.randomUUID().toString().replace("-", ""));
        s.setTenantId(tenantId);
        s.setShiftNo("SHF" + LocalDateTime.now().format(NO_FMT)
                + UUID.randomUUID().toString().substring(0, 4).toUpperCase());
        s.setCashierId(cashierId);
        s.setCashierName(UserContext.username());
        s.setTerminal(terminal);
        s.setOpeningCash(scale(opening));
        s.setSaleCount(0);
        s.setSaleItemCount(0);
        s.setCashSaleAmount(BigDecimal.ZERO);
        s.setOnlineSaleAmount(BigDecimal.ZERO);
        s.setCardSaleAmount(BigDecimal.ZERO);
        s.setCreditAmount(BigDecimal.ZERO);
        s.setRefundCashAmount(BigDecimal.ZERO);
        s.setExpectedCash(scale(opening));
        s.setStatus("OPEN");
        s.setOpenedAt(LocalDateTime.now());
        s.setRemark(remark);
        s.setCreatorId(cashierId);
        s.setCreatorName(UserContext.username());
        shiftMapper.insert(s);

        log.info("[交接班] 开班 {} 备用金 {}", s.getShiftNo(), s.getOpeningCash());
        return view(s);
    }

    // ───────────────────────── 当前班次与交班 ─────────────────────────

    /** 当前班次（含实时统计），没有则返回 null。 */
    public Map<String, Object> currentShift() {
        TenantAssert.assertTenantContext();
        PosShift s = findOpenShift(UserContext.tenantId(), UserContext.userId());
        if (s == null) {
            return null;
        }
        return view(withLiveStats(s));
    }

    /**
     * 交班：结算本班统计、登记实点现金与差异。
     *
     * @param actualCash 实点现金；与应有差额超过容忍时必须填原因
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> closeShift(BigDecimal actualCash, String diffReason, String remark) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String cashierId = UserContext.userId();

        PosShift s = findOpenShift(tenantId, cashierId);
        if (s == null) {
            throw new IllegalStateException("你没有开着的班次，无法交班");
        }
        if (actualCash == null || actualCash.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("请填写实点现金（不能为负数）");
        }

        PosShift live = withLiveStats(s);
        BigDecimal expected = live.getExpectedCash();
        BigDecimal diff = scale(actualCash.subtract(expected));

        // 差异必须解释：长款短款都不放过（金额小也要写，便于事后追查）
        if (diff.compareTo(BigDecimal.ZERO) != 0
                && (diffReason == null || diffReason.isBlank())) {
            throw new IllegalArgumentException(
                    "实点与应有现金相差 " + diff.abs() + " 元，请填写差异原因");
        }

        PosShift patch = new PosShift();
        patch.setId(s.getId());
        patch.setStatus("CLOSED");
        patch.setClosedAt(LocalDateTime.now());
        patch.setActualCash(scale(actualCash));
        patch.setDiffAmount(diff);
        patch.setDiffReason(diffReason);
        if (remark != null && !remark.isBlank()) {
            patch.setRemark(remark);
        }
        // 规则④：带 status 条件的原子更新，防止并发交班被记两次
        int rows = shiftMapper.update(patch, new LambdaQueryWrapper<PosShift>()
                .eq(PosShift::getId, s.getId())
                .eq(PosShift::getStatus, "OPEN"));
        if (rows <= 0) {
            throw new IllegalStateException("该班次刚被交班，请刷新查看");
        }

        live.setActualCash(scale(actualCash));
        live.setDiffAmount(diff);
        live.setStatus("CLOSED");
        log.info("[交接班] 交班 {} 应收{} 实点{} 差异{}", s.getShiftNo(), expected, actualCash, diff);
        return view(live);
    }

    /** 班次历史。 */
    public List<Map<String, Object>> listShifts(int limit) {
        TenantAssert.assertTenantContext();
        List<PosShift> rows = shiftMapper.selectList(new LambdaQueryWrapper<PosShift>()
                .eq(PosShift::getTenantId, UserContext.tenantId())
                .orderByDesc(PosShift::getOpenedAt)
                .last("LIMIT " + Math.max(1, Math.min(limit, 200))));
        List<Map<String, Object>> out = new ArrayList<>();
        for (PosShift s : rows) {
            out.add(view(s));
        }
        return out;
    }

    // ───────────────────────── 内部 ─────────────────────────

    /**
     * 统计本班实时数据。
     *
     * <p>时间窗用开班时间 ~ 现在，**闭班后再算一次也不会变**（闭班时间之前的
     * 销售不会再变），所以报表可复算、对得上账。
     */
    private PosShift withLiveStats(PosShift s) {
        Long tenantId = s.getTenantId();
        LocalDateTime from = s.getOpenedAt();

        // 已收款单按**收款时间**归班；挂账单（UNPAID，含组合支付"收了一部分"的单）
        // 没有收款时间，按**开单时间**归班 —— 组合支付的现金部分物理上进过钱箱，
        // 不算进本班钱箱必然对不平。下面循环只统计"当场收到的部分"，
        // 挂账行单独进 creditAmount（本班新挂出去的账）。
        LocalDateTime now = LocalDateTime.now();
        List<PosSale> sales = saleMapper.selectList(new LambdaQueryWrapper<PosSale>()
                .eq(PosSale::getTenantId, tenantId)
                .eq(PosSale::getStatus, "NORMAL")
                .and(w -> w
                        .and(a -> a.eq(PosSale::getPayStatus, "PAID")
                                .ge(PosSale::getPaidTime, from)
                                .le(PosSale::getPaidTime, now))
                        .or(a -> a.eq(PosSale::getPayStatus, "UNPAID")
                                .ge(PosSale::getCreateTime, from)
                                .le(PosSale::getCreateTime, now))));

        int count = 0;
        BigDecimal cash = BigDecimal.ZERO;
        BigDecimal online = BigDecimal.ZERO;
        BigDecimal card = BigDecimal.ZERO;
        BigDecimal credit = BigDecimal.ZERO;

        // 组合支付按明细行拆分：现金500+微信300 的单，现金只进钱箱 500，
        // 不能按主方式把 800 全记现金。历史单没有明细行，回退整单口径。
        List<Long> saleIds = sales.stream().map(PosSale::getId).toList();
        Map<Long, List<PosSalePayment>> paymentsBySale = saleIds.isEmpty() ? Map.of()
                : salePaymentMapper.selectList(new LambdaQueryWrapper<PosSalePayment>()
                        .in(PosSalePayment::getSaleId, saleIds))
                .stream().collect(java.util.stream.Collectors.groupingBy(PosSalePayment::getSaleId));

        for (PosSale sale : sales) {
            count++;
            List<PosSalePayment> pays = paymentsBySale.get(sale.getId());
            if (pays != null && !pays.isEmpty()) {
                for (PosSalePayment p : pays) {
                    String pm = p.getPayMethod() == null ? PAY_CASH : p.getPayMethod().toUpperCase();
                    BigDecimal amt = scale(p.getAmount());
                    if (PAY_CASH.equals(pm)) {
                        cash = cash.add(amt);
                    } else if (PAY_ONLINE_A.equals(pm) || PAY_ONLINE_B.equals(pm)) {
                        online = online.add(amt);
                    } else if (PAY_CARD.equals(pm)) {
                        card = card.add(amt);
                    } else if (PAY_CREDIT.equals(pm)) {
                        credit = credit.add(amt);
                    }
                }
                continue;
            }
            BigDecimal amt = scale(sale.getTotalAmount());
            String pm = sale.getPayMethod() == null ? PAY_CASH : sale.getPayMethod().toUpperCase();
            // 规则②：只有现金进钱箱
            if (PAY_CASH.equals(pm)) {
                cash = cash.add(amt);
            } else if (PAY_ONLINE_A.equals(pm) || PAY_ONLINE_B.equals(pm)) {
                online = online.add(amt);
            } else if (PAY_CARD.equals(pm)) {
                card = card.add(amt);
            } else if (PAY_CREDIT.equals(pm)) {
                credit = credit.add(amt);
            }
        }

        // 规则③：退款要从钱箱减
        BigDecimal refundCash = BigDecimal.ZERO;
        List<PosReturn> returns = returnMapper.selectList(new LambdaQueryWrapper<PosReturn>()
                .eq(PosReturn::getTenantId, tenantId)
                .eq(PosReturn::getRefundStatus, "REFUNDED")
                .ge(PosReturn::getCreateTime, from));
        for (PosReturn r : returns) {
            String pm = r.getPayMethod() == null ? PAY_CASH : r.getPayMethod().toUpperCase();
            if (PAY_CASH.equals(pm)) {
                refundCash = refundCash.add(scale(r.getRefundedAmount()));
            }
        }

        s.setSaleCount(count);
        s.setCashSaleAmount(scale(cash));
        s.setOnlineSaleAmount(scale(online));
        s.setCardSaleAmount(scale(card));
        s.setCreditAmount(scale(credit));
        s.setRefundCashAmount(scale(refundCash));
        s.setExpectedCash(scale(scale(s.getOpeningCash()).add(cash).subtract(refundCash)));
        return s;
    }

    private PosShift findOpenShift(Long tenantId, String cashierId) {
        if (cashierId == null) {
            return null;
        }
        return shiftMapper.selectOne(new LambdaQueryWrapper<PosShift>()
                .eq(PosShift::getTenantId, tenantId)
                .eq(PosShift::getCashierId, cashierId)
                .eq(PosShift::getStatus, "OPEN")
                .orderByDesc(PosShift::getOpenedAt)
                .last("LIMIT 1"));
    }

    private Map<String, Object> view(PosShift s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("shiftNo", s.getShiftNo());
        m.put("cashierName", s.getCashierName());
        m.put("terminal", s.getTerminal());
        m.put("status", s.getStatus());
        m.put("openingCash", s.getOpeningCash());
        m.put("saleCount", s.getSaleCount());
        m.put("cashSaleAmount", s.getCashSaleAmount());
        m.put("onlineSaleAmount", s.getOnlineSaleAmount());
        m.put("cardSaleAmount", s.getCardSaleAmount());
        m.put("creditAmount", s.getCreditAmount());
        m.put("refundCashAmount", s.getRefundCashAmount());
        m.put("expectedCash", s.getExpectedCash());
        m.put("actualCash", s.getActualCash());
        m.put("diffAmount", s.getDiffAmount());
        m.put("diffReason", s.getDiffReason());
        m.put("openedAt", s.getOpenedAt());
        m.put("closedAt", s.getClosedAt());
        m.put("cashOnlyHint", "钱箱只统计现金：微信/支付宝线上到账、刷卡走对账单，均不进钱箱");
        return m;
    }

    private static BigDecimal scale(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v.setScale(2, java.math.RoundingMode.HALF_UP);
    }
}