package com.fashion.supplychain.production.service;

import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.helper.lookup.BundleLookupContext;
import com.fashion.supplychain.production.helper.lookup.BundleLookupStrategy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@Slf4j
public class CuttingBundleLookupService {

    private final List<BundleLookupStrategy> strategies;

    public CuttingBundleLookupService(List<BundleLookupStrategy> strategies) {
        this.strategies = strategies.stream()
                .sorted(Comparator.comparingInt(s -> {
                    Order order = s.getClass().getAnnotation(Order.class);
                    return order != null ? order.value() : Integer.MAX_VALUE;
                }))
                .collect(Collectors.toList());
    }

    public CuttingBundle lookup(BundleLookupContext context) {
        if (context == null) {
            log.warn("[BundleLookup] 查找上下文为空");
            return null;
        }

        for (BundleLookupStrategy strategy : strategies) {
            try {
                CuttingBundle bundle = strategy.lookup(context);
                if (bundle != null && StringUtils.hasText(bundle.getId())) {
                    log.info("[BundleLookup] 策略{}成功找到菲号: bundleId={}",
                            strategy.getStrategyName(), bundle.getId());
                    return bundle;
                }
            } catch (Exception e) {
                log.error("[BundleLookup] 策略{}执行异常: {}", strategy.getStrategyName(), e.getMessage(), e);
            }
        }

        log.warn("[BundleLookup] 所有策略均未找到菲号: scanCode={}, orderNo={}, bundleNo={}",
                context.getScanCode(), context.getOrderNo(), context.getBundleNo());
        return null;
    }

    public CuttingBundle lookupFromParams(Map<String, Object> params) {
        return lookup(BundleLookupContext.from(params));
    }
}
