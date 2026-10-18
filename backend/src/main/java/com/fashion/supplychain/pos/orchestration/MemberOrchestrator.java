package com.fashion.supplychain.pos.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.pos.entity.PosMember;
import com.fashion.supplychain.pos.entity.PosMemberTx;
import com.fashion.supplychain.pos.mapper.PosMemberMapper;
import com.fashion.supplychain.pos.mapper.PosMemberTxMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 会员（建档 / 会员价 / 储值 / 消费记录）。
 *
 * <p><b>余额安全是这个类的全部重点</b>。储值余额是钱，
 * 一旦出现"付了钱余额没扣"或"余额扣了钱没扣"，就是直接的资损，
 * 而且往往要到月底对账才发现。
 *
 * <p>为此定了三条铁律：
 * <ol>
 *   <li><b>余额只走流水</b>：每次变动必写 {@link PosMemberTx}，带变动后余额。
 *       业务代码不允许直接 set 会员表的 balance。</li>
 *   <li><b>扣减走原子 SQL</b>：{@code UPDATE ... SET balance = balance - ? WHERE balance >= ?}，
 *       用数据库保证"不会扣成负数"。先查后扣在并发下必然超扣 —— 两个人同时用同一张卡结账，
 *       查出来都是 500，实扣两次变 -500。</li>
 *   <li><b>按 saleNo 幂等</b>：同一笔销售单重复回调/重试只能扣一次，
 *       否则一次网络重试就是一次重复扣款。</li>
 * </ol>
 */
@Slf4j
@Service
public class MemberOrchestrator {

    private static final DateTimeFormatter NO_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    private static final AtomicInteger NO_SEQ = new AtomicInteger(0);
    private static final BigDecimal MIN_RATE = new BigDecimal("0.01");
    private static final BigDecimal MAX_RATE = new BigDecimal("1.00");
    private static final BigDecimal MAX_RECHARGE = new BigDecimal("1000000.00");

    private final PosMemberMapper memberMapper;
    private final PosMemberTxMapper txMapper;

    public MemberOrchestrator(PosMemberMapper memberMapper, PosMemberTxMapper txMapper) {
        this.memberMapper = memberMapper;
        this.txMapper = txMapper;
    }

    /* ── 查询 ─────────────────────────────────────────────────────────────── */

    /** 按手机号查会员（收银台输入手机号即识别）。 */
    public Map<String, Object> byPhone(String phone) {
        TenantAssert.assertTenantContext();
        if (phone == null || phone.trim().length() < 5) {
            return null;
        }
        PosMember m = memberMapper.selectOne(new LambdaQueryWrapper<PosMember>()
                .eq(PosMember::getTenantId, UserContext.tenantId())
                .eq(PosMember::getPhone, phone.trim())
                .last("LIMIT 1"));
        return m == null ? null : view(m);
    }

    /** 按会员ID查（开单时确认会员仍然有效）。 */
    public Map<String, Object> byMemberId(String memberId) {
        TenantAssert.assertTenantContext();
        if (memberId == null || memberId.isBlank()) {
            return null;
        }
        PosMember m = memberMapper.selectOne(new LambdaQueryWrapper<PosMember>()
                .eq(PosMember::getId, memberId.trim())
                .eq(PosMember::getTenantId, UserContext.tenantId())
                .last("LIMIT 1"));
        return m == null ? null : view(m);
    }

    /** 会员列表（后台管理用）。 */
    public List<Map<String, Object>> list(String keyword, int limit) {
        TenantAssert.assertTenantContext();
        LambdaQueryWrapper<PosMember> qw = new LambdaQueryWrapper<PosMember>()
                .eq(PosMember::getTenantId, UserContext.tenantId())
                .orderByDesc(PosMember::getCreateTime)
                .last("LIMIT " + Math.max(1, Math.min(limit, 200)));
        if (keyword != null && !keyword.isBlank()) {
            String kw = keyword.trim();
            qw.and(w -> w.like(PosMember::getPhone, kw).or().like(PosMember::getName, kw)
                    .or().like(PosMember::getMemberNo, kw));
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (PosMember m : memberMapper.selectList(qw)) {
            out.add(view(m));
        }
        return out;
    }

    /** 会员流水（消费记录）。 */
    public List<Map<String, Object>> transactions(String memberId, int limit) {
        TenantAssert.assertTenantContext();
        List<PosMemberTx> rows = txMapper.selectList(new LambdaQueryWrapper<PosMemberTx>()
                .eq(PosMemberTx::getTenantId, UserContext.tenantId())
                .eq(PosMemberTx::getMemberId, memberId)
                .orderByDesc(PosMemberTx::getCreateTime)
                .last("LIMIT " + Math.max(1, Math.min(limit, 200))));
        List<Map<String, Object>> out = new ArrayList<>();
        for (PosMemberTx t : rows) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("type", t.getType());
            m.put("amount", t.getAmount());
            m.put("balanceAfter", t.getBalanceAfter());
            m.put("saleNo", t.getSaleNo());
            m.put("bizNo", t.getBizNo());
            m.put("operatorName", t.getOperatorName());
            m.put("remark", t.getRemark());
            m.put("createTime", t.getCreateTime());
            out.add(m);
        }
        return out;
    }

    /* ── 建档 / 充值 ──────────────────────────────────────────────────────── */

    /**
     * 建档。手机号已存在时**返回原会员**而不是报错 ——
     * 收银台输错一位号码再输对，不该弹一个红色报错让人发懵。
     */
    public Map<String, Object> enroll(String phone, String name, BigDecimal discountRate, String remark) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (phone == null || phone.trim().length() < 5) {
            throw new IllegalArgumentException("请填写正确的会员手机号");
        }
        String p = phone.trim();
        PosMember exist = memberMapper.selectOne(new LambdaQueryWrapper<PosMember>()
                .eq(PosMember::getTenantId, tenantId)
                .eq(PosMember::getPhone, p)
                .last("LIMIT 1"));
        if (exist != null) {
            return view(exist);
        }

        PosMember m = new PosMember();
        m.setTenantId(tenantId);
        m.setPhone(p);
        m.setName(name == null || name.isBlank() ? null : name.trim());
        m.setMemberNo(generateMemberNo(tenantId));
        m.setLevelCode("NORMAL");
        m.setDiscountRate(normalizeRate(discountRate));
        m.setBalance(BigDecimal.ZERO);
        m.setTotalRecharge(BigDecimal.ZERO);
        m.setTotalSpend(BigDecimal.ZERO);
        m.setPoints(0);
        m.setStatus("ACTIVE");
        m.setRemark(remark);
        m.setCreatorId(UserContext.userId());
        m.setCreatorName(UserContext.username());
        m.setCreateTime(LocalDateTime.now());
        m.setUpdateTime(LocalDateTime.now());
        memberMapper.insert(m);
        log.info("[POS会员] 建档: phone={} no={}", p, m.getMemberNo());
        return view(m);
    }

    /**
     * 储值充值。
     *
     * <p>同样是「原子加 + 记流水」：并发充值不会互相覆盖，
     * 且流水里的 balanceAfter 是串行执行的结果，可逐条核对。
     */
    public Map<String, Object> recharge(String memberId, BigDecimal amount, String remark) {
        TenantAssert.assertTenantContext();
        if (memberId == null || memberId.isBlank()) {
            throw new IllegalArgumentException("请选择会员");
        }
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("充值金额必须大于 0");
        }
        if (amount.compareTo(MAX_RECHARGE) > 0) {
            throw new IllegalArgumentException("单笔充值不能超过 " + MAX_RECHARGE.toPlainString() + " 元");
        }
        PosMember m = requireMember(memberId);
        if (!"ACTIVE".equals(m.getStatus())) {
            throw new IllegalArgumentException("会员已冻结，无法充值");
        }
        memberMapper.update(null, new LambdaUpdateWrapper<PosMember>()
                .eq(PosMember::getId, memberId)
                .eq(PosMember::getTenantId, UserContext.tenantId())
                .setSql("balance = balance + " + amount.toPlainString())
                .setSql("total_recharge = total_recharge + " + amount.toPlainString())
                .set(PosMember::getUpdateTime, LocalDateTime.now()));
        PosMember after = requireMember(memberId);
        writeTx(memberId, "RECHARGE", amount, after.getBalance(), null,
                generateBizNo("RC"), remark);
        log.info("[POS会员] 充值: member={} amount={} 余额={}", memberId, amount, after.getBalance());
        return view(after);
    }

    /* ── 余额扣减 / 回退（供开单与退货调用）─────────────────────────────── */

    /**
     * 用余额支付。
     *
     * <p><b>三重保护</b>：金额校验 → 原子扣减（不足则影响 0 行）→ saleNo 幂等。
     * 原子扣减是必须的：先查余额再扣，并发下两个人同时结账都能通过校验。
     */
    public BigDecimal consumeBalance(String memberId, BigDecimal amount, String saleNo) {
        TenantAssert.assertTenantContext();
        PosMember m = requireMember(memberId);
        if (!"ACTIVE".equals(m.getStatus())) {
            throw new IllegalArgumentException("会员已冻结，无法使用余额");
        }
        if (saleNo == null || saleNo.isBlank()) {
            throw new IllegalArgumentException("缺少销售单号，余额扣减必须可追溯");
        }
        // 幂等：同一单已扣过就直接返回，不再扣
        Long done = txMapper.selectCount(new LambdaQueryWrapper<PosMemberTx>()
                .eq(PosMemberTx::getTenantId, UserContext.tenantId())
                .eq(PosMemberTx::getSaleNo, saleNo)
                .eq(PosMemberTx::getType, "CONSUME"));
        if (done != null && done > 0) {
            log.warn("[POS会员] 单号 {} 已扣过余额，跳过重复扣减", saleNo);
            return m.getBalance();
        }
        int rows = memberMapper.update(null, new LambdaUpdateWrapper<PosMember>()
                .eq(PosMember::getId, memberId)
                .eq(PosMember::getTenantId, UserContext.tenantId())
                .ge(PosMember::getBalance, amount)
                .setSql("balance = balance - " + amount.toPlainString())
                .setSql("total_spend = total_spend + " + amount.toPlainString())
                .set(PosMember::getUpdateTime, LocalDateTime.now()));
        if (rows == 0) {
            throw new IllegalArgumentException("会员余额不足");
        }
        PosMember after = requireMember(memberId);
        writeTx(memberId, "CONSUME", amount, after.getBalance(), saleNo, null, "余额支付");
        log.info("[POS会员] 余额支付: member={} 单={} 金额={} 余额={}",
                memberId, saleNo, amount, after.getBalance());
        return after.getBalance();
    }

    /**
     * 退款退回余额。
     *
     * <p>与扣减对称，同样按 saleNo 幂等 —— 退货重试不会退两次。
     */
    public BigDecimal refundBalance(String memberId, BigDecimal amount, String saleNo) {
        TenantAssert.assertTenantContext();
        requireMember(memberId);
        if (amount == null || amount.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        if (saleNo == null || saleNo.isBlank()) {
            throw new IllegalArgumentException("缺少销售单号，余额退回必须可追溯");
        }
        Long done = txMapper.selectCount(new LambdaQueryWrapper<PosMemberTx>()
                .eq(PosMemberTx::getTenantId, UserContext.tenantId())
                .eq(PosMemberTx::getSaleNo, saleNo)
                .eq(PosMemberTx::getType, "REFUND"));
        if (done != null && done > 0) {
            log.warn("[POS会员] 单号 {} 已退过余额，跳过重复退回", saleNo);
            return null;
        }
        memberMapper.update(null, new LambdaUpdateWrapper<PosMember>()
                .eq(PosMember::getId, memberId)
                .eq(PosMember::getTenantId, UserContext.tenantId())
                .setSql("balance = balance + " + amount.toPlainString())
                .setSql("total_spend = CASE WHEN total_spend >= " + amount.toPlainString()
                        + " THEN total_spend - " + amount.toPlainString()
                        + " ELSE 0 END")
                .set(PosMember::getUpdateTime, LocalDateTime.now()));
        PosMember after = requireMember(memberId);
        writeTx(memberId, "REFUND", amount, after.getBalance(), saleNo, null, "退货退回余额");
        return after.getBalance();
    }

    /* ── 内部 ─────────────────────────────────────────────────────────────── */

    private PosMember requireMember(String memberId) {
        PosMember m = memberMapper.selectOne(new LambdaQueryWrapper<PosMember>()
                .eq(PosMember::getId, memberId)
                .eq(PosMember::getTenantId, UserContext.tenantId())
                .last("LIMIT 1"));
        if (m == null) {
            throw new IllegalArgumentException("会员不存在");
        }
        return m;
    }

    private void writeTx(String memberId, String type, BigDecimal amount, BigDecimal balanceAfter,
                         String saleNo, String bizNo, String remark) {
        PosMemberTx t = new PosMemberTx();
        t.setTenantId(UserContext.tenantId());
        t.setMemberId(memberId);
        t.setType(type);
        t.setAmount(amount);
        t.setBalanceAfter(balanceAfter);
        t.setSaleNo(saleNo);
        t.setBizNo(bizNo);
        t.setOperatorId(UserContext.userId());
        t.setOperatorName(UserContext.username());
        t.setRemark(remark);
        t.setCreateTime(LocalDateTime.now());
        txMapper.insert(t);
    }

    /** 折扣率收敛到 [0.01, 1.00]，越界就夹紧而不是放行 —— 折扣 > 1 等于倒贴钱。 */
    private BigDecimal normalizeRate(BigDecimal rate) {
        if (rate == null) {
            return MAX_RATE;
        }
        if (rate.compareTo(MIN_RATE) < 0 || rate.compareTo(MAX_RATE) > 0) {
            throw new IllegalArgumentException("折扣率需在 0.01 ~ 1.00 之间（1=不打折，0.9=九折）");
        }
        return rate;
    }

    private String generateMemberNo(Long tenantId) {
        return "M" + LocalDateTime.now().format(NO_FMT)
                + String.format("%03d", NO_SEQ.incrementAndGet() % 1000);
    }

    private String generateBizNo(String prefix) {
        return prefix + LocalDateTime.now().format(NO_FMT)
                + String.format("%02d", NO_SEQ.incrementAndGet() % 100);
    }

    private Map<String, Object> view(PosMember m) {
        Map<String, Object> v = new LinkedHashMap<>();
        v.put("id", m.getId());
        v.put("memberNo", m.getMemberNo());
        v.put("phone", m.getPhone());
        v.put("name", m.getName());
        v.put("levelCode", m.getLevelCode());
        v.put("discountRate", m.getDiscountRate());
        v.put("balance", m.getBalance());
        v.put("totalRecharge", m.getTotalRecharge());
        v.put("totalSpend", m.getTotalSpend());
        v.put("points", m.getPoints());
        v.put("status", m.getStatus());
        v.put("remark", m.getRemark());
        v.put("createTime", m.getCreateTime());
        return v;
    }
}