package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.orchestration.StyleAttachmentOrchestrator;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 下单管理编排器
 * 负责款式推送到下单管理的跨域业务逻辑
 */
@Slf4j
@Service
public class OrderManagementOrchestrator {

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private StyleAttachmentOrchestrator styleAttachmentOrchestrator;

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private ProductSkuService productSkuService;

    @Autowired(required = false)
    private EcUniversalStockService ecUniversalStockService;

    @Autowired(required = false)
    private EcommerceOrderService ecommerceOrderService;

    /**
     * 从样衣开发推送到下单管理
     * 只更新款式状态为"可下单"，不会直接创建大货订单
     *
     * @param styleId     款式ID
     * @param targetTypes 推送目标类型列表
     * @return 推送结果
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> createFromStyle(Long styleId, List<String> targetTypes) {
        if (styleId == null) {
            throw new IllegalArgumentException("缺少styleId");
        }

        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) {
            throw new IllegalArgumentException("款号不存在");
        }

        // 已推送过则禁止重复推送
        if (Integer.valueOf(1).equals(style.getPushedToOrder())) {
            throw new IllegalStateException("该款已推送到下单管理，无需重复推送");
        }

        // 检查是否有工序单价配置
        List<StyleProcess> processList = styleProcessService.listByStyleId(styleId);
        if (processList == null || processList.isEmpty()) {
            log.warn("样衣无工序单价数据，但仍允许推送: styleId={}", styleId);
        }

        // 更新款式状态为"可下单"（样衣完成）
        String currentProgressNode = style.getProgressNode();
        if (!"样衣完成".equals(currentProgressNode)) {
            style.setProgressNode("样衣完成");
            styleInfoService.updateById(style);
            log.info("更新款式状态为可下单: styleId={}, styleNo={}, 原状态={}",
                    styleId, style.getStyleNo(), currentProgressNode);
        }

        // 标记已推送，并记录推送人
        String currentUser = UserContext.username();
        style.setPushedToOrder(1);
        style.setPushedToOrderTime(LocalDateTime.now());
        style.setPushedByName(StringUtils.hasText(currentUser) ? currentUser.trim() : null);
        if (StringUtils.hasText(currentUser) && !StringUtils.hasText(style.getOrderType())) {
            style.setOrderType(currentUser.trim());
        }
        styleInfoService.updateById(style);

        // 根据勾选的目标进行同步
        if (targetTypes != null && !targetTypes.isEmpty()) {
            syncToTemplateLibrary(style, targetTypes);
            syncToDataCenter(style, styleId, targetTypes);
        }

        // 返回成功数据
        Map<String, Object> data = new HashMap<>();
        data.put("styleId", styleId);
        data.put("styleNo", style.getStyleNo());
        data.put("status", "ready_for_order");
        data.put("message", "已推送到下单管理，请在下单管理页面创建订单");
        // 返回客户信息（用于下单时带入）
        if (style.getCustomerId() != null) {
            data.put("salesChannel", style.getSalesChannel());
            data.put("customerId", style.getCustomerId());
            data.put("customerName", style.getCustomerName());
            data.put("customerContact", style.getCustomerContact());
            data.put("customerPhone", style.getCustomerPhone());
            data.put("customerAddress", style.getCustomerAddress());
        }
        return data;
    }

    private void syncToTemplateLibrary(StyleInfo style, List<String> targetTypes) {
        try {
            if (StringUtils.hasText(style.getStyleNo())) {
                List<String> templateTypes = new ArrayList<>();
                if (targetTypes.contains("bom")) {
                    templateTypes.add("bom");
                }
                if (targetTypes.contains("size") || targetTypes.contains("pattern")) {
                    templateTypes.add("size");
                }
                if (targetTypes.contains("process") || targetTypes.contains("sizePrice")) {
                    templateTypes.add("process");
                }
                if (targetTypes.contains("process_price")) {
                    templateTypes.add("process_price");
                }
                if (targetTypes.contains("progress")) {
                    templateTypes.add("progress");
                }

                if (!templateTypes.isEmpty()) {
                    Map<String, Object> body = new HashMap<>();
                    body.put("sourceStyleNo", style.getStyleNo());
                    body.put("templateTypes", templateTypes);
                    templateLibraryOrchestrator.createFromStyle(body);
                    log.info("推送到下单管理时同步单价维护成功: styleId={}, styleNo={}, types={}",
                            style.getId(), style.getStyleNo(), templateTypes);
                }
            }
        } catch (Exception e) {
            log.warn("推送到下单管理时同步单价维护失败，但不影响推送操作: styleId={}, error={}",
                    style.getId(), e.getMessage());
        }
    }

    private void syncToDataCenter(StyleInfo style, Long styleId, List<String> targetTypes) {
        try {
            if (targetTypes.contains("pattern")) {
                styleAttachmentOrchestrator.flowPatternToDataCenter(String.valueOf(styleId));
            }
        } catch (Exception e) {
            log.warn("推送到下单管理时同步资料中心失败，但不影响推送操作: styleId={}, error={}",
                    styleId, e.getMessage());
        }
    }

    /**
     * 根据款式ID查询在途生产数量（按颜色x尺码分组）
     * 在途 = orderQuantity - completedQuantity，状态为非终态（未完成/未关单/未取消/未归档）
     *
     * @param styleId 款式ID
     * @return Map 结构: { matrix: { "颜色": { "尺码": 数量 } }, colors: ["颜色"], sizes: ["尺码"], totalInProduction: 总数 }
     */
    public Map<String, Object> getStyleInProductionQuantities(String styleId) {
        Map<String, Object> result = new HashMap<>();
        if (styleId == null || styleId.trim().isEmpty()) {
            result.put("matrix", new HashMap<String, Map<String, Integer>>());
            result.put("totalInProduction", 0);
            return result;
        }

        // 在途状态：pending待生产, production生产中, delayed已逾期, paused已暂停, returned已退回, scrapped待报废(不完全是在途，但为了防重复下单暂不算入)
        Set<String> inProgressStatuses = new HashSet<>();
        inProgressStatuses.add("pending");
        inProgressStatuses.add("production");
        inProgressStatuses.add("delayed");
        inProgressStatuses.add("paused");
        inProgressStatuses.add("returned");

        try {
            Long tid = UserContext.tenantId();
            QueryWrapper<ProductionOrder> query = new QueryWrapper<>();
            query.eq("style_id", styleId);
            query.in("status", inProgressStatuses);
            query.eq("delete_flag", 0);
            query.eq("tenant_id", tid);
            query.isNotNull("color");
            query.isNotNull("size");
            List<ProductionOrder> orders = productionOrderService.list(query);

            // 按 color + size 分组汇总（orderQuantity - completedQuantity）
            Map<String, Map<String, Integer>> matrix = new HashMap<>();
            Set<String> colors = new java.util.LinkedHashSet<>();
            Set<String> sizes = new java.util.LinkedHashSet<>();
            int total = 0;

            for (ProductionOrder order : orders) {
                String color = (order.getColor() == null) ? "" : order.getColor().trim();
                String size = (order.getSize() == null) ? "" : order.getSize().trim();
                if (color.isEmpty() || size.isEmpty()) continue;

                Integer orderQty = order.getOrderQuantity();
                Integer completedQty = order.getCompletedQuantity();
                int remaining = (orderQty == null ? 0 : orderQty) - (completedQty == null ? 0 : completedQty);
                if (remaining <= 0) continue;

                colors.add(color);
                sizes.add(size);

                matrix.computeIfAbsent(color, k -> new HashMap<>())
                      .merge(size, remaining, Integer::sum);
                total += remaining;
            }

            result.put("matrix", matrix);
            result.put("colors", new ArrayList<>(colors));
            result.put("sizes", new ArrayList<>(sizes));
            result.put("totalInProduction", total);
            result.put("orderCount", orders.size());
            log.info("[OrderManagement] 在途数量查询: styleId={}, tenantId={}, 匹配订单数={}, 在途总数={}",
                    styleId, tid, orders.size(), total);
        } catch (Exception e) {
            log.warn("[OrderManagement] 在途数量查询异常: styleId={}, {}", styleId, e.getMessage());
            result.put("matrix", new HashMap<String, Map<String, Integer>>());
            result.put("totalInProduction", 0);
            result.put("orderCount", 0);
        }
        return result;
    }

    /**
     * 综合查询：在途生产 + 库存 + 销售欠数（按颜色x尺码分组）
     * 用于下单时全面展示款式状态，避免超量或漏订
     *
     * @param styleId 款式ID
     * @return Map 结构: {
     *   matrix: { "颜色": { "尺码": { inProduction: N, stock: N, pendingSales: N } } },
     *   summary: { totalInProduction, totalStock, totalPendingSales },
     *   colors: ["颜色"], sizes: ["尺码"]
     * }
     */
    public Map<String, Object> getStyleFullAvailability(String styleId) {
        Map<String, Object> result = new HashMap<>();
        if (styleId == null || styleId.trim().isEmpty()) {
            result.put("matrix", new HashMap<>());
            result.put("summary", buildEmptySummary());
            return result;
        }

        Long tid = UserContext.tenantId();
        Map<String, Map<String, Map<String, Integer>>> matrix = new HashMap<>();
        Set<String> colors = new java.util.LinkedHashSet<>();
        Set<String> sizes = new java.util.LinkedHashSet<>();
        int totalInProd = 0, totalStock = 0, totalPending = 0;

        // 1. 在途生产数量（复用已有逻辑）
        Map<String, Object> inProdData = getStyleInProductionQuantities(styleId);
        Map<String, Map<String, Integer>> inProdMatrix = (Map<String, Map<String, Integer>>) inProdData.getOrDefault("matrix", new HashMap<>());
        for (Map.Entry<String, Map<String, Integer>> colorEntry : inProdMatrix.entrySet()) {
            String color = normalizeKey(colorEntry.getKey());
            colors.add(color);
            for (Map.Entry<String, Integer> sizeEntry : colorEntry.getValue().entrySet()) {
                String size = normalizeKey(sizeEntry.getKey());
                sizes.add(size);
                int qty = sizeEntry.getValue();
                Map<String, Map<String, Integer>> colorMap = matrix.computeIfAbsent(color, k -> new HashMap<>());
                Map<String, Integer> sizeMap = colorMap.computeIfAbsent(size, k -> new HashMap<>());
                sizeMap.merge("inProduction", Integer.valueOf(qty), Integer::sum);
                totalInProd += qty;
            }
        }

        // 2. SKU库存（ProductSku.stockQuantity）
        if (productSkuService != null) {
            try {
                List<ProductSku> skus = productSkuService.list(new LambdaQueryWrapper<ProductSku>()
                        .eq(ProductSku::getStyleId, Long.parseLong(styleId))
                        .eq(ProductSku::getTenantId, tid)
                        .gt(ProductSku::getStockQuantity, 0));
                for (ProductSku sku : skus) {
                    String color = normalizeKey(sku.getColor());
                    String size = normalizeKey(sku.getSize());
                    if (color.isEmpty() || size.isEmpty()) continue;
                    colors.add(color);
                    sizes.add(size);
                    int qty = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
                    Map<String, Map<String, Integer>> colorMap = matrix.computeIfAbsent(color, k -> new HashMap<>());
                    Map<String, Integer> sizeMap = colorMap.computeIfAbsent(size, k -> new HashMap<>());
                    sizeMap.merge("stock", Integer.valueOf(qty), Integer::sum);
                    totalStock += qty;
                }
            } catch (Exception e) {
                log.warn("[OrderManagement] SKU库存查询异常: styleId={}, {}", styleId, e.getMessage());
            }
        }

        // 3. 电商库存（EcUniversalStock.availableStock + pendingOrders）
        if (ecUniversalStockService != null) {
            try {
                List<EcUniversalStock> ecStocks = ecUniversalStockService.list(new LambdaQueryWrapper<EcUniversalStock>()
                        .eq(EcUniversalStock::getStyleId, Long.parseLong(styleId))
                        .eq(EcUniversalStock::getTenantId, tid));
                for (EcUniversalStock ec : ecStocks) {
                    // EcUniversalStock 没有 color/size，需要通过 skuId 关联 ProductSku
                    if (ec.getSkuId() != null && productSkuService != null) {
                        ProductSku sku = productSkuService.getById(ec.getSkuId());
                        if (sku == null) continue;
                        String color = normalizeKey(sku.getColor());
                        String size = normalizeKey(sku.getSize());
                        if (color.isEmpty() || size.isEmpty()) continue;
                        colors.add(color);
                        sizes.add(size);
                        Integer avail = ec.getAvailableStock() != null ? ec.getAvailableStock() : Integer.valueOf(0);
                        Integer pending = ec.getPendingOrders() != null ? ec.getPendingOrders() : Integer.valueOf(0);
                        Map<String, Integer> sizeMap = matrix.computeIfAbsent(color, k -> new HashMap<>())
                              .computeIfAbsent(size, k -> new HashMap<>());
                        sizeMap.merge("ecAvailable", avail, Integer::sum);
                        sizeMap.merge("pendingSales", pending, Integer::sum);
                        totalPending += pending;
                    }
                }
            } catch (Exception e) {
                log.warn("[OrderManagement] 电商库存查询异常: styleId={}, {}", styleId, e.getMessage());
            }
        }

        // 4. 电商订单欠数（EcommerceOrder.status=1待发货，未关联生产订单的）
        if (ecommerceOrderService != null) {
            try {
                List<EcommerceOrder> pendingOrders = ecommerceOrderService.list(new LambdaQueryWrapper<EcommerceOrder>()
                        .eq(EcommerceOrder::getTenantId, tid)
                        .eq(EcommerceOrder::getStatus, 1) // 待发货
                        .isNull(EcommerceOrder::getProductionOrderId) // 未关联生产订单
                        .isNotNull(EcommerceOrder::getSkuCode));
                for (EcommerceOrder order : pendingOrders) {
                    String skuCode = order.getSkuCode();
                    if (skuCode == null || !skuCode.contains("-")) continue;
                    // skuCode 格式: 款号-颜色-尺码
                    String[] parts = skuCode.split("-");
                    if (parts.length < 3) continue;
                    String color = normalizeKey(parts[parts.length - 2]);
                    String size = normalizeKey(parts[parts.length - 1]);
                    colors.add(color);
                    sizes.add(size);
                    int qty = order.getQuantity() != null ? order.getQuantity() : 1;
                    Map<String, Map<String, Integer>> colorMap = matrix.computeIfAbsent(color, k -> new HashMap<>());
                    Map<String, Integer> sizeMap = colorMap.computeIfAbsent(size, k -> new HashMap<>());
                    sizeMap.merge("pendingSales", Integer.valueOf(qty), Integer::sum);
                    totalPending += qty;
                }
            } catch (Exception e) {
                log.warn("[OrderManagement] 电商订单欠数查询异常: styleId={}, {}", styleId, e.getMessage());
            }
        }

        result.put("matrix", matrix);
        result.put("colors", new ArrayList<>(colors));
        result.put("sizes", new ArrayList<>(sizes));
        result.put("summary", buildSummary(totalInProd, totalStock, totalPending));
        log.info("[OrderManagement] 综合查询完成: styleId={}, 在途={}, 库存={}, 欠数={}, 颜色={}, 尺码={}",
                styleId, totalInProd, totalStock, totalPending, colors.size(), sizes.size());
        return result;
    }

    private String normalizeKey(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private Map<String, Integer> buildEmptySummary() {
        Map<String, Integer> s = new HashMap<>();
        s.put("totalInProduction", 0);
        s.put("totalStock", 0);
        s.put("totalPendingSales", 0);
        return s;
    }

    private Map<String, Integer> buildSummary(int inProd, int stock, int pending) {
        Map<String, Integer> s = new HashMap<>();
        s.put("totalInProduction", inProd);
        s.put("totalStock", stock);
        s.put("totalPendingSales", pending);
        return s;
    }
}
