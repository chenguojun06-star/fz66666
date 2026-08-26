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
import java.math.BigDecimal;
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

    @Autowired
    private com.fashion.supplychain.style.service.StyleInfoService styleInfoService;

    @Autowired(required = false)
    private com.fashion.supplychain.production.service.PatternProductionService patternProductionService;

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
        return getMyTasks(false);
    }

    /**
     * D-119：includeCompleted=true 时返回「待领取 + 我名下全部状态（含已完成/已取消/部分到货）」，
     * 供手机端采购列表「已完成」等终态筛选使用——原逻辑把已完成任务全部过滤掉，
     * 导致手机端"已完成"Tab 永远是 0 条。默认 false 保持待办语义不变。
     *
     * D-141：无主待领取分支必须做订单有效性过滤（排除已完成/已关闭/已取消/已归档/已报废订单）。
     *   原实现两分支都不过滤，订单走完后遗留的僵尸 PENDING 行在手机端永远显示"待领取"，
     *   而 PC 列表与手机详情页走 listWithEnrichment（excludeScrappedOrders 会滤掉）→ 三端不一致：
     *   手机列表有、点进详情空白、PC 没有。我名下历史任务仍不过滤（保住 D-119"已完成"Tab 语义）。
     */
    public List<MaterialPurchase> getMyTasks(boolean includeCompleted) {
        Long tenantId = UserContext.tenantId();
        UserContext ctx = UserContext.get();
        String userId = ctx == null ? null : ctx.getUserId();
        if (!StringUtils.hasText(userId) || tenantId == null) {
            return new ArrayList<>();
        }

        if (includeCompleted) {
            // 我名下任意状态的任务（含已完成/已取消/已回料确认，不过滤）
            List<MaterialPurchase> myOwn = materialPurchaseService.lambdaQuery()
                    .eq(MaterialPurchase::getTenantId, tenantId)
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .eq(MaterialPurchase::getReceiverId, userId)
                    .orderByDesc(MaterialPurchase::getCreateTime)
                    .list();

            // 无主待领取任务：与 PC 端 excludeScrappedOrders 同口径，排除无效订单的僵尸行；
            // D-161：回料确认过的行(returnConfirmed=1)与样衣生产已完成/已作废的行同样排除——
            // 原实现样衣采购回料确认后（回料数量0时状态仍PENDING）永远显示"待采购"
            List<MaterialPurchase> unclaimed = materialPurchaseService.lambdaQuery()
                    .eq(MaterialPurchase::getTenantId, tenantId)
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .isNull(MaterialPurchase::getReceiverId)
                    .eq(MaterialPurchase::getStatus, MaterialConstants.STATUS_PENDING)
                    .and(w -> w.isNull(MaterialPurchase::getReturnConfirmed)
                            .or().eq(MaterialPurchase::getReturnConfirmed, 0))
                    .orderByDesc(MaterialPurchase::getCreateTime)
                    .list();
            if (!unclaimed.isEmpty()) {
                Set<String> orderIds = unclaimed.stream()
                        .map(MaterialPurchase::getOrderId)
                        .filter(StringUtils::hasText)
                        .collect(Collectors.toSet());
                if (!orderIds.isEmpty()) {
                    Set<String> validOrderIds = productionOrderService.lambdaQuery()
                            .in(ProductionOrder::getId, orderIds)
                            .eq(ProductionOrder::getDeleteFlag, 0)
                            .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                            .list()
                            .stream()
                            .map(ProductionOrder::getId)
                            .collect(Collectors.toSet());
                    unclaimed = unclaimed.stream()
                            .filter(p -> {
                                String orderId = p.getOrderId();
                                // 无订单关联的独立采购保留（样衣采购由下方样衣状态过滤）
                                return !StringUtils.hasText(orderId) || validOrderIds.contains(orderId);
                            })
                            .collect(Collectors.toList());
                }
                // D-161：样衣采购（patternProductionId）——样衣生产已完成/已作废的不再作为待采购展示
                Set<String> patternIds = unclaimed.stream()
                        .map(MaterialPurchase::getPatternProductionId)
                        .filter(StringUtils::hasText)
                        .collect(Collectors.toSet());
                if (!patternIds.isEmpty() && patternProductionService != null) {
                    Set<String> deadPatternIds = patternProductionService.lambdaQuery()
                            .in(com.fashion.supplychain.production.entity.PatternProduction::getId, patternIds)
                            .and(w -> w
                                    .eq(com.fashion.supplychain.production.entity.PatternProduction::getStatus, "COMPLETED")
                                    .or().eq(com.fashion.supplychain.production.entity.PatternProduction::getDeleteFlag, 1))
                            .list()
                            .stream()
                            .map(com.fashion.supplychain.production.entity.PatternProduction::getId)
                            .map(String::valueOf)
                            .collect(Collectors.toSet());
                    if (!deadPatternIds.isEmpty()) {
                        unclaimed = unclaimed.stream()
                                .filter(p -> !deadPatternIds.contains(String.valueOf(p.getPatternProductionId())))
                                .collect(Collectors.toList());
                    }
                }
            }

            List<MaterialPurchase> merged = new ArrayList<>(myOwn.size() + unclaimed.size());
            merged.addAll(myOwn);
            merged.addAll(unclaimed);
            merged.sort(java.util.Comparator.comparing(
                    MaterialPurchase::getCreateTime,
                    java.util.Comparator.nullsLast(java.util.Comparator.reverseOrder())));
            injectStyleCover(merged, tenantId);
            return merged;
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
        List<MaterialPurchase> result = myPurchases.stream()
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

        // 注入款式图（styleCover）供小程序通知卡片展示
        injectStyleCover(result, tenantId);

        return result;
    }

    /**
     * 批量注入款式图（styleCover）到采购任务列表
     * 根据 styleNo 关联查询 StyleInfo.cover，填充到 styleCover 字段
     */
    private void injectStyleCover(List<MaterialPurchase> purchaseList, Long tenantId) {
        if (purchaseList == null || purchaseList.isEmpty() || tenantId == null) return;
        Set<String> styleNos = purchaseList.stream()
                .map(MaterialPurchase::getStyleNo)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());
        if (styleNos.isEmpty()) return;

        try {
            Map<String, String> styleNoToCover = styleInfoService.lambdaQuery()
                    .select(com.fashion.supplychain.style.entity.StyleInfo::getStyleNo,
                            com.fashion.supplychain.style.entity.StyleInfo::getCover)
                    .in(com.fashion.supplychain.style.entity.StyleInfo::getStyleNo, styleNos)
                    .eq(com.fashion.supplychain.style.entity.StyleInfo::getTenantId, tenantId)
                    .list()
                    .stream()
                    .filter(s -> StringUtils.hasText(s.getStyleNo()) && StringUtils.hasText(s.getCover()))
                    .collect(Collectors.toMap(
                            com.fashion.supplychain.style.entity.StyleInfo::getStyleNo,
                            com.fashion.supplychain.style.entity.StyleInfo::getCover,
                            (v1, v2) -> v1));

            if (!styleNoToCover.isEmpty()) {
                purchaseList.forEach(purchase -> {
                    if (StringUtils.hasText(purchase.getStyleNo())) {
                        String cover = styleNoToCover.get(purchase.getStyleNo());
                        if (cover != null) {
                            purchase.setStyleCover(cover);
                        }
                    }
                });
            }
        } catch (Exception e) {
            log.warn("[MaterialPurchase] 注入款式图失败（不影响主流程）: styleNos={}, err={}", styleNos, e.getMessage());
        }
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
        Map<String, Object> stats = new java.util.LinkedHashMap<>();
        stats.put("pendingCount", 0);
        stats.put("receivedCount", 0);
        stats.put("partialCount", 0);
        stats.put("completedCount", 0);
        stats.put("cancelledCount", 0);
        stats.put("totalCount", 0);
        stats.put("totalQuantity", 0);
        stats.put("pendingQuantity", 0);
        stats.put("receivedQuantity", 0);
        stats.put("partialQuantity", 0);
        stats.put("completedQuantity", 0);
        stats.put("cancelledQuantity", 0);
        return stats;
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
        int pendingQuantity = 0;
        int receivedQuantity = 0;
        int partialQuantity = 0;
        int completedQuantity = 0;
        int cancelledQuantity = 0;

        for (MaterialPurchase p : all) {
            String status = p.getStatus() == null ? "" : p.getStatus().trim().toLowerCase();
            int qty = p.getPurchaseQuantity() == null ? 0 : p.getPurchaseQuantity().intValue();
            totalQuantity += qty;
            // 状态分类必须与 applyBasicFilters 的 status 过滤分组保持一致
            // 任何新增状态必须同时更新此处和 applyBasicFilters，否则会出现"统计数≠列表数"的 P0 bug
            switch (status) {
                case "pending":
                    pendingCount++;
                    pendingQuantity += qty;
                    break;
                case "received":
                case "warehouse_pending":       // 待仓库出库 → 归入"已采购"
                    receivedCount++;
                    receivedQuantity += qty;
                    break;
                case "partial":
                case "partial_arrival":
                    partialCount++;
                    partialQuantity += qty;
                    break;
                case "completed":
                case "awaiting_confirm":        // 待确认完成 → 归入"全部到货"
                    completedCount++;
                    completedQuantity += qty;
                    break;
                case "cancelled":
                    cancelledCount++;
                    cancelledQuantity += qty;
                    break;
                default:
                    // 未知状态保守计入 pending（向后兼容历史脏数据）
                    pendingCount++;
                    pendingQuantity += qty;
                    break;
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
        result.put("pendingQuantity", pendingQuantity);
        result.put("receivedQuantity", receivedQuantity);
        result.put("partialQuantity", partialQuantity);
        result.put("completedQuantity", completedQuantity);
        result.put("cancelledQuantity", cancelledQuantity);
        return result;
    }

    /**
     * 按款号/订单号汇总面辅料采购数据（采购量/到货量/使用量/剩余量）
     * 支持按 styleId 或 orderNo 过滤，按物料编码+物料名称分组汇总。
     */
    public List<Map<String, Object>> getStyleSummary(Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        String styleId = params == null ? "" : String.valueOf(params.getOrDefault("styleId", "")).trim();
        String orderNo = params == null ? "" : String.valueOf(params.getOrDefault("orderNo", "")).trim();

        LambdaQueryWrapper<MaterialPurchase> wrapper = new LambdaQueryWrapper<MaterialPurchase>()
                .eq(MaterialPurchase::getTenantId, tenantId)
                .eq(MaterialPurchase::getDeleteFlag, 0)
                .ne(MaterialPurchase::getStatus, MaterialConstants.STATUS_CANCELLED);
        if (StringUtils.hasText(styleId)) {
            wrapper.eq(MaterialPurchase::getStyleId, styleId);
        }
        if (StringUtils.hasText(orderNo)) {
            wrapper.eq(MaterialPurchase::getOrderNo, orderNo);
        }
        if (!StringUtils.hasText(styleId) && !StringUtils.hasText(orderNo)) {
            return List.of();
        }

        List<MaterialPurchase> purchases = materialPurchaseService.list(wrapper);

        // 按物料编码+物料名称分组汇总
        Map<String, Map<String, Object>> grouped = new java.util.LinkedHashMap<>();
        for (MaterialPurchase p : purchases) {
            String key = (p.getMaterialCode() != null ? p.getMaterialCode() : "") + "|" + (p.getMaterialName() != null ? p.getMaterialName() : "");
            Map<String, Object> row = grouped.computeIfAbsent(key, k -> {
                Map<String, Object> m = new java.util.LinkedHashMap<>();
                m.put("materialCode", p.getMaterialCode());
                m.put("materialName", p.getMaterialName());
                m.put("materialType", p.getMaterialType());
                m.put("unit", p.getUnit());
                m.put("color", p.getColor());
                m.put("styleNo", p.getStyleNo());
                m.put("styleName", p.getStyleName());
                m.put("orderNo", p.getOrderNo());
                m.put("purchaseQuantity", BigDecimal.ZERO);
                m.put("arrivedQuantity", 0);
                m.put("usedQuantity", BigDecimal.ZERO);
                m.put("returnQuantity", BigDecimal.ZERO);
                m.put("purchaseCount", 0);
                return m;
            });
            BigDecimal purchaseQty = p.getPurchaseQuantity() != null ? p.getPurchaseQuantity() : BigDecimal.ZERO;
            Integer arrivedQty = p.getArrivedQuantity() != null ? p.getArrivedQuantity() : 0;
            BigDecimal usedQty = p.getUsedQuantity() != null ? p.getUsedQuantity() : BigDecimal.ZERO;
            BigDecimal returnQty = p.getReturnQuantity() != null ? p.getReturnQuantity() : BigDecimal.ZERO;
            row.put("purchaseQuantity", ((BigDecimal) row.get("purchaseQuantity")).add(purchaseQty));
            row.put("arrivedQuantity", (Integer) row.get("arrivedQuantity") + arrivedQty);
            row.put("usedQuantity", ((BigDecimal) row.get("usedQuantity")).add(usedQty));
            row.put("returnQuantity", ((BigDecimal) row.get("returnQuantity")).add(returnQty));
            row.put("purchaseCount", (Integer) row.get("purchaseCount") + 1);
        }

        // 计算剩余量 = 到货量 - 使用量
        List<Map<String, Object>> result = new java.util.ArrayList<>();
        for (Map<String, Object> row : grouped.values()) {
            Integer arrived = (Integer) row.get("arrivedQuantity");
            BigDecimal used = (BigDecimal) row.get("usedQuantity");
            BigDecimal remaining = BigDecimal.valueOf(arrived).subtract(used);
            if (remaining.compareTo(BigDecimal.ZERO) < 0) {
                remaining = BigDecimal.ZERO;
            }
            row.put("remainingQuantity", remaining);
            result.add(row);
        }
        return result;
    }
}
