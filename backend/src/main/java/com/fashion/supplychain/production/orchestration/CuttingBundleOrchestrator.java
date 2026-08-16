package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
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

    @Autowired
    private com.fashion.supplychain.production.helper.OrderRemarkHelper orderRemarkHelper;

    public IPage<CuttingBundle> list(Map<String, Object> params) {
        try {
            // P1 多租户隔离：强制租户上下文校验
            TenantAssert.assertTenantContext();
            Long tenantId = UserContext.tenantId();
            IPage<CuttingBundle> page = doList(params, tenantId);
            // P1-6 数据链路：查询后补齐 styleName/styleCover，供前端展示
            enrichStyleInfo(page, tenantId);
            return page;
        } catch (Exception e) {
            log.error("[CuttingBundle.list] 查询失败（可能为 schema 漂移）: {}", e.getMessage());
            return new Page<>();
        }
    }

    private IPage<CuttingBundle> doList(Map<String, Object> params, Long tenantId) {
        // 工厂账号隔离：只能查看本工厂订单的裁剪格号
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            List<String> factoryOrderNos = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getOrderNo)
                            .eq(ProductionOrder::getTenantId, tenantId)
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

    /**
     * 批量补齐 styleName/styleCover：通过 productionOrderId 关联 ProductionOrder 查询
     */
    private void enrichStyleInfo(IPage<CuttingBundle> page, Long tenantId) {
        if (page == null) return;
        List<CuttingBundle> records = page.getRecords();
        if (records == null || records.isEmpty()) return;

        List<String> orderIds = records.stream()
                .map(CuttingBundle::getProductionOrderId)
                .filter(StringUtils::hasText)
                .distinct()
                .collect(Collectors.toList());
        if (orderIds.isEmpty()) return;

        try {
            // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 listByIds，避免跨租户读取
            Map<String, ProductionOrder> orderMap = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .in(ProductionOrder::getId, orderIds)
                            .eq(ProductionOrder::getTenantId, tenantId)
            ).stream()
                    .filter(o -> o != null && StringUtils.hasText(o.getId()))
                    .collect(Collectors.toMap(ProductionOrder::getId, o -> o, (a, b) -> a));
            for (CuttingBundle b : records) {
                if (b == null) continue;
                String oid = b.getProductionOrderId();
                if (!StringUtils.hasText(oid)) continue;
                ProductionOrder order = orderMap.get(oid);
                if (order == null) continue;
                if (!StringUtils.hasText(b.getStyleName())) {
                    b.setStyleName(order.getStyleName());
                }
                if (!StringUtils.hasText(b.getStyleCover())) {
                    b.setStyleCover(order.getStyleCover());
                }
            }
        } catch (Exception e) {
            log.warn("[CuttingBundle.enrichStyleInfo] 补齐 styleName/styleCover 失败: {}", e.getMessage());
        }
    }

    public Map<String, Object> summary(String orderNo, String orderId) {
        // P1 多租户隔离：summary 委托时增补 tenantId 上下文校验
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        String on = orderNo == null ? null : orderNo.trim();
        String oid = orderId == null ? null : orderId.trim();
        if (!StringUtils.hasText(on) && !StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        try {
            // tenantId 已校验，cuttingBundleService.summarize 内部按订单号聚合（订单归属由调用方保证）
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

        // P1 多租户隔离：写订单备注前校验订单归属当前租户
        List<CuttingBundle> result = cuttingBundleService.generateBundles(orderId, bundles);
        try {
            Long tenantId = UserContext.tenantId();
            ProductionOrder order = productionOrderService.lambdaQuery()
                    .eq(ProductionOrder::getId, orderId)
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .one();
            if (order != null) {
                orderRemarkHelper.append(order, "分扎生成", "生成 " + bundles.size() + " 个菲号");
            }
        } catch (Exception e) {
            log.warn("[分扎生成] 写订单备注失败（不阻断）: orderId={}, err={}", orderId, e.getMessage());
        }
        return result;
    }

    public List<CuttingBundle> receive(Map<String, Object> body) {
        return generate(body);
    }

    public CuttingBundle getByCode(String qrCode) {
        CuttingBundle bundle = cuttingBundleService.getByQrCode(qrCode);
        if (bundle == null) {
            throw new NoSuchElementException("未找到对应的裁剪扎号");
        }
        // P1 多租户隔离：通过 QR 码查询后，校验菲号归属当前租户
        TenantAssert.assertBelongsToCurrentTenant(bundle.getTenantId(), "裁剪扎号");
        return bundle;
    }

    public CuttingBundle getByBundleNo(String orderNo, Integer bundleNo) {
        CuttingBundle bundle = cuttingBundleService.getByBundleNo(orderNo, bundleNo);
        if (bundle == null) {
            throw new NoSuchElementException("未找到对应的裁剪扎号");
        }
        // P1 多租户隔离：通过 bundleNo 查询后，校验菲号归属当前租户
        TenantAssert.assertBelongsToCurrentTenant(bundle.getTenantId(), "裁剪扎号");
        return bundle;
    }

    public CuttingBundle toggleScanBlocked(String bundleId, boolean blocked) {
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById，避免跨租户读取
        Long tenantId = UserContext.tenantId();
        CuttingBundle bundle = cuttingBundleService.lambdaQuery()
                .eq(CuttingBundle::getId, bundleId)
                .eq(CuttingBundle::getTenantId, tenantId)
                .one();
        if (bundle == null) {
            throw new NoSuchElementException("未找到对应的菲号");
        }
        bundle.setScanBlocked(blocked);
        cuttingBundleService.updateById(bundle);
        log.info("[扫码阻止开关] bundleId={}, bundleNo={}, blocked={}, operator={}",
                bundleId, bundle.getBundleNo(), blocked, UserContext.username());
        return bundle;
    }
}
