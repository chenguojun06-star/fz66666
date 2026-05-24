package com.fashion.supplychain.production.helper.lookup;

import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.service.CuttingBundleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Order(0)
@Slf4j
public class DirectIdLookupStrategy implements BundleLookupStrategy {

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Override
    public CuttingBundle lookup(BundleLookupContext context) {
        if (!StringUtils.hasText(context.getCuttingBundleId())) {
            return null;
        }

        try {
            CuttingBundle bundle = cuttingBundleService.getById(context.getCuttingBundleId());
            if (bundle != null && StringUtils.hasText(bundle.getId())) {
                log.info("[BundleLookup] {}命中: cuttingBundleId={}, bundleNo={}",
                        getStrategyName(), context.getCuttingBundleId(), bundle.getBundleNo());
                return bundle;
            }
        } catch (Exception e) {
            log.warn("[BundleLookup] {}查找失败: cuttingBundleId={}",
                    getStrategyName(), context.getCuttingBundleId(), e);
        }
        return null;
    }

    @Override
    public String getStrategyName() {
        return "cuttingBundleId-direct";
    }
}
