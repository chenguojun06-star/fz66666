package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.mapper.MaterialReconciliationMapper;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.util.StringUtils;

import java.util.Map;

@Service
public class MaterialReconciliationServiceImpl extends ServiceImpl<MaterialReconciliationMapper, MaterialReconciliation>
        implements MaterialReconciliationService {

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
        return baseMapper.selectPage(pageInfo,
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<MaterialReconciliation>()
                        .eq(StringUtils.hasText(reconciliationNo), MaterialReconciliation::getReconciliationNo,
                                reconciliationNo)
                        .like(StringUtils.hasText(supplierName), MaterialReconciliation::getSupplierName, supplierName)
                        .like(StringUtils.hasText(materialCode), MaterialReconciliation::getMaterialCode, materialCode)
                        .eq(StringUtils.hasText(status), MaterialReconciliation::getStatus, status)
                        .eq(MaterialReconciliation::getDeleteFlag, 0)
                        .orderByDesc(MaterialReconciliation::getCreateTime));
    }
}
