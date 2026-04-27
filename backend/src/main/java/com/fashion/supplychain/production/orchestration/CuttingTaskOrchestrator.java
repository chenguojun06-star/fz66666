package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.CuttingBundleService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.ProductionOrderScanRecordDomainService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.dto.FactoryOrganizationSnapshot;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.helper.OrganizationUnitBindingHelper;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.OrganizationUnitService;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.security.access.AccessDeniedException;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;

@Service
@Slf4j
@RequiredArgsConstructor
public class CuttingTaskOrchestrator {

    private static final String FACTORY_TYPE_INTERNAL = "INTERNAL";
    private static final String FACTORY_TYPE_EXTERNAL = "EXTERNAL";

    private boolean isDirectCuttingOrder(ProductionOrder order, CuttingTask task) {
        String orderNo = order != null && StringUtils.hasText(order.getOrderNo())
                ? order.getOrderNo().trim()
                : (task != null && StringUtils.hasText(task.getProductionOrderNo())
                ? task.getProductionOrderNo().trim()
                : null);
        return StringUtils.hasText(orderNo) && orderNo.toUpperCase().startsWith("CUT");
    }

    private final CuttingTaskService cuttingTaskService;

    private final StyleInfoService styleInfoService;

    private final CuttingBundleService cuttingBundleService;

    private final ProductionOrderService productionOrderService;

    private final ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private com.fashion.supplychain.production.service.SysNoticeService sysNoticeService;

    private final TemplateLibraryService templateLibraryService;

    private final FactoryService factoryService;

    private final OrganizationUnitService organizationUnitService;

    private final OrganizationUnitBindingHelper organizationUnitBindingHelper;

    private final ObjectMapper objectMapper;


    private final MaterialPurchaseService materialPurchaseService;

    private final OrderRemarkService orderRemarkService;

    private boolean hasCuttingMaterialReady(ProductionOrder order, CuttingTask task) {
        if (isDirectCuttingOrder(order, task)) {
            return true;
        }
        if (order == null || !StringUtils.hasText(order.getId())) {
            return false;
        }
        if (materialPurchaseService.hasConfirmedQuantityByOrderId(order.getId(), true)) {
            return true;
        }
        Integer rate = order.getMaterialArrivalRate();
        if (rate != null && rate >= 100) {
            return true;
        }
        return order.getProcurementManuallyCompleted() != null && order.getProcurementManuallyCompleted() == 1;
    }

    public IPage<CuttingTask> queryPage(Map<String, Object> params) {
        // 工厂账号隔离：只能查看本工厂订单的裁剪任务
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            List<String> factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                            .ne(ProductionOrder::getStatus, "scrapped")
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
            if (factoryOrderIds.isEmpty()) {
                return new com.baomidou.mybatisplus.extension.plugins.pagination.Page<>();
            }
            Map<String, Object> mutableParams = new java.util.HashMap<>(params != null ? params : new java.util.HashMap<>());
            mutableParams.put("_factoryOrderIds", factoryOrderIds);
            IPage<CuttingTask> factoryPage = cuttingTaskService.queryPage(mutableParams);
            java.util.Set<String> scannedIds = scanRecordDomainService.batchHasProductionTypeScanRecords(
                    factoryPage.getRecords().stream()
                            .map(CuttingTask::getProductionOrderId)
                            .filter(StringUtils::hasText)
                            .collect(Collectors.toList()));
            factoryPage.getRecords().forEach(t -> t.setHasScanRecords(scannedIds.contains(t.getProductionOrderId())));
            return factoryPage;
        }
        // PC端透传参数，factoryType 由前端明确传递（全部/内部/外发），不在后端强制覆盖
        Map<String, Object> pcParams = params != null ? new java.util.HashMap<>(params) : new java.util.HashMap<>();
        IPage<CuttingTask> page = cuttingTaskService.queryPage(pcParams);
        java.util.Set<String> scannedIds = scanRecordDomainService.batchHasProductionTypeScanRecords(
                page.getRecords().stream()
                        .map(CuttingTask::getProductionOrderId)
                        .filter(StringUtils::hasText)
                        .collect(Collectors.toList()));
        page.getRecords().forEach(t -> t.setHasScanRecords(scannedIds.contains(t.getProductionOrderId())));
        return page;
    }

    /**
     * 获取裁剪任务状态统计（各状态数量）
     */
    public Map<String, Object> getStatusStats(Map<String, Object> params) {
        // 基础过滤条件
        String orderNo = params != null ? getTrimmedText(params, "orderNo") : null;
        String styleNo = params != null ? getTrimmedText(params, "styleNo") : null;
        String factoryType = normalizeFactoryType(params != null ? getTrimmedText(params, "factoryType") : null);

        LambdaQueryWrapper<CuttingTask> baseWrapper = new LambdaQueryWrapper<CuttingTask>()
                .select(CuttingTask::getId, CuttingTask::getStatus, CuttingTask::getOrderQuantity, CuttingTask::getProductionOrderId)
                .like(StringUtils.hasText(orderNo), CuttingTask::getProductionOrderNo, orderNo)
                .like(StringUtils.hasText(styleNo), CuttingTask::getStyleNo, styleNo);

        // 工厂账号隔离
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(ctxFactoryId)) {
            List<String> factoryOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getFactoryId, ctxFactoryId)
                            .ne(ProductionOrder::getStatus, "scrapped")
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).collect(Collectors.toList());
            if (factoryOrderIds.isEmpty()) {
                Map<String, Object> emptyStats = new java.util.LinkedHashMap<>();
                emptyStats.put("totalCount", 0L);
                emptyStats.put("totalQuantity", 0L);
                emptyStats.put("pendingCount", 0L);
                emptyStats.put("receivedCount", 0L);
                emptyStats.put("bundledCount", 0L);
                return emptyStats;
            }
            baseWrapper.in(CuttingTask::getProductionOrderId, factoryOrderIds);
        }

        // 🔒 PC端默认隔离：未指定工厂类型时，跟单员/管理员只统计内部工厂裁剪数据
        String effectiveFactoryType = StringUtils.hasText(factoryType) ? factoryType :
                (!DataPermissionHelper.isFactoryAccount() ? "INTERNAL" : null);
        if (StringUtils.hasText(effectiveFactoryType)) {
            List<String> matchedOrderIds = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .select(ProductionOrder::getId)
                            .eq(ProductionOrder::getFactoryType, effectiveFactoryType)
                            .ne(ProductionOrder::getStatus, "scrapped")
                            .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0))
            ).stream().map(ProductionOrder::getId).filter(StringUtils::hasText).collect(Collectors.toList());
            if (matchedOrderIds.isEmpty()) {
                Map<String, Object> emptyStats = new java.util.LinkedHashMap<>();
                emptyStats.put("totalCount", 0L);
                emptyStats.put("totalQuantity", 0L);
                emptyStats.put("pendingCount", 0L);
                emptyStats.put("receivedCount", 0L);
                emptyStats.put("bundledCount", 0L);
                return emptyStats;
            }
            baseWrapper.in(CuttingTask::getProductionOrderId, matchedOrderIds);
        }

        List<CuttingTask> allTasks = cuttingTaskService.list(baseWrapper);

        Map<String, Object> stats = new java.util.LinkedHashMap<>();
        stats.put("totalCount", (long) allTasks.size());
        stats.put("totalQuantity", allTasks.stream().mapToLong(t -> t.getOrderQuantity() != null ? t.getOrderQuantity() : 0).sum());
        stats.put("pendingCount", allTasks.stream().filter(t -> "pending".equals(t.getStatus())).count());
        stats.put("receivedCount", allTasks.stream().filter(t -> "received".equals(t.getStatus())).count());
        stats.put("bundledCount", allTasks.stream().filter(t -> "bundled".equals(t.getStatus())).count());
        return stats;
    }

    private String normalizeFactoryType(String raw) {
        if (!StringUtils.hasText(raw)) {
            return null;
        }
        String normalized = raw.trim().toUpperCase();
        if (FACTORY_TYPE_INTERNAL.equals(normalized) || FACTORY_TYPE_EXTERNAL.equals(normalized)) {
            return normalized;
        }
        return null;
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

        String resolvedFactoryType = resolveFactoryType(factoryType, orgUnitId);
        FactoryContext factoryCtx = resolveFactoryContext(resolvedFactoryType, factoryId, orgUnitId);

        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, styleNo)
                .eq(StyleInfo::getStatus, "ENABLED")
                .last("limit 1")
                .one();
        String resolvedStyleId = style == null || style.getId() == null ? null : String.valueOf(style.getId());
        if (!StringUtils.hasText(resolvedStyleId)) {
            resolvedStyleId = styleNo;
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

        String progressWorkflowJson = resolveProgressWorkflowJson(body, styleNo);

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

    private String resolveFactoryType(String factoryType, String orgUnitId) {
        if (StringUtils.hasText(factoryType)) {
            return factoryType.trim().toUpperCase();
        }
        return StringUtils.hasText(orgUnitId) ? "INTERNAL" : "EXTERNAL";
    }

    private static class FactoryContext {
        String factoryType;
        Factory factory;
        FactoryOrganizationSnapshot factorySnapshot;
        OrganizationUnit internalUnit;
        OrganizationUnit internalParentUnit;
    }

    private FactoryContext resolveFactoryContext(String resolvedFactoryType, String factoryId, String orgUnitId) {
        FactoryContext ctx = new FactoryContext();
        ctx.factoryType = resolvedFactoryType;
        if ("INTERNAL".equals(resolvedFactoryType)) {
            if (!StringUtils.hasText(orgUnitId)) {
                throw new IllegalArgumentException("请选择内部生产组/车间");
            }
            ctx.internalUnit = organizationUnitService.getById(orgUnitId.trim());
            if (ctx.internalUnit == null
                    || (ctx.internalUnit.getDeleteFlag() != null && ctx.internalUnit.getDeleteFlag() == 1)
                    || !"DEPARTMENT".equalsIgnoreCase(ctx.internalUnit.getNodeType())) {
                throw new IllegalArgumentException("所选生产组/车间不存在");
            }
            if (StringUtils.hasText(ctx.internalUnit.getParentId())) {
                ctx.internalParentUnit = organizationUnitService.getById(ctx.internalUnit.getParentId());
            }
        } else {
            if (!StringUtils.hasText(factoryId)) {
                throw new IllegalArgumentException("请选择外发工厂");
            }
            ctx.factory = factoryService.getById(factoryId.trim());
            if (ctx.factory == null || (ctx.factory.getDeleteFlag() != null && ctx.factory.getDeleteFlag() == 1)) {
                throw new IllegalArgumentException("所选工厂不存在");
            }
            ctx.factorySnapshot = organizationUnitBindingHelper.getFactorySnapshot(ctx.factory);
        }
        return ctx;
    }

    private void syncStyleCover(String styleImageUrl, StyleInfo style) {
        if (StringUtils.hasText(styleImageUrl) && style != null) {
            if (!StringUtils.hasText(style.getCover())) {
                style.setCover(styleImageUrl);
                styleInfoService.updateById(style);
            }
        }
    }

    private String resolveProgressWorkflowJson(Map<String, Object> body, String styleNo) {
        String progressWorkflowJson = getTrimmedText(body, "progressWorkflowJson");
        if (!StringUtils.hasText(progressWorkflowJson)) {
            progressWorkflowJson = buildProgressWorkflowJson(styleNo);
        }
        if (!StringUtils.hasText(progressWorkflowJson)) {
            progressWorkflowJson = buildCuttingDefaultWorkflowJson();
        }
        return progressWorkflowJson;
    }

    private ProductionOrder buildProductionOrder(String baseOrderNo, String styleNo, String resolvedStyleId,
            String resolvedStyleName, List<Map<String, Object>> requestedOrderLines, int totalOrderQuantity,
            LocalDateTime requestedOrderDate, LocalDateTime requestedDeliveryDate,
            String progressWorkflowJson, FactoryContext factoryCtx) {
        LocalDateTime now = LocalDateTime.now();
        LocalDateTime orderCreateTime = requestedOrderDate != null ? requestedOrderDate : now;
        com.fashion.supplychain.common.UserContext ctx = com.fashion.supplychain.common.UserContext.get();

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
        order.setProgressWorkflowJson(progressWorkflowJson);
        order.setCreateTime(orderCreateTime);
        order.setUpdateTime(now);

        applyFactoryFields(order, factoryCtx, now);

        if (ctx != null && ctx.getTenantId() != null) {
            order.setTenantId(ctx.getTenantId());
        }
        if (ctx != null) {
            order.setCreatedById(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
            order.setCreatedByName(ctx.getUsername());
        }
        return order;
    }

    private void applyFactoryFields(ProductionOrder order, FactoryContext factoryCtx, LocalDateTime now) {
        if ("INTERNAL".equals(factoryCtx.factoryType)) {
            OrganizationUnit unit = factoryCtx.internalUnit;
            OrganizationUnit parent = factoryCtx.internalParentUnit;
            order.setFactoryId(null);
            order.setFactoryName(unit.getNodeName());
            order.setFactoryContactPerson(null);
            order.setFactoryContactPhone(null);
            order.setFactoryType("INTERNAL");
            order.setOrgUnitId(unit.getId());
            order.setParentOrgUnitId(parent != null ? parent.getId() : unit.getParentId());
            order.setParentOrgUnitName(parent != null ? parent.getNodeName() : null);
            order.setOrgPath(unit.getPathNames());
        } else {
            Factory factory = factoryCtx.factory;
            FactoryOrganizationSnapshot snapshot = factoryCtx.factorySnapshot;
            order.setFactoryId(factory.getId());
            order.setFactoryName(factory.getFactoryName());
            order.setFactoryContactPerson(factory.getContactPerson());
            order.setFactoryContactPhone(factory.getContactPhone());
            order.setFactoryType(snapshot.getFactoryType());
            order.setOrgUnitId(snapshot.getOrgUnitId());
            order.setParentOrgUnitId(snapshot.getParentOrgUnitId());
            order.setParentOrgUnitName(snapshot.getParentOrgUnitName());
            order.setOrgPath(snapshot.getOrgPath());
        }
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
            log.warn("CuttingTaskOrchestrator.getPositiveInteger 解析异常: key={}, value={}", key, v, e);
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
                            log.warn("CuttingTaskOrchestrator.resolveRequestedOrderLines 数量解析异常: quantityRaw={}", quantityRaw, e);
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

    private String buildProgressWorkflowJson(String styleNo) {
        List<Map<String, Object>> nodes = templateLibraryService.resolveProgressNodeUnitPrices(styleNo);
        if (nodes == null || nodes.isEmpty()) {
            return null;
        }

        List<Map<String, Object>> normalizedNodes = new ArrayList<>();
        for (Map<String, Object> item : nodes) {
            if (item == null) {
                continue;
            }
            String processName = item.get("name") == null ? null : String.valueOf(item.get("name")).trim();
            if (!StringUtils.hasText(processName)) {
                continue;
            }

            Map<String, Object> node = new java.util.LinkedHashMap<>();

            String processCode = item.get("id") == null ? null : String.valueOf(item.get("id")).trim();
            if (StringUtils.hasText(processCode)) {
                node.put("id", processCode);
                node.put("processCode", processCode);
            }

            node.put("name", processName);

            String progressStage = item.get("progressStage") == null ? null : String.valueOf(item.get("progressStage")).trim();
            if (StringUtils.hasText(progressStage)) {
                node.put("progressStage", progressStage);
            }

            BigDecimal unitPrice = BigDecimal.ZERO;
            Object unitPriceObj = item.get("unitPrice");
            if (unitPriceObj instanceof BigDecimal decimal) {
                unitPrice = decimal;
            } else if (unitPriceObj != null) {
                try {
                    unitPrice = new BigDecimal(String.valueOf(unitPriceObj));
                } catch (Exception ignore) {
                    unitPrice = BigDecimal.ZERO;
                }
            }
            node.put("unitPrice", unitPrice);
            normalizedNodes.add(node);
        }

        if (normalizedNodes.isEmpty()) {
            return null;
        }

        Map<String, Object> workflow = new java.util.LinkedHashMap<>();
        workflow.put("nodes", normalizedNodes);
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(workflow);
        } catch (Exception ex) {
            log.warn("构建 progressWorkflowJson 失败", ex);
            return null;
        }
    }

    private String buildCuttingDefaultWorkflowJson() {
        List<Map<String, Object>> nodes = new ArrayList<>();
        String[][] defaults = {
            {"01", "裁剪", "裁剪"},
            {"02", "整件", "车缝"},
            {"03", "尾部", "尾部"}
        };
        for (String[] d : defaults) {
            Map<String, Object> node = new java.util.LinkedHashMap<>();
            node.put("id", d[0]);
            node.put("name", d[1]);
            node.put("processCode", d[0]);
            node.put("progressStage", d[2]);
            node.put("unitPrice", BigDecimal.ZERO);
            nodes.add(node);
        }
        Map<String, Object> workflow = new java.util.LinkedHashMap<>();
        workflow.put("nodes", nodes);
        try {
            return new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(workflow);
        } catch (Exception ex) {
            log.warn("构建裁剪默认工序模板失败", ex);
            return null;
        }
    }

    public CuttingTask receive(Map<String, Object> body) {
        String taskId = getTrimmedText(body, "taskId");
        String receiverId = getTrimmedText(body, "receiverId");
        String receiverName = getTrimmedText(body, "receiverName");

        if (!StringUtils.hasText(taskId)) {
            throw new IllegalArgumentException("参数错误");
        }

        CuttingTask task = cuttingTaskService.getById(taskId);
        if (task == null) {
            throw new NoSuchElementException("裁剪任务不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(task.getTenantId(), "裁剪任务");

        assertMaterialReady(task);
        assertNotReceivedByOther(task, receiverId, receiverName);

        boolean ok = cuttingTaskService.receiveTask(taskId, receiverId, receiverName);
        if (!ok) {
            assertNotReceivedByOtherAfterFail(taskId, receiverId, receiverName);
            throw new IllegalStateException("领取失败");
        }

        CuttingTask updated = cuttingTaskService.getById(taskId);
        if (updated == null) {
            throw new IllegalStateException("领取失败");
        }

        writeReceiveRemark(updated);
        sendReceiveNotice(updated);

        return updated;
    }

    private void assertMaterialReady(CuttingTask task) {
        String orderId = task.getProductionOrderId();
        if (StringUtils.hasText(orderId)) {
            ProductionOrder order = productionOrderService.getById(orderId.trim());
            if (order != null) {
                TenantAssert.assertBelongsToCurrentTenant(order.getTenantId(), "生产订单");
            }
            if (!hasCuttingMaterialReady(order, task)) {
                throw new IllegalStateException("主面料尚未完成可裁确认，无法领取裁剪任务");
            }
        }
    }

    private void assertNotReceivedByOther(CuttingTask task, String receiverId, String receiverName) {
        String status = task.getStatus() == null ? "" : task.getStatus().trim();
        if ("pending".equals(status) || !StringUtils.hasText(status)) {
            return;
        }
        String existingReceiverId = task.getReceiverId() == null ? null : task.getReceiverId().trim();
        String existingReceiverName = task.getReceiverName() == null ? null : task.getReceiverName().trim();
        boolean isSame = isSameOperator(receiverId, receiverName, existingReceiverId, existingReceiverName);
        if (!isSame) {
            String otherName = StringUtils.hasText(existingReceiverName) ? existingReceiverName : "他人";
            throw new IllegalStateException("该任务已被「" + otherName + "」领取，无法重复领取");
        }
    }

    private void assertNotReceivedByOtherAfterFail(String taskId, String receiverId, String receiverName) {
        CuttingTask latest = cuttingTaskService.getById(taskId);
        if (latest != null) {
            String latestReceiverId = latest.getReceiverId() == null ? null : latest.getReceiverId().trim();
            String latestReceiverName = latest.getReceiverName() == null ? null : latest.getReceiverName().trim();
            boolean isSameNow = isSameOperator(receiverId, receiverName, latestReceiverId, latestReceiverName);
            if (!isSameNow && StringUtils.hasText(latestReceiverName)) {
                throw new IllegalStateException("该任务已被「" + latestReceiverName + "」领取，无法重复领取");
            }
        }
    }

    private boolean isSameOperator(String id1, String name1, String id2, String name2) {
        if (StringUtils.hasText(id1) && StringUtils.hasText(id2)) {
            return id1.trim().equals(id2);
        }
        if (StringUtils.hasText(name1) && StringUtils.hasText(name2)) {
            return name1.trim().equals(name2);
        }
        return false;
    }

    private void writeReceiveRemark(CuttingTask updated) {
        try {
            if (updated != null && StringUtils.hasText(updated.getProductionOrderNo())) {
                String updatedReceiverName = updated.getReceiverName();
                OrderRemark sysRemark = new OrderRemark();
                sysRemark.setTargetType("order");
                sysRemark.setTargetNo(updated.getProductionOrderNo());
                sysRemark.setAuthorId("system");
                sysRemark.setAuthorName("系统");
                sysRemark.setAuthorRole("裁剪");
                sysRemark.setContent("裁剪任务已领取"
                        + (StringUtils.hasText(updatedReceiverName) ? "，领取人：" + updatedReceiverName : ""));
                sysRemark.setTenantId(updated.getTenantId());
                sysRemark.setCreateTime(LocalDateTime.now());
                sysRemark.setDeleteFlag(0);
                orderRemarkService.save(sysRemark);
            }
        } catch (Exception e) {
            log.warn("自动写入裁剪领取备注失败，不影响主流程", e);
        }
    }

    private void sendReceiveNotice(CuttingTask updated) {
        try {
            Long tenantId = updated.getTenantId();
            String orderNo = updated.getProductionOrderNo() != null ? updated.getProductionOrderNo() : "";
            String receiver = updated.getReceiverName() != null ? updated.getReceiverName() : "未知";
            com.fashion.supplychain.production.entity.SysNotice notice = new com.fashion.supplychain.production.entity.SysNotice();
            notice.setTenantId(tenantId);
            notice.setFromName(receiver);
            notice.setOrderNo(orderNo);
            notice.setTitle("✂️ 裁剪任务已领取 — " + orderNo);
            notice.setContent(String.format("%s 已领取裁剪任务%s，请安排生产排期。",
                receiver, orderNo.isEmpty() ? "" : "（订单 " + orderNo + "）"));
            notice.setNoticeType("cutting_received");
            notice.setIsRead(0);
            notice.setCreatedAt(LocalDateTime.now());
            sysNoticeService.save(notice);
        } catch (Exception e) {
            log.warn("[裁剪领取] 发送通知失败: {}", e.getMessage());
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public CuttingTask rollback(Map<String, Object> body) {
        String taskId = getTrimmedText(body, "taskId");
        String reason = getTrimmedText(body, "reason");

        if (!StringUtils.hasText(taskId)) {
            throw new IllegalArgumentException("参数错误");
        }

        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }

        // 从 JWT 获取当前登录用户（不信任客户端传入的 operatorId）
        String currentUserId = com.fashion.supplychain.common.UserContext.userId();
        String currentUsername = com.fashion.supplychain.common.UserContext.username();
        if (!StringUtils.hasText(currentUserId)) {
            throw new AccessDeniedException("未登录或登录已过期");
        }

        CuttingTask task = cuttingTaskService.getById(taskId);
        if (task == null) {
            throw new NoSuchElementException("裁剪任务不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(task.getTenantId(), "裁剪任务");

        // 检查是否已有生产扫码记录，有则禁止退回（防止清除工人工资数据）
        if (scanRecordDomainService.hasProductionTypeScanRecords(task.getProductionOrderId())) {
            throw new IllegalStateException("该裁剪任务已存在生产扫码记录，无法退回");
        }

        // bundled 状态（已生成菲号）允许退回，rollbackTask 会同步清理菲号、扫码记录、工序跟踪

        boolean ok = cuttingTaskService.rollbackTask(taskId);
        if (!ok) {
            throw new IllegalStateException("退回失败");
        }

        markCustomCutOrderScrapped(task, reason);

        cuttingTaskService.insertRollbackLog(task, currentUserId, currentUsername, reason);

        CuttingTask updated = cuttingTaskService.getById(taskId);
        if (updated == null) {
            throw new IllegalStateException("退回失败");
        }
        TenantAssert.assertBelongsToCurrentTenant(updated.getTenantId(), "裁剪任务");
        return updated;
    }

    private void markCustomCutOrderScrapped(CuttingTask task, String reason) {
        if (task == null || !StringUtils.hasText(task.getProductionOrderId())) {
            return;
        }
        String orderNo = StringUtils.hasText(task.getProductionOrderNo()) ? task.getProductionOrderNo().trim() : "";
        if (!orderNo.startsWith("CUT")) {
            return;
        }

        ProductionOrder order = productionOrderService.getById(task.getProductionOrderId().trim());
        if (order == null || order.getDeleteFlag() != 0) {
            return;
        }
        String currentStatus = order.getStatus() == null ? "" : order.getStatus().trim().toLowerCase();
        if ("scrapped".equals(currentStatus)) {
            return;
        }

        order.setStatus("scrapped");
        order.setUpdateTime(LocalDateTime.now());
        if (StringUtils.hasText(reason)) {
            order.setOperationRemark(reason.trim());
        }
        boolean updated = productionOrderService.updateById(order);
        if (!updated) {
            throw new IllegalStateException("退回成功但更新订单报废状态失败");
        }
    }

    /**
     * 获取当前用户的裁剪任务（已领取，待生成菲号）
     * 注意：排除已关闭/已完成/已取消/已归档的订单
     */
    public List<CuttingTask> getMyTasks() {
        com.fashion.supplychain.common.UserContext ctx = com.fashion.supplychain.common.UserContext.get();
        String userId = ctx == null ? null : ctx.getUserId();
        if (!StringUtils.hasText(userId)) {
            return new ArrayList<>();
        }

        // 查询当前用户已领取的裁剪任务（status = received）
        List<CuttingTask> tasks = cuttingTaskService.lambdaQuery()
                .select(
                        CuttingTask::getId,
                        CuttingTask::getProductionOrderId,
                        CuttingTask::getProductionOrderNo,
                        CuttingTask::getStyleNo,
                        CuttingTask::getColor,
                        CuttingTask::getOrderQuantity,
                        CuttingTask::getReceiverName,
                        CuttingTask::getReceivedTime,
                        CuttingTask::getExpectedShipDate
                )
                .eq(CuttingTask::getReceiverId, userId)
                .eq(CuttingTask::getStatus, "received")
                .orderByDesc(CuttingTask::getReceivedTime)
                .list();

        // 过滤掉已关闭/已完成订单对应的任务
        if (tasks.isEmpty()) {
            return tasks;
        }

        Set<String> orderIds = tasks.stream()
                .map(CuttingTask::getProductionOrderId)
                .filter(StringUtils::hasText)
                .collect(Collectors.toSet());

        if (orderIds.isEmpty()) {
            return tasks;
        }

        // 查询有效订单（排除已关闭/已完成/已取消/已归档/已报废）
        Set<String> validOrderIds = productionOrderService.lambdaQuery()
            .select(ProductionOrder::getId)
                .in(ProductionOrder::getId, orderIds)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .notIn(ProductionOrder::getStatus, "closed", "completed", "cancelled", "archived", "scrapped")
                .list()
                .stream()
                .map(ProductionOrder::getId)
                .collect(Collectors.toSet());

        // 只返回有效订单的任务
        return tasks.stream()
                .filter(task -> validOrderIds.contains(task.getProductionOrderId()))
                .collect(Collectors.toList());
    }
}
