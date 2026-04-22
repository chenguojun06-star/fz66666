package com.fashion.supplychain.production.helper.lookup;

import com.fashion.supplychain.production.entity.CuttingBundle;

public interface BundleLookupStrategy {

    CuttingBundle lookup(BundleLookupContext context);

    String getStrategyName();
}
