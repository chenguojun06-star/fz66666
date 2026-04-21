package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.TaxConfig;
import com.fashion.supplychain.finance.service.TaxConfigService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * 税率配置编排器
 * 管理各税种税率，提供税额计算能力
 */
@Slf4j
@Service
public class TaxConfigOrchestrator {

    @Autowired
    private TaxConfigService taxConfigService;

    public List<TaxConfig> listAll() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        return taxConfigService.list(
                new LambdaQueryWrapper<TaxConfig>()
                        .eq(TaxConfig::getTenantId, tenantId)
                        .orderByAsc(TaxConfig::getTaxCode));
    }

    public List<TaxConfig> listActive() {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LocalDate today = LocalDate.now();
        return taxConfigService.list(
                new LambdaQueryWrapper<TaxConfig>()
                        .eq(TaxConfig::getStatus, "ACTIVE")
                        .eq(TaxConfig::getTenantId, tenantId)
                        .and(w -> w.isNull(TaxConfig::getExpiryDate).or().ge(TaxConfig::getExpiryDate, today))
                        .orderByAsc(TaxConfig::getTaxCode));
    }

    @Transactional(rollbackFor = Exception.class)
    public TaxConfig create(TaxConfig config) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();

        config.setTenantId(tenantId);
        if (!StringUtils.hasText(config.getStatus())) {
            config.setStatus("ACTIVE");
        }
        if (config.getIsDefault() == null) {
            config.setIsDefault(0);
        }
        if (ctx != null) {
            config.setCreatorId(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
        }

        // 若设为默认，清除同税种其他默认标记
        if (config.getIsDefault() == 1) {
            clearDefaultFlag(config.getTaxCode(), tenantId);
        }

        taxConfigService.save(config);
        log.info("[TaxConfigOrchestrator] 新增税率 {} code={} rate={}", config.getTaxName(), config.getTaxCode(), config.getTaxRate());
        return config;
    }

    @Transactional(rollbackFor = Exception.class)
    public TaxConfig update(TaxConfig config) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        if (config.getIsDefault() != null && config.getIsDefault() == 1) {
            clearDefaultFlag(config.getTaxCode(), tenantId);
        }

        taxConfigService.updateById(config);
        log.info("[TaxConfigOrchestrator] 更新税率 id={}", config.getId());
        return config;
    }

    @Transactional(rollbackFor = Exception.class)
    public void delete(String id) {
        TenantAssert.assertTenantContext();
        taxConfigService.removeById(id);
    }

    /**
     * 计算税额（被 InvoiceOrchestrator/FinancialReportOrchestrator 使用）
     */
    public BigDecimal calcTax(BigDecimal amount, String taxCode) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        TaxConfig cfg = taxConfigService.getOne(
                new LambdaQueryWrapper<TaxConfig>()
                        .eq(TaxConfig::getStatus, "ACTIVE")
                        .eq(TaxConfig::getTaxCode, taxCode)
                        .eq(TaxConfig::getIsDefault, 1)
                        .eq(TaxConfig::getTenantId, tenantId)
                        .last("LIMIT 1"));
        if (cfg == null) return BigDecimal.ZERO;
        return amount.multiply(cfg.getTaxRate()).setScale(2, java.math.RoundingMode.HALF_UP);
    }

    private void clearDefaultFlag(String taxCode, Long tenantId) {
        List<TaxConfig> defaults = taxConfigService.list(
                new LambdaQueryWrapper<TaxConfig>()
                        .eq(TaxConfig::getTaxCode, taxCode)
                        .eq(TaxConfig::getIsDefault, 1)
                        .eq(TaxConfig::getTenantId, tenantId));
        for (TaxConfig c : defaults) {
            c.setIsDefault(0);
            taxConfigService.updateById(c);
        }
    }
}
