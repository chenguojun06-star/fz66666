package com.fashion.supplychain.integration.ecommerce.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.EcSalesRevenue;
import com.fashion.supplychain.finance.service.EcSalesRevenueService;
import com.fashion.supplychain.integration.ecommerce.entity.EcommerceOrder;
import com.fashion.supplychain.integration.ecommerce.entity.EcUniversalStock;
import com.fashion.supplychain.integration.ecommerce.service.EcommerceOrderService;
import com.fashion.supplychain.integration.ecommerce.service.EcUniversalStockService;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.OrderProcessQueryService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.service.ProductSkuService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 电商 ↔ 生产 ↔ 仓库 双向联动面板数据编排器
 *
 * <p>给"生产端看销售动态 / 销售端看生产动态"的悬浮小面板提供数据源。
 *
 * <h3>数据真实性铁律（本类最重要约束）</h3>
 * <ol>
 *   <li><b>只读真实落库数据</b>，绝不使用随机数、常量或估算值填充任何字段。</li>
 *   <li>查不到就返回 {@code linked=false} + {@code reason}，由前端显示"暂无关联"；
 *       <b>不返回编造的默认值</b>（如把缺失库存写成 0、把缺失进度写成 0%）。</li>
 *   <li>可推导字段（剩余天数、风险等级）必须写明推导依据，且依据缺失时置 null。</li>
 *   <li>本类是<b>只读</b>的：不产生任何 UPDATE / INSERT，读方法不应有副作用。</li>
 * </ol>
 *
 * <h3>双向链路</h3>
 * <ul>
 *   <li>{@link #ecBriefByProductionOrderNo} 生产端 → 电商动态（订单状态/仓库状态/发货信息/近7天销量/库存联动）</li>
 *   <li>{@link #productionBriefByOrderNo} 销售端 → 生产动态（进度/完成数/交期/风险/库存联动）</li>
 * </ul>
 *
 * <h3>款号口径（踩过的坑）</h3>
 * 真实 SKU 编码是<b>款号直接拼颜色尺码、没有分隔符</b>（如
 * {@code BR24XQ0098E草绿色L(170/84A)}），因此<b>严禁用 {@code indexOf('-')} 之类的
 * 字符串切分去猜款号</b>。本类统一以<b>生产单的 styleId / styleNo</b> 为权威口径，
 * 库存按 {@code t_ec_universal_stock.style_id} 精确匹配。
 */
@Slf4j
@Service
public class EcProductionLinkOrchestrator {

    /** 近 N 天销量窗口 */
    private static final int SALES_TREND_DAYS = 7;

    private static final DateTimeFormatter DATE_KEY = DateTimeFormatter.ofPattern("MM-dd");
    private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Autowired(required = false)
    private EcommerceOrderService ecOrderService;

    @Autowired(required = false)
    private EcSalesRevenueService ecSalesRevenueService;

    @Autowired(required = false)
    private EcUniversalStockService ecUniversalStockService;

    @Autowired(required = false)
    private ProductionOrderService productionOrderService;

    @Autowired(required = false)
    private OrderProcessQueryService orderProcessQueryService;

    @Autowired(required = false)
    private ProductSkuService productSkuService;

    // ==================================================================================
    // 方向一：生产端 → 电商动态
    // ==================================================================================

    /**
     * 按生产单号取电商动态（生产端悬浮面板用）
     *
     * @param productionOrderNo 生产订单号
     * @return 永远非 null；无关联时 {@code linked=false}
     */
    public Map<String, Object> ecBriefByProductionOrderNo(String productionOrderNo) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (!StringUtils.hasText(productionOrderNo)) {
            return notLinked(result, "未提供生产单号");
        }
        if (ecOrderService == null) {
            return notLinked(result, "电商模块未启用");
        }

        Long tenantId;
        try {
            tenantId = TenantAssert.requireTenantId();
        } catch (Exception e) {
            return notLinked(result, "缺少租户上下文");
        }

        try {
            EcommerceOrder order = ecOrderService.getOne(new LambdaQueryWrapper<EcommerceOrder>()
                    .eq(EcommerceOrder::getTenantId, tenantId)
                    .eq(EcommerceOrder::getProductionOrderNo, productionOrderNo)
                    .orderByDesc(EcommerceOrder::getCreateTime)
                    .last("LIMIT 1"), false);

            if (order == null) {
                return notLinked(result, "该生产单尚未关联电商订单");
            }

            result.put("linked", true);
            result.put("ecOrderNo", order.getOrderNo());
            result.put("platform", order.getPlatform());
            result.put("platformOrderNo", order.getPlatformOrderNo());
            result.put("shopName", order.getShopName());
            result.put("productName", order.getProductName());
            result.put("skuCode", order.getSkuCode());
            result.put("quantity", order.getQuantity());
            result.put("payAmount", order.getPayAmount());
            result.put("buyerNick", order.getBuyerNick());
            result.put("buyerRemark", order.getBuyerRemark());
            result.put("isPresale", order.getIsPresale());

            result.put("status", order.getStatus());
            result.put("statusText", ecStatusText(order.getStatus()));
            result.put("warehouseStatus", order.getWarehouseStatus());
            result.put("warehouseStatusText", ecWarehouseStatusText(order.getWarehouseStatus()));

            result.put("createTime", fmt(order.getCreateTime()));
            result.put("payTime", fmt(order.getPayTime()));
            result.put("shipTime", fmt(order.getShipTime()));
            result.put("completeTime", fmt(order.getCompleteTime()));
            result.put("trackingNo", order.getTrackingNo());
            result.put("expressCompany", order.getExpressCompany());

            // 款号/款ID 取权威来源：生产单（EC 订单的 skuCode 是平台编码，不能靠字符串切分猜款号）
            ProductionOrder prodOrder = findProductionOrder(tenantId, productionOrderNo);
            Long styleId = prodOrder == null ? null : parseLong(prodOrder.getStyleId());
            String styleNo = prodOrder == null ? null : prodOrder.getStyleNo();

            result.put("styleNo", styleNo);
            result.put("styleId", styleId);
            result.put("salesTrend", buildSalesTrend(tenantId, styleNo, styleId));
            result.put("stock", buildStockBrief(tenantId, styleId, styleNo));

            return result;
        } catch (Exception e) {
            log.warn("[联动面板] 查询电商动态失败 productionOrderNo={}: {}", productionOrderNo, e.getMessage());
            return notLinked(result, "查询电商动态异常");
        }
    }

    // ==================================================================================
    // 方向二：销售端 → 生产动态
    // ==================================================================================

    /**
     * 按生产单号取生产动态（销售端/电商端悬浮面板用）
     *
     * @param orderNo 生产订单号
     * @return 永远非 null；无关联时 {@code linked=false}
     */
    public Map<String, Object> productionBriefByOrderNo(String orderNo) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (!StringUtils.hasText(orderNo)) {
            return notLinked(result, "未提供生产单号");
        }
        if (productionOrderService == null) {
            return notLinked(result, "生产模块未启用");
        }

        Long tenantId;
        try {
            tenantId = TenantAssert.requireTenantId();
        } catch (Exception e) {
            return notLinked(result, "缺少租户上下文");
        }

        try {
            ProductionOrder order = productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getOrderNo, orderNo)
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("LIMIT 1"), false);

            if (order == null) {
                return notLinked(result, "未找到该生产订单");
            }

            result.put("linked", true);
            result.put("orderNo", order.getOrderNo());
            result.put("styleNo", order.getStyleNo());
            result.put("styleName", order.getStyleName());
            result.put("factoryName", order.getFactoryName());
            result.put("platformCode", order.getPlatformCode());

            result.put("status", order.getStatus());
            result.put("statusText", productionStatusText(order.getStatus()));
            result.put("currentProcess", resolveCurrentProcess(order));

            result.put("orderQuantity", order.getOrderQuantity());
            result.put("completedQuantity", order.getCompletedQuantity());
            result.put("productionProgress", order.getProductionProgress());
            result.put("materialArrivalRate", order.getMaterialArrivalRate());
            result.put("urgencyLevel", order.getUrgencyLevel());
            result.put("deliverySlaStatus", order.getDeliverySlaStatus());

            result.put("plannedStartDate", fmt(order.getPlannedStartDate()));
            result.put("plannedEndDate", fmt(order.getPlannedEndDate()));
            result.put("actualStartDate", fmt(order.getActualStartDate()));
            result.put("actualEndDate", fmt(order.getActualEndDate()));
            result.put("expectedShipDate", fmt(order.getExpectedShipDate()));

            // 交期推导：仅当计划交期真实存在时才计算，否则置 null（不编造）
            result.put("delivery", buildDeliveryHint(order));

            result.put("stock", buildStockBrief(tenantId, parseLong(order.getStyleId()), order.getStyleNo()));

            return result;
        } catch (Exception e) {
            log.warn("[联动面板] 查询生产动态失败 orderNo={}: {}", orderNo, e.getMessage());
            return notLinked(result, "查询生产动态异常");
        }
    }

    // ==================================================================================
    // 内部实现
    // ==================================================================================

    private Map<String, Object> notLinked(Map<String, Object> result, String reason) {
        result.put("linked", false);
        result.put("reason", reason);
        return result;
    }

    /**
     * 近 N 天销量趋势：按真实出库流水（t_ec_sales_revenue）逐日聚合，缺口日期补 0（0 是事实，不是编造）。
     *
     * <p>{@code t_ec_sales_revenue} 只有 {@code sku_code} 没有 {@code style_id}，
     * 因此用"该款全部内部 SKU 编码 IN 匹配 + 款号前缀匹配"两条口径，
     * 覆盖流水里存内部 SKU 码与存平台 SKU 码两种情形。
     */
    private List<Map<String, Object>> buildSalesTrend(Long tenantId, String styleNo, Long styleId) {
        List<Map<String, Object>> trend = new ArrayList<>();
        LocalDate today = LocalDate.now();
        LocalDate from = today.minusDays(SALES_TREND_DAYS - 1L);

        // 先铺满日期轴，保证图表 X 轴连续
        Map<String, int[]> qtyByDate = new LinkedHashMap<>();
        Map<String, BigDecimal> amountByDate = new LinkedHashMap<>();
        for (int i = 0; i < SALES_TREND_DAYS; i++) {
            String key = from.plusDays(i).format(DATE_KEY);
            qtyByDate.put(key, new int[]{0});
            amountByDate.put(key, BigDecimal.ZERO);
        }

        List<String> skuCodes = resolveSkuCodes(tenantId, styleId);
        boolean hasStyleKey = StringUtils.hasText(styleNo) || !skuCodes.isEmpty();

        if (ecSalesRevenueService != null && hasStyleKey) {
            try {
                List<EcSalesRevenue> rows = ecSalesRevenueService.list(new LambdaQueryWrapper<EcSalesRevenue>()
                        .eq(EcSalesRevenue::getTenantId, tenantId)
                        .ge(EcSalesRevenue::getCreateTime, from.atStartOfDay())
                        .and(w -> {
                            if (!skuCodes.isEmpty()) {
                                w.in(EcSalesRevenue::getSkuCode, skuCodes);
                            }
                            if (StringUtils.hasText(styleNo)) {
                                if (!skuCodes.isEmpty()) {
                                    w.or();
                                }
                                w.likeRight(EcSalesRevenue::getSkuCode, styleNo);
                            }
                        }));
                for (EcSalesRevenue r : rows) {
                    if (r.getCreateTime() == null) continue;
                    String key = r.getCreateTime().toLocalDate().format(DATE_KEY);
                    if (!qtyByDate.containsKey(key)) continue;
                    qtyByDate.get(key)[0] += r.getQuantity() == null ? 0 : r.getQuantity();
                    BigDecimal amt = r.getPayAmount() != null ? r.getPayAmount()
                            : (r.getTotalAmount() != null ? r.getTotalAmount() : BigDecimal.ZERO);
                    amountByDate.merge(key, amt, BigDecimal::add);
                }
            } catch (Exception e) {
                log.warn("[联动面板] 近{}天销量查询失败 styleNo={}: {}", SALES_TREND_DAYS, styleNo, e.getMessage());
            }
        }

        for (Map.Entry<String, int[]> e : qtyByDate.entrySet()) {
            Map<String, Object> point = new LinkedHashMap<>();
            point.put("date", e.getKey());
            point.put("quantity", e.getValue()[0]);
            point.put("amount", amountByDate.getOrDefault(e.getKey(), BigDecimal.ZERO)
                    .setScale(2, RoundingMode.HALF_UP));
            trend.add(point);
        }
        return trend;
    }

    /**
     * 库存联动快照：按 {@code style_id} 取 {@code t_ec_universal_stock} 并汇总<b>款级行</b>。
     *
     * <p>该表由 {@code EcUniversalStockService.recalculateStock} 在电商接单/出库/入库时维护，
     * 是"仓库 ↔ 电商"联动的真实落点。两点必须注意：
     * <ul>
     *   <li><b>只统计 {@code warehouse} 为空的款级汇总行</b>：recalculateStock 会为每个 SKU
     *       同时写"N 个仓库行 + 1 个款级行"，把仓库行一起加会<b>重复计数</b>。
     *       去重放在 Java 层做，保证确定性与可测性。</li>
     *   <li>匹配优先用 {@code style_id} 精确等值，不用 sku_code 字符串猜
     *       （真实 SKU 编码是"款号直接拼颜色尺码"，不含分隔符）。</li>
     * </ul>
     * 查不到款级行时返回 null，前端显示"暂无库存数据"。
     */
    private Map<String, Object> buildStockBrief(Long tenantId, Long styleId, String styleNo) {
        if (ecUniversalStockService == null) {
            return null;
        }
        if (styleId == null && !StringUtils.hasText(styleNo)) {
            return null;
        }
        try {
            List<EcUniversalStock> rows = ecUniversalStockService.list(new LambdaQueryWrapper<EcUniversalStock>()
                    .eq(EcUniversalStock::getTenantId, tenantId)
                    .and(w -> {
                        if (styleId != null) {
                            w.eq(EcUniversalStock::getStyleId, styleId);
                        }
                        if (StringUtils.hasText(styleNo)) {
                            if (styleId != null) {
                                w.or();
                            }
                            w.likeRight(EcUniversalStock::getSkuCode, styleNo);
                        }
                    }));
            if (rows == null || rows.isEmpty()) {
                return null;
            }
            int available = 0, onWay = 0, pending = 0, warehoused = 0, outstock = 0, safe = 0, skuCount = 0;
            for (EcUniversalStock s : rows) {
                // 仓库行是款级行的明细，跳过，避免重复计数
                if (StringUtils.hasText(s.getWarehouse())) {
                    continue;
                }
                available += nz(s.getAvailableStock());
                onWay += nz(s.getOnWayProduction());
                pending += nz(s.getPendingOrders());
                warehoused += nz(s.getTotalWarehoused());
                outstock += nz(s.getTotalOutstock());
                safe += nz(s.getSafeStock());
                skuCount++;
            }
            if (skuCount == 0) {
                // 只有仓库明细行、没有款级行时不做兜底：宁可显示"暂无库存数据"，也不给出会重复计数的数字
                return null;
            }
            Map<String, Object> stock = new LinkedHashMap<>();
            stock.put("availableStock", available);
            stock.put("onWayProduction", onWay);
            stock.put("pendingOrders", pending);
            stock.put("totalWarehoused", warehoused);
            stock.put("totalOutstock", outstock);
            stock.put("safeStock", safe);
            stock.put("skuCount", skuCount);
            // 低于安全库存：只有安全库存被真实设置过（>0）才判定，避免全 0 时误报
            stock.put("belowSafeStock", safe > 0 && available < safe);
            return stock;
        } catch (Exception e) {
            log.warn("[联动面板] 库存联动查询失败 styleId={} styleNo={}: {}", styleId, styleNo, e.getMessage());
            return null;
        }
    }

    /** 交期提示：仅有真实计划交期时才计算剩余天数与风险 */
    private Map<String, Object> buildDeliveryHint(ProductionOrder order) {
        if (isTerminal(order.getStatus())) {
            Map<String, Object> done = new LinkedHashMap<>();
            done.put("daysLeft", null);
            done.put("riskLevel", "done");
            done.put("riskText", "已完成");
            return done;
        }
        LocalDateTime planEnd = order.getPlannedEndDate();
        if (planEnd == null) {
            Map<String, Object> unknown = new LinkedHashMap<>();
            unknown.put("daysLeft", null);
            unknown.put("riskLevel", "unknown");
            unknown.put("riskText", "未设置交期");
            return unknown;
        }
        long daysLeft = ChronoUnit.DAYS.between(LocalDate.now(), planEnd.toLocalDate());
        int prog = nz(order.getProductionProgress());

        String level;
        String text;
        if (daysLeft < 0) {
            level = "danger";
            text = "逾期 " + (-daysLeft) + " 天";
        } else if (daysLeft == 0) {
            level = "danger";
            text = "今天交货";
        } else if (daysLeft <= 3 && prog < 80) {
            level = "danger";
            text = "还剩 " + daysLeft + " 天·高风险";
        } else if (daysLeft <= 7 && prog < 50) {
            level = "warning";
            text = "还剩 " + daysLeft + " 天·存在风险";
        } else {
            level = "normal";
            text = "还剩 " + daysLeft + " 天";
        }

        Map<String, Object> hint = new LinkedHashMap<>();
        hint.put("daysLeft", daysLeft);
        hint.put("riskLevel", level);
        hint.put("riskText", text);
        return hint;
    }

    private String resolveCurrentProcess(ProductionOrder order) {
        if (orderProcessQueryService != null) {
            try {
                List<ProductionOrder> one = new ArrayList<>(Collections.singletonList(order));
                orderProcessQueryService.fillCurrentProcessName(one);
                if (StringUtils.hasText(order.getCurrentProcessName())) {
                    return order.getCurrentProcessName();
                }
            } catch (Exception e) {
                log.warn("[联动面板] 计算当前工序失败 orderNo={}: {}", order.getOrderNo(), e.getMessage());
            }
        }
        // 兜底：直接用状态映射，不编造
        return productionStatusText(order.getStatus());
    }

    /** 按生产单号取生产单（款号/款ID 的权威来源），查不到返回 null */
    private ProductionOrder findProductionOrder(Long tenantId, String orderNo) {
        if (productionOrderService == null || !StringUtils.hasText(orderNo)) {
            return null;
        }
        try {
            return productionOrderService.getOne(new LambdaQueryWrapper<ProductionOrder>()
                    .eq(ProductionOrder::getOrderNo, orderNo)
                    .eq(ProductionOrder::getTenantId, tenantId)
                    .eq(ProductionOrder::getDeleteFlag, 0)
                    .last("LIMIT 1"), false);
        } catch (Exception e) {
            log.warn("[联动面板] 查询生产单失败 orderNo={}: {}", orderNo, e.getMessage());
            return null;
        }
    }

    /** 该款下的全部内部 SKU 编码（销售流水表只有 sku_code，需要用它做 IN 匹配） */
    private List<String> resolveSkuCodes(Long tenantId, Long styleId) {
        if (productSkuService == null || styleId == null) {
            return List.of();
        }
        try {
            return productSkuService.list(new LambdaQueryWrapper<ProductSku>()
                            .select(ProductSku::getSkuCode)
                            .eq(ProductSku::getTenantId, tenantId)
                            .eq(ProductSku::getStyleId, styleId))
                    .stream()
                    .map(ProductSku::getSkuCode)
                    .filter(StringUtils::hasText)
                    .distinct()
                    .toList();
        } catch (Exception e) {
            log.warn("[联动面板] 查询款下SKU失败 styleId={}: {}", styleId, e.getMessage());
            return List.of();
        }
    }

    /** styleId 在生产单里是 varchar(36)，转 Long 失败时返回 null（不编造、不猜测） */
    private Long parseLong(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        try {
            return Long.valueOf(raw.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private boolean isTerminal(String status) {
        if (!StringUtils.hasText(status)) return false;
        String s = status.toLowerCase();
        return s.equals("completed") || s.equals("closed") || s.equals("cancelled")
                || s.equals("scrapped") || s.equals("archived");
    }

    private String ecStatusText(Integer status) {
        if (status == null) return null;
        return switch (status) {
            case 0 -> "待付款";
            case 1 -> "待发货";
            case 2 -> "已发货";
            case 3 -> "已完成";
            case 4 -> "已取消";
            case 5 -> "退款中";
            default -> "未知(" + status + ")";
        };
    }

    private String ecWarehouseStatusText(Integer status) {
        if (status == null) return null;
        return switch (status) {
            case 0 -> "待拣货";
            case 1 -> "备货中";
            case 2 -> "已出库";
            default -> "未知(" + status + ")";
        };
    }

    private String productionStatusText(String status) {
        if (!StringUtils.hasText(status)) return "未知";
        return switch (status.toLowerCase()) {
            case "not_started", "pending" -> "待开始";
            case "procurement" -> "物料采购";
            case "cutting" -> "裁剪";
            case "sewing" -> "车缝";
            case "ironing" -> "大烫";
            case "secondary_process" -> "二次工艺";
            case "packaging" -> "包装";
            case "quality_check" -> "质检";
            case "warehousing" -> "入库";
            case "production" -> "生产中";
            case "completed" -> "已完成";
            case "closed" -> "已关单";
            case "cancelled" -> "已取消";
            case "scrapped" -> "已报废";
            case "archived" -> "已归档";
            default -> status;
        };
    }

    private int nz(Integer v) {
        return v == null ? 0 : v;
    }

    private String fmt(LocalDateTime t) {
        return t == null ? null : t.format(DATE_TIME);
    }
}
