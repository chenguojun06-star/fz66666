package com.fashion.supplychain.production.helper.lookup;

import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.service.CuttingBundleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Order(1)
@Slf4j
public class QrCodeLookupStrategy implements BundleLookupStrategy {

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Override
    public CuttingBundle lookup(BundleLookupContext context) {
        if (!StringUtils.hasText(context.getScanCode())) {
            return null;
        }

        CuttingBundle bundle = cuttingBundleService.getByQrCode(context.getScanCode());
        if (bundle != null && StringUtils.hasText(bundle.getId())) {
            log.info("[BundleLookup] {}命中: scanCode={}, bundleId={}",
                    getStrategyName(), context.getScanCode(), bundle.getId());
        } else {
            log.info("[BundleLookup] {}未命中: scanCode长度={}",
                    getStrategyName(), context.getScanCode().length());
        }
        return bundle;
    }

    @Override
    public String getStrategyName() {
        return "getByQrCode";
    }
}
