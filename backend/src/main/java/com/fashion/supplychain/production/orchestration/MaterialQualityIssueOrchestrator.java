package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.orchestration.MaterialReconciliationOrchestrator;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialQualityIssue;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialQualityIssueService;
import com.fashion.supplychain.production.service.helper.MaterialPurchaseHelper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.ThreadLocalRandom;

@Service
@RequiredArgsConstructor
@Slf4j
public class MaterialQualityIssueOrchestrator {

    private final MaterialQualityIssueService materialQualityIssueService;
    private final MaterialPurchaseService materialPurchaseService;
    private final MaterialReconciliationService materialReconciliationService;
    private final MaterialReconciliationOrchestrator materialReconciliationOrchestrator;
    private final com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator billAggregationOrchestrator;

    public List<MaterialQualityIssue> listByPurchaseId(String purchaseId) {
        Long tenantId = UserContext.tenantId();
        return materialQualityIssueService.list(new LambdaQueryWrapper<MaterialQualityIssue>()
                .eq(MaterialQualityIssue::getDeleteFlag, 0)
                .eq(MaterialQualityIssue::getTenantId, tenantId)
                .eq(MaterialQualityIssue::getPurchaseId, purchaseId)
                .orderByDesc(MaterialQualityIssue::getCreateTime));
    }

    public boolean hasOpenIssue(String purchaseId) {
        if (!StringUtils.hasText(purchaseId)) {
            return false;
        }
        try {
            Long tenantId = UserContext.tenantId();
            return materialQualityIssueService.lambdaQuery()
                    .eq(MaterialQualityIssue::getPurchaseId, purchaseId.trim())
                    .eq(MaterialQualityIssue::getDeleteFlag, 0)
                    .eq(MaterialQualityIssue::getTenantId, tenantId)
                    .eq(MaterialQualityIssue::getStatus, "OPEN")
                    .count() > 0;
        } catch (Exception e) {
            log.warn("[hasOpenIssue] 查询品质异常失败(t_material_quality_issue表可能不存在)，跳过检查: {}", e.getMessage());
            return false;
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public MaterialQualityIssue create(Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        String purchaseId = str(body.get("purchaseId"));
        if (!StringUtils.hasText(purchaseId)) {
            throw new IllegalArgumentException("采购任务不能为空");
        }
        MaterialPurchase purchase = materialPurchaseService.getById(purchaseId);
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("采购任务不存在");
        }

        Integer issueQuantity = intOf(body.get("issueQuantity"));
        if (issueQuantity == null || issueQuantity <= 0) {
            throw new IllegalArgumentException("异常数量必须大于0");
        }
        int max = purchase.getArrivedQuantity() != null && purchase.getArrivedQuantity() > 0
                ? purchase.getArrivedQuantity()
                : purchase.getPurchaseQuantity() == null ? 0 : purchase.getPurchaseQuantity().intValue();
        if (max > 0 && issueQuantity > max) {
            throw new IllegalArgumentException("异常数量不能大于到货数量或采购数量");
        }

        String issueType = normalizeEnum(str(body.get("issueType")), "OTHER");
        String severity = normalizeEnum(str(body.get("severity")), "MAJOR");
        String disposition = normalizeEnum(str(body.get("disposition")), "RETURN_GOODS");
        String remark = str(body.get("remark"));
        if (!StringUtils.hasText(remark)) {
            throw new IllegalArgumentException("异常说明不能为空");
        }

        UserContext ctx = UserContext.get();
        MaterialQualityIssue issue = new MaterialQualityIssue();
        issue.setIssueNo(generateIssueNo());
        issue.setPurchaseId(purchase.getId());
        issue.setPurchaseNo(purchase.getPurchaseNo());
        issue.setOrderId(purchase.getOrderId());
        issue.setOrderNo(purchase.getOrderNo());
        issue.setStyleId(purchase.getStyleId());
        issue.setStyleNo(purchase.getStyleNo());
        issue.setSupplierId(purchase.getSupplierId());
        issue.setSupplierName(purchase.getSupplierName());
        issue.setMaterialId(purchase.getMaterialId());
        issue.setMaterialCode(purchase.getMaterialCode());
        issue.setMaterialName(purchase.getMaterialName());
        issue.setMaterialType(purchase.getMaterialType());
        issue.setIssueQuantity(issueQuantity);
        issue.setIssueType(issueType);
        issue.setSeverity(severity);
        issue.setDisposition(disposition);
        issue.setStatus("OPEN");
        issue.setEvidenceImageUrls(str(body.get("evidenceImageUrls")));
        issue.setRemark(remark);
        issue.setTenantId(UserContext.tenantId());
        issue.setDeleteFlag(0);
        if (ctx != null) {
            issue.setReporterId(str(ctx.getUserId()));
            issue.setReporterName(str(ctx.getUsername()));
        }
        materialQualityIssueService.save(issue);
        return issue;
    }

    @Transactional(rollbackFor = Exception.class)
    public MaterialQualityIssue resolve(String id, Map<String, Object> body) {
        TenantAssert.assertTenantContext();
        MaterialQualityIssue issue = materialQualityIssueService.getById(id);
        if (issue == null || (issue.getDeleteFlag() != null && issue.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("品质异常单不存在");
        }
        if ("RESOLVED".equalsIgnoreCase(issue.getStatus())) {
            return issue;
        }
        String resolutionRemark = str(body.get("resolutionRemark"));
        if (!StringUtils.hasText(resolutionRemark)) {
            throw new IllegalArgumentException("处理结果不能为空");
        }
        String disposition = normalizeEnum(str(body.get("disposition")), issue.getDisposition());
        MaterialPurchase purchase = materialPurchaseService.getById(issue.getPurchaseId());
        if (purchase == null || (purchase.getDeleteFlag() != null && purchase.getDeleteFlag() != 0)) {
            throw new NoSuchElementException("关联采购任务不存在");
        }
        applyBusinessResolution(issue, purchase, disposition, resolutionRemark);
        UserContext ctx = UserContext.get();
        issue.setStatus("RESOLVED");
        issue.setDisposition(disposition);
        issue.setResolutionRemark(resolutionRemark);
        issue.setResolvedTime(LocalDateTime.now());
        if (ctx != null) {
            issue.setResolverId(str(ctx.getUserId()));
            issue.setResolverName(str(ctx.getUsername()));
        }
        materialQualityIssueService.updateById(issue);
        return issue;
    }

    private void applyBusinessResolution(MaterialQualityIssue issue, MaterialPurchase purchase,
                                         String disposition, String resolutionRemark) {
        switch (disposition) {
            case "RETURN_GOODS":
                adjustPurchaseAfterIssue(purchase, issue, resolutionRemark, false);
                break;
            case "REPLENISH":
                adjustPurchaseAfterIssue(purchase, issue, resolutionRemark, false);
                MaterialPurchase extra = createReplacementPurchase(purchase, issue, resolutionRemark);
                issue.setRelatedPurchaseId(extra.getId());
                issue.setRelatedPurchaseNo(extra.getPurchaseNo());
                break;
            case "DEDUCT_PAYMENT":
                applyDeductionToReconciliation(issue, purchase, resolutionRemark);
                break;
            case "ACCEPT_AS_IS":
            default:
                appendPurchaseRemark(purchase, buildImpactRemark(issue, resolutionRemark, "让步接收，不调整数量"));
                materialPurchaseService.updateById(purchase);
                break;
        }
    }

    private void adjustPurchaseAfterIssue(MaterialPurchase purchase, MaterialQualityIssue issue,
                                          String resolutionRemark, boolean keepQuantity) {
        int currentArrived = purchase.getArrivedQuantity() == null ? 0 : purchase.getArrivedQuantity();
        int issueQty = issue.getIssueQuantity() == null ? 0 : issue.getIssueQuantity();
        int targetArrived = keepQuantity ? currentArrived : Math.max(0, currentArrived - issueQty);

        appendPurchaseRemark(purchase, buildImpactRemark(issue, resolutionRemark,
                keepQuantity ? "数量保留" : ("有效到货调整为 " + targetArrived)));
        purchase.setArrivedQuantity(targetArrived);
        if (!keepQuantity) {
            purchase.setReturnConfirmed(0);
            purchase.setReturnQuantity(null);
            purchase.setReturnConfirmerId(null);
            purchase.setReturnConfirmerName(null);
            purchase.setReturnConfirmTime(null);
        }
        int purchaseQty = purchase.getPurchaseQuantity() == null ? 0 : purchase.getPurchaseQuantity().intValue();
        purchase.setStatus(MaterialPurchaseHelper.resolveStatusByArrived(
                purchase.getStatus(), targetArrived, purchaseQty));
        if (targetArrived <= 0) {
            purchase.setActualArrivalDate(null);
        }
        materialPurchaseService.updatePurchaseAndUpdateOrder(purchase);
        materialReconciliationOrchestrator.upsertFromPurchaseId(purchase.getId());
    }

    private MaterialPurchase createReplacementPurchase(MaterialPurchase source, MaterialQualityIssue issue,
                                                       String resolutionRemark) {
        MaterialPurchase replacement = new MaterialPurchase();
        replacement.setMaterialId(source.getMaterialId());
        replacement.setMaterialCode(source.getMaterialCode());
        replacement.setMaterialName(source.getMaterialName());
        replacement.setMaterialType(source.getMaterialType());
        replacement.setSpecifications(source.getSpecifications());
        replacement.setUnit(source.getUnit());
        replacement.setPurchaseQuantity(BigDecimal.valueOf(issue.getIssueQuantity() == null ? 0 : issue.getIssueQuantity()));
        replacement.setArrivedQuantity(0);
        replacement.setSupplierId(source.getSupplierId());
        replacement.setSupplierName(source.getSupplierName());
        replacement.setUnitPrice(source.getUnitPrice());
        replacement.setOrderId(source.getOrderId());
        replacement.setOrderNo(source.getOrderNo());
        replacement.setStyleId(source.getStyleId());
        replacement.setStyleNo(source.getStyleNo());
        replacement.setStyleName(source.getStyleName());
        replacement.setStyleCover(source.getStyleCover());
        replacement.setSourceType(source.getSourceType());
        replacement.setPatternProductionId(source.getPatternProductionId());
        replacement.setFactoryName(source.getFactoryName());
        replacement.setFactoryType(source.getFactoryType());
        replacement.setOrderBizType(source.getOrderBizType());
        replacement.setColor(source.getColor());
        replacement.setSize(source.getSize());
        replacement.setFabricComposition(source.getFabricComposition());
        replacement.setFabricWidth(source.getFabricWidth());
        replacement.setFabricWeight(source.getFabricWeight());
        replacement.setExpectedArrivalDate(source.getExpectedArrivalDate());
        replacement.setExpectedShipDate(source.getExpectedShipDate());
        replacement.setRemark(String.format("【品质异常补货】来源异常单:%s；原采购单:%s；说明:%s",
                issue.getIssueNo(), source.getPurchaseNo(), resolutionRemark));
        replacement.setStatus("pending");
        materialPurchaseService.savePurchaseAndUpdateOrder(replacement);
        return replacement;
    }

    private void applyDeductionToReconciliation(MaterialQualityIssue issue, MaterialPurchase purchase,
                                                String resolutionRemark) {
        materialReconciliationOrchestrator.upsertFromPurchaseId(purchase.getId());
        MaterialReconciliation reconciliation = materialReconciliationService.lambdaQuery()
                .eq(MaterialReconciliation::getPurchaseId, purchase.getId())
                .eq(MaterialReconciliation::getDeleteFlag, 0)
                .orderByDesc(MaterialReconciliation::getCreateTime)
                .last("limit 1")
                .one();
        if (reconciliation == null || !StringUtils.hasText(reconciliation.getId())) {
            throw new IllegalStateException("当前采购尚未生成可扣款对账单");
        }
        String status = str(reconciliation.getStatus());
        if ("PAID".equalsIgnoreCase(status)) {
            throw new IllegalStateException("该对账单已付款，不能再自动扣款");
        }
        BigDecimal unitPrice = purchase.getUnitPrice() == null ? BigDecimal.ZERO : purchase.getUnitPrice();
        BigDecimal addition = unitPrice.multiply(BigDecimal.valueOf(issue.getIssueQuantity() == null ? 0 : issue.getIssueQuantity()))
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal deduction = reconciliation.getDeductionAmount() == null ? BigDecimal.ZERO : reconciliation.getDeductionAmount();
        BigDecimal totalAmount = reconciliation.getTotalAmount() == null ? BigDecimal.ZERO : reconciliation.getTotalAmount();
        MaterialReconciliation patch = new MaterialReconciliation();
        patch.setId(reconciliation.getId());
        patch.setDeductionAmount(deduction.add(addition));
        patch.setFinalAmount(totalAmount.subtract(patch.getDeductionAmount()));
        patch.setRemark(joinRemark(reconciliation.getRemark(),
                String.format("品质异常扣款[%s] %s", issue.getIssueNo(), resolutionRemark)));
        materialReconciliationService.updateById(patch);

        if (billAggregationOrchestrator != null) {
            try {
                billAggregationOrchestrator.syncAmountBySource("MATERIAL_RECONCILIATION", reconciliation.getId(), patch.getFinalAmount());
            } catch (Exception e) {
                log.warn("[QualityIssue] 扣款后同步账单金额失败: reconciliationId={}", reconciliation.getId(), e);
            }
        }

        issue.setDeductionAmount(addition);
        appendPurchaseRemark(purchase, buildImpactRemark(issue, resolutionRemark, "已联动物料对账扣款"));
        materialPurchaseService.updateById(purchase);
    }

    private void appendPurchaseRemark(MaterialPurchase purchase, String addition) {
        purchase.setRemark(joinRemark(purchase.getRemark(), addition));
    }

    private String buildImpactRemark(MaterialQualityIssue issue, String resolutionRemark, String suffix) {
        return String.format("品质异常[%s] %s；处理:%s；结果:%s",
                issue.getIssueNo(), issue.getRemark(), suffix, resolutionRemark);
    }

    private String joinRemark(String current, String addition) {
        String left = str(current);
        String right = str(addition);
        if (!StringUtils.hasText(left)) {
            return right;
        }
        if (!StringUtils.hasText(right)) {
            return left;
        }
        return left + "；" + right;
    }

    private String generateIssueNo() {
        String ts = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        int suffix = ThreadLocalRandom.current().nextInt(100, 1000);
        return "MQI" + ts + suffix;
    }

    private String str(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private Integer intOf(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception e) {
            return null;
        }
    }

    private String normalizeEnum(String value, String defaultValue) {
        String source = StringUtils.hasText(value) ? value : defaultValue;
        return String.valueOf(source).trim().toUpperCase(Locale.ROOT);
    }
}
