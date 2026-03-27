package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;

/**
 * 对账服务基础类，提供公共的单价获取和自动修复逻辑
 *
 * @param <T> 对账实体类型
 * @param <M> 对账Mapper类型
 */
@Slf4j
public abstract class BaseReconciliationServiceImpl<T extends BaseReconciliationServiceImpl.ReconciliationEntity, M extends BaseMapper<T>> extends ServiceImpl<M, T> {

    /**
     * 检查是否需要自动修复单价
     *
     * @param reconciliation 对账实体
     * @param computedUnitPrice 计算出的单价
     * @return 是否需要修复
     */
    protected boolean shouldAutoFixAmounts(T reconciliation, BigDecimal computedUnitPrice) {
        if (reconciliation == null) {
            return false;
        }
        if (!StringUtils.hasText(reconciliation.getId())) {
            return false;
        }
        if (reconciliation.getQuantity() == null || reconciliation.getQuantity() <= 0) {
            return false;
        }

        String status = reconciliation.getStatus();
        String st = StringUtils.hasText(status) ? status.trim() : "";
        if ("approved".equals(st) || "paid".equals(st)) {
            return false;
        }

        BigDecimal curUp = reconciliation.getUnitPrice() == null ? BigDecimal.ZERO : reconciliation.getUnitPrice();
        
        // 简化条件：只要计算的单价大于0，且与当前单价不同，就允许修复
        if (computedUnitPrice == null || computedUnitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            return false;
        }
        
        // 只有当当前单价为0或者与计算的单价不同时，才进行修复
        if (curUp.setScale(2, RoundingMode.HALF_UP).compareTo(computedUnitPrice.setScale(2, RoundingMode.HALF_UP)) == 0) {
            return false;
        }

        return true;
    }

    /**
     * 自动修复单价和金额
     *
     * @param reconciliation 对账实体
     * @param computedUnitPrice 计算出的单价
     */
    protected void autoFixAmounts(T reconciliation, BigDecimal computedUnitPrice) {
        if (reconciliation == null) {
            return;
        }
        if (!shouldAutoFixAmounts(reconciliation, computedUnitPrice)) {
            return;
        }

        BigDecimal deductionAmount = reconciliation.getDeductionAmount() == null ? BigDecimal.ZERO : reconciliation.getDeductionAmount();
        BigDecimal total = computedUnitPrice.multiply(BigDecimal.valueOf(reconciliation.getQuantity())).setScale(2, RoundingMode.HALF_UP);
        BigDecimal finalAmount = total.subtract(deductionAmount).setScale(2, RoundingMode.HALF_UP);

        LocalDateTime now = LocalDateTime.now();

        reconciliation.setUnitPrice(computedUnitPrice);
        reconciliation.setTotalAmount(total);
        reconciliation.setFinalAmount(finalAmount);
        reconciliation.setUpdateTime(now);

        // 创建更新对象，只更新需要更新的字段
        T patch = createPatch(reconciliation);
        patch.setId(reconciliation.getId());
        patch.setUnitPrice(computedUnitPrice);
        patch.setTotalAmount(total);
        patch.setFinalAmount(finalAmount);
        patch.setUpdateTime(now);
        
        try {
            baseMapper.updateById(patch);
        } catch (Exception e) {
            log.warn("Failed to auto fix reconciliation amounts: reconciliationId={}", reconciliation.getId(), e);
        }
    }

    /**
     * 创建更新补丁对象
     *
     * @param reconciliation 原始对账实体
     * @return 更新补丁对象
     */
    protected abstract T createPatch(T reconciliation);

    /**
     * 对账实体接口，定义了对账实体必须具备的字段
     */
    public interface ReconciliationEntity {
        String getId();
        void setId(String id);
        String getStatus();
        void setStatus(String status);
        Integer getQuantity();
        void setQuantity(Integer quantity);
        BigDecimal getUnitPrice();
        void setUnitPrice(BigDecimal unitPrice);
        BigDecimal getTotalAmount();
        void setTotalAmount(BigDecimal totalAmount);
        BigDecimal getDeductionAmount();
        void setDeductionAmount(BigDecimal deductionAmount);
        BigDecimal getFinalAmount();
        void setFinalAmount(BigDecimal finalAmount);
        LocalDateTime getUpdateTime();
        void setUpdateTime(LocalDateTime updateTime);
        String getCreateBy();
        void setCreateBy(String createBy);
        String getUpdateBy();
        void setUpdateBy(String updateBy);
    }
}
