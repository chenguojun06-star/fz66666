package com.fashion.supplychain.production.helper.lookup;

import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.service.CuttingBundleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Order(3)
@Slf4j
public class OrderBundleNoLookupStrategy implements BundleLookupStrategy {

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Override
    public CuttingBundle lookup(BundleLookupContext context) {
        if (!StringUtils.hasText(context.getOrderNo()) || context.getBundleNo() == null || context.getBundleNo() <= 0) {
            return null;
        }

        try {
            CuttingBundle bundle = cuttingBundleService.getByBundleNo(context.getOrderNo(), context.getBundleNo());
            if (bundle != null && StringUtils.hasText(bundle.getId())) {
                log.info("[BundleLookup] {}命中: orderNo={}, bundleNo={}, bundleId={}",
                        getStrategyName(), context.getOrderNo(), context.getBundleNo(), bundle.getId());
            }
            return bundle;
        } catch (Exception e) {
            log.warn("[BundleLookup] {}查找失败: orderNo={}, bundleNo={}",
                    getStrategyName(), context.getOrderNo(), context.getBundleNo(), e);
            return null;
        }
    }

    @Override
    public String getStrategyName() {
        return "orderNo+bundleNo";
    }
}
