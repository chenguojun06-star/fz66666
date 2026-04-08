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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

@Service
public class CuttingBundleOrchestrator {

    private static final Logger log = LoggerFactory.getLogger(CuttingBundleOrchestrator.class);

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    public IPage<CuttingBundle> list(Map<String, Object> params) {
        try {
            return doList(params);
        } catch (Exception e) {
            log.error("[CuttingBundle.list] 查询失败（可能为 schema 漂移）: {}", e.getMessage());
            return new Page<>();
        }
    }

    private IPage<CuttingBundle> doList(Map<String, Object> params) {
        // 工厂账号隔离：只能查看本工厂订单的裁剪格号
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            List<String> factoryOrderNos = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getOrderNo)
                            .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream()
                    .map(ProductionOrder::getOrderNo)
                    .filter(StringUtils::hasText)
                    .collect(Collectors.toList());
            if (factoryOrderNos.isEmpty()) {
                return new Page<>();
            }
            Map<String, Object> mutableParams = new HashMap<>(params != null ? params : new HashMap<>());
            mutableParams.put("_factoryOrderNos", factoryOrderNos);
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
        try {
            return cuttingBundleService.summarize(on, oid);
        } catch (Exception e) {
            log.error("[CuttingBundle.summary] 查询失败（可能为 schema 漂移）: {}", e.getMessage());
            Map<String, Object> fallback = new HashMap<>();
            fallback.put("totalQuantity", 0);
            fallback.put("bundleCount", 0);
            fallback.put("tasks", List.of());
            return fallback;
        }
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
