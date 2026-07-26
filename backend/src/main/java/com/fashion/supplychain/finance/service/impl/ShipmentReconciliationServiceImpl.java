package com.fashion.supplychain.finance.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.ParamUtils;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.mapper.ShipmentReconciliationMapper;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.util.OrderPricingSnapshotUtils;
import org.springframework.stereotype.Service;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.Map;

@Service
@Slf4j
public class ShipmentReconciliationServiceImpl extends BaseReconciliationServiceImpl<ShipmentReconciliation, ShipmentReconciliationMapper>
        implements ShipmentReconciliationService {

    private final ProductionOrderService productionOrderService;

    public ShipmentReconciliationServiceImpl(ProductionOrderService productionOrderService) {
        this.productionOrderService = productionOrderService;
    }

    @Override
    protected ShipmentReconciliation createPatch(ShipmentReconciliation reconciliation) {
        ShipmentReconciliation patch = new ShipmentReconciliation();
        patch.setId(reconciliation.getId());
        patch.setUnitPrice(reconciliation.getUnitPrice());
        patch.setTotalAmount(reconciliation.getTotalAmount());
        patch.setFinalAmount(reconciliation.getFinalAmount());
        patch.setUpdateTime(reconciliation.getUpdateTime());
        return patch;
    }

    private void autoFixAmountsIfNeeded(ShipmentReconciliation r) {
        if (r == null) {
            return;
        }
        ProductionOrder order = null;
        if (StringUtils.hasText(r.getOrderId())) {
            order = productionOrderService.getById(r.getOrderId().trim());
        }
        if (order == null && StringUtils.hasText(r.getOrderNo())) {
            order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getOrderNo, r.getOrderNo().trim())
                    .last("limit 1")
                    .one();
        }
        BigDecimal computedUp = order == null
                ? BigDecimal.ZERO
                : OrderPricingSnapshotUtils.resolveLockedOrderUnitPrice(order.getFactoryUnitPrice(), order.getOrderDetails());
        if (computedUp.compareTo(BigDecimal.ZERO) > 0) {
            autoFixAmounts(r, computedUp);
        }
    }

    @Override
    public ShipmentReconciliation getById(Serializable id) {
        ShipmentReconciliation r = super.getById(id);
        if (r != null) {
            autoFixAmountsIfNeeded(r);
        }
        return r;
    }

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

        // P0 防御性双重隔离：显式 tenant_id 过滤（与 stats 接口风格统一，符合 P0 铁律 4）
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();

        // 使用条件构造器进行查询
        IPage<ShipmentReconciliation> pageResult = baseMapper.selectPage(pageInfo,
                new LambdaQueryWrapper<ShipmentReconciliation>()
                        .eq(tenantId != null, ShipmentReconciliation::getTenantId, tenantId)
                        .eq(StringUtils.hasText(reconciliationNo), ShipmentReconciliation::getReconciliationNo,
                                reconciliationNo)
                        .like(StringUtils.hasText(customerName), ShipmentReconciliation::getCustomerName, customerName)
                        .like(StringUtils.hasText(orderNo), ShipmentReconciliation::getOrderNo, orderNo)
                        .like(StringUtils.hasText(styleNo), ShipmentReconciliation::getStyleNo, styleNo)
                        // 状态过滤：支持多值（逗号分隔），与 stats 的分类对齐
                        // 例：status=approved,paid → in("approved","paid")
                        .and(StringUtils.hasText(status), w -> {
                            String[] parts = status.split(",");
                            if (parts.length == 1) {
                                w.eq(ShipmentReconciliation::getStatus, parts[0].trim());
                            } else {
                                java.util.List<String> statusList = java.util.Arrays.stream(parts)
                                        .map(String::trim)
                                        .filter(StringUtils::hasText)
                                        .collect(java.util.stream.Collectors.toList());
                                w.in(ShipmentReconciliation::getStatus, statusList);
                            }
                        })
                        .orderByDesc(ShipmentReconciliation::getCreateTime));

        // 自动修复单价
        if (pageResult != null && pageResult.getRecords() != null) {
            for (ShipmentReconciliation r : pageResult.getRecords()) {
                autoFixAmountsIfNeeded(r);
            }
        }

        return pageResult;
    }

    @Override
    public boolean removeByOrderId(String orderId) {
        if (!org.springframework.util.StringUtils.hasText(orderId)) {
            return false;
        }
        return this.remove(new LambdaQueryWrapper<ShipmentReconciliation>()
                .eq(ShipmentReconciliation::getOrderId, orderId.trim()));
    }
}
