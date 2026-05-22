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
@Order(3)
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

        if (context.getBundleNo() != null && context.getBundleNo() > 0) {
            log.debug("[BundleLookup] {}跳过: bundleNo已提供({}), 应由精确策略处理",
                    getStrategyName(), context.getBundleNo());
            return null;
        }

        ProductionOrder order = context.getOrder();
        if (order == null) {
            order = productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getOrderNo, context.getOrderNo().trim())
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("limit 1"));
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
