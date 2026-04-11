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

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private CuttingBundleService cuttingBundleService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ProductionOrderScanRecordDomainService scanRecordDomainService;

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private OrganizationUnitService organizationUnitService;

    @Autowired
    private OrganizationUnitBindingHelper organizationUnitBindingHelper;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private ProductionProcessTrackingOrchestrator processTrackingOrchestrator;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private OrderRemarkService orderRemarkService;

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
            factoryPage.getRecords().forEach(t -> {
                if (StringUtils.hasText(t.getProductionOrderId())) {
                    t.setHasScanRecords(scanRecordDomainService.hasProductionTypeScanRecords(t.getProductionOrderId()));
                }
            });
            return factoryPage;
        }
        // PC端透传参数，factoryType 由前端明确传递（全部/内部/外发），不在后端强制覆盖
        Map<String, Object> pcParams = params != null ? new java.util.HashMap<>(params) : new java.util.HashMap<>();
        IPage<CuttingTask> page = cuttingTaskService.queryPage(pcParams);
        page.getRecords().forEach(t -> {
            if (StringUtils.hasText(t.getProductionOrderId())) {
                t.setHasScanRecords(scanRecordDomainService.hasProductionTypeScanRecords(t.getProductionOrderId()));
            }
        });
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

        long totalCount = allTasks.size();
        long pendingCount = allTasks.stream().filter(t -> "pending".equals(t.getStatus())).count();
        long receivedCount = allTasks.stream().filter(t -> "received".equals(t.getStatus())).count();
        long bundledCount = allTasks.stream().filter(t -> "bundled".equals(t.getStatus())).count();
        long totalQuantity = allTasks.stream()
                .mapToLong(t -> t.getOrderQuantity() != null ? t.getOrderQuantity() : 0)
                .sum();

        Map<String, Object> stats = new java.util.LinkedHashMap<>();
        stats.put("totalCount", totalCount);
        stats.put("totalQuantity", totalQuantity);
        stats.put("pendingCount", pendingCount);
        stats.put("receivedCount", receivedCount);
        stats.put("bundledCount", bundledCount);
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
        LocalDateTime requestedOrderDate = parseDate(body, "orderDate", false);
        LocalDateTime requestedDeliveryDate = parseDate(body, "deliveryDate", true);
        List<Map<String, Object>> requestedOrderLines = resolveRequestedOrderLines(body);

        if (!StringUtils.hasText(styleNo)) {
            throw new IllegalArgumentException("参数错误");
        }
        if (requestedOrderLines.isEmpty()) {
            throw new IllegalArgumentException("请至少填写一行颜色、尺码和数量");
        }

        String resolvedFactoryType = StringUtils.hasText(factoryType) ? factoryType.trim().toUpperCase() : null;
        if (!StringUtils.hasText(resolvedFactoryType)) {
            resolvedFactoryType = StringUtils.hasText(orgUnitId) ? "INTERNAL" : "EXTERNAL";
        }

        Factory factory = null;
        FactoryOrganizationSnapshot factorySnapshot = null;
        OrganizationUnit internalUnit = null;
        OrganizationUnit internalParentUnit = null;
        if ("INTERNAL".equals(resolvedFactoryType)) {
            if (!StringUtils.hasText(orgUnitId)) {
                throw new IllegalArgumentException("请选择内部生产组/车间");
            }
            internalUnit = organizationUnitService.getById(orgUnitId.trim());
            if (internalUnit == null
                    || (internalUnit.getDeleteFlag() != null && internalUnit.getDeleteFlag() == 1)
                    || !"DEPARTMENT".equalsIgnoreCase(internalUnit.getNodeType())) {
                throw new IllegalArgumentException("所选生产组/车间不存在");
            }
            if (StringUtils.hasText(internalUnit.getParentId())) {
                internalParentUnit = organizationUnitService.getById(internalUnit.getParentId());
            }
        } else {
            if (!StringUtils.hasText(factoryId)) {
                throw new IllegalArgumentException("请选择外发工厂");
            }
            factory = factoryService.getById(factoryId.trim());
            if (factory == null || (factory.getDeleteFlag() != null && factory.getDeleteFlag() == 1)) {
                throw new IllegalArgumentException("所选工厂不存在");
            }
            factorySnapshot = organizationUnitBindingHelper.getFactorySnapshot(factory);
        }

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

        // 生成 CUT 前缀订单号基础（若用户未提供）
        String baseOrderNo = StringUtils.hasText(orderNo)
                ? orderNo
                : "CUT" + DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS").format(LocalDateTime.now());

        LocalDateTime now = LocalDateTime.now();
        LocalDateTime orderCreateTime = requestedOrderDate != null ? requestedOrderDate : now;

        String progressWorkflowJson = buildProgressWorkflowJson(styleNo);
        com.fashion.supplychain.common.UserContext ctx = com.fashion.supplychain.common.UserContext.get();

        // ── 按颜色分菲：为每个 orderLine（color+size+qty 组合）创建独立的 CuttingTask ────────────
        List<CuttingTask> createdTasks = new ArrayList<>();
        int lineIndex = 0;

        for (Map<String, Object> orderLine : requestedOrderLines) {
            lineIndex++;
            String lineColor = String.valueOf(orderLine.get("color")).trim();
            String lineSize = String.valueOf(orderLine.get("size")).trim();
            int lineQuantity = Integer.parseInt(String.valueOf(orderLine.get("quantity")));

            // 为每条颜色行生成唯一订单号
            String finalOrderNo = baseOrderNo;
            if (requestedOrderLines.size() > 1) {
                // 多颜色时，按顺序追加 -1, -2, -3...
                finalOrderNo = baseOrderNo + "-" + lineIndex;
            }

            // 检查重复
            CuttingTask existed = cuttingTaskService.getOne(
                    new LambdaQueryWrapper<CuttingTask>()
                            .eq(CuttingTask::getProductionOrderNo, finalOrderNo)
                            .last("limit 1"));
            if (existed != null) {
                finalOrderNo = finalOrderNo + "-" + String.valueOf(System.nanoTime()).substring(8);
            }

            // 创建该颜色/尺码的 ProductionOrder
            ProductionOrder order = new ProductionOrder();
            order.setOrderNo(finalOrderNo);
            order.setQrCode(finalOrderNo);
            order.setStyleId(resolvedStyleId);
            order.setStyleNo(styleNo);
            order.setStyleName(resolvedStyleName);
            order.setColor(lineColor);
            order.setSize(lineSize);
            order.setOrderQuantity(lineQuantity);
            order.setOrderDetails(buildOrderDetailsJson(List.of(orderLine)));
            order.setCompletedQuantity(0);
            order.setProductionProgress(0);
            // 模板裁剪任务从裁剪起点直接开始，不经过采购回料链路，避免生成菲号时被采购校验误拦截。
            order.setMaterialArrivalRate(100);
            order.setStatus("pending");
            order.setDeleteFlag(0);
            order.setPlannedEndDate(requestedDeliveryDate);
            order.setProgressWorkflowJson(progressWorkflowJson);
            order.setCreateTime(orderCreateTime);
            order.setUpdateTime(now);
            if ("INTERNAL".equals(resolvedFactoryType)) {
                order.setFactoryId(null);
                order.setFactoryName(StringUtils.hasText(factoryName) ? factoryName : internalUnit.getNodeName());
                order.setFactoryContactPerson(null);
                order.setFactoryContactPhone(null);
                order.setFactoryType("INTERNAL");
                order.setOrgUnitId(internalUnit.getId());
                order.setParentOrgUnitId(internalParentUnit != null ? internalParentUnit.getId() : internalUnit.getParentId());
                order.setParentOrgUnitName(internalParentUnit != null ? internalParentUnit.getNodeName() : null);
                order.setOrgPath(internalUnit.getPathNames());
            } else {
                order.setFactoryId(factory.getId());
                order.setFactoryName(StringUtils.hasText(factoryName) ? factoryName : factory.getFactoryName());
                order.setFactoryContactPerson(factory.getContactPerson());
                order.setFactoryContactPhone(factory.getContactPhone());
                order.setFactoryType(factorySnapshot.getFactoryType());
                order.setOrgUnitId(factorySnapshot.getOrgUnitId());
                order.setParentOrgUnitId(factorySnapshot.getParentOrgUnitId());
                order.setParentOrgUnitName(factorySnapshot.getParentOrgUnitName());
                order.setOrgPath(factorySnapshot.getOrgPath());
            }
            // 设置租户 ID 及创建人
            if (ctx != null && ctx.getTenantId() != null) {
                order.setTenantId(ctx.getTenantId());
            }
            if (ctx != null) {
                order.setCreatedById(ctx.getUserId() == null ? null : String.valueOf(ctx.getUserId()));
                order.setCreatedByName(ctx.getUsername());
            }

            boolean orderOk = productionOrderService.save(order);
            if (!orderOk) {
                throw new IllegalStateException("创建颜色 " + lineColor + " 的生产订单失败");
            }

            CuttingTask task = cuttingTaskService.createTaskIfAbsent(order);
            if (task == null) {
                throw new IllegalStateException("创建颜色 " + lineColor + " 的裁剪任务失败");
            }

            try {
                scanRecordDomainService.ensureBaseStageScanRecordsOnCreate(order);
                productionOrderService.recomputeProgressFromRecords(order.getId().trim());
            } catch (Exception e) {
                log.warn("颜色 {} 的裁剪任务创建后初始化基础记录失败: orderId={}", lineColor, order.getId(), e);
            }

            createdTasks.add(task);
            log.info("已创建颜色分菲裁剪任务: orderNo={}, color={}, size={}, quantity={}, orderId={}",
                    finalOrderNo, lineColor, lineSize, lineQuantity, order.getId());
        }

        // 返回最后一个创建的任务，或首个任务（用于前端响应）
        return createdTasks.isEmpty() ? null : createdTasks.get(0);
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

    private String summarizeLineField(List<Map<String, Object>> orderLines, String field, String fallbackWhenMultiple) {
        Set<String> values = orderLines.stream()
                .map(line -> String.valueOf(line.get(field)).trim())
                .filter(StringUtils::hasText)
                .collect(Collectors.toCollection(java.util.LinkedHashSet::new));
        if (values.isEmpty()) {
            return null;
        }
        if (values.size() == 1) {
            return values.iterator().next();
        }
        return fallbackWhenMultiple;
    }

    private String buildOrderDetailsJson(List<Map<String, Object>> orderLines) {
        try {
            return objectMapper.writeValueAsString(orderLines);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("构造订单明细失败", e);
        }
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
            node.put("name", processName);

            String processCode = item.get("id") == null ? null : String.valueOf(item.get("id")).trim();
            if (StringUtils.hasText(processCode)) {
                node.put("processCode", processCode);
            }

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

        String orderId = task.getProductionOrderId();
        if (StringUtils.hasText(orderId)) {
            ProductionOrder order = productionOrderService.getById(orderId.trim());
            if (!hasCuttingMaterialReady(order, task)) {
                throw new IllegalStateException("主面料尚未完成可裁确认，无法领取裁剪任务");
            }
        }

        // 检查是否已被他人领取
        String status = task.getStatus() == null ? "" : task.getStatus().trim();
        String existingReceiverId = task.getReceiverId() == null ? null : task.getReceiverId().trim();
        String existingReceiverName = task.getReceiverName() == null ? null : task.getReceiverName().trim();

        if (!"pending".equals(status) && StringUtils.hasText(status)) {
            // 已被领取，检查是否是同一个人
            boolean isSame = false;
            if (StringUtils.hasText(receiverId) && StringUtils.hasText(existingReceiverId)) {
                isSame = receiverId.trim().equals(existingReceiverId);
            } else if (StringUtils.hasText(receiverName) && StringUtils.hasText(existingReceiverName)) {
                isSame = receiverName.trim().equals(existingReceiverName);
            }
            if (!isSame) {
                String otherName = StringUtils.hasText(existingReceiverName) ? existingReceiverName : "他人";
                throw new IllegalStateException("该任务已被「" + otherName + "」领取，无法重复领取");
            }
        }

        boolean ok = cuttingTaskService.receiveTask(taskId, receiverId, receiverName);
        if (!ok) {
            // 再次检查最新状态
            CuttingTask latest = cuttingTaskService.getById(taskId);
            if (latest != null) {
                String latestReceiverName = latest.getReceiverName() == null ? null : latest.getReceiverName().trim();
                String latestReceiverId = latest.getReceiverId() == null ? null : latest.getReceiverId().trim();
                boolean isSameNow = false;
                if (StringUtils.hasText(receiverId) && StringUtils.hasText(latestReceiverId)) {
                    isSameNow = receiverId.trim().equals(latestReceiverId);
                } else if (StringUtils.hasText(receiverName) && StringUtils.hasText(latestReceiverName)) {
                    isSameNow = receiverName.trim().equals(latestReceiverName);
                }
                if (!isSameNow && StringUtils.hasText(latestReceiverName)) {
                    throw new IllegalStateException("该任务已被「" + latestReceiverName + "」领取，无法重复领取");
                }
            }
            throw new IllegalStateException("领取失败");
        }

        CuttingTask updated = cuttingTaskService.getById(taskId);
        if (updated == null) {
            throw new IllegalStateException("领取失败");
        }

        // 自动写入系统备注：裁剪任务领取节点
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

        return updated;
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

        String taskStatus = task.getStatus() == null ? "" : task.getStatus().trim().toLowerCase();
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

    private String buildQrCode(String orderNo, String styleNo, String color, String size, int quantity, int bundleNo) {
        StringBuilder sb = new StringBuilder();
        if (StringUtils.hasText(orderNo)) {
            sb.append(orderNo);
        }
        sb.append("-");
        if (StringUtils.hasText(styleNo)) {
            sb.append(styleNo);
        }
        sb.append("-");
        if (StringUtils.hasText(color)) {
            sb.append(color);
        }
        sb.append("-");
        if (StringUtils.hasText(size)) {
            sb.append(size);
        }
        sb.append("-").append(Math.max(quantity, 0));
        sb.append("-").append(bundleNo);
        return sb.toString();
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
                        CuttingTask::getReceivedTime
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
