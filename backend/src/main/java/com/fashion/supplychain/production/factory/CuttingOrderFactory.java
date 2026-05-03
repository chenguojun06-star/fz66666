package com.fashion.supplychain.production.factory;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.helper.CuttingFactoryContextHelper;
import com.fashion.supplychain.production.helper.CuttingWorkflowBuilderHelper;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
@Slf4j
@RequiredArgsConstructor
public class CuttingOrderFactory {

    private final CuttingTaskService cuttingTaskService;
    private final StyleInfoService styleInfoService;
    private final ProductionOrderService productionOrderService;
    private final ProductionOrderScanRecordDomainService scanRecordDomainService;
    private final CuttingFactoryContextHelper factoryContextHelper;
    private final CuttingWorkflowBuilderHelper workflowBuilderHelper;
    private final ObjectMapper objectMapper;

    @Transactional(rollbackFor = Exception.class)
    public CuttingTask createCustom(Map<String, Object> body) {
        String styleNo = getTrimmedText(body, "styleNo");
        String orderNo = getTrimmedText(body, "orderNo");
        String factoryType = getTrimmedText(body, "factoryType");
        String factoryId = getTrimmedText(body, "factoryId");
        String factoryName = getTrimmedText(body, "factoryName");
        String orgUnitId = getTrimmedText(body, "orgUnitId");
        String styleImageUrl = getTrimmedText(body, "styleImageUrl");
        LocalDateTime requestedOrderDate = parseDate(body, "orderDate", false);
        LocalDateTime requestedDeliveryDate = parseDate(body, "deliveryDate", true);
        List<Map<String, Object>> requestedOrderLines = resolveRequestedOrderLines(body);

        if (!StringUtils.hasText(styleNo)) {
            throw new IllegalArgumentException("参数错误");
        }
        if (requestedOrderLines.isEmpty()) {
            throw new IllegalArgumentException("请至少填写一行颜色、尺码和数量");
        }

        String resolvedFactoryType = factoryContextHelper.resolveFactoryType(factoryType, orgUnitId);
        CuttingFactoryContextHelper.FactoryContext factoryCtx = factoryContextHelper.resolveFactoryContext(resolvedFactoryType, factoryId, orgUnitId);

        // 修复(2026-04-28)：移除 status='ENABLED' 过滤，否则草稿/停用款式视同不存在；
        //                  并在款式不存在时按用户上传的款式图自动创建最小化 StyleInfo，
        //                  避免 styleImageUrl 静默丢弃导致裁剪订单列表"无图"
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, styleNo)
                .last("limit 1")
                .one();
        if (style == null) {
            style = autoCreateStyleForCutting(styleNo, styleImageUrl);
        }
        String resolvedStyleId = style == null || style.getId() == null ? null : String.valueOf(style.getId());
        if (!StringUtils.hasText(resolvedStyleId)) {
            throw new IllegalStateException("无法解析款式ID: styleNo=" + styleNo + "，款式自动创建失败且无可用ID");
        }
        int totalOrderQuantity = requestedOrderLines.stream()
                .map(line -> line.get("quantity"))
                .mapToInt(value -> Integer.parseInt(String.valueOf(value)))
                .sum();
        String resolvedStyleName = style != null && StringUtils.hasText(style.getStyleName())
            ? style.getStyleName() : styleNo;

        syncStyleCover(styleImageUrl, style);

        String baseOrderNo = StringUtils.hasText(orderNo)
                ? orderNo
                : "CUT" + DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(LocalDateTime.now());

        String progressWorkflowJson = workflowBuilderHelper.resolveProgressWorkflowJson(body, styleNo);

        ProductionOrder order = buildProductionOrder(baseOrderNo, styleNo, resolvedStyleId, resolvedStyleName,
                requestedOrderLines, totalOrderQuantity, requestedOrderDate, requestedDeliveryDate,
                progressWorkflowJson, factoryCtx);

        boolean orderOk = productionOrderService.save(order);
        if (!orderOk) {
            throw new IllegalStateException("创建生产订单失败");
        }

        initializePostCreateRecords(order);

        CuttingTask firstTask = cuttingTaskService.createTaskIfAbsent(order);
        if (firstTask == null) {
            throw new IllegalStateException("创建裁剪任务失败");
        }

        log.info("已创建裁剪订单(含{}行颜色尺码): orderNo={}, totalQty={}, orderId={}",
                requestedOrderLines.size(), baseOrderNo, totalOrderQuantity, order.getId());

        return firstTask;
    }

    private void syncStyleCover(String styleImageUrl, StyleInfo style) {
        if (StringUtils.hasText(styleImageUrl) && style != null) {
            if (!StringUtils.hasText(style.getCover())) {
                style.setCover(styleImageUrl);
                styleInfoService.updateById(style);
            }
        }
    }

    /**
     * 修复(2026-04-28)：自定义裁剪下单允许使用未存在的款号(如手输 0099988)。
     * 此前 styleImageUrl 上传后没有任何落库点（t_production_order 无图片列、t_style_info 找不到记录、t_style_attachment 没写）
     * 导致列表"无图"。这里以最小字段创建 StyleInfo，让 fillStyleCover 列表查询能通过 styleNo→cover 链路找到图片。
     */
    private StyleInfo autoCreateStyleForCutting(String styleNo, String styleImageUrl) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            log.warn("[CuttingOrderFactory] 当前无租户上下文，跳过自动创建 StyleInfo: styleNo={}", styleNo);
            return null;
        }
        try {
            StyleInfo newStyle = new StyleInfo();
            newStyle.setStyleNo(styleNo);
            newStyle.setStyleName(styleNo);
            newStyle.setCategory("UNISEX");
            newStyle.setStatus("ENABLED");
            newStyle.setTenantId(tenantId);
            newStyle.setDescriptionLocked(1);
            newStyle.setPatternRevLocked(0);
            if (StringUtils.hasText(styleImageUrl)) {
                newStyle.setCover(styleImageUrl);
            }
            newStyle.setCreateTime(LocalDateTime.now());
            newStyle.setUpdateTime(LocalDateTime.now());
            boolean ok = styleInfoService.save(newStyle);
            if (ok) {
                log.info("[CuttingOrderFactory] 自定义裁剪下单自动创建款式: styleNo={}, styleId={}, hasCover={}",
                        styleNo, newStyle.getId(), StringUtils.hasText(styleImageUrl));
                return newStyle;
            }
            log.warn("[CuttingOrderFactory] 自动创建款式 save 返回 false: styleNo={}", styleNo);
            return null;
        } catch (Exception e) {
            log.error("[CuttingOrderFactory] 自动创建款式失败: styleNo={}, err={}", styleNo, e.getMessage(), e);
            return null;
        }
    }

    private ProductionOrder buildProductionOrder(String baseOrderNo, String styleNo, String resolvedStyleId,
            String resolvedStyleName, List<Map<String, Object>> requestedOrderLines, int totalOrderQuantity,
            LocalDateTime requestedOrderDate, LocalDateTime requestedDeliveryDate,
            String progressWorkflowJson, CuttingFactoryContextHelper.FactoryContext factoryCtx) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime orderCreateTime = requestedOrderDate != null ? requestedOrderDate : now;
        UserContext ctx = UserContext.get();
        String primaryColor = resolvePrimaryValue(requestedOrderLines, "color", "多色");
        String primarySize = resolvePrimaryValue(requestedOrderLines, "size", "多码");
        ProductionOrder order = new ProductionOrder();
        order.setOrderNo(baseOrderNo);
        order.setQrCode(baseOrderNo);
        order.setStyleId(resolvedStyleId);
        order.setStyleNo(styleNo);
        order.setStyleName(resolvedStyleName);
        order.setColor(primaryColor);
        order.setSize(primarySize);
        order.setOrderQuantity(totalOrderQuantity);
        order.setOrderDetails(buildOrderDetailsJson(requestedOrderLines));
        order.setCompletedQuantity(0);
        order.setProductionProgress(0);
        order.setMaterialArrivalRate(100);
        order.setStatus("pending");
        order.setDeleteFlag(0);
        order.setPlannedEndDate(requestedDeliveryDate);
        if (requestedDeliveryDate != null) {
            order.setExpectedShipDate(requestedDeliveryDate.toLocalDate());
        }
        order.setProgressWorkflowJson(progressWorkflowJson);
        order.setPricingMode("PROCESS");
        order.setScatterPricingMode("FOLLOW_ORDER");
        order.setFactoryUnitPrice(BigDecimal.ZERO);
        order.setCreateTime(orderCreateTime);
        order.setUpdateTime(now);
        factoryContextHelper.applyFactoryFields(order, factoryCtx);
        if (ctx != null && ctx.getTenantId() != null) {
            order.setTenantId(ctx.getTenantId());
        }
        if (ctx != null) {
            order.setCreatedById(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
            order.setCreatedByName(ctx.getUsername());
        }
        return order;
    }

    private void initializePostCreateRecords(ProductionOrder order) {
        try {
            scanRecordDomainService.ensureBaseStageScanRecordsOnCreate(order);
            productionOrderService.recomputeProgressFromRecords(order.getId().trim());
        } catch (Exception e) {
            log.warn("裁剪任务创建后初始化基础记录失败: orderId={}", order.getId(), e);
        }
    }

    private LocalDateTime parseDate(Map<String, Object> body, String key, boolean endOfDay) {
        String value = getTrimmedText(body, key);
        if (!StringUtils.hasText(value)) {
            return null;
        }
        try {
            LocalDate parsed = LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE);
            return endOfDay ? parsed.atTime(23, 59, 59) : parsed.atStartOfDay();
        } catch (Exception ex) {
            throw new IllegalArgumentException("日期格式错误，请使用 yyyy-MM-dd");
        }
    }

    private Integer getPositiveInteger(Map<String, Object> body, String key) {
        if (body == null || key == null) {
            return null;
        }
        Object v = body.get(key);
        if (v == null) {
            return null;
        }
        try {
            int value = Integer.parseInt(String.valueOf(v).trim());
            return value > 0 ? value : null;
        } catch (Exception e) {
            log.warn("CuttingOrderFactory.getPositiveInteger 解析异常: key={}, value={}", key, v, e);
            return null;
        }
    }

    private List<Map<String, Object>> resolveRequestedOrderLines(Map<String, Object> body) {
        List<Map<String, Object>> normalized = new ArrayList<>();
        if (body != null) {
            Object raw = body.get("orderLines");
            if (raw instanceof List<?>) {
                for (Object item : (List<?>) raw) {
                    if (!(item instanceof Map<?, ?> rawMap)) {
                        continue;
                    }
                    Object colorRaw = rawMap.get("color");
                    Object sizeRaw = rawMap.get("size");
                    String color = colorRaw == null ? "" : String.valueOf(colorRaw).trim();
                    String size = sizeRaw == null ? "" : String.valueOf(sizeRaw).trim();
                    Integer quantity = null;
                    Object quantityRaw = rawMap.get("quantity");
                    if (quantityRaw != null) {
                        try {
                            int parsed = Integer.parseInt(String.valueOf(quantityRaw).trim());
                            if (parsed > 0) {
                                quantity = parsed;
                            }
                        } catch (Exception e) {
                            log.warn("CuttingOrderFactory.resolveRequestedOrderLines 数量解析异常: quantityRaw={}", quantityRaw, e);
                            quantity = null;
                        }
                    }
                    if (StringUtils.hasText(color) || StringUtils.hasText(size) || quantity != null) {
                        if (!StringUtils.hasText(color) || !StringUtils.hasText(size) || quantity == null) {
                            throw new IllegalArgumentException("请完整填写每一行颜色、尺码和数量");
                        }
                        normalized.add(Map.of(
                                "color", color,
                                "size", size,
                                "quantity", quantity));
                    }
                }
            }
        }
        if (!normalized.isEmpty()) {
            return normalized;
        }

        String color = getTrimmedText(body, "color");
        String size = getTrimmedText(body, "size");
        Integer quantity = getPositiveInteger(body, "orderQuantity");
        if (StringUtils.hasText(color) && StringUtils.hasText(size) && quantity != null) {
            return List.of(Map.of(
                    "color", color,
                    "size", size,
                    "quantity", quantity));
        }
        return normalized;
    }

    private String buildOrderDetailsJson(List<Map<String, Object>> orderLines) {
        try {
            return objectMapper.writeValueAsString(orderLines);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("构造订单明细失败", e);
        }
    }

    private String resolvePrimaryValue(List<Map<String, Object>> orderLines, String field, String multiLabel) {
        if (orderLines == null || orderLines.isEmpty()) return "";
        java.util.Set<String> values = new java.util.LinkedHashSet<>();
        for (Map<String, Object> line : orderLines) {
            String v = line.get(field) == null ? "" : String.valueOf(line.get(field)).trim();
            if (!v.isEmpty()) values.add(v);
        }
        if (values.isEmpty()) return "";
        if (values.size() == 1) return values.iterator().next();
        return multiLabel;
    }

    private String getTrimmedText(Map<String, Object> body, String key) {
        if (body == null || key == null) {
            return null;
        }
        Object v = body.get(key);
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return StringUtils.hasText(s) ? s : null;
    }
}
