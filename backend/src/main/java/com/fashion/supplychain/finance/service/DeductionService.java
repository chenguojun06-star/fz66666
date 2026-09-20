package com.fashion.supplychain.finance.service;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.finance.entity.DeductionTypeConfig;
import com.fashion.supplychain.finance.mapper.DeductionTypeConfigMapper;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * D-474：扣款类型管理 + 录入扣款。
 * 录入的扣款会推成账单（billCategory=DEDUCTION，金额为负=冲减应付），
 * 之后在收付款中心跟正常账单一起对账、付款。
 */
@Service
public class DeductionService extends ServiceImpl<DeductionTypeConfigMapper, DeductionTypeConfig> {

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    /** 扣款类型列表 */
    public List<DeductionTypeConfig> listTypes(Long tenantId) {
        return this.lambdaQuery()
                .eq(DeductionTypeConfig::getTenantId, tenantId)
                .eq(DeductionTypeConfig::getDeleteFlag, 0)
                .orderByAsc(DeductionTypeConfig::getSortOrder)
                .list();
    }

    /** 新增/更新扣款类型 */
    public DeductionTypeConfig saveType(DeductionTypeConfig t, Long tenantId) {
        t.setTenantId(tenantId);
        if (t.getDeleteFlag() == null) t.setDeleteFlag(0);
        if (t.getStatus() == null) t.setStatus("ACTIVE");
        if (t.getApplyTarget() == null) t.setApplyTarget("WORKER");
        if (t.getSortOrder() == null) t.setSortOrder(0);
        if (t.getDefaultAmount() == null) t.setDefaultAmount(BigDecimal.ZERO);
        if (t.getDeductRatio() == null) t.setDeductRatio(BigDecimal.ZERO);

        DeductionTypeConfig exist = this.lambdaQuery()
                .eq(DeductionTypeConfig::getTenantId, tenantId)
                .eq(DeductionTypeConfig::getTypeCode, t.getTypeCode())
                .eq(DeductionTypeConfig::getDeleteFlag, 0)
                .last("LIMIT 1").one();
        if (exist != null) {
            t.setId(exist.getId());
            this.updateById(t);
        } else {
            if (t.getId() == null) t.setId(UUID.randomUUID().toString().replace("-", ""));
            this.save(t);
        }
        return t;
    }

    /**
     * 录入一笔扣款，推成账单。
     *
     * @param targetType   对象类型：WORKER / FACTORY
     * @param targetId     对象ID
     * @param targetName   对象名称
     * @param typeCode     扣款类型编码（来自扣款类型配置）
     * @param amount       扣款金额（不传则用类型的默认金额）
     * @param baseAmount   货款基数（类型按比例扣款时用）
     * @param month        结算月 yyyy-MM
     * @param remark       说明
     */
    public Map<String, Object> createDeduction(Long tenantId, String targetType, String targetId,
                                               String targetName, String typeCode, BigDecimal amount,
                                               BigDecimal baseAmount, String month, String remark) {
        Map<String, Object> result = new HashMap<>();

        DeductionTypeConfig type = null;
        if (typeCode != null && !typeCode.isBlank()) {
            type = this.lambdaQuery()
                    .eq(DeductionTypeConfig::getTenantId, tenantId)
                    .eq(DeductionTypeConfig::getTypeCode, typeCode)
                    .eq(DeductionTypeConfig::getDeleteFlag, 0)
                    .last("LIMIT 1").one();
        }

        // 金额优先级：手填 > 按比例算 > 类型默认
        BigDecimal deductAmount = amount;
        if (deductAmount == null && type != null && type.getDeductRatio() != null
                && type.getDeductRatio().compareTo(BigDecimal.ZERO) > 0 && baseAmount != null) {
            deductAmount = baseAmount.multiply(type.getDeductRatio())
                    .divide(BigDecimal.valueOf(100), 2, java.math.RoundingMode.HALF_UP);
        }
        if (deductAmount == null && type != null && type.getDefaultAmount() != null) {
            deductAmount = type.getDefaultAmount();
        }
        if (deductAmount == null || deductAmount.compareTo(BigDecimal.ZERO) <= 0) {
            result.put("success", false);
            result.put("message", "扣款金额必须大于 0");
            return result;
        }

        // 扣款在账单里记为负数（冲减应付）
        BillAggregationOrchestrator.BillPushRequest req =
                new BillAggregationOrchestrator.BillPushRequest();
        req.setBillType("PAYABLE");
        req.setBillCategory("DEDUCTION");
        req.setSourceType("MANUAL_DEDUCTION");
        String stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        req.setSourceId("DEDUCT-" + targetId + "-" + (typeCode == null ? "OTHER" : typeCode) + "-" + stamp);
        req.setSourceNo(req.getSourceId());
        req.setCounterpartyType(targetType);
        req.setCounterpartyId(targetId);
        req.setCounterpartyName(targetName);
        req.setAmount(deductAmount.negate());
        req.setSettlementMonth(month);
        req.setRemark((type != null ? type.getTypeName() : "扣款")
                + (remark != null && !remark.isBlank() ? "：" + remark : ""));

        billAggregationOrchestrator.pushBill(req);

        result.put("success", true);
        result.put("amount", deductAmount);
        result.put("billNo", req.getSourceId());
        result.put("message", "扣款已录入，已生成账单（金额记负数，付款时自动冲减）");
        return result;
    }
}
