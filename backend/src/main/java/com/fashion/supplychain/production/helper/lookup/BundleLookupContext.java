package com.fashion.supplychain.production.helper.lookup;

import com.fashion.supplychain.common.util.NumberUtils;
import com.fashion.supplychain.common.util.TextUtils;
import com.fashion.supplychain.production.entity.ProductionOrder;
import lombok.Data;

import java.util.Map;

@Data
public class BundleLookupContext {

    private String scanCode;
    private String orderNo;
    private String color;
    private String size;
    private Integer bundleNo;
    private ProductionOrder order;

    public static BundleLookupContext from(Map<String, Object> params) {
        BundleLookupContext context = new BundleLookupContext();
        context.setScanCode(TextUtils.safeText(params.get("scanCode")));
        context.setOrderNo(TextUtils.safeText(params.get("orderNo")));
        context.setColor(TextUtils.safeText(params.get("color")));
        context.setSize(TextUtils.safeText(params.get("size")));
        Integer bn = NumberUtils.toInt(params.get("bundleNo"));
        if (bn == null || bn <= 0) {
            bn = NumberUtils.toInt(params.get("cuttingBundleNo"));
        }
        context.setBundleNo(bn != null && bn > 0 ? bn : null);
        return context;
    }
}
