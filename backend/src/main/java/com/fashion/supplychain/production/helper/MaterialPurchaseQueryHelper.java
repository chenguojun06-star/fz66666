package com.fashion.supplychain.production.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.MaterialPurchaseOrchestratorHelper;
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

@Component
@Slf4j
public class MaterialPurchaseQueryHelper {

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private MaterialPurchaseOrchestratorHelper orchestratorHelper;

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

    /**
     * 通过扫码获取关联的采购单列表
     *
     * @param params 包含 scanCode 和 orderNo
     * @return 采购单列表
     */
    public List<MaterialPurchase> getByScanCode(Map<String, Object> params) {
        String scanCode = params.get("scanCode") != null ? String.valueOf(params.get("scanCode")).trim() : null;
        String orderNo = params.get("orderNo") != null ? String.valueOf(params.get("orderNo")).trim() : null;

        // 如果有 scanCode，尝试多种方式匹配
        if (StringUtils.hasText(scanCode)) {
            // 1. 先尝试作为采购单号精确查询
            LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(MaterialPurchase::getPurchaseNo, scanCode);
            wrapper.eq(MaterialPurchase::getDeleteFlag, 0);
            List<MaterialPurchase> purchases = materialPurchaseService.list(wrapper);

            if (purchases != null && !purchases.isEmpty()) {
                return purchases;
            }

            // 2. 尝试将 scanCode 转换为订单号格式
            // P020226012201 -> PO20260122001
            String normalizedOrderNo = orchestratorHelper.normalizeOrderNo(scanCode);
            if (StringUtils.hasText(normalizedOrderNo)) {
                wrapper = new LambdaQueryWrapper<>();
                wrapper.eq(MaterialPurchase::getOrderNo, normalizedOrderNo);
                wrapper.eq(MaterialPurchase::getDeleteFlag, 0);
                wrapper.orderByDesc(MaterialPurchase::getCreateTime);
                purchases = materialPurchaseService.list(wrapper);

                if (purchases != null && !purchases.isEmpty()) {
                    return purchases;
                }
            }
        }

        // 如果有明确的订单号参数，用它查询
        if (StringUtils.hasText(orderNo)) {
            LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(MaterialPurchase::getOrderNo, orderNo);
            wrapper.eq(MaterialPurchase::getDeleteFlag, 0);
            wrapper.orderByDesc(MaterialPurchase::getCreateTime);
            List<MaterialPurchase> purchases = materialPurchaseService.list(wrapper);

            if (purchases != null && !purchases.isEmpty()) {
                return purchases;
            }
        }

        return new ArrayList<>();
    }

    public List<MaterialPurchase> getMyTasks() {
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();
        String userId = ctx == null ? null : ctx.getUserId();
        if (!StringUtils.hasText(userId) || tenantId == null) {
            return new ArrayList<>();
        }

        // 在 DB 层完成核心过滤（租户隔离 + 状态 + 领取人），避免跨租户全表加载
        List<MaterialPurchase> myPurchases = materialPurchaseService.lambdaQuery()
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .eq(MaterialPurchase::getReceiverId, userId)
                .eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_RECEIVED)
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
        String qFactoryId = com.fashion.supplychain.common.UserContext.factoryId();
        Long qTenantId = com.fashion.supplychain.common.UserContext.tenantId();
        wrapper.eq(qTenantId != null, MaterialPurchase::getTenantId, qTenantId);

        // 工厂账号进一步隔离：只统计该工厂的采购记录
        if (StringUtils.hasText(qFactoryId)) {
            List<String> factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(qTenantId != null, ProductionOrder::getTenantId, qTenantId)
                            .eq(ProductionOrder::getFactoryId, qFactoryId)
                            .ne(ProductionOrder::getStatus, "scrapped")
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
            if (factoryOrderIds.isEmpty()) {
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
            wrapper.in(MaterialPurchase::getOrderId, factoryOrderIds);
        }

        // 复用 queryPage 的筛选逻辑，但不分页

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
        if (StringUtils.hasText(materialType)) {
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
        String effectiveFactoryType = StringUtils.hasText(factoryType) ? factoryType :
                (!DataPermissionHelper.isFactoryAccount() ? "INTERNAL" : "");
        if (StringUtils.hasText(effectiveFactoryType)) {
            wrapper.apply("(order_id IS NULL OR order_id = '' OR order_id IN " +
                    "(SELECT id FROM t_production_order WHERE factory_type = {0} AND (delete_flag IS NULL OR delete_flag = 0)))",
                    effectiveFactoryType.toUpperCase());
        }

        List<MaterialPurchase> all = materialPurchaseService.list(wrapper);

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
