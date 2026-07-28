package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.mapper.PayrollSettlementMapper;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import java.math.BigDecimal;
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
        PayrollSettlement entity = baseMapper.selectById(id);
        if (entity != null) {
            // P0 铁律4：多租户隔离 — 详情查询必须校验租户归属，防止跨租户读取工资单
            com.fashion.supplychain.common.tenant.TenantAssert.assertBelongsToCurrentTenant(
                    entity.getTenantId(), "工资结算单");
        }
        return entity;
    }

    @Override
    public void deleteByOrderId(String orderId) {
        if (!StringUtils.hasText(orderId)) return;
        remove(new LambdaQueryWrapper<PayrollSettlement>()
                .eq(PayrollSettlement::getOrderId, orderId));
    }

    @Override
    public int atomicAddPaidAmount(String id, BigDecimal delta, BigDecimal expectedPaidAmount, Long tenantId) {
        return baseMapper.atomicAddPaidAmount(id, delta, expectedPaidAmount, tenantId);
    }

    @Override
    public int atomicAddDeductionAmount(String id, BigDecimal delta, BigDecimal expectedDeductionAmount, Long tenantId) {
        return baseMapper.atomicAddDeductionAmount(id, delta, expectedDeductionAmount, tenantId);
    }
}
