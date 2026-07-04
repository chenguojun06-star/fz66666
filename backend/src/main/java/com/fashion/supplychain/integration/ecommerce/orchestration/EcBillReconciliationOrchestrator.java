package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.EcSalesRevenue;
import com.fashion.supplychain.finance.service.EcSalesRevenueService;
import com.fashion.supplychain.integration.ecommerce.entity.EcPlatformBill;
import com.fashion.supplychain.integration.ecommerce.service.EcPlatformBillService;
import com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Phase 3 平台账单 AI 对账编排器
 *
 * <p>核心能力：
 * <ol>
 *   <li>拉取平台账单（当前 mock，留 fetchPlatformBills 扩展点对接真实平台 API）</li>
 *   <li>与本地 EcSalesRevenue 按 platformOrderNo 比对</li>
 *   <li>差异分类：NONE/MISSING_LOCAL/MISSING_PLATFORM/AMOUNT_MISMATCH</li>
 *   <li>AI 差异分析（技术性差异/真实差异/申诉候选），AI 失败走规则兜底</li>
 * </ol>
 *
 * <p>设计原则：
 * <ul>
 *   <li>不加 @Transactional：单条对账失败不影响其他</li>
 *   <li>去重：同账期同订单不重复落库（uk_tenant_period_order）</li>
 *   <li>不修改 EcSalesRevenue 状态，只读分析</li>
 * </ul>
 */
@Slf4j
@Service
@Lazy
public class EcBillReconciliationOrchestrator {

    @Autowired @Lazy private EcPlatformBillService billService;
    @Autowired @Lazy private EcSalesRevenueService revenueService;
    @Autowired @Lazy private AiInferenceGateway aiInferenceGateway;

    @Value("${fashion.ecommerce.bill.scene:bill_reconciliation_advisor}")
    private String aiScene;

    /** 金额差异容忍阈值（元），小于此值视为无差异 */
    private static final BigDecimal AMOUNT_TOLERANCE = new BigDecimal("0.01");

    /**
     * 拉取平台账单并完成对账
     * @param platform 平台代码（如 TAOBAO/JD），传 null 则全部平台
     * @param billPeriod 账期（如 2026-07），传 null 则默认当前月
     * @return 对账结果汇总
     */
    public ReconcileResult reconcile(String platform, String billPeriod) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (billPeriod == null || billPeriod.isBlank()) {
            billPeriod = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        }
        // 账期长度校验：避免 substring 越界（如 "2026" 4 字符 substring(0,7) 越界）
        // 支持 yyyy-MM（7字符）/ yyyy-Www（8字符） / yyyy-MM-dd（10字符）
        if (billPeriod.length() < 7) {
            throw new IllegalArgumentException("账期格式不合法，应为 yyyy-MM 或 yyyy-Www：" + billPeriod);
        }

        // 1. 拉取平台账单（mock，基于本地 EcSalesRevenue 生成模拟账单）
        List<PlatformBillItem> platformBills = fetchPlatformBills(tenantId, platform, billPeriod);
        if (platformBills.isEmpty()) {
            log.info("[BillReconcile] 无账单数据 tenantId={} platform={} period={}", tenantId, platform, billPeriod);
            ReconcileResult r = new ReconcileResult();
            r.setBillPeriod(billPeriod);
            r.setTotalBills(0);
            return r;
        }

        // 2. 查本地收入流水（按 platform + 账期月份匹配 shipTime）
        Map<String, EcSalesRevenue> localMap = queryLocalRevenueMap(tenantId, platform, billPeriod);

        // 3. 逐条对账
        int created = 0, matched = 0, mismatched = 0, missingLocal = 0;
        for (PlatformBillItem pb : platformBills) {
            try {
                EcSalesRevenue local = localMap.get(pb.platformOrderNo);
                ReconcileOutcome outcome = reconcileOne(tenantId, platform, billPeriod, pb, local);
                if (outcome.saved) created++;
                switch (outcome.diffType) {
                    case "NONE" -> matched++;
                    case "MISSING_LOCAL" -> missingLocal++;
                    case "AMOUNT_MISMATCH" -> mismatched++;
                }
            } catch (Exception e) {
                log.warn("[BillReconcile] 对账失败 platformOrderNo={}: {}", pb.platformOrderNo, e.getMessage());
            }
        }
        ReconcileResult result = new ReconcileResult();
        result.setBillPeriod(billPeriod);
        result.setTotalBills(platformBills.size());
        result.setMatched(matched);
        result.setMismatched(mismatched);
        result.setMissingLocal(missingLocal);
        result.setNewBills(created);
        log.info("[BillReconcile] 对账完成 tenantId={} period={} total={} matched={} mismatched={} missingLocal={} newBills={}",
                tenantId, billPeriod, platformBills.size(), matched, mismatched, missingLocal, created);
        return result;
    }

    /** 单条对账：比对 + AI 分析 + 落库（已存在则更新） */
    private ReconcileOutcome reconcileOne(Long tenantId, String platform, String billPeriod,
                                           PlatformBillItem pb, EcSalesRevenue local) {
        ReconcileOutcome o = new ReconcileOutcome();
        o.diffType = "NONE";
        o.saved = false;

        BigDecimal platformAmount = pb.amount;
        BigDecimal localAmount = local != null ? (local.getPayAmount() != null ? local.getPayAmount() : BigDecimal.ZERO) : BigDecimal.ZERO;
        BigDecimal diffAmount = platformAmount.subtract(localAmount);
        String diffType;
        if (local == null) {
            diffType = "MISSING_LOCAL";
        } else if (diffAmount.abs().compareTo(AMOUNT_TOLERANCE) <= 0) {
            diffType = "NONE";
        } else {
            diffType = "AMOUNT_MISMATCH";
        }
        o.diffType = diffType;

        // 仅对差异项落库（NONE 不落库，避免噪声）
        if ("NONE".equals(diffType)) return o;

        // AI 差异分析
        AiAnalysis ai = callAiForAnalysis(pb, local, diffAmount, diffType);

        // 重复对账：已存在则更新金额与 AI 分析，不重复新增
        EcPlatformBill existing = billService.getByPeriodAndOrder(tenantId, platform, billPeriod, pb.platformOrderNo);
        if (existing != null) {
            existing.setPlatformAmount(platformAmount);
            existing.setLocalAmount(localAmount);
            existing.setDiffAmount(diffAmount);
            existing.setDiffType(diffType);
            existing.setLocalRevenueId(local != null ? local.getId() : null);
            existing.setLocalRevenueNo(local != null ? local.getRevenueNo() : null);
            existing.setAiAnalysis(ai != null ? ai.analysis : buildRuleFallback(diffType, diffAmount));
            existing.setAiConfidence(ai != null ? ai.confidence : 60);
            existing.setFetchedTime(LocalDateTime.now());
            billService.updateById(existing);
            o.saved = true;
            return o;
        }

        EcPlatformBill bill = new EcPlatformBill();
        bill.setTenantId(tenantId);
        bill.setPlatform(platform);
        bill.setShopName(pb.shopName);
        bill.setBillPeriod(billPeriod);
        bill.setBillNo(pb.billNo);
        bill.setPlatformOrderNo(pb.platformOrderNo);
        bill.setLocalRevenueId(local != null ? local.getId() : null);
        bill.setLocalRevenueNo(local != null ? local.getRevenueNo() : null);
        bill.setPlatformAmount(platformAmount);
        bill.setLocalAmount(localAmount);
        bill.setDiffAmount(diffAmount);
        bill.setDiffType(diffType);
        bill.setAiAnalysis(ai != null ? ai.analysis : buildRuleFallback(diffType, diffAmount));
        bill.setAiConfidence(ai != null ? ai.confidence : 60);
        bill.setHandledStatus(0);
        bill.setFetchedTime(LocalDateTime.now());
        billService.save(bill);
        o.saved = true;
        return o;
    }

    /** AI 差异分析，失败返回 null 走规则兜底 */
    private AiAnalysis callAiForAnalysis(PlatformBillItem pb, EcSalesRevenue local,
                                          BigDecimal diffAmount, String diffType) {
        if (aiInferenceGateway == null) return null;
        String prompt = buildPrompt(pb, local, diffAmount, diffType);
        try {
            IntelligenceInferenceResult res = aiInferenceGateway.chat(
                    aiScene,
                    "你是服装电商财务对账助手。分析平台账单与本地收入的差异原因，返回 JSON："
                    + "{\"analysis\":\"差异原因分析\",\"confidence\":0-100}。"
                    + "常见原因：平台佣金/手续费扣除、优惠券抵扣、跨账期结算、平台技术延迟、真实金额错误。",
                    prompt);
            if (res == null || !res.isSuccess() || res.getContent() == null) return null;
            return parseAiAnalysis(res.getContent());
        } catch (Exception e) {
            log.warn("[BillReconcile] AI 调用失败，走规则兜底: {}", e.getMessage());
            return null;
        }
    }

    private String buildPrompt(PlatformBillItem pb, EcSalesRevenue local,
                               BigDecimal diffAmount, String diffType) {
        StringBuilder sb = new StringBuilder();
        sb.append("平台: ").append(pb.platform).append("\n");
        sb.append("平台订单号: ").append(pb.platformOrderNo).append("\n");
        sb.append("账单金额: ").append(pb.amount).append("\n");
        if (local != null) {
            sb.append("本地收入金额: ").append(local.getPayAmount()).append("\n");
            sb.append("本地收入流水号: ").append(local.getRevenueNo()).append("\n");
            sb.append("本地运费: ").append(local.getFreight()).append("\n");
            sb.append("本地优惠: ").append(local.getDiscount()).append("\n");
        } else {
            sb.append("本地无对应收入流水\n");
        }
        sb.append("差异金额: ").append(diffAmount).append("\n");
        sb.append("差异类型: ").append(diffType).append("\n");
        sb.append("请分析差异原因并给出处理建议。");
        return sb.toString();
    }

    private AiAnalysis parseAiAnalysis(String content) {
        if (content == null) return null;
        int start = content.indexOf('{');
        int end = content.lastIndexOf('}');
        if (start < 0 || end <= start) return null;
        try {
            com.fasterxml.jackson.databind.ObjectMapper mapper = new com.fasterxml.jackson.databind.ObjectMapper();
            com.fasterxml.jackson.databind.JsonNode node = mapper.readTree(content.substring(start, end + 1));
            AiAnalysis a = new AiAnalysis();
            a.analysis = node.has("analysis") ? node.get("analysis").asText() : null;
            a.confidence = node.has("confidence") ? node.get("confidence").asInt() : 60;
            return a;
        } catch (Exception e) {
            log.warn("[BillReconcile] AI 返回解析失败: {}", e.getMessage());
            return null;
        }
    }

    private String buildRuleFallback(String diffType, BigDecimal diffAmount) {
        if ("MISSING_LOCAL".equals(diffType)) return "本地无对应收入流水，建议核查订单是否已出库或是否漏记";
        if ("AMOUNT_MISMATCH".equals(diffType)) {
            return diffAmount.signum() > 0
                    ? "平台金额大于本地，可能是平台佣金扣除或跨账期结算，建议核查平台账单明细"
                    : "本地金额大于平台，可能是优惠券抵扣或平台优惠，建议核查订单实付金额";
        }
        return "建议人工核查";
    }

    /**
     * 拉取平台账单（mock 实现）
     * <p>当前基于本地 EcSalesRevenue 生成模拟账单，故意引入少量差异以演示对账能力。
     * <p>后续对接真实平台 API 时，替换此方法实现即可。
     */
    private List<PlatformBillItem> fetchPlatformBills(Long tenantId, String platform, String billPeriod) {
        // mock：取本地收入流水作为账单基础数据，模拟 10% 概率金额差异 + 5% 概率完全不同
        String periodPrefix = safeYearMonthPrefix(billPeriod);
        List<EcSalesRevenue> revenues = revenueService.list(new LambdaQueryWrapper<EcSalesRevenue>()
                .eq(EcSalesRevenue::getTenantId, tenantId)
                .eq(platform != null, EcSalesRevenue::getPlatform, platform)
                .likeRight(EcSalesRevenue::getShipTime, periodPrefix));
        return revenues.stream()
                .map(r -> {
                    PlatformBillItem item = new PlatformBillItem();
                    item.platform = r.getPlatform();
                    item.shopName = r.getShopName();
                    item.billNo = "PL-" + billPeriod + "-" + r.getPlatformOrderNo();
                    item.platformOrderNo = r.getPlatformOrderNo();
                    // mock：模拟 10% 概率金额差异（±5 元）、5% 概率完全不同
                    int rand = (int) (Math.random() * 100);
                    if (rand < 5) {
                        item.amount = r.getPayAmount() != null
                                ? r.getPayAmount().add(new BigDecimal("3.50")) : new BigDecimal("3.50");
                    } else if (rand < 10) {
                        item.amount = r.getPayAmount() != null
                                ? r.getPayAmount().subtract(new BigDecimal("2.00")) : new BigDecimal("0");
                    } else {
                        item.amount = r.getPayAmount() != null ? r.getPayAmount() : BigDecimal.ZERO;
                    }
                    return item;
                })
                .toList();
    }

    /** 查本地收入流水，按 platformOrderNo 建立 Map */
    private Map<String, EcSalesRevenue> queryLocalRevenueMap(Long tenantId, String platform, String billPeriod) {
        String periodPrefix = safeYearMonthPrefix(billPeriod);
        List<EcSalesRevenue> list = revenueService.list(new LambdaQueryWrapper<EcSalesRevenue>()
                .eq(EcSalesRevenue::getTenantId, tenantId)
                .eq(platform != null, EcSalesRevenue::getPlatform, platform)
                .likeRight(EcSalesRevenue::getShipTime, periodPrefix));
        Map<String, EcSalesRevenue> map = new HashMap<>();
        for (EcSalesRevenue r : list) {
            if (r.getPlatformOrderNo() != null) map.put(r.getPlatformOrderNo(), r);
        }
        return map;
    }

    /**
     * 安全提取账期前缀用于 likeRight 匹配。
     * yyyy-MM（7字符） → 直接返回
     * yyyy-Www（8字符） → 返回前 7 字符（yyyy-W 加首位周数，周账期对账时月份仍可命中）
     * yyyy-MM-dd（10字符） → 返回前 7 字符（yyyy-MM）
     */
    private String safeYearMonthPrefix(String billPeriod) {
        if (billPeriod == null) return "";
        return billPeriod.length() >= 7 ? billPeriod.substring(0, 7) : billPeriod;
    }

    /** mock 平台账单项 */
    private static class PlatformBillItem {
        String platform;
        String shopName;
        String billNo;
        String platformOrderNo;
        BigDecimal amount;
    }

    /** AI 分析结果 */
    private static class AiAnalysis {
        String analysis;
        int confidence;
    }

    /** 单条对账结果 */
    private static class ReconcileOutcome {
        String diffType;
        boolean saved;
    }

    /** 对账汇总结果 */
    @Data
    public static class ReconcileResult {
        private String billPeriod;
        private int totalBills;
        private int matched;
        private int mismatched;
        private int missingLocal;
        private int newBills;
    }
}
