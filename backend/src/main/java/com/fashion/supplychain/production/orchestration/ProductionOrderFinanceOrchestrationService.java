package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import com.fashion.supplychain.common.ParamUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.integration.openapi.service.WebhookPushService;
import com.fashion.supplychain.production.entity.CuttingBundle;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.intelligence.mapper.IntelligencePredictionLogMapper;
import com.fashion.supplychain.production.helper.OrderReconciliationHelper;
import com.fashion.supplychain.production.mapper.CuttingBundleMapper;
import com.fashion.supplychain.production.service.ProductOutstockService;
import com.fashion.supplychain.production.service.ProductWarehousingService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleQuotationService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.concurrent.ThreadLocalRandom;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
@Slf4j
public class ProductionOrderFinanceOrchestrationService {

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private CuttingBundleMapper cuttingBundleMapper;

    @Autowired
    private ProductWarehousingService productWarehousingService;

    @Autowired
    private ProductOutstockService productOutstockService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleQuotationService styleQuotationService;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private OrderReconciliationHelper orderReconciliationHelper;

    @Autowired(required = false)
    private WebhookPushService webhookPushService;

    /** 智能预测回填（可选注入，模块未启用时不影响关单流程） */
    @Autowired(required = false)
    private IntelligencePredictionLogMapper intelligencePredictionLogMapper;

    @Transactional(rollbackFor = Exception.class)
    public boolean completeProduction(String id, BigDecimal tolerancePercent) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equals(st)) {
            return true;
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            throw new IllegalStateException("订单数量异常，无法结单");
        }

        BigDecimal tp = tolerancePercent;
        if (tp == null) {
            tp = new BigDecimal("0.10");
        }
        if (tp.compareTo(new BigDecimal("0.05")) < 0) {
            tp = new BigDecimal("0.05");
        }
        if (tp.compareTo(new BigDecimal("0.10")) > 0) {
            tp = new BigDecimal("0.10");
        }

        List<ProductWarehousing> list = productWarehousingService.list(new LambdaQueryWrapper<ProductWarehousing>()
                .eq(ProductWarehousing::getOrderId, oid)
                .eq(ProductWarehousing::getDeleteFlag, 0));
        if (list == null || list.isEmpty()) {
            throw new IllegalStateException("该订单暂无入库记录，无法结单");
        }

        long qualifiedSum = 0;
        for (ProductWarehousing w : list) {
            if (w == null) {
                continue;
            }
            int q = w.getQualifiedQuantity() == null ? 0 : w.getQualifiedQuantity();
            if (q > 0) {
                qualifiedSum += q;
            }
        }

        if (qualifiedSum <= 0) {
            throw new IllegalStateException("该订单合格入库数量为0，无法结单");
        }

        long packagingDone = 0;
        packagingDone = scanRecordDomainService.computePackagingDoneQuantity(oid);

        if (packagingDone < qualifiedSum) {
            throw new IllegalStateException("请先完成包装后再入库结单");
        }

        long diff = Math.abs(qualifiedSum - (long) orderQty);
        BigDecimal allowDiff = tp.multiply(BigDecimal.valueOf(orderQty)).setScale(0, RoundingMode.CEILING);
        if (BigDecimal.valueOf(diff).compareTo(allowDiff) > 0) {
            throw new IllegalStateException("入库数量与订单数量差异超出允许范围");
        }

        LocalDateTime now = LocalDateTime.now();
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getCompletedQuantity, (int) Math.min(Integer.MAX_VALUE, qualifiedSum))
                .set(ProductionOrder::getProductionProgress, 100)
                .set(ProductionOrder::getStatus, "completed")
                .set(ProductionOrder::getActualEndDate, now)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }

        // 异步推送订单状态变更给已对接客户
        if (webhookPushService != null && order.getOrderNo() != null) {
            try {
                webhookPushService.pushOrderStatusChange(
                    order.getOrderNo(), st, "completed",
                    Map.of("completedQuantity", qualifiedSum, "orderQuantity", orderQty)
                );
            } catch (Exception e) {
                log.warn("Webhook推送订单完成状态失败: orderNo={}", order.getOrderNo(), e);
            }
        }

        // 【智能学习】订单完成时回填预测记录，自动闭合数据飞轮
        if (intelligencePredictionLogMapper != null) {
            try {
                int backfilled = intelligencePredictionLogMapper.backfillByOrderId(oid, now);
                if (backfilled > 0) {
                    log.info("[智能回填] 订单 {} 完成（completeProduction），回填 {} 条预测记录", oid, backfilled);
                }
            } catch (Exception ex) {
                log.warn("[智能回填] 回填失败，不影响关单流程: orderId={}", oid, ex);
            }
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public ProductionOrder closeOrder(String id) {
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("无权限完成");
        }
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equals(st)) {
            ProductionOrder detail = productionOrderService.getDetailById(oid);
            if (detail == null) {
                throw new NoSuchElementException("订单不存在");
            }
            return detail;
        }

        int orderQty = order.getOrderQuantity() == null ? 0 : order.getOrderQuantity();
        if (orderQty <= 0) {
            throw new IllegalStateException("订单数量异常，无法完成");
        }

        int cuttingQty = 0;
        try {
            QueryWrapper<CuttingBundle> qw = new QueryWrapper<CuttingBundle>()
                    .select("COALESCE(SUM(quantity), 0) as totalQuantity")
                    .eq("production_order_id", oid);
            List<Map<String, Object>> rows = cuttingBundleMapper.selectMaps(qw);
            if (rows != null && !rows.isEmpty()) {
                Object v = ParamUtils.getIgnoreCase(rows.get(0), "totalQuantity");
                cuttingQty = ParamUtils.toIntSafe(v);
            }
        } catch (Exception e) {
            log.warn("Failed to aggregate cutting quantity when closing order: orderId={}", oid, e);
        }
        cuttingQty = Math.max(0, cuttingQty);

        int warehousingQualified = productWarehousingService.sumQualifiedByOrderId(oid);
        if (cuttingQty <= 0) {
            throw new IllegalStateException("裁剪数量不足，无法完成");
        }

        int minRequired = (int) Math.ceil(cuttingQty * 0.9);
        if (warehousingQualified < minRequired) {
            throw new IllegalStateException("成品合格入库数量不足，无法完成");
        }

        LocalDateTime now = LocalDateTime.now();
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getCompletedQuantity, warehousingQualified)
                .set(ProductionOrder::getProductionProgress, 100)
                .set(ProductionOrder::getStatus, "completed")
                .set(ProductionOrder::getActualEndDate, now)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("完成失败");
        }

        // 【关键】关单时自动创建订单结算（本厂+加工厂统一处理）
        try {
            orderReconciliationHelper.createShipmentReconciliationOnClose(order);
        } catch (Exception e) {
            log.error("创建订单结算失败: orderId={}", oid, e);
            // 不阻断关单流程，只记录错误
        }

        // 【智能学习】关单时回填预测记录，自动闭合数据飞轮
        if (intelligencePredictionLogMapper != null) {
            try {
                int backfilled = intelligencePredictionLogMapper.backfillByOrderId(oid, now);
                if (backfilled > 0) {
                    log.info("[智能回填] 订单 {} 关单（closeOrder），回填 {} 条预测记录", oid, backfilled);
                }
            } catch (Exception ex) {
                log.warn("[智能回填] 回填失败，不影响关单流程: orderId={}", oid, ex);
            }
        }

        ProductionOrder detail = productionOrderService.getDetailById(oid);
        if (detail == null) {
            throw new NoSuchElementException("订单不存在");
        }
        return detail;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean autoCloseOrderIfEligible(String id) {
        String oid = StringUtils.hasText(id) ? id.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("订单ID不能为空");
        }

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("订单不存在");
        }
        String st = order.getStatus() == null ? "" : order.getStatus().trim();
        if ("completed".equals(st)) {
            return true;
        }

        int cuttingQty = 0;
        try {
            QueryWrapper<CuttingBundle> qw = new QueryWrapper<CuttingBundle>()
                    .select("COALESCE(SUM(quantity), 0) as totalQuantity")
                    .eq("production_order_id", oid);
            List<Map<String, Object>> rows = cuttingBundleMapper.selectMaps(qw);
            if (rows != null && !rows.isEmpty()) {
                Object v = ParamUtils.getIgnoreCase(rows.get(0), "totalQuantity");
                cuttingQty = ParamUtils.toIntSafe(v);
            }
        } catch (Exception e) {
            log.warn("Failed to aggregate cutting quantity when auto closing order: orderId={}", oid, e);
        }
        cuttingQty = Math.max(0, cuttingQty);
        if (cuttingQty <= 0) {
            return false;
        }

        int warehousingQualified = productWarehousingService.sumQualifiedByOrderId(oid);
        int minRequired = (int) Math.ceil(cuttingQty * 0.9);
        if (warehousingQualified < minRequired) {
            return false;
        }

        LocalDateTime now = LocalDateTime.now();
        boolean ok = productionOrderService.lambdaUpdate()
                .eq(ProductionOrder::getId, oid)
                .set(ProductionOrder::getCompletedQuantity, warehousingQualified)
                .set(ProductionOrder::getProductionProgress, 100)
                .set(ProductionOrder::getStatus, "completed")
                .set(ProductionOrder::getActualEndDate, now)
                .set(ProductionOrder::getUpdateTime, now)
                .update();
        if (!ok) {
            throw new IllegalStateException("完成失败");
        }

        // 自动关单时创建对账单（与手动关单保持一致）
        try {
            ProductionOrder updatedOrder = productionOrderService.getById(oid);
            if (updatedOrder != null) {
                orderReconciliationHelper.createShipmentReconciliationOnClose(updatedOrder);
            }
        } catch (Exception e) {
            log.error("自动关单创建对账单失败: orderId={}", oid, e);
            // 不阻断关单流程
        }

        // 【智能学习】自动关单时同步回填预测记录，自动闭合数据飞轮
        if (intelligencePredictionLogMapper != null) {
            try {
                int backfilled = intelligencePredictionLogMapper.backfillByOrderId(oid, now);
                if (backfilled > 0) {
                    log.info("[智能回填] 订单 {} 自动关单，回填 {} 条预测记录", oid, backfilled);
                }
            } catch (Exception ex) {
                log.warn("[智能回填] 自动关单回填失败，不影响流程: orderId={}", oid, ex);
            }
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean ensureFinanceRecordsForOrder(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }
        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }
        int qty = productWarehousingService.sumQualifiedByOrderId(oid);
        if (qty > 0) {
            // 有合格入库记录时，确保出货对账单存在并更新利润
            try {
                ensureShipmentReconciliationForOrder(oid);
            } catch (Exception e) {
                log.warn("ensureFinanceRecordsForOrder: 确保出货对账单时异常 orderId={}", oid, e);
            }
            return true;
        }
        return false;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean ensureShipmentReconciliationForOrder(String orderId) {
        String oid = StringUtils.hasText(orderId) ? orderId.trim() : null;
        if (!StringUtils.hasText(oid)) {
            throw new IllegalArgumentException("参数错误");
        }

        ProductionOrder order = productionOrderService.getById(oid);
        if (order == null || order.getDeleteFlag() == null || order.getDeleteFlag() != 0) {
            throw new NoSuchElementException("生产订单不存在");
        }

        Map<String, Object> orderDetails = parseOrderDetails(order);
        String customerId = resolveCustomerId(orderDetails);
        String customerName = resolveCustomerName(orderDetails);

        int shippedQty = productOutstockService.sumOutstockByOrderId(oid);
        if (shippedQty <= 0) {
            try {
                ShipmentReconciliation existed = shipmentReconciliationService.lambdaQuery()
                        .select(ShipmentReconciliation::getId, ShipmentReconciliation::getStatus)
                        .eq(ShipmentReconciliation::getOrderId, oid)
                        .orderByDesc(ShipmentReconciliation::getCreateTime)
                        .last("limit 1")
                        .one();
                if (existed != null && StringUtils.hasText(existed.getId())) {
                    String st = existed.getStatus() == null ? "" : existed.getStatus().trim();
                    if (!StringUtils.hasText(st) || "pending".equalsIgnoreCase(st)) {
                        shipmentReconciliationService.removeById(existed.getId().trim());
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to cleanup pending shipment reconciliation when no outstock quantity: orderId={}",
                        oid,
                        e);
            }
            return false;
        }

        LocalDateTime now = LocalDateTime.now();
        String uid = null;
        try {
            UserContext ctx = UserContext.get();
            String tmpUid = ctx == null ? null : ctx.getUserId();
            if (tmpUid != null) {
                String normalizedUid = tmpUid.trim();
                if (!normalizedUid.isEmpty()) {
                    uid = normalizedUid;
                }
            }
        } catch (Exception ignored) {
            uid = null;
        }
        ShipmentReconciliation sr;
        try {
            sr = shipmentReconciliationService.lambdaQuery()
                    .eq(ShipmentReconciliation::getOrderId, oid)
                    .orderByDesc(ShipmentReconciliation::getCreateTime)
                    .last("limit 1")
                    .one();
        } catch (Exception e) {
            log.warn("Failed to query existing shipment reconciliation: orderId={}", oid, e);
            sr = null;
        }

        if (sr == null && StringUtils.hasText(order.getOrderNo())) {
            try {
                sr = shipmentReconciliationService.lambdaQuery()
                        .eq(ShipmentReconciliation::getOrderNo, order.getOrderNo().trim())
                        .orderByDesc(ShipmentReconciliation::getCreateTime)
                        .last("limit 1")
                        .one();
            } catch (Exception e) {
                log.warn("Failed to query existing shipment reconciliation by orderNo: orderId={}, orderNo={}",
                        oid,
                        order.getOrderNo(),
                        e);
                sr = null;
            }
        }

        if (sr == null) {
            sr = new ShipmentReconciliation();
            sr.setReconciliationNo(buildFinanceNo("SR", now));
            sr.setCustomerId(null);
            sr.setCustomerName("");
            sr.setStyleId(order.getStyleId());
            sr.setStyleNo(order.getStyleNo());
            sr.setStyleName(order.getStyleName());
            sr.setOrderId(order.getId());
            sr.setOrderNo(order.getOrderNo());
            sr.setStatus("pending");
            sr.setCreateTime(now);
            if (StringUtils.hasText(uid)) {
                sr.setCreateBy(uid);
                sr.setUpdateBy(uid);
            }
        } else {
            String st = sr.getStatus() == null ? "" : sr.getStatus().trim();
            if (StringUtils.hasText(st) && !"pending".equalsIgnoreCase(st)) {
                ShipmentReconciliation patch = new ShipmentReconciliation();
                patch.setId(sr.getId());
                boolean needPatch = false;

                if (!StringUtils.hasText(sr.getStyleId()) && StringUtils.hasText(order.getStyleId())) {
                    patch.setStyleId(order.getStyleId());
                    needPatch = true;
                }
                if (!StringUtils.hasText(sr.getStyleNo()) && StringUtils.hasText(order.getStyleNo())) {
                    patch.setStyleNo(order.getStyleNo());
                    needPatch = true;
                }
                if (!StringUtils.hasText(sr.getStyleName()) && StringUtils.hasText(order.getStyleName())) {
                    patch.setStyleName(order.getStyleName());
                    needPatch = true;
                }
                if (!StringUtils.hasText(sr.getOrderId()) && StringUtils.hasText(order.getId())) {
                    patch.setOrderId(order.getId());
                    needPatch = true;
                }
                if (!StringUtils.hasText(sr.getOrderNo()) && StringUtils.hasText(order.getOrderNo())) {
                    patch.setOrderNo(order.getOrderNo());
                    needPatch = true;
                }

                if (!StringUtils.hasText(sr.getCustomerId()) && StringUtils.hasText(customerId)) {
                    patch.setCustomerId(customerId);
                    needPatch = true;
                }
                if (!StringUtils.hasText(sr.getCustomerName()) && StringUtils.hasText(customerName)) {
                    patch.setCustomerName(customerName);
                    needPatch = true;
                }

                if (needPatch) {
                    patch.setUpdateTime(now);
                    if (StringUtils.hasText(uid)) {
                        patch.setUpdateBy(uid);
                        if (!StringUtils.hasText(sr.getCreateBy())) {
                            patch.setCreateBy(uid);
                        }
                    }
                    shipmentReconciliationService.updateById(patch);
                }
                return true;
            }
        }

        if (!StringUtils.hasText(sr.getStyleId())) {
            sr.setStyleId(order.getStyleId());
        }
        if (!StringUtils.hasText(sr.getStyleNo())) {
            sr.setStyleNo(order.getStyleNo());
        }
        if (!StringUtils.hasText(sr.getStyleName())) {
            sr.setStyleName(order.getStyleName());
        }
        if (!StringUtils.hasText(sr.getOrderId())) {
            sr.setOrderId(order.getId());
        }
        if (!StringUtils.hasText(sr.getOrderNo())) {
            sr.setOrderNo(order.getOrderNo());
        }

        if (StringUtils.hasText(customerId) && !StringUtils.hasText(sr.getCustomerId())) {
            sr.setCustomerId(customerId);
        }
        if (StringUtils.hasText(customerName) && !StringUtils.hasText(sr.getCustomerName())) {
            sr.setCustomerName(customerName);
        }

        // 尝试从款号资料中获取单价信息
        BigDecimal unitPrice = sr.getUnitPrice();
        if (unitPrice == null || unitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            try {
                // 正确处理款号 ID，可能是字符串格式
                if (StringUtils.hasText(order.getStyleId())) {
                    String sidRaw0 = order.getStyleId();
                    String sidRaw = StringUtils.hasText(sidRaw0) ? sidRaw0.trim() : null;
                    if (StringUtils.hasText(sidRaw) && isAllDigits(sidRaw)) {
                        Long styleId = Long.parseLong(sidRaw);
                        StyleQuotation quotation = styleQuotationService.getByStyleId(styleId);
                        if (quotation != null && quotation.getTotalPrice() != null
                                && quotation.getTotalPrice().compareTo(BigDecimal.ZERO) > 0) {
                            unitPrice = quotation.getTotalPrice();
                            sr.setUnitPrice(unitPrice);
                        }
                    } else if (StringUtils.hasText(order.getStyleNo())) {
                        StyleInfo styleInfo = styleInfoService.lambdaQuery()
                                .eq(StyleInfo::getStyleNo, order.getStyleNo().trim())
                                .one();
                        if (styleInfo != null) {
                            StyleQuotation quotation = styleQuotationService.getByStyleId(styleInfo.getId());
                            if (quotation != null && quotation.getTotalPrice() != null
                                    && quotation.getTotalPrice().compareTo(BigDecimal.ZERO) > 0) {
                                unitPrice = quotation.getTotalPrice();
                                sr.setUnitPrice(unitPrice);
                            }
                        }
                    }
                }
            } catch (Exception e) {
                log.warn("Failed to get unit price from style quotation: styleId={}, styleNo={}", order.getStyleId(),
                        order.getStyleNo(), e);
            }
        }

        sr.setQuantity(Math.max(0, shippedQty));

        // 优先使用从款号资料中获取的单价
        BigDecimal up = sr.getUnitPrice();
        if (up == null || up.compareTo(BigDecimal.ZERO) <= 0) {
            // 如果没有从款号资料中获取到单价，尝试从其他途径获取
            up = resolveLastUnitPrice(oid, "shipment");
            if (up == null || up.compareTo(BigDecimal.ZERO) <= 0) {
                try {
                    String sno = order.getStyleNo();
                    if (StringUtils.hasText(sno)) {
                        StyleInfo styleInfo = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
                                .eq(StyleInfo::getStyleNo, sno.trim())
                                .last("limit 1"));
                        if (styleInfo != null && styleInfo.getPrice() != null
                                && styleInfo.getPrice().compareTo(BigDecimal.ZERO) > 0) {
                            up = styleInfo.getPrice();
                        }
                    }
                } catch (Exception e) {
                    log.warn("Failed to resolve style price for shipment reconciliation: orderId={}, styleNo={}", oid,
                            order.getStyleNo(), e);
                }
            }
        }

        sr.setUnitPrice(up);
        if (sr.getDeductionAmount() == null) {
            sr.setDeductionAmount(BigDecimal.ZERO);
        }
        if (up == null) {
            up = BigDecimal.ZERO;
            sr.setUnitPrice(up);
        }
        BigDecimal total = up.multiply(BigDecimal.valueOf(Math.max(0, shippedQty))).setScale(2, RoundingMode.HALF_UP);
        sr.setTotalAmount(total);
        sr.setFinalAmount(total.subtract(sr.getDeductionAmount()).setScale(2, RoundingMode.HALF_UP));
        sr.setReconciliationDate(now);
        sr.setUpdateTime(now);
        if (StringUtils.hasText(uid)) {
            sr.setUpdateBy(uid);
            if (!StringUtils.hasText(sr.getCreateBy())) {
                sr.setCreateBy(uid);
            }
        }
        return shipmentReconciliationService.saveOrUpdate(sr);
    }

    private Map<String, Object> parseOrderDetails(ProductionOrder order) {
        if (order == null || !StringUtils.hasText(order.getOrderDetails())) {
            return null;
        }
        try {
            String json = order.getOrderDetails().trim();
            if (json.startsWith("[")) {
                // orderDetails 是数组格式（SKU列表），取第一个元素
                java.util.List<Map<String, Object>> list = objectMapper.readValue(json,
                    new TypeReference<java.util.List<Map<String, Object>>>() {});
                return (list != null && !list.isEmpty()) ? list.get(0) : null;
            }
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            log.warn("Failed to parse production order orderDetails: orderId={}", order.getId(), e);
            return null;
        }
    }

    private String resolveCustomerId(Map<String, Object> details) {
        String v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customerId"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customer_id"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        Object customer = ParamUtils.getIgnoreCase(details, "customer");
        if (customer instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) customer;
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "id"));
            if (StringUtils.hasText(v)) {
                return v;
            }
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "customerId"));
            if (StringUtils.hasText(v)) {
                return v;
            }
        }
        return null;
    }

    private String resolveCustomerName(Map<String, Object> details) {
        String v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customerName"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customer_name"));
        if (StringUtils.hasText(v)) {
            return v;
        }
        Object customer = ParamUtils.getIgnoreCase(details, "customer");
        if (customer instanceof Map) {
            @SuppressWarnings("unchecked")
            Map<String, Object> m = (Map<String, Object>) customer;
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "name"));
            if (StringUtils.hasText(v)) {
                return v;
            }
            v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(m, "customerName"));
            if (StringUtils.hasText(v)) {
                return v;
            }
        }
        v = ParamUtils.toTrimmedString(ParamUtils.getIgnoreCase(details, "customer"));
        return StringUtils.hasText(v) ? v : null;
    }

    @Transactional(rollbackFor = Exception.class)
    public int backfillFinanceRecords() {
        List<ProductionOrder> orders = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getDeleteFlag, 0)
                .and(w -> w.gt(ProductionOrder::getCompletedQuantity, 0).or().eq(ProductionOrder::getStatus,
                        "completed"))
                .orderByDesc(ProductionOrder::getUpdateTime)
                .list();
        if (orders == null || orders.isEmpty()) {
            return 0;
        }

        int touched = 0;
        LocalDateTime now = LocalDateTime.now();
        for (ProductionOrder o : orders) {
            if (o == null || !StringUtils.hasText(o.getId())) {
                continue;
            }
            int qty = o.getCompletedQuantity() == null ? 0 : o.getCompletedQuantity();
            if (qty <= 0) {
                qty = productWarehousingService.sumQualifiedByOrderId(o.getId());
            }
            if (qty <= 0) {
                continue;
            }
            try {
                ensureShipmentReconciliationForOrder(o.getId());
            } catch (Exception e) {
                log.warn("Failed to ensure shipment reconciliation during backfill: orderId={}", o.getId(), e);
                scanRecordDomainService.insertOrchestrationFailure(
                        o,
                        "ensureShipmentReconciliation",
                        e == null ? "ensureShipmentReconciliation failed"
                                : ("ensureShipmentReconciliation failed: " + e.getMessage()),
                        now);
            }
            touched++;
        }
        return touched;
    }

    private BigDecimal resolveLastUnitPrice(String orderId, String type) {
        if (!StringUtils.hasText(orderId)) {
            return null;
        }
        String oid = orderId.trim();
        String tp = StringUtils.hasText(type) ? type.trim().toLowerCase() : "";

        try {
            if ("shipment".equals(tp)) {
                ShipmentReconciliation sr = shipmentReconciliationService.lambdaQuery()
                        .select(ShipmentReconciliation::getUnitPrice)
                        .eq(ShipmentReconciliation::getOrderId, oid)
                        .orderByDesc(ShipmentReconciliation::getCreateTime)
                        .last("limit 1")
                        .one();
                return sr == null ? null : sr.getUnitPrice();
            }
            return null;
        } catch (Exception e) {
            log.warn("Failed to resolve last unit price: orderId={}, type={}", oid, tp, e);
            return null;
        }
    }

    private String buildFinanceNo(String prefix, LocalDateTime now) {
        LocalDateTime t = now == null ? LocalDateTime.now() : now;
        String p = StringUtils.hasText(prefix) ? prefix.trim().toUpperCase() : "NO";
        String ts = t.format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss"));
        String rand = String.valueOf((int) (ThreadLocalRandom.current().nextDouble() * 9000) + 1000);
        return p + ts + rand;
    }

    private static boolean isAllDigits(String s) {
        if (s == null || s.isEmpty()) {
            return false;
        }
        for (int i = 0; i < s.length(); i++) {
            if (!Character.isDigit(s.charAt(i))) {
                return false;
            }
        }
        return true;
    }
}
