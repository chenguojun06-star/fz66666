package com.fashion.supplychain.production.helper.lookup;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Order(2)
@Slf4j
public class OrderColorSizeLookupStrategy implements BundleLookupStrategy {

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Override
    public CuttingBundle lookup(BundleLookupContext context) {
        if (!StringUtils.hasText(context.getOrderNo())
                || !StringUtils.hasText(context.getColor())
                || !StringUtils.hasText(context.getSize())) {
            return null;
        }

        ProductionOrder order = context.getOrder();
        if (order == null) {
            order = productionOrderService.getByOrderNo(context.getOrderNo());
        }
        if (order == null) {
            return null;
        }

        try {
            CuttingBundle bundle = cuttingBundleService.getOne(
                    new LambdaQueryWrapper<CuttingBundle>()
                            .eq(CuttingBundle::getProductionOrderId, order.getId())
                            .eq(CuttingBundle::getColor, context.getColor())
                            .eq(CuttingBundle::getSize, context.getSize())
                            .last("limit 1"));

            if (bundle != null) {
                log.info("[BundleLookup] {}命中: orderNo={}, color={}, size={}, bundleId={}",
                        getStrategyName(), context.getOrderNo(), context.getColor(),
                        context.getSize(), bundle.getId());
            }
            return bundle;
        } catch (Exception e) {
            log.warn("[BundleLookup] {}查找失败: orderNo={}, color={}, size={}",
                    getStrategyName(), context.getOrderNo(), context.getColor(), context.getSize(), e);
            return null;
        }
    }

    @Override
    public String getStrategyName() {
        return "orderNo+color+size";
    }
}
