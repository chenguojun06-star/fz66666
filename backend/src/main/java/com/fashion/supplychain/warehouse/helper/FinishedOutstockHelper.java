package com.fashion.supplychain.warehouse.helper;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.BillAggregation;
import com.fashion.supplychain.finance.orchestration.BillAggregationOrchestrator;
import com.fashion.supplychain.finance.service.BillAggregationService;
import com.fashion.supplychain.integration.ecommerce.orchestration.EcommerceOrderOrchestrator;
import com.fashion.supplychain.integration.sync.event.StockChangePublisher;
import com.fashion.supplychain.production.entity.ProductOutstock;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.OrderRemarkHelper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.warehouse.entity.ComboProduct;
import com.fashion.supplychain.warehouse.entity.ComboProductItem;
import com.fashion.supplychain.warehouse.service.ComboProductItemService;
import com.fashion.supplychain.warehouse.service.ComboProductService;
import com.fashion.supplychain.warehouse.entity.WarehouseArea;
import com.fashion.supplychain.warehouse.service.WarehouseAreaService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@Component
@Slf4j
public class FinishedOutstockHelper {

    private static final Set<String> VALID_OUTSTOCK_TYPES = Set.of(
            "shipment", "free_outbound", "sample_out", "damage_out", "transfer_out", "other_out", "scan_outbound");

    /**
     * D-374：需要客户信息的出库类型（真正"发货给客户"的场景）。
     * <p>
     * 其余类型都是**内部流向**，强制要客户名属于逻辑错误：
     * <ul>
     *   <li>transfer_out 调拨出库——仓库/库位之间转移，与客户无关</li>
     *   <li>damage_out 报废出库——内部损耗</li>
     *   <li>sample_out 样衣出库——借出/内部流转</li>
     *   <li>other_out 其他出库</li>
     * </ul>
     */
    private static final Set<String> REQUIRES_CUSTOMER_TYPES = Set.of(
            "shipment", "free_outbound", "scan_outbound");

    /**
     * D-130 出库类型词汇表统一：前端旧值（sales/free/transfer/scrap）映射到后端规范值。
     * 规范值原样通过；空值默认销售出货 shipment。
     */
    private static String normalizeOutstockType(String raw) {
        if (!StringUtils.hasText(raw)) {
            return "shipment";
        }
        switch (raw) {
            case "sales": return "shipment";
            case "free": return "free_outbound";
            case "transfer": return "transfer_out";
            case "scrap": return "damage_out";
            default: return raw;
        }
    }

    private final ProductSkuService productSkuService;
    private final ProductOutstockService productOutstockService;
    private final StyleInfoService styleInfoService;
    private final WarehouseAreaService warehouseAreaService;
    private final ProductWarehousingService productWarehousingService;

    @Lazy
    @Autowired
    private EcommerceOrderOrchestrator ecommerceOrderOrchestrator;

    @Autowired
    private BillAggregationOrchestrator billAggregationOrchestrator;

    @Autowired
    private BillAggregationService billAggregationService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private OrderRemarkHelper orderRemarkHelper;

    /** D-529 组合商品：套装出库时按子SKU展开扣库存、行上挂组合溯源 */
    @Autowired
    private ComboProductService comboProductService;

    @Autowired
    private ComboProductItemService comboProductItemService;

    /** 成品出库后通知电商库存链路重算（仓库 → 电商 联动） */
    @Autowired
    private StockChangePublisher stockChangePublisher;

    public FinishedOutstockHelper(ProductSkuService productSkuService,
                                  ProductOutstockService productOutstockService,
                                  StyleInfoService styleInfoService,
                                  WarehouseAreaService warehouseAreaService,
                                  ProductWarehousingService productWarehousingService) {
        this.productSkuService = productSkuService;
        this.productOutstockService = productOutstockService;
        this.styleInfoService = styleInfoService;
        this.warehouseAreaService = warehouseAreaService;
        this.productWarehousingService = productWarehousingService;
    }

    // D-001 修复：移除 Helper 层 @Transactional（调用方 FinishedInventoryOrchestrator.outbound 已有事务保护）
    public void outbound(Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) params.get("items");
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("出库明细不能为空");
        }
        // P0铁律4：多租户隔离，方法顶部统一获取 tenantId
        Long tenantId = UserContext.tenantId();
        String requestOrderId = trimToNull(params.get("orderId"));
        String requestOrderNo = trimToNull(params.get("orderNo"));
        String requestWarehouse = trimToNull(params.get("warehouseLocation"));
        String trackingNo = trimToNull(params.get("trackingNo"));
        String expressCompany = trimToNull(params.get("expressCompany"));
        String customerName = trimToNull(params.get("customerName"));
        String customerPhone = trimToNull(params.get("customerPhone"));
        String shippingAddress = trimToNull(params.get("shippingAddress"));
        // D-483：出库备注（原后端把 remark 写死成「成品库存页面出库|sku=xxx」，
        // 页面上填的备注根本存不进去）。此处读取调用方传入的 remark 并追加到固定前缀之后；
        // 未传时行为与改动前完全一致。
        String requestRemark = trimToNull(params.get("remark"));
        // D-360k：质检直发——不落成品库存直接发客户，跳过库存扣减但仍写销售出库记录
        boolean directShip = params.get("directShip") != null
                && Boolean.parseBoolean(String.valueOf(params.get("directShip")));
        String outstockType = trimToNull(params.get("outstockType"));
        // D-130：兼容前端旧键名 outboundType（PC出库弹窗/二维码出库均发该键，此前后端读不到→一律默认 shipment，
        // 报废/调拨出库被错误记成销售出库）
        if (outstockType == null) {
            outstockType = trimToNull(params.get("outboundType"));
        }
        String finalOutstockType = normalizeOutstockType(outstockType);
        if (!VALID_OUTSTOCK_TYPES.contains(finalOutstockType)) {
            throw new IllegalArgumentException("无效的出库类型: " + finalOutstockType);
        }
        // D-363e：直发模式(质检直发入口)只允许销售出库——直发不扣库存，若允许调拨/报废等
        // 内部流向，会生成"记了出库单但库存没扣"的幽灵出库，之后回入库再加库存就翻倍
        if (directShip && !"shipment".equals(finalOutstockType)) {
            throw new IllegalArgumentException("直发模式仅支持销售出库；调拨/报废出库请从库存管理页正常出库（会扣减库存）");
        }
        // D-374：只有「发客户」类出库才要求客户——调拨/报废/样衣借出等内部流向不再强制；
        // 质检直发（directShip）本质仍是发客户，同样要求客户
        boolean needsCustomer = REQUIRES_CUSTOMER_TYPES.contains(finalOutstockType) || directShip;
        if (needsCustomer && !StringUtils.hasText(customerName)) {
            throw new IllegalArgumentException("销售/赠品/扫码出库必须选择客户");
        }
        String warehouseAreaId = trimToNull(params.get("warehouseAreaId"));
        String warehouseAreaName = resolveWarehouseAreaName(warehouseAreaId);
        String platformCode = trimToNull(params.get("platformCode"));
        // 如果未传入 platformCode，尝试从生产订单查询（带 tenant_id 隔离，P0铁律4）
        if (!StringUtils.hasText(platformCode) && StringUtils.hasText(requestOrderNo)) {
            try {
                ProductionOrder prodOrder = productionOrderService.lambdaQuery()
                        .select(ProductionOrder::getId, ProductionOrder::getPlatformCode)
                        .eq(ProductionOrder::getOrderNo, requestOrderNo)
                        .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
                        .one();
                if (prodOrder != null && StringUtils.hasText(prodOrder.getPlatformCode())) {
                    platformCode = prodOrder.getPlatformCode();
                }
            } catch (Exception e) {
                log.warn("[出库] 查询生产订单 platformCode 失败: orderNo={} {}", requestOrderNo, e.getMessage());
            }
        }

        // D-529：组合套装出库——行上挂组合溯源（销售记录关联组合SKU，实际按子SKU逐个扣库存）
        Long comboId = parseLongOrNull(params.get("comboId"));
        String comboCode = trimToNull(params.get("comboCode"));
        String comboName = trimToNull(params.get("comboName"));

        int totalItems = 0;
        int totalQty = 0;

        // D-360n：一次出库共用同一出库单号（明细多行同单），不再按码数拆成多张出库单
        String batchOutstockNo = buildOutstockNo(LocalDateTime.now());
        // D-362i：把出库单号回填进请求参数，操作日志AOP的 targetId 才能落到单号（否则日志无法按单追溯）
        params.put("outstockNo", batchOutstockNo);

        for (Map<String, Object> item : items) {
            String skuCode = (String) item.get("sku");
            if (!StringUtils.hasText(skuCode)) {
                throw new IllegalArgumentException("SKU编码不能为空");
            }
            int quantity = Integer.parseInt(item.getOrDefault("quantity", "0").toString());
            if (quantity <= 0) {
                throw new IllegalArgumentException("出库数量必须大于0: " + skuCode);
            }
            LambdaQueryWrapper<ProductSku> wrapper = new LambdaQueryWrapper<ProductSku>()
                    .eq(ProductSku::getSkuCode, skuCode)
                    .eq(tenantId != null, ProductSku::getTenantId, tenantId);
            ProductSku sku = productSkuService.getOne(wrapper);
            if (sku == null) {
                throw new IllegalArgumentException("SKU不存在: " + skuCode);
            }
            if (!directShip) {
                boolean updated = productSkuService.decreaseStockBySkuCode(skuCode, quantity);
                if (!updated) {
                    int current = sku.getStockQuantity() != null ? sku.getStockQuantity() : 0;
                    throw new IllegalArgumentException(
                            "库存不足: " + skuCode + "，可用库存:" + current + "件，申请出库:" + quantity + "件");
                }
            } else {
                log.info("[出库] 质检直发模式：不扣减库存 skuCode={} qty={}", skuCode, quantity);
            }

            // 价格覆盖逻辑
            BigDecimal overrideSalesPrice = null;
            Object priceObj = item.get("salesPrice");
            if (priceObj != null) {
                try { overrideSalesPrice = new BigDecimal(priceObj.toString()); } catch (NumberFormatException e) {
                    log.warn("[FinishedOutstock] 解析销售单价失败: {}", e.getMessage());
                }
            }
            String priceAdjustmentReason = trimToNull(item.get("priceAdjustmentReason"));
            // D-529：组合套装分摊——行总额以分摊结果为准（精确到分），单价仅为展示
            BigDecimal overrideTotalAmount = toBigDecimalOrNull(item.get("totalAmount"));

            String effectiveWarehouse = requestWarehouse;
            String effectiveAreaId = warehouseAreaId;
            String effectiveAreaName = warehouseAreaName;
            if (!StringUtils.hasText(effectiveWarehouse) && !StringUtils.hasText(effectiveAreaId)) {
                String[] resolved = resolveWarehouseFromLatestInbound(skuCode, tenantId);
                if (resolved != null) {
                    effectiveWarehouse = resolved[0];
                    effectiveAreaId = resolved[1];
                    effectiveAreaName = resolved[2];
                }
            }

            // D-483：把调用方传入的备注追加到固定前缀之后（未传则保持原样）
            String autoRemark = StringUtils.hasText(comboCode)
                    ? "组合套装出库|套装=" + comboName + "(" + comboCode + ")|sku=" + skuCode
                    : "成品库存页面出库|sku=" + skuCode;
            String itemRemark = StringUtils.hasText(requestRemark) ? autoRemark + " | " + requestRemark : autoRemark;
            recordProductOutstock(batchOutstockNo, sku, quantity, requestOrderId, requestOrderNo, effectiveWarehouse,
                    itemRemark, trackingNo, expressCompany,
                    customerName, customerPhone, shippingAddress, finalOutstockType,
                    effectiveAreaId, effectiveAreaName, overrideSalesPrice, priceAdjustmentReason, platformCode,
                    comboId, comboCode, comboName, overrideTotalAmount);
            totalItems++;
            totalQty += quantity;
        }
        String productionOrderNo = trimToNull(params.get("productionOrderNo"));
        // 兜底：若未显式传 productionOrderNo，使用 orderNo（出库时的生产单号）
        // 之前缺失时静默跳过无日志，导致 EC 订单状态长期不更新且难以排查
        if (!StringUtils.hasText(productionOrderNo)) {
            productionOrderNo = requestOrderNo;
        }
        if (StringUtils.hasText(productionOrderNo)) {
            try {
                ecommerceOrderOrchestrator.onWarehouseOutbound(productionOrderNo,
                        trackingNo != null ? trackingNo : "", expressCompany != null ? expressCompany : "");
            } catch (Exception ex) {
                // P1-3 修复：EC回写失败由静默 warn 升级为 error 级别告警，便于排查订单状态不同步问题
                log.error("[EC回写失败] productionOrderNo={} trackingNo={} expressCompany={} err={}",
                        productionOrderNo, trackingNo, expressCompany, ex.getMessage(), ex);
            }
        } else if (StringUtils.hasText(requestOrderId)) {
            log.warn("[EC回写跳过] 缺少 productionOrderNo 与 orderNo，无法回写EC订单 orderId={} customer={}",
                    requestOrderId, customerName);
        }

        // P1-2 修复：成品出库补订单备注双写（铁律：所有仓库操作必须写入 ProductionOrder.remarks）
        appendOrderRemarkForOutbound(requestOrderId, requestOrderNo, customerName, totalItems, totalQty,
                finalOutstockType, trackingNo, expressCompany);

        log.info("[FinishedOutbound] 成品批量出库: operator={}, orderId={}, orderNo={}, customer={}, items={}, totalQty={}, type={}",
                UserContext.username(), requestOrderId, requestOrderNo, customerName, totalItems, totalQty, finalOutstockType);
    }

    /**
     * P1-2 修复：成品出库写入订单备注，确保出库操作可追溯
     */
    private void appendOrderRemarkForOutbound(String orderId, String orderNo, String customerName,
                                              int totalItems, int totalQty, String outstockType,
                                              String trackingNo, String expressCompany) {
        try {
            ProductionOrder order = null;
            if (StringUtils.hasText(orderId)) {
                order = productionOrderService.getById(orderId);
            }
            if (order == null && StringUtils.hasText(orderNo)) {
                Long tenantId = UserContext.tenantId();
                order = productionOrderService.lambdaQuery()
                        .eq(ProductionOrder::getOrderNo, orderNo)
                        .eq(tenantId != null, ProductionOrder::getTenantId, tenantId)
                        .one();
            }
            if (order == null) {
                return;
            }
            StringBuilder detail = new StringBuilder();
            detail.append("客户:").append(customerName != null ? customerName : "-");
            detail.append("|类型:").append(outstockType);
            detail.append("|SKU数:").append(totalItems);
            detail.append("|总数量:").append(totalQty);
            if (StringUtils.hasText(trackingNo)) {
                detail.append("|快递单号:").append(trackingNo);
            }
            if (StringUtils.hasText(expressCompany)) {
                detail.append("|快递公司:").append(expressCompany);
            }
            orderRemarkHelper.append(order, "成品出库", detail.toString());
        } catch (Exception e) {
            log.warn("成品出库写入订单备注失败（不阻塞主流程）: orderId={}, orderNo={}, error={}",
                    orderId, orderNo, e.getMessage());
        }
    }

    // D-001 修复：移除 Helper 层 @Transactional（调用方 FinishedInventoryOrchestrator.qrcodeOutbound 已有事务保护）
    public void qrcodeOutbound(Map<String, Object> params) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) params.get("items");
        if (items == null || items.isEmpty()) {
            throw new IllegalArgumentException("出库明细不能为空");
        }
        Map<String, Integer> skuQtyMap = new java.util.LinkedHashMap<>();
        for (Map<String, Object> item : items) {
            String qrCode = (String) item.get("qrCode");
            if (!StringUtils.hasText(qrCode)) {
                throw new IllegalArgumentException("二维码内容不能为空");
            }
            int quantity = Integer.parseInt(item.getOrDefault("quantity", "1").toString());
            if (quantity <= 0) {
                throw new IllegalArgumentException("出库数量必须大于0: " + qrCode);
            }
            String[] parts = qrCode.split("-");
            String skuCode = parts.length > 3
                    ? String.join("-", java.util.Arrays.copyOf(parts, parts.length - 1))
                    : qrCode;
            skuQtyMap.merge(skuCode, quantity, Integer::sum);
        }
        List<Map<String, Object>> stdItems = new java.util.ArrayList<>();
        int totalQty = 0;
        for (Map.Entry<String, Integer> e : skuQtyMap.entrySet()) {
            Map<String, Object> m = new java.util.HashMap<>();
            m.put("sku", e.getKey());
            m.put("quantity", e.getValue());
            stdItems.add(m);
            totalQty += e.getValue();
        }
        log.info("[QRCodeOutbound] 二维码成品出库: operator={}, items={}, skus={}, totalQty={}",
                UserContext.username(), items.size(), stdItems.size(), totalQty);
        Map<String, Object> outboundParams = new java.util.HashMap<>(params);
        outboundParams.put("items", stdItems);
        outbound(outboundParams);
    }

    /**
     * D-529：组合套装出库。
     * 销售的是"组合SKU"（套装），但库存实际扣在组成它的子SKU上：
     * 每个子SKU展开成 quantity(单套数量)×套数，逐个原子扣减（复用 outbound 的防超卖），
     * 每个子SKU一行出库记录、共用一张出库单号，行上挂 combo_id/combo_code/combo_name 溯源。
     * 套装价按子SKU售价权重分摊到各行（最大余数法，精确到分，各行合计=套装价×套数）；
     * 未设套装价或子SKU均无售价时，按子SKU原售价出库。
     *
     * @param params comboId、quantity(套数，默认1)、customerName/Phone/Address、outstockType(默认shipment)、remark 等
     * @return outstockNo + 套数 + 明细
     */
    public Map<String, Object> comboOutbound(Map<String, Object> params) {
        Long tenantId = UserContext.tenantId();
        Long comboId = parseLongOrNull(params.get("comboId"));
        if (comboId == null) {
            throw new IllegalArgumentException("缺少组合商品ID");
        }
        ComboProduct combo = comboProductService.getById(comboId);
        if (combo == null || !tenantId.equals(combo.getTenantId())) {
            throw new IllegalArgumentException("组合商品不存在或无权访问");
        }
        if (!"ENABLED".equals(combo.getStatus())) {
            throw new IllegalArgumentException("组合商品已停用: " + combo.getComboName());
        }
        int sets = parseIntOr(params.get("quantity"), 1);
        if (sets <= 0) {
            throw new IllegalArgumentException("出库套数必须大于0");
        }
        List<ComboProductItem> comboItems = comboProductItemService.lambdaQuery()
                .eq(ComboProductItem::getComboId, comboId)
                .orderByAsc(ComboProductItem::getSort)
                .list();
        if (comboItems.isEmpty()) {
            throw new IllegalArgumentException("组合商品未配置子商品，无法出库: " + combo.getComboName());
        }

        // 展开成子SKU行：quantity = 单套数量 × 套数
        List<Map<String, Object>> stdItems = new ArrayList<>();
        for (ComboProductItem ci : comboItems) {
            Map<String, Object> m = new HashMap<>();
            m.put("sku", ci.getSkuCode());
            int perSet = ci.getQuantity() != null && ci.getQuantity() > 0 ? ci.getQuantity() : 1;
            m.put("quantity", perSet * sets);
            stdItems.add(m);
        }

        // 套装价分摊：权重 = 子SKU售价 × 单套数量；最大余数法保证各行总额合计 = 套装价 × 套数
        BigDecimal comboPrice = params.get("salesPrice") != null ? toBigDecimalOrNull(params.get("salesPrice")) : combo.getSalePrice();
        if (comboPrice != null && comboPrice.compareTo(BigDecimal.ZERO) > 0) {
            allocateComboPrice(stdItems, comboItems, comboPrice, sets);
        }

        params.put("items", stdItems);
        params.put("comboId", combo.getId());
        params.put("comboCode", combo.getComboCode());
        params.put("comboName", combo.getComboName());
        if (trimToNull(params.get("outstockType")) == null && trimToNull(params.get("outboundType")) == null) {
            params.put("outstockType", "shipment");
        }
        outbound(params);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("outstockNo", params.get("outstockNo"));
        result.put("comboId", combo.getId());
        result.put("comboCode", combo.getComboCode());
        result.put("comboName", combo.getComboName());
        result.put("sets", sets);
        result.put("lines", stdItems.size());
        result.put("totalQty", stdItems.stream()
                .mapToInt(m -> parseIntOr(m.get("quantity"), 0))
                .sum());
        log.info("[组合套装出库] operator={}, combo={}({}), 套数={}, 子SKU行数={}",
                UserContext.username(), combo.getComboName(), combo.getComboCode(), sets, stdItems.size());
        return result;
    }

    /**
     * 套装价分摊（最大余数法，单位：分）。
     * 行总额按 权重(子SKU售价×单套数量) 占比切分套装价×套数，舍入余额给小数部分最大的行；
     * 行单价 = 行总额/行数量（2位小数，仅展示），行总额随 items["totalAmount"] 透传精确落库。
     */
    private void allocateComboPrice(List<Map<String, Object>> stdItems,
                                    List<ComboProductItem> comboItems,
                                    BigDecimal comboPrice,
                                    int sets) {
        int n = comboItems.size();
        long[] weights = new long[n];
        long weightSum = 0;
        for (int i = 0; i < n; i++) {
            BigDecimal price = loadSkuSalePrice(comboItems.get(i).getSkuCode());
            long qty = stdItems.get(i) != null ? parseIntOr(stdItems.get(i).get("quantity"), 0) : 0;
            long w = price != null ? price.movePointRight(2).longValue() * qty : 0L;
            weights[i] = w;
            weightSum += w;
        }
        if (weightSum <= 0) {
            return; // 子SKU均无售价——不诱导分摊，按子SKU原价（可能为空）出库
        }
        long totalCents = comboPrice.movePointRight(2).multiply(BigDecimal.valueOf(sets)).longValue();
        long[] rowCents = new long[n];
        java.util.NavigableMap<Long, Integer> remainderOrder = new java.util.TreeMap<>();
        for (int i = 0; i < n; i++) {
            long exact = BigDecimal.valueOf(totalCents).multiply(BigDecimal.valueOf(weights[i]))
                    .divide(BigDecimal.valueOf(weightSum), 0, java.math.RoundingMode.FLOOR)
                    .longValue();
            rowCents[i] = exact;
            long remainder = totalCents * weights[i] - exact * weightSum;
            remainderOrder.put(remainder * 1000L + (n - i), i); // 同余数按行序稳定
        }
        long distributed = 0;
        for (long c : rowCents) distributed += c;
        long leftover = totalCents - distributed;
        // 从余数最大的行开始补 1 分
        for (int done = 0; done < leftover && !remainderOrder.isEmpty(); done++) {
            Map.Entry<Long, Integer> e = remainderOrder.pollLastEntry();
            rowCents[e.getValue()] += 1;
        }
        for (int i = 0; i < n; i++) {
            BigDecimal rowTotal = BigDecimal.valueOf(rowCents[i]).movePointLeft(2);
            int rowQty = parseIntOr(stdItems.get(i).get("quantity"), 1);
            stdItems.get(i).put("totalAmount", rowTotal);
            stdItems.get(i).put("salesPrice", rowTotal.divide(BigDecimal.valueOf(rowQty), 2, java.math.RoundingMode.HALF_UP));
            stdItems.get(i).put("priceAdjustmentReason", "组合套装售价分摊(" + comboPrice + "×" + sets + "套)");
        }
    }

    /** 子SKU售价缓存（分摊权重用，避免逐个回查） */
    private BigDecimal loadSkuSalePrice(String skuCode) {
        ProductSku sku = productSkuService.lambdaQuery()
                .eq(ProductSku::getSkuCode, skuCode)
                .eq(ProductSku::getTenantId, UserContext.tenantId())
                .one();
        return sku != null ? sku.getSalesPrice() : null;
    }

    private void recordProductOutstock(String outstockNo,
                                       ProductSku sku,
                                       int quantity,
                                       String orderId,
                                       String orderNo,
                                       String warehouse,
                                       String remark,
                                       String trackingNo,
                                       String expressCompany,
                                       String customerName,
                                       String customerPhone,
                                       String shippingAddress,
                                       String outstockType,
                                       String warehouseAreaId,
                                       String warehouseAreaName,
                                       BigDecimal overrideSalesPrice,
                                       String priceAdjustmentReason,
                                       String platformCode,
                                       Long comboId,
                                       String comboCode,
                                       String comboName,
                                       BigDecimal overrideTotalAmount) {
        ProductOutstock outstock = new ProductOutstock();
        LocalDateTime now = LocalDateTime.now();
        StyleInfo styleInfo = sku.getStyleId() == null ? null : styleInfoService.getById(sku.getStyleId());
        outstock.setOutstockNo(outstockNo);
        outstock.setOrderId(orderId);
        outstock.setOrderNo(StringUtils.hasText(orderNo)
                ? orderNo
                : styleInfo != null && StringUtils.hasText(styleInfo.getOrderNo()) ? styleInfo.getOrderNo() : null);
        outstock.setStyleId(sku.getStyleId() == null ? null : String.valueOf(sku.getStyleId()));
        outstock.setStyleNo(StringUtils.hasText(sku.getStyleNo())
                ? sku.getStyleNo()
                : styleInfo != null ? styleInfo.getStyleNo() : null);
        outstock.setStyleName(styleInfo != null ? styleInfo.getStyleName() : null);
        outstock.setOutstockQuantity(quantity);
        outstock.setOutstockType(outstockType);
        outstock.setWarehouse(warehouse);
        outstock.setWarehouseAreaId(warehouseAreaId);
        outstock.setWarehouseAreaName(warehouseAreaName);
        outstock.setRemark(remark);
        outstock.setSkuCode(sku.getSkuCode());
        outstock.setColor(sku.getColor());
        outstock.setSize(sku.getSize());
        outstock.setCostPrice(sku.getCostPrice());

        // 价格逻辑：支持改价（D-529：组合套装分摊单价时子SKU可能无原价，改价直接生效）
        BigDecimal effectiveSalesPrice = sku.getSalesPrice();
        if (overrideSalesPrice != null) {
            if (sku.getSalesPrice() != null) {
                BigDecimal originalPrice = sku.getSalesPrice();
                if (overrideSalesPrice.compareTo(originalPrice) != 0) {
                    // 价格有变化，记录原始价格
                    outstock.setOriginalSalesPrice(originalPrice);
                    if (priceAdjustmentReason == null || priceAdjustmentReason.isBlank()) {
                        // 价格偏差超过10%必须填原因
                        BigDecimal diff = overrideSalesPrice.subtract(originalPrice).abs();
                        if (diff.compareTo(originalPrice.multiply(BigDecimal.valueOf(0.1))) > 0) {
                            throw new IllegalArgumentException("价格调整超过10%，必须填写价格调整原因");
                        }
                    }
                    outstock.setPriceAdjustmentReason(priceAdjustmentReason);
                    log.info("[出库改价] sku={} 原价={} 改价={} 原因={}", sku.getSkuCode(), originalPrice, overrideSalesPrice, priceAdjustmentReason);
                }
            } else if (StringUtils.hasText(priceAdjustmentReason)) {
                outstock.setPriceAdjustmentReason(priceAdjustmentReason);
            }
            effectiveSalesPrice = overrideSalesPrice;
        }
        outstock.setSalesPrice(effectiveSalesPrice);

        // D-529：组合套装溯源三列——销售记录关联组合SKU，实际按子SKU出库
        outstock.setComboId(comboId);
        outstock.setComboCode(comboCode);
        outstock.setComboName(comboName);

        outstock.setTrackingNo(trackingNo);
        outstock.setExpressCompany(expressCompany);
        outstock.setPlatformCode(platformCode);
        outstock.setCustomerName(customerName);
        outstock.setCustomerPhone(customerPhone);
        outstock.setShippingAddress(shippingAddress);
        if (overrideTotalAmount != null) {
            // 组合套装分摊：行总额精确到分（各行合计=套装价×套数）
            outstock.setTotalAmount(overrideTotalAmount);
        } else if (effectiveSalesPrice != null) {
            outstock.setTotalAmount(effectiveSalesPrice.multiply(BigDecimal.valueOf(quantity)));
        }
        outstock.setPaidAmount(BigDecimal.ZERO);
        outstock.setPaymentStatus("unpaid");
        outstock.setApprovalStatus("pending");
        String ctxUserId = UserContext.userId();
        String ctxUsername = UserContext.username();
        outstock.setOperatorId(ctxUserId);
        outstock.setOperatorName(ctxUsername);
        outstock.setCreatorId(ctxUserId);
        outstock.setCreatorName(ctxUsername);
        outstock.setCreateTime(now);
        outstock.setUpdateTime(now);
        outstock.setDeleteFlag(0);
        productOutstockService.save(outstock);

        // 仓库 → 电商 联动：出库流水落库后重算电商可售库存，联动面板才能实时看到变化
        // 事务提交后触发（无事务则立即），避免下游读到未提交的出库记录
        Long changeTenantId = sku.getTenantId() != null ? sku.getTenantId() : UserContext.tenantId();
        stockChangePublisher.publishAfterCommit(changeTenantId, sku.getSkuCode(), "OUTBOUND");
    }

    public IPage<ProductOutstock> listOutstockRecords(Map<String, Object> params) {
        int page = Integer.parseInt(params.getOrDefault("page", "1").toString());
        int pageSize = Integer.parseInt(params.getOrDefault("pageSize", "20").toString());
        Long tenantId = UserContext.tenantId();
        TenantAssert.assertTenantContext();

        LambdaQueryWrapper<ProductOutstock> wrapper = new LambdaQueryWrapper<ProductOutstock>()
                .eq(ProductOutstock::getTenantId, tenantId)
                .eq(ProductOutstock::getDeleteFlag, 0);

        String keyword = trimToNull(params.get("keyword"));
        if (keyword != null) {
            wrapper.and(w -> w.like(ProductOutstock::getOutstockNo, keyword)
                    .or().like(ProductOutstock::getOrderNo, keyword)
                    .or().like(ProductOutstock::getStyleNo, keyword)
                    .or().like(ProductOutstock::getSkuCode, keyword)
                    .or().like(ProductOutstock::getTrackingNo, keyword));
        }

        // D-360k：质检直发——不落成品库存直接发客户，跳过库存扣减但仍写销售出库记录
        boolean directShip = params.get("directShip") != null
                && Boolean.parseBoolean(String.valueOf(params.get("directShip")));
        String outstockType = trimToNull(params.get("outstockType"));
        if (outstockType != null) {
            wrapper.eq(ProductOutstock::getOutstockType, outstockType);
        }

        String paymentStatus = trimToNull(params.get("paymentStatus"));
        if (paymentStatus != null) {
            wrapper.eq(ProductOutstock::getPaymentStatus, paymentStatus);
        }

        String approvalStatus = trimToNull(params.get("approvalStatus"));
        if (approvalStatus != null) {
            wrapper.eq(ProductOutstock::getApprovalStatus, approvalStatus);
        }

        String customerName = trimToNull(params.get("customerName"));
        if (customerName != null) {
            wrapper.like(ProductOutstock::getCustomerName, customerName);
        }

        wrapper.orderByDesc(ProductOutstock::getCreateTime);
        return productOutstockService.page(new Page<>(page, pageSize), wrapper);
    }

    // D-001 修复：移除 Helper 层 @Transactional（调用方 FinishedInventoryOrchestrator.confirmPayment 已有事务保护）
    public void confirmPayment(String id, BigDecimal paidAmount) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("出库记录ID不能为空");
        }
        if (paidAmount == null || paidAmount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("收款金额必须大于0");
        }
        ProductOutstock outstock = productOutstockService.getById(id);
        if (outstock == null) {
            throw new IllegalArgumentException("出库记录不存在");
        }
        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(outstock.getTenantId())) {
            throw new SecurityException("无权操作该出库记录");
        }

        productOutstockService.atomicAddPaidAmount(outstock.getId(), paidAmount, tenantId);
        ProductOutstock refreshed = productOutstockService.getById(outstock.getId());
        syncOutstockBillAfterPayment(refreshed);
    }

    private void syncOutstockBillAfterPayment(ProductOutstock outstock) {
        if (outstock == null || !StringUtils.hasText(outstock.getId())) {
            return;
        }
        Long tenantId = UserContext.tenantId();
        BillAggregation bill = billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, "PRODUCT_OUTSTOCK")
                .eq(BillAggregation::getSourceId, outstock.getId())
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        // D-135：客户收款统一进应收账本——出库单自身无账单时，依次兜底：
        // ① 同订单的出货对账单应收（销售对账口径）；② 都没有（未走审批的出库）则现建一张应收，
        // 保证每一笔收款都落在账本上，不再出现"账外收款孤岛"。
        if (bill == null) {
            bill = findShipmentReceivableBill(outstock, tenantId);
        }
        if (bill == null) {
            bill = ensureOutstockReceivableBill(outstock);
        }
        if (bill == null) {
            return;
        }

        BigDecimal paid = outstock.getPaidAmount() != null ? outstock.getPaidAmount() : BigDecimal.ZERO;
        if (bill.getAmount() != null && paid.compareTo(bill.getAmount()) > 0) {
            paid = bill.getAmount();
        }
        bill.setSettledAmount(paid);
        if (bill.getAmount() != null && paid.compareTo(bill.getAmount()) >= 0) {
            bill.setStatus("SETTLED");
            bill.setSettledAt(LocalDateTime.now());
            bill.setSettledById(UserContext.userId());
            bill.setSettledByName(UserContext.username());
        } else if (paid.compareTo(BigDecimal.ZERO) > 0) {
            bill.setStatus("SETTLING");
        }
        billAggregationService.updateById(bill);
    }

    /** D-135：按订单号找销售出货对账单生成的应收账单（未取消的最近一张）。 */
    private BillAggregation findShipmentReceivableBill(ProductOutstock outstock, Long tenantId) {
        if (!StringUtils.hasText(outstock.getOrderNo())) {
            return null;
        }
        return billAggregationService.lambdaQuery()
                .eq(BillAggregation::getSourceType, "SHIPMENT_RECONCILIATION")
                .eq(BillAggregation::getBillType, "RECEIVABLE")
                .eq(BillAggregation::getOrderNo, outstock.getOrderNo())
                .eq(BillAggregation::getTenantId, tenantId)
                .eq(BillAggregation::getDeleteFlag, 0)
                .ne(BillAggregation::getStatus, "CANCELLED")
                .orderByDesc(BillAggregation::getCreateTime)
                .last("LIMIT 1")
                .one();
    }

    /** D-135：为无账单的出库补建应收账单（幂等，pushBill 按 sourceType+sourceId 去重）。 */
    private BillAggregation ensureOutstockReceivableBill(ProductOutstock outstock) {
        try {
            BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
            req.setBillType("RECEIVABLE");
            req.setBillCategory("PRODUCT");
            req.setSourceType("PRODUCT_OUTSTOCK");
            req.setSourceId(outstock.getId());
            req.setSourceNo(outstock.getOutstockNo());
            req.setCounterpartyType("CUSTOMER");
            req.setCounterpartyName(outstock.getCustomerName());
            req.setOrderNo(outstock.getOrderNo());
            req.setStyleNo(outstock.getStyleNo());
            req.setAmount(outstock.getTotalAmount());
            req.setRemark("D-135 客户收款补建应收: " + outstock.getOutstockNo());
            return billAggregationOrchestrator.pushBill(req);
        } catch (Exception e) {
            log.warn("[D-135] 收款补建应收账单失败(不影响收款本身): outstockNo={}, err={}",
                    outstock.getOutstockNo(), e.getMessage());
            return null;
        }
    }
    /**
     * D-360n：调拨出库回入库——调入方确认收货：增加SKU库存 + 标记出库记录已回入
     */
    @org.springframework.transaction.annotation.Transactional(rollbackFor = Exception.class)
    public Map<String, Object> transferInbound(java.util.Map<String, Object> params) {
        String outstockId = params.get("outstockId") == null ? "" : String.valueOf(params.get("outstockId")).trim();
        String warehouseLocation = params.get("warehouseLocation") == null ? null : String.valueOf(params.get("warehouseLocation")).trim();
        String warehouseAreaId = params.get("warehouseAreaId") == null ? null : String.valueOf(params.get("warehouseAreaId")).trim();
        if (!StringUtils.hasText(outstockId)) throw new IllegalArgumentException("出库记录ID不能为空");
        Long tenantId = UserContext.tenantId();
        ProductOutstock outstock = productOutstockService.getById(outstockId.trim());
        if (outstock == null || (outstock.getDeleteFlag() != null && outstock.getDeleteFlag() != 0)) {
            throw new java.util.NoSuchElementException("出库记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(outstock.getTenantId(), "出库记录");
        if (!"transfer_out".equals(outstock.getOutstockType())) {
            throw new IllegalArgumentException("仅调拨出库支持回入库");
        }
        if ("INBOUND".equals(outstock.getTransferInboundStatus())) {
            throw new IllegalStateException("该出库记录已回入，请勿重复操作");
        }
        String skuCode = outstock.getSkuCode();
        int qty = outstock.getOutstockQuantity() != null ? outstock.getOutstockQuantity() : 0;
        if (qty <= 0 || !StringUtils.hasText(skuCode)) {
            throw new IllegalArgumentException("出库记录缺少商品编码或数量");
        }
        // D-363f：回填键给操作日志AOP——targetId 落到出库单号（与出库行一致，行级日志按单号可查），
        // 详情带上 sku/数量/款号（方法执行前解析拿不到这些）
        params.put("outstockNo", outstock.getOutstockNo());
        params.put("skuCode", skuCode);
        params.put("quantity", qty);
        if (StringUtils.hasText(outstock.getStyleNo())) params.put("styleNo", outstock.getStyleNo());
        // 调入方确认收货：增加库存
        productSkuService.updateStock(skuCode, qty);

        // D-363e：回入库写入库记录留痕——否则对账公式（入库=库存+出库+次品）永远闭合不了，
        // 且"这批货是什么时候回来入库的"在页面上无迹可查
        try {
            ProductWarehousing wh = new ProductWarehousing();
            wh.setId(java.util.UUID.randomUUID().toString().replace("-", ""));
            // 单号带出库单号，回库来源可直接追溯（t_product_warehousing 无 remark 列）
            wh.setWarehousingNo("TR" + outstock.getOutstockNo());
            wh.setWarehousingQuantity(qty);
            wh.setQualifiedQuantity(qty);
            wh.setWarehousingType("transfer_inbound");
            wh.setWarehouse(warehouseLocation != null && !warehouseLocation.isBlank()
                    ? warehouseLocation : (outstock.getWarehouse() != null ? outstock.getWarehouse() : "默认仓"));
            wh.setWarehouseAreaId(warehouseAreaId);
            wh.setStyleId(outstock.getStyleId());
            wh.setStyleNo(outstock.getStyleNo() != null ? outstock.getStyleNo() : "");
            wh.setStyleName(outstock.getStyleName());
            wh.setOrderNo(outstock.getOrderNo());
            wh.setSkuCode(skuCode);
            wh.setColor(outstock.getColor());
            wh.setSize(outstock.getSize());
            wh.setWarehousingStartTime(LocalDateTime.now());
            wh.setWarehousingEndTime(LocalDateTime.now());
            wh.setWarehousingOperatorId(UserContext.userId());
            wh.setWarehousingOperatorName(UserContext.username());
            wh.setStatus("completed");
            wh.setCreateTime(LocalDateTime.now());
            wh.setUpdateTime(LocalDateTime.now());
            productWarehousingService.save(wh);
        } catch (Exception e) {
            log.warn("[TransferInbound] 写入库记录失败（不阻塞回入库主流程）: outstockId={}, err={}", outstockId, e.getMessage());
        }

        ProductOutstock upd = new ProductOutstock();
        upd.setId(outstock.getId());
        upd.setTransferInboundStatus("INBOUND");
        upd.setWarehouse(warehouseLocation != null ? warehouseLocation : outstock.getWarehouse());
        upd.setWarehouseAreaId(warehouseAreaId);
        productOutstockService.updateById(upd);
        log.info("[TransferInbound] 调拨回入库成功 outstockId={} skuCode={} qty={}", outstockId, skuCode, qty);

        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("success", true);
        result.put("skuCode", skuCode);
        result.put("quantity", qty);
        result.put("message", "回入库成功，库存已增加");
        return result;
    }


    // D-001 修复：移除 Helper 层 @Transactional（调用方 FinishedInventoryOrchestrator.approveOutstock 已有事务保护）
    public Map<String, Object> approveOutstock(String id, String remark) {
        ProductOutstock outstock = productOutstockService.getById(id);
        if (outstock == null) {
            throw new IllegalArgumentException("出库记录不存在");
        }
        Long tenantId = UserContext.tenantId();
        if (!tenantId.equals(outstock.getTenantId())) {
            throw new SecurityException("无权审批该出库记录");
        }
        if ("approved".equals(outstock.getApprovalStatus())) {
            throw new IllegalArgumentException("该记录已审批，不可重复操作");
        }
        // D-363g：已回入库的调拨出库不可审核——货已回仓，这张单不再产生任何结算账单
        if ("transfer_out".equals(outstock.getOutstockType())
                && "INBOUND".equals(outstock.getTransferInboundStatus())) {
            throw new IllegalArgumentException("该调拨出库已回入库（货已回仓），无需审核，不会推送结算账单");
        }
        outstock.setApprovalStatus("approved");
        outstock.setApproveBy(UserContext.userId());
        outstock.setApproveByName(UserContext.username());
        outstock.setApproveTime(LocalDateTime.now());
        outstock.setUpdateTime(LocalDateTime.now());
        if (StringUtils.hasText(remark)) {
            outstock.setRemark(outstock.getRemark() != null ? outstock.getRemark() + " | 审批: " + remark : "审批: " + remark);
        }
        productOutstockService.updateById(outstock);
        // D-363g：调拨出库是内部流向（无客户无金额），审核只改状态，不推应收账单
        if (!"transfer_out".equals(outstock.getOutstockType())) {
            pushOutstockBill(outstock);
        }
        log.info("[成品出库审批] outstockNo={} type={}", outstock.getOutstockNo(), outstock.getOutstockType());
        return Map.of("id", id, "status", "approved");
    }

    // D-001 修复：移除 Helper 层 @Transactional（调用方 FinishedInventoryOrchestrator.batchApproveOutstocks 已有事务保护）
    public List<Map<String, Object>> batchApproveOutstocks(List<String> ids, String remark) {
        List<Map<String, Object>> results = new java.util.ArrayList<>();
        for (String id : ids) {
            try {
                Map<String, Object> r = approveOutstock(id, remark);
                r = new java.util.HashMap<>(r);
                r.put("success", true);
                results.add(r);
            } catch (Exception e) {
                results.add(Map.of("id", id, "success", false, "message", e.getMessage()));
            }
        }
        return results;
    }

    private void pushOutstockBill(ProductOutstock outstock) {
        try {
            if (outstock.getOrderId() != null) {
                boolean hasShipmentBill = billAggregationOrchestrator.billExists("SHIPMENT_RECONCILIATION", outstock.getOrderId());
                if (hasShipmentBill) {
                    log.info("[出库账单推送跳过] 订单{}已有成品对账账单，避免重复应收: outstockNo={}",
                            outstock.getOrderId(), outstock.getOutstockNo());
                    return;
                }
            }
            BillAggregationOrchestrator.BillPushRequest req = new BillAggregationOrchestrator.BillPushRequest();
            req.setBillType("RECEIVABLE");
            req.setBillCategory("PRODUCT");
            req.setSourceType("PRODUCT_OUTSTOCK");
            req.setSourceId(outstock.getId());
            req.setSourceNo(outstock.getOutstockNo());
            req.setCounterpartyType("CUSTOMER");
            req.setCounterpartyName(outstock.getCustomerName());
            req.setOrderNo(outstock.getOrderNo());
            req.setStyleNo(outstock.getStyleNo());
            req.setAmount(outstock.getTotalAmount());
            req.setRemark("成品出库审批通过: " + outstock.getOutstockNo());
            billAggregationOrchestrator.pushBill(req);
        } catch (Exception e) {
            log.error("[出库账单推送失败] outstockNo={} err={}", outstock.getOutstockNo(), e.getMessage());
        }
    }

    private String trimToNull(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return StringUtils.hasText(text) ? text : null;
    }

    private Long parseLongOrNull(Object value) {
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private BigDecimal toBigDecimalOrNull(Object value) {
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            return null;
        }
        try {
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private int parseIntOr(Object value, int defaultValue) {
        if (value == null) {
            return defaultValue;
        }
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    private String resolveWarehouseAreaName(String areaId) {
        if (!StringUtils.hasText(areaId)) return null;
        try {
            WarehouseArea area = warehouseAreaService.getById(areaId);
            return area != null ? area.getAreaName() : null;
        } catch (Exception e) {
            return null;
        }
    }

    private String[] resolveWarehouseFromLatestInbound(String skuCode, Long tenantId) {
        try {
            ProductWarehousing latest = productWarehousingService.lambdaQuery()
                    .eq(ProductWarehousing::getSkuCode, skuCode)
                    .eq(ProductWarehousing::getTenantId, tenantId)
                    .eq(ProductWarehousing::getDeleteFlag, 0)
                    .orderByDesc(ProductWarehousing::getWarehousingEndTime)
                    .last("LIMIT 1")
                    .one();
            if (latest != null) {
                return new String[]{latest.getWarehouse(), latest.getWarehouseAreaId(), latest.getWarehouseAreaName()};
            }
        } catch (Exception e) {
            log.warn("[出库] 从入库记录解析仓库位置失败: skuCode={}", skuCode, e);
        }
        return null;
    }

    private String buildOutstockNo(LocalDateTime now) {
        return "FI" + now.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"))
                + Integer.toHexString(ThreadLocalRandom.current().nextInt(0x1000, 0x10000)).toUpperCase(Locale.ROOT);
    }
}
