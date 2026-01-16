package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.service.CuttingBundleService;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class CuttingBundleOrchestrator {

    @Autowired
    private CuttingBundleService cuttingBundleService;

    public IPage<CuttingBundle> list(Map<String, Object> params) {
        return cuttingBundleService.queryPage(params);
    }

    public Map<String, Object> summary(String orderNo, String orderId) {
        String on = orderNo == null ? null : orderNo.trim();
        String oid = orderId == null ? null : orderId.trim();
        if (!StringUtils.hasText(on) && !StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        return cuttingBundleService.summarize(on, oid);
    }

    public List<CuttingBundle> generate(Map<String, Object> body) {
        if (body == null) {
            throw new IllegalArgumentException("参数错误");
        }
        String orderId = body.get("orderId") == null ? null : String.valueOf(body.get("orderId"));
        Object bundlesRaw = body.get("bundles");
        if (!StringUtils.hasText(orderId) || !(bundlesRaw instanceof List)) {
            throw new IllegalArgumentException("参数错误");
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> bundles = (List<Map<String, Object>>) bundlesRaw;
        if (bundles.isEmpty()) {
            throw new IllegalArgumentException("参数错误");
        }

        return cuttingBundleService.generateBundles(orderId, bundles);
    }

    public List<CuttingBundle> receive(Map<String, Object> body) {
        return generate(body);
    }

    public CuttingBundle getByCode(String qrCode) {
        CuttingBundle bundle = cuttingBundleService.getByQrCode(qrCode);
        if (bundle == null) {
            throw new NoSuchElementException("未找到对应的裁剪扎号");
        }
        return bundle;
    }

    public CuttingBundle getByBundleNo(String orderNo, Integer bundleNo) {
        CuttingBundle bundle = cuttingBundleService.getByBundleNo(orderNo, bundleNo);
        if (bundle == null) {
            throw new NoSuchElementException("未找到对应的裁剪扎号");
        }
        return bundle;
    }
}
