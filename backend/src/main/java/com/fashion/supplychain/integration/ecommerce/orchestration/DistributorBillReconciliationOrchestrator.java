package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.EcSalesRevenue;
import com.fashion.supplychain.finance.service.EcSalesRevenueService;
import com.fashion.supplychain.integration.ecommerce.entity.DistributorProfile;
import com.fashion.supplychain.integration.ecommerce.entity.EcPlatformBill;
import com.fashion.supplychain.integration.ecommerce.service.DistributorProfileService;
import com.fashion.supplychain.integration.ecommerce.service.EcPlatformBillService;
import com.fashion.supplychain.intelligence.gateway.AiInferenceGateway;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 分销对账 Orchestrator（Phase 4）
 * <p>
 * 平移 Phase 3 的 EcBillReconciliationOrchestrator 对账模型：
 * 1. 拉取分销商订单流水（mock：以 EcSalesRevenue 中 revenue_source=DISTRIBUTOR 为账单源）
 * 2. 与本地出库流水按 platformOrderNo 比对
 * 3. 差异分类：NONE / MISSING_LOCAL / AMOUNT_MISMATCH
 * 4. AI 分析差异原因（复用 AiInferenceGateway）
 * <p>
 * 与 Phase 3 的差异：
 * - 数据源：分销商账单 vs 平台账单
 * - 比对维度：distributorId + billPeriod vs platform + billPeriod
 * - 落库：复用 t_ec_platform_bill，bill_source=DISTRIBUTOR
 * <p>
 * 事务边界在此层（D-001）
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DistributorBillReconciliationOrchestrator {

    private final EcSalesRevenueService revenueService;
    private final EcPlatformBillService billService;
    private final DistributorProfileService profileService;
    private final AiInferenceGateway aiInferenceGateway;

    private static final BigDecimal AMOUNT_TOLERANCE = new BigDecimal("0.01");
    private static final String AI_SCENE = "distributor_bill_reconcile";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    /**
     * 触发分销对账
     * @param distributorId 分销商ID（null=全部分销商）
     * @param billPeriod    账期（如 2026-07），null=当前月
     */
    public ReconcileResult reconcile(Long distributorId, String billPeriod) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        if (billPeriod == null || billPeriod.isBlank()) {
            billPeriod = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        }
        if (billPeriod.length() < 7) {
            throw new IllegalArgumentException("账期格式不合法：" + billPeriod);
        }
        final String period = billPeriod;

        // 选定分销商列表
        List<DistributorProfile> distributors;
        if (distributorId != null) {
            DistributorProfile d = profileService.getByIdAndTenant(tenantId, distributorId);
            distributors = d != null ? List.of(d) : List.of();
        } else {
            distributors = profileService.listByTenant(tenantId, null, null, "ACTIVE");
        }
        if (distributors.isEmpty()) {
            log.info("[DistributorReconcile] 无分销商 tenantId={} distributorId={}", tenantId, distributorId);
            ReconcileResult r = new ReconcileResult();
            r.setBillPeriod(period);
            r.setTotalBills(0);
            return r;
        }

        int total = 0, matched = 0, mismatched = 0, missingLocal = 0, newBills = 0;
        for (DistributorProfile d : distributors) {
            // 1. mock：拉取该分销商账单（以 EcSalesRevenue 中 revenue_source=DISTRIBUTOR 为账单源）
            List<EcSalesRevenue> bills = fetchDistributorBills(tenantId, d.getId(), period);
            // 2. 查本地出库流水（同表 EcSalesRevenue，按 distributorId 关联 EcommerceOrder 反查）
            Map<String, EcSalesRevenue> localMap = queryLocalRevenueMap(tenantId, d.getId(), period);

            for (EcSalesRevenue bill : bills) {
                total++;
                try {
                    EcSalesRevenue local = localMap.get(bill.getPlatformOrderNo());
                    String diffType = classifyDiff(bill.getPayAmount(),
                            local != null ? local.getPayAmount() : null);
                    switch (diffType) {
                        case "NONE" -> matched++;
                        case "MISSING_LOCAL" -> missingLocal++;
                        case "AMOUNT_MISMATCH" -> mismatched++;
                    }
                    if ("NONE".equals(diffType)) continue;
                    // AI 分析 + 落库（已存在则更新）
                    boolean saved = saveOrUpdateBill(tenantId, d, period, bill, local, diffType);
                    if (saved) newBills++;
                } catch (Exception e) {
                    log.warn("[DistributorReconcile] 对账失败 distributorId={} orderNo={}: {}",
                            d.getId(), bill.getPlatformOrderNo(), e.getMessage());
                }
            }
        }
        ReconcileResult result = new ReconcileResult();
        result.setBillPeriod(period);
        result.setTotalBills(total);
        result.setMatched(matched);
        result.setMismatched(mismatched);
        result.setMissingLocal(missingLocal);
        result.setNewBills(newBills);
        log.info("[DistributorReconcile] 对账完成 tenantId={} period={} distributors={} total={} matched={} mismatched={} missingLocal={} newBills={}",
                tenantId, period, distributors.size(), total, matched, mismatched, missingLocal, newBills);
        return result;
    }

    /** 分类差异 */
    private String classifyDiff(BigDecimal billAmount, BigDecimal localAmount) {
        if (localAmount == null) return "MISSING_LOCAL";
        BigDecimal diff = billAmount.subtract(localAmount);
        if (diff.abs().compareTo(AMOUNT_TOLERANCE) <= 0) return "NONE";
        return "AMOUNT_MISMATCH";
    }

    /** AI 分析 + 落库（已存在则更新） */
    @Transactional(rollbackFor = Exception.class)
    public boolean saveOrUpdateBill(Long tenantId, DistributorProfile d, String billPeriod,
                                     EcSalesRevenue bill, EcSalesRevenue local, String diffType) {
        BigDecimal billAmount = bill.getPayAmount() != null ? bill.getPayAmount() : BigDecimal.ZERO;
        BigDecimal localAmount = local != null && local.getPayAmount() != null ? local.getPayAmount() : BigDecimal.ZERO;
        BigDecimal diffAmount = billAmount.subtract(localAmount);
        AiAnalysis ai = callAiForAnalysis(d, bill, local, diffAmount, diffType);

        // 查是否已存在
        EcPlatformBill existing = billService.getOne(new LambdaQueryWrapper<EcPlatformBill>()
                .eq(EcPlatformBill::getTenantId, tenantId)
                .eq(EcPlatformBill::getBillSource, "DISTRIBUTOR")
                .eq(EcPlatformBill::getDistributorId, d.getId())
                .eq(EcPlatformBill::getBillPeriod, billPeriod)
                .eq(EcPlatformBill::getPlatformOrderNo, bill.getPlatformOrderNo()), false);
        if (existing != null) {
            existing.setPlatformAmount(billAmount);
            existing.setLocalAmount(localAmount);
            existing.setDiffAmount(diffAmount);
            existing.setDiffType(diffType);
            existing.setLocalRevenueId(local != null ? local.getId() : null);
            existing.setLocalRevenueNo(local != null ? local.getRevenueNo() : null);
            existing.setAiAnalysis(ai != null ? ai.analysis : buildRuleFallback(diffType, diffAmount));
            existing.setAiConfidence(ai != null ? ai.confidence : 60);
            existing.setFetchedTime(LocalDateTime.now());
            billService.updateById(existing);
            return true;
        }
        EcPlatformBill newBill = new EcPlatformBill();
        newBill.setTenantId(tenantId);
        newBill.setBillSource("DISTRIBUTOR");
        newBill.setDistributorId(d.getId());
        newBill.setPlatform(d.getDistributorName());
        newBill.setShopName(d.getDistributorName());
        newBill.setBillPeriod(billPeriod);
        newBill.setBillNo("DS-" + billPeriod + "-" + bill.getPlatformOrderNo());
        newBill.setPlatformOrderNo(bill.getPlatformOrderNo());
        newBill.setLocalRevenueId(local != null ? local.getId() : null);
        newBill.setLocalRevenueNo(local != null ? local.getRevenueNo() : null);
        newBill.setPlatformAmount(billAmount);
        newBill.setLocalAmount(localAmount);
        newBill.setDiffAmount(diffAmount);
        newBill.setDiffType(diffType);
        newBill.setAiAnalysis(ai != null ? ai.analysis : buildRuleFallback(diffType, diffAmount));
        newBill.setAiConfidence(ai != null ? ai.confidence : 60);
        newBill.setHandledStatus(0);
        newBill.setFetchedTime(LocalDateTime.now());
        billService.save(newBill);
        return true;
    }

    /** mock：拉取分销商账单（基于 EcSalesRevenue 中 revenue_source=DISTRIBUTOR） */
    private List<EcSalesRevenue> fetchDistributorBills(Long tenantId, Long distributorId, String billPeriod) {
        String prefix = billPeriod.length() >= 7 ? billPeriod.substring(0, 7) : billPeriod;
        // 查 revenue_source=DISTRIBUTOR 且关联 EcommerceOrder.distributor_id 的流水
        // 这里简化：直接查 EcSalesRevenue 中 shipTime like 'yyyy-MM' 且 revenue_source=DISTRIBUTOR
        // 实际分销商维度通过 ec_order_id 关联 EcommerceOrder.distributor_id
        List<EcSalesRevenue> all = revenueService.list(new LambdaQueryWrapper<EcSalesRevenue>()
                .eq(EcSalesRevenue::getTenantId, tenantId)
                .eq(EcSalesRevenue::getRevenueSource, "DISTRIBUTOR")
                .likeRight(EcSalesRevenue::getShipTime, prefix));
        // mock：模拟 10% 概率金额差异
        return all.stream()
                .map(r -> {
                    int rand = (int) (Math.random() * 100);
                    if (rand < 5) {
                        EcSalesRevenue mock = copyRevenue(r);
                        mock.setPayAmount(r.getPayAmount() != null
                                ? r.getPayAmount().add(new BigDecimal("3.50")) : new BigDecimal("3.50"));
                        return mock;
                    } else if (rand < 10) {
                        EcSalesRevenue mock = copyRevenue(r);
                        mock.setPayAmount(r.getPayAmount() != null
                                ? r.getPayAmount().subtract(new BigDecimal("2.00")) : BigDecimal.ZERO);
                        return mock;
                    }
                    return r;
                })
                .toList();
    }

    private EcSalesRevenue copyRevenue(EcSalesRevenue src) {
        EcSalesRevenue dst = new EcSalesRevenue();
        dst.setId(src.getId());
        dst.setRevenueNo(src.getRevenueNo());
        dst.setEcOrderId(src.getEcOrderId());
        dst.setEcOrderNo(src.getEcOrderNo());
        dst.setPlatformOrderNo(src.getPlatformOrderNo());
        dst.setPlatform(src.getPlatform());
        dst.setShopName(src.getShopName());
        dst.setSkuCode(src.getSkuCode());
        dst.setQuantity(src.getQuantity());
        dst.setUnitPrice(src.getUnitPrice());
        dst.setTotalAmount(src.getTotalAmount());
        dst.setPayAmount(src.getPayAmount());
        dst.setFreight(src.getFreight());
        dst.setDiscount(src.getDiscount());
        dst.setStatus(src.getStatus());
        dst.setRevenueSource(src.getRevenueSource());
        dst.setShipTime(src.getShipTime());
        return dst;
    }

    /** 查本地出库流水，按 platformOrderNo 建立 Map */
    private Map<String, EcSalesRevenue> queryLocalRevenueMap(Long tenantId, Long distributorId, String billPeriod) {
        String prefix = billPeriod.length() >= 7 ? billPeriod.substring(0, 7) : billPeriod;
        List<EcSalesRevenue> list = revenueService.list(new LambdaQueryWrapper<EcSalesRevenue>()
                .eq(EcSalesRevenue::getTenantId, tenantId)
                .eq(EcSalesRevenue::getRevenueSource, "DISTRIBUTOR")
                .likeRight(EcSalesRevenue::getShipTime, prefix));
        Map<String, EcSalesRevenue> map = new HashMap<>();
        for (EcSalesRevenue r : list) {
            if (r.getPlatformOrderNo() != null) map.put(r.getPlatformOrderNo(), r);
        }
        return map;
    }

    /** 查询分销账单列表 */
    public List<EcPlatformBill> listBills(Long distributorId, String billPeriod, boolean pendingOnly) {
        Long tenantId = UserContext.tenantId();
        return billService.list(new LambdaQueryWrapper<EcPlatformBill>()
                .eq(EcPlatformBill::getTenantId, tenantId)
                .eq(EcPlatformBill::getBillSource, "DISTRIBUTOR")
                .eq(distributorId != null, EcPlatformBill::getDistributorId, distributorId)
                .eq(billPeriod != null && !billPeriod.isBlank(), EcPlatformBill::getBillPeriod, billPeriod)
                .eq(pendingOnly, EcPlatformBill::getHandledStatus, 0)
                .orderByDesc(EcPlatformBill::getCreateTime));
    }

    /** AI 差异分析（复用 AiInferenceGateway） */
    private AiAnalysis callAiForAnalysis(DistributorProfile d, EcSalesRevenue bill,
                                         EcSalesRevenue local, BigDecimal diffAmount, String diffType) {
        try {
            String systemPrompt = "你是分销对账专家，分析分销商账单与本地出库流水的差异原因，"
                    + "输出 JSON 格式：{\"analysis\":\"原因分析(50字内)\",\"confidence\":0-100}";
            StringBuilder prompt = new StringBuilder();
            prompt.append("分销商：").append(d.getDistributorName()).append("（等级：").append(d.getDistributorLevel()).append("）\n");
            prompt.append("订单号：").append(bill.getPlatformOrderNo()).append("\n");
            prompt.append("差异类型：").append(diffType).append("\n");
            prompt.append("账单金额：").append(bill.getPayAmount()).append("\n");
            prompt.append("本地金额：").append(local != null ? local.getPayAmount() : "无").append("\n");
            prompt.append("差异金额：").append(diffAmount).append("\n");
            com.fashion.supplychain.intelligence.dto.IntelligenceInferenceResult inf =
                    aiInferenceGateway.chat(AI_SCENE, systemPrompt, prompt.toString());
            String resp = inf != null ? inf.getContent() : null;
            if (resp == null || resp.isBlank()) return null;
            String json = extractJson(resp);
            JsonNode node = MAPPER.readTree(json);
            AiAnalysis r = new AiAnalysis();
            r.analysis = node.has("analysis") ? node.get("analysis").asText() : null;
            r.confidence = node.has("confidence") ? node.get("confidence").asInt() : 60;
            return r;
        } catch (Exception e) {
            log.warn("[DistributorReconcile] AI 分析失败 orderNo={}: {}", bill.getPlatformOrderNo(), e.getMessage());
            return null;
        }
    }

    private String extractJson(String text) {
        int start = text.indexOf('{');
        int end = text.lastIndexOf('}');
        if (start >= 0 && end > start) return text.substring(start, end + 1);
        return text;
    }

    private String buildRuleFallback(String diffType, BigDecimal diffAmount) {
        return switch (diffType) {
            case "MISSING_LOCAL" -> "本地缺失该订单出库流水，请核实是否已发货";
            case "AMOUNT_MISMATCH" -> "金额差异 " + diffAmount + " 元，请核对供货价/优惠/运费";
            default -> "请人工核对";
        };
    }

    // ==================== 内部类 ====================

    @Data
    public static class ReconcileResult {
        private String billPeriod;
        private int totalBills;
        private int matched;
        private int mismatched;
        private int missingLocal;
        private int newBills;
    }

    private static class AiAnalysis {
        String analysis;
        int confidence;
    }
}
