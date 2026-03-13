package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.mapper.PayrollSettlementMapper;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class PayrollSettlementServiceImpl extends ServiceImpl<PayrollSettlementMapper, PayrollSettlement>
        implements PayrollSettlementService {

    @Override
    @SuppressWarnings("unchecked")
    public IPage<PayrollSettlement> queryPage(Map<String, Object> params) {
        Integer page = ParamUtils.getPage(params);
        Integer pageSize = ParamUtils.getPageSize(params);

        Page<PayrollSettlement> pageInfo = new Page<>(page, pageSize);

        String settlementNo = params == null ? null : (String) params.get("settlementNo");
        String orderNo = params == null ? null : (String) params.get("orderNo");
        String styleNo = params == null ? null : (String) params.get("styleNo");
        String status = params == null ? null : (String) params.get("status");
        java.util.List<String> factoryOrderIds = params == null ? null
                : (java.util.List<String>) params.get("_factoryOrderIds");

        return baseMapper.selectPage(pageInfo,
                new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<PayrollSettlement>()
                        .eq(StringUtils.hasText(settlementNo), PayrollSettlement::getSettlementNo, settlementNo)
                        .eq(StringUtils.hasText(orderNo), PayrollSettlement::getOrderNo, orderNo)
                        .eq(StringUtils.hasText(styleNo), PayrollSettlement::getStyleNo, styleNo)
                        .eq(StringUtils.hasText(status), PayrollSettlement::getStatus, status)
                        .in(factoryOrderIds != null && !factoryOrderIds.isEmpty(),
                                PayrollSettlement::getOrderId, factoryOrderIds)
                        .orderByDesc(PayrollSettlement::getCreateTime));
    }

    @Override
    public PayrollSettlement getDetailById(String id) {
        return baseMapper.selectById(id);
    }

    @Override
    public void deleteByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) return;
        remove(new LambdaQueryWrapper<PayrollSettlement>()
                .eq(PayrollSettlement::getOrderId, orderId));
    }
}
