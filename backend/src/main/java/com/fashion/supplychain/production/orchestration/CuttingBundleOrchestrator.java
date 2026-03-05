package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class CuttingBundleOrchestrator {

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    public IPage<CuttingBundle> list(Map<String, Object> params) {
        // 工厂账号隔离：只能查看本工厂订单的裁剪格号
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            List<String> factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
            if (factoryOrderIds.isEmpty()) {
                return new Page<>();
            }
            Map<String, Object> mutableParams = new HashMap<>(params != null ? params : new HashMap<>());
            mutableParams.put("_factoryOrderIds", factoryOrderIds);
            return cuttingBundleService.queryPage(mutableParams);
        }
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
