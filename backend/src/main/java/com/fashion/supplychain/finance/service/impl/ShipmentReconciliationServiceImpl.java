package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.ShipmentReconciliationMapper;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import org.springframework.util.StringUtils;

import java.util.Map;

@Service
public class ShipmentReconciliationServiceImpl extends ServiceImpl<ShipmentReconciliationMapper, ShipmentReconciliation>
        implements ShipmentReconciliationService {

    @Override
    public IPage<ShipmentReconciliation> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);

        // 创建分页对象
        Page<ShipmentReconciliation> pageInfo = new Page<>(page, pageSize);

        // 构建查询条件
        String reconciliationNo = (String) params.getOrDefault("reconciliationNo", "");
        String customerName = (String) params.getOrDefault("customerName", "");
        String orderNo = (String) params.getOrDefault("orderNo", "");
        String styleNo = (String) params.getOrDefault("styleNo", "");
        String status = (String) params.getOrDefault("status", "");

        // 使用条件构造器进行查询
        return baseMapper.selectPage(pageInfo,
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<ShipmentReconciliation>()
                        .eq(StringUtils.hasText(reconciliationNo), ShipmentReconciliation::getReconciliationNo,
                                reconciliationNo)
                        .like(StringUtils.hasText(customerName), ShipmentReconciliation::getCustomerName, customerName)
                        .like(StringUtils.hasText(orderNo), ShipmentReconciliation::getOrderNo, orderNo)
                        .like(StringUtils.hasText(styleNo), ShipmentReconciliation::getStyleNo, styleNo)
                        .eq(StringUtils.hasText(status), ShipmentReconciliation::getStatus, status)
                        .orderByDesc(ShipmentReconciliation::getCreateTime));
    }
}
