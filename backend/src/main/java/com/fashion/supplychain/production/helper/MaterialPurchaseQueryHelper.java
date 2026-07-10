package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component("materialPurchaseQueryHelper")
@Slf4j
public class MaterialPurchaseQueryHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    public IPage<MaterialPurchase> list(Map<String, Object> params) {
        // 🔒 PC端默认隔离：未指定工厂类型时，跟单员/管理员只查内部工厂采购记录
        Map<String, Object> effectiveParams = params != null ? params : new java.util.HashMap<>();
        String factoryType = String.valueOf(effectiveParams.getOrDefault("factoryType", "")).trim();
        if (!StringUtils.hasText(factoryType) && !DataPermissionHelper.isFactoryAccount()) {
            effectiveParams = new java.util.HashMap<>(effectiveParams);
            effectiveParams.put("factoryType", "INTERNAL");
        }
        return materialPurchaseService.queryPage(effectiveParams);
    }

    // P0 修复（D-023 2026-07-09）：删除 getByScanCode 方法。
    //   旧版手机端调用此方法存在以下问题：
    //     1. 无 tenant_id WHERE，违反 P0 #4 / #19 多租户隔离铁律
    //     2. 无工厂/物料库/StyleInfo/订单维度 enrichment
    //     3. purchaseNo/orderNo 精确匹配逻辑容易误匹配
    //   统一改用 list(Map) → queryPage(effectiveParams) → listWithEnrichment 路径，
    //   三端（PC / H5 / 小程序）走完全相同的代码路径。
    //   该方法在 MaterialPurchaseController.list 中已无引用，确认全代码库无其他调用方后删除。

    public List<MaterialPurchase> getMyTasks() {
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();
        String userId = ctx == null ? null : ctx.getUserId();
        if (!StringUtils.hasText(userId) || tenantId == null) {
            return new ArrayList<>();
        }

        // 同时返回「待领取的任务」+「我已领取的任务」
        // 修复前只返回 status=received 的任务,导致小程序看不到「领取任务」按钮
        List<MaterialPurchase> myPurchases = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .and(w -> w
                        .isNull(MaterialPurchase::getReceiverId).eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                        .or()
                        .eq(MaterialPurchase::getReceiverId, userId).eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_RECEIVED))
                .and(w -> w.isNull(MaterialPurchase::getReturnConfirmed)
                           .or().eq(MaterialPurchase::getReturnConfirmed, 0))
                .list()
                .stream()
                // 排除已完成的任务（已入库数量 >= 采购数量）
                .filter(p -> {
                    if (p.getArrivedQuantity() == null) return true;
                    if (p.getPurchaseQuantity() == null) return true;
                    return p.getArrivedQuantity() < p.getPurchaseQuantity().intValue();
                })
                .collect(Collectors.toList());

        // 过滤掉已关闭/已完成订单对应的采购任务
        if (myPurchases.isEmpty()) {
            return myPurchases;
        }

        Set<String> orderIds = myPurchases.stream()
                .map(MaterialPurchase::getOrderId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        if (orderIds.isEmpty()) {
            return myPurchases;
        }

        // 查询有效订单（排除已关闭/已完成/已取消/已归档/已报废）
        List<ProductionOrder> validOrders = productionOrderService.lambdaQuery()
                .in(ProductionOrder::getId, orderIds)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .list();

        // 构建 orderId -> orderNo 映射
        Map<String, String> orderIdToOrderNoMap = validOrders.stream()
                .collect(Collectors.toMap(
                        ProductionOrder::getId,
                        ProductionOrder::getOrderNo,
                        (v1, v2) -> v1
                ));

        Set<String> validOrderIds = orderIdToOrderNoMap.keySet();

        // 返回采购任务：
        // 1. 无订单关联的独立采购任务（orderId 为空）
        // 2. 有订单关联且订单有效的采购任务
        return myPurchases.stream()
                .filter(purchase -> {
                    String orderId = purchase.getOrderId();
                    // 如果没有关联订单，保留（独立采购）
                    if (!StringUtils.hasText(orderId)) {
                        return true;
                    }
                    // 如果有关联订单，检查订单是否有效
                    return validOrderIds.contains(orderId);
                })
                .peek(purchase -> {
                    // 如果 orderNo 为空，从映射表中补充
                    if (!StringUtils.hasText(purchase.getOrderNo())) {
                        String orderId = purchase.getOrderId();
                        if (StringUtils.hasText(orderId)) {
                            String orderNo = orderIdToOrderNoMap.get(orderId);
                            if (orderNo != null) {
                                purchase.setOrderNo(orderNo);
                            }
                        }
                    }
                })
                .collect(Collectors.toList());
    }

    /**
     * 获取采购任务状态统计（全局，不受分页影响）
     * 支持按 materialType / sourceType / orderNo(keyword) 筛选
     */
    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getDeleteFlag, 0);

        // 🔒 多租户隔离：所有账号（含非工厂）都必须按 tenantId 过滤
        TenantAssert.assertTenantContext();
        String qFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        Long qTenantId = com.fashion.supplychain.common.UserContext.tenantId();
        wrapper.eq(MaterialPurchase::getTenantId, qTenantId);

        // 工厂账号进一步隔离：只统计该工厂的采购记录
        if (shouldReturnEmptyForFactory(wrapper, qTenantId, qFactoryId)) {
            return emptyStats();
        }

        // 复用 queryPage 的筛选逻辑，但不分页
        applyStatusStatsFilters(wrapper, params);

        // 排除已关闭/已完成/已取消/已归档/已报废/已删除订单关联的采购记录
        excludeInvalidOrdersFromStats(wrapper, qTenantId);

        wrapper.last("LIMIT 5000");
        List<MaterialPurchase> all = materialPurchaseService.list(wrapper);

        return computeStatusStats(all);
    }

    /**
     * 统计查询中排除无效订单（已删除/已关闭/已完成/已取消/已归档/已报废）关联的采购记录。
     * 与 service/impl/MaterialPurchaseQueryHelper.excludeScrappedOrders 逻辑保持一致。
     */
    private void excludeInvalidOrdersFromStats(LambdaQueryWrapper<MaterialPurchase> wrapper, Long tenantId) {
        List<String> invalidOrderIds = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .and(w -> w.eq(ProductionOrder::getDeleteFlag, 1)
                                .or().in(ProductionOrder::getStatus, "scrapped", "closed", "completed", "cancelled", "archived")))
                .stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());
        if (!invalidOrderIds.isEmpty()) {
            wrapper.and(w -> w.isNull(MaterialPurchase::getOrderId).or().eq(MaterialPurchase::getOrderId, "").or().notIn(MaterialPurchase::getOrderId, invalidOrderIds));
        }
    }

    private boolean shouldReturnEmptyForFactory(LambdaQueryWrapper<MaterialPurchase> wrapper,
                                                Long qTenantId, String qFactoryId) {
        if (!StringUtils.hasText(qFactoryId)) {
            return false;
        }
        List<String> factoryOrderIds = productionOrderService.list(
                new LambdaQueryWrapper<ProductionOrder>()
                        .select(ProductionOrder::getId)
                        .eq(ProductionOrder::getTenantId, qTenantId)
                        .eq(ProductionOrder::getFactoryId, qFactoryId)
                        .notIn(ProductionOrder::getStatus, "scrapped", "closed", "completed", "cancelled", "archived")
                        .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
        ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
        if (factoryOrderIds.isEmpty()) {
            return true;
        }
        wrapper.in(MaterialPurchase::getOrderId, factoryOrderIds);
        return false;
    }

    private Map<String, Object> emptyStats() {
        return Map.of(
                "pendingCount", 0,
                "receivedCount", 0,
                "partialCount", 0,
                "completedCount", 0,
                "cancelledCount", 0,
                "totalCount", 0,
                "totalQuantity", 0
        );
    }

    private void applyStatusStatsFilters(LambdaQueryWrapper<MaterialPurchase> wrapper, Map<String, Object> params) {
        String orderNo = params == null ? "" : String.valueOf(params.getOrDefault("orderNo", "")).trim();
        String materialType = params == null ? "" : String.valueOf(params.getOrDefault("materialType", "")).trim();
        String sourceType = params == null ? "" : String.valueOf(params.getOrDefault("sourceType", "")).trim();
        String factoryType = params == null ? "" : String.valueOf(params.getOrDefault("factoryType", "")).trim();

        if (StringUtils.hasText(orderNo)) {
            wrapper.and(w -> w
                .like(MaterialPurchase::getOrderNo, orderNo)
                .or().like(MaterialPurchase::getPurchaseNo, orderNo)
                .or().like(MaterialPurchase::getMaterialCode, orderNo)
                .or().like(MaterialPurchase::getMaterialName, orderNo)
            );
        }
        if (StringUtils.hasText(sourceType)) {
            if ("batch".equals(sourceType)) {
                wrapper.in(MaterialPurchase::getSourceType, "batch", "stock", "manual");
            } else {
                wrapper.eq(MaterialPurchase::getSourceType, sourceType);
            }
        }
        applyMaterialTypeFilter(wrapper, materialType);
        applyFactoryTypeFilter(wrapper, factoryType);
    }

    private void applyMaterialTypeFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String materialType) {
        if (!StringUtils.hasText(materialType)) {
            return;
        }
        String mt = materialType;
        if (MaterialConstants.TYPE_FABRIC.equals(mt) || MaterialConstants.TYPE_LINING.equals(mt)
                || MaterialConstants.TYPE_ACCESSORY.equals(mt)) {
            wrapper.and(w -> {
                w.likeRight(MaterialPurchase::getMaterialType, mt);
                if (MaterialConstants.TYPE_FABRIC.equals(mt)) {
                    w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_FABRIC_CN);
                } else if (MaterialConstants.TYPE_LINING.equals(mt)) {
                    w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_LINING_CN);
                } else if (MaterialConstants.TYPE_ACCESSORY.equals(mt)) {
                    w.or().likeRight(MaterialPurchase::getMaterialType, MaterialConstants.TYPE_ACCESSORY_CN);
                }
            });
        } else {
            wrapper.eq(MaterialPurchase::getMaterialType, mt);
        }
    }

    // factoryType 过滤：通过子查询匹配关联订单工厂类型
    // 🔒 PC端默认隔离：未指定工厂类型时，跟单员/管理员只统计内部工厂采购数据
    private void applyFactoryTypeFilter(LambdaQueryWrapper<MaterialPurchase> wrapper, String factoryType) {
        String effectiveFactoryType = StringUtils.hasText(factoryType) ? factoryType :
                (!DataPermissionHelper.isFactoryAccount() ? "INTERNAL" : "");
        if (StringUtils.hasText(effectiveFactoryType)) {
            wrapper.apply("(order_id IS NULL OR order_id = '' OR order_id IN " +
                    "(SELECT id FROM t_production_order WHERE factory_type = {0} AND (delete_flag IS NULL OR delete_flag = 0)))",
                    effectiveFactoryType.toUpperCase());
        }
    }

    private Map<String, Object> computeStatusStats(List<MaterialPurchase> all) {
        int totalCount = all.size();
        int pendingCount = 0;
        int receivedCount = 0;
        int partialCount = 0;
        int completedCount = 0;
        int cancelledCount = 0;
        int totalQuantity = 0;

        for (MaterialPurchase p : all) {
            String status = p.getStatus() == null ? "" : p.getStatus().trim().toLowerCase();
            int qty = p.getPurchaseQuantity() == null ? 0 : p.getPurchaseQuantity().intValue();
            totalQuantity += qty;
            switch (status) {
                case "pending": pendingCount++; break;
                case "received": receivedCount++; break;
                case "partial":
                case "partial_arrival": partialCount++; break;
                case "completed": completedCount++; break;
                case "cancelled": cancelledCount++; break;
                default: pendingCount++; break;
            }
        }

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("totalCount", totalCount);
        result.put("totalQuantity", totalQuantity);
        result.put("pendingCount", pendingCount);
        result.put("receivedCount", receivedCount);
        result.put("partialCount", partialCount);
        result.put("completedCount", completedCount);
        result.put("cancelledCount", cancelledCount);
        return result;
    }
}
