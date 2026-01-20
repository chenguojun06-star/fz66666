package com.fashion.supplychain.finance.service.impl;

import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.mapper.MaterialReconciliationMapper;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.util.StringUtils;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Map;

@Service
@Slf4j
public class MaterialReconciliationServiceImpl extends BaseReconciliationServiceImpl<MaterialReconciliation, MaterialReconciliationMapper>
        implements MaterialReconciliationService {

    @Autowired
    public MaterialReconciliationServiceImpl(StyleInfoService styleInfoService, StyleQuotationService styleQuotationService) {
        this.setStyleInfoService(styleInfoService);
        this.setStyleQuotationService(styleQuotationService);
    }

    @Override
    protected MaterialReconciliation createPatch(MaterialReconciliation reconciliation) {
        MaterialReconciliation patch = new MaterialReconciliation();
        patch.setId(reconciliation.getId());
        patch.setUnitPrice(reconciliation.getUnitPrice());
        patch.setTotalAmount(reconciliation.getTotalAmount());
        patch.setFinalAmount(reconciliation.getFinalAmount());
        patch.setUpdateTime(reconciliation.getUpdateTime());
        return patch;
    }

    @Override
    public IPage<MaterialReconciliation> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);

        // 创建分页对象
        Page<MaterialReconciliation> pageInfo = new Page<>(page, pageSize);

        // 构建查询条件
        String reconciliationNo = (String) params.getOrDefault("reconciliationNo", "");
        String supplierName = (String) params.getOrDefault("supplierName", "");
        String materialCode = (String) params.getOrDefault("materialCode", "");
        String status = (String) params.getOrDefault("status", "");

        // 使用条件构造器进行查询
        IPage<MaterialReconciliation> pageResult = baseMapper.selectPage(pageInfo,
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialReconciliation>()
                        .eq(StringUtils.hasText(reconciliationNo), MaterialReconciliation::getReconciliationNo,
                                reconciliationNo)
                        .like(StringUtils.hasText(supplierName), MaterialReconciliation::getSupplierName, supplierName)
                        .like(StringUtils.hasText(materialCode), MaterialReconciliation::getMaterialCode, materialCode)
                        .eq(StringUtils.hasText(status), MaterialReconciliation::getStatus, status)
                        .eq(MaterialReconciliation::getDeleteFlag, 0)
                        .orderByDesc(MaterialReconciliation::getCreateTime));

        // 自动修复单价
        if (pageResult != null && pageResult.getRecords() != null) {
            for (MaterialReconciliation r : pageResult.getRecords()) {
                autoFixAmountsIfNeeded(r);
            }
        }

        return pageResult;
    }

    @Override
    public MaterialReconciliation getById(Serializable id) {
        MaterialReconciliation r = super.getById(id);
        if (r != null) {
            autoFixAmountsIfNeeded(r);
        }
        return r;
    }

    private void autoFixAmountsIfNeeded(MaterialReconciliation r) {
        if (r == null) {
            return;
        }
        // 优先从款号报价中获取单价
        BigDecimal computedUp = resolveTotalUnitPriceFromStyleQuotation(r.getStyleNo(), r.getStyleId());
        if (computedUp.compareTo(BigDecimal.ZERO) > 0) {
            autoFixAmounts(r, computedUp);
        }
    }
}
