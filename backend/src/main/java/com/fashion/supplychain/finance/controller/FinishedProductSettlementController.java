package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.mapper.ProductionOrderMapper;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.util.OrderPricingSnapshotUtils;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import com.fashion.supplychain.finance.service.FinishedSettlementApprovalStatusService;
import com.fashion.supplychain.finance.service.FinishedProductSettlementExportService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.apache.commons.lang3.StringUtils;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;
import java.util.stream.Collectors;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Collections;

/**
 * 成品结算控制器
 */
@Tag(name = "成品结算管理")
@RestController
@RequestMapping("/api/finance/finished-settlement")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class FinishedProductSettlementController {

    private final FinishedProductSettlementService settlementService;
    private final FinishedProductSettlementExportService exportService;
    private final FinishedSettlementApprovalStatusService approvalStatusService;
    private final FactoryService factoryService;
    /** 绕过租户拦截器查询订单，用于超管跨租户查看成品结算。 */
    private final ProductionOrderMapper productionOrderMapper;
    private final ProductionOrderService productionOrderService;

    @Operation(summary = "分页查询成品结算列表")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<Page<FinishedProductSettlement>> page(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer pageSize,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String parentOrgUnitId,
            @RequestParam(required = false) String factoryType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String factoryId
    ) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        Page<FinishedProductSettlement> pageObj = new Page<>(page, pageSize);
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedProductSettlement::getTenantId, tenantId);

        // 订单号模糊查询
        if (StringUtils.isNotBlank(orderNo)) {
            wrapper.like(FinishedProductSettlement::getOrderNo, orderNo);
        }

        // 款号模糊查询
        if (StringUtils.isNotBlank(styleNo)) {
            wrapper.like(FinishedProductSettlement::getStyleNo, styleNo);
        }

        // 订单状态筛选
        if (StringUtils.isNotBlank(status)) {
            wrapper.eq(FinishedProductSettlement::getStatus, status);
        }

        // 始终排除已取消/报废/逻辑删除的订单（不参与结算）
        wrapper.notIn(FinishedProductSettlement::getStatus, "CANCELLED", "cancelled", "DELETED", "deleted", "scrapped", "SCRAPPED", "archived", "ARCHIVED");

        // 日期范围筛选
        if (StringUtils.isNotBlank(startDate)) {
            LocalDateTime startDateTime = LocalDate.parse(startDate).atStartOfDay();
            wrapper.ge(FinishedProductSettlement::getCreateTime, startDateTime);
        }
        if (StringUtils.isNotBlank(endDate)) {
            LocalDateTime endDateTime = LocalDate.parse(endDate).atTime(LocalTime.MAX);
            wrapper.le(FinishedProductSettlement::getCreateTime, endDateTime);
        }

        // 外发工厂账号强制只看自己工厂数据；租户管理员可按 factoryId 筛选
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.isNotBlank(ctxFactoryId)) {
            wrapper.eq(FinishedProductSettlement::getFactoryId, ctxFactoryId);
        } else if (StringUtils.isNotBlank(factoryId)) {
            wrapper.eq(FinishedProductSettlement::getFactoryId, factoryId);
        }

        if (!applyOrderScopeFilter(wrapper, parentOrgUnitId, factoryType)) {
            return Result.success(new Page<>(page, pageSize, 0));
        }

        // 按创建时间倒序
        wrapper.orderByDesc(FinishedProductSettlement::getCreateTime);

        Page<FinishedProductSettlement> result = settlementService.page(pageObj, wrapper);
        enrichSettlementRecords(result.getRecords());
        return Result.success(result);
    }

    @Operation(summary = "根据订单号获取结算详情")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/detail/{orderNo}")
    public Result<FinishedProductSettlement> getByOrderNo(@PathVariable String orderNo) {
        TenantAssert.assertTenantContext();
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedProductSettlement::getOrderNo, orderNo);
        wrapper.eq(FinishedProductSettlement::getTenantId, UserContext.tenantId());
        FinishedProductSettlement settlement = settlementService.getOne(wrapper);

        if (settlement == null) {
            return Result.fail("未找到该订单的结算数据");
        }
        // 外发工厂账号只能查看自己工厂的结算单
        String ctxFactoryId = UserContext.factoryId();
        if (StringUtils.isNotBlank(ctxFactoryId) && !ctxFactoryId.equals(settlement.getFactoryId())) {
            return Result.fail("未找到该订单的结算数据");
        }
        enrichSettlementRecords(Collections.singletonList(settlement));
        return Result.success(settlement);
    }

    @Operation(summary = "导出成品结算数据")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String parentOrgUnitId,
            @RequestParam(required = false) String factoryType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate
    ) throws IOException {
        // 构建查询条件
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();

        com.fashion.supplychain.common.tenant.TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        wrapper.eq(FinishedProductSettlement::getTenantId, tenantId);

        if (StringUtils.isNotBlank(orderNo)) {
            wrapper.like(FinishedProductSettlement::getOrderNo, orderNo);
        }
        if (StringUtils.isNotBlank(styleNo)) {
            wrapper.like(FinishedProductSettlement::getStyleNo, styleNo);
        }
        if (StringUtils.isNotBlank(status)) {
            wrapper.eq(FinishedProductSettlement::getStatus, status);
        }
        // 排除已取消/报废的订单
        wrapper.notIn(FinishedProductSettlement::getStatus, "CANCELLED", "cancelled", "DELETED", "deleted", "scrapped", "SCRAPPED", "archived", "ARCHIVED");
        if (StringUtils.isNotBlank(startDate)) {
            LocalDateTime startDateTime = LocalDate.parse(startDate).atStartOfDay();
            wrapper.ge(FinishedProductSettlement::getCreateTime, startDateTime);
        }
        if (StringUtils.isNotBlank(endDate)) {
            LocalDateTime endDateTime = LocalDate.parse(endDate).atTime(LocalTime.MAX);
            wrapper.le(FinishedProductSettlement::getCreateTime, endDateTime);
        }

        // 外发工厂账号强制只导出自己工厂数据
        String ctxFactoryIdExport = UserContext.factoryId();
        if (StringUtils.isNotBlank(ctxFactoryIdExport)) {
            wrapper.eq(FinishedProductSettlement::getFactoryId, ctxFactoryIdExport);
        }

        if (!applyOrderScopeFilter(wrapper, parentOrgUnitId, factoryType)) {
            wrapper.in(FinishedProductSettlement::getOrderId, Collections.singletonList("__NO_MATCH__"));
        }

        wrapper.orderByDesc(FinishedProductSettlement::getCreateTime);
        wrapper.last("LIMIT 5000");

        List<FinishedProductSettlement> data = settlementService.list(wrapper);
        enrichSettlementRecords(data);

        // 导出为Excel
        byte[] excelBytes = exportService.exportToExcel(data);

        // 生成文件名
        String fileName = "成品结算汇总_" +
                         LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss")) +
                         ".xlsx";
        String encodedFileName = URLEncoder.encode(fileName, StandardCharsets.UTF_8)
                                           .replace("+", "%20");

        // 返回文件
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedFileName)
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(excelBytes);
    }

    @Operation(summary = "审批核实成品结算")
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/approve")
    public Result<?> approve(@RequestBody Map<String, String> params) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可审批结算");
        }
        String id = params.get("id");

        if (StringUtils.isBlank(id)) {
            return Result.fail("订单ID不能为空");
        }

        // 查询结算记录
        FinishedProductSettlement settlement = settlementService.getById(id);
        if (settlement == null) {
            return Result.fail("未找到该订单的结算数据");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "结算单");

        // 内部工厂结算单通过工资结算审核，禁止在成品结算页重复审核
        // factoryType 是 @TableField(exist=false)，getById 不会填充，需从关联数据推断
        String resolvedFactoryType = null;
        if (StringUtils.isNotBlank(settlement.getFactoryId())) {
            Factory factory = factoryService.getById(settlement.getFactoryId());
            if (factory != null) {
                resolvedFactoryType = factory.getFactoryType();
            }
        }
        if (resolvedFactoryType == null && StringUtils.isNotBlank(settlement.getOrderId())) {
            ProductionOrder order = productionOrderService.getById(settlement.getOrderId());
            if (order != null) {
                resolvedFactoryType = order.getFactoryType();
            }
        }
        if ("INTERNAL".equals(resolvedFactoryType)) {
            return Result.fail("内部工厂订单请在「工资结算」中审核");
        }

        Integer warehousedQty = settlement.getWarehousedQuantity();
        if (warehousedQty == null || warehousedQty <= 0) {
            return Result.fail("该订单无入库数量，无法审核");
        }

        Long tenantId = settlement.getTenantId();
        if (tenantId == null) {
            tenantId = UserContext.tenantId();
        }

        approvalStatusService.markApproved(
                id,
                tenantId,
                UserContext.userId(),
                UserContext.username()
        );

        return Result.success();
    }

    @Operation(summary = "获取审批状态")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/approval-status/{id}")
    public Result<Map<String, Object>> getApprovalStatus(@PathVariable String id) {
        Long tenantId = UserContext.tenantId();
        String status = approvalStatusService.getApprovalStatus(id, tenantId);
        Map<String, Object> result = new HashMap<>();
        result.put("id", id);
        result.put("status", status);
        return Result.success(result);
    }

    /**
     * 工厂订单汇总：按工厂聚合结算数据
     * 返回每个工厂的订单数、总件数、总金额等汇总信息
     */
    @Operation(summary = "工厂订单汇总")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/factory-summary")
    public Result<List<Map<String, Object>>> factorySummary(
            @RequestParam(required = false) String factoryName,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String factoryType
    ) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedProductSettlement::getTenantId, tenantId);

        if (StringUtils.isNotBlank(factoryName)) {
            wrapper.like(FinishedProductSettlement::getFactoryName, factoryName);
        }
        if (StringUtils.isNotBlank(status)) {
            wrapper.eq(FinishedProductSettlement::getStatus, status);
        }
        wrapper.notIn(FinishedProductSettlement::getStatus, "CANCELLED", "cancelled", "DELETED", "deleted", "scrapped", "closed", "CLOSED", "SCRAPPED", "archived", "ARCHIVED");
        if (StringUtils.isNotBlank(startDate)) {
            wrapper.ge(FinishedProductSettlement::getCreateTime,
                    LocalDate.parse(startDate).atStartOfDay());
        }
        if (StringUtils.isNotBlank(endDate)) {
            wrapper.le(FinishedProductSettlement::getCreateTime,
                    LocalDate.parse(endDate).atTime(LocalTime.MAX));
        }

        String effectiveFactoryType = StringUtils.isNotBlank(factoryType) ? factoryType : "EXTERNAL";
        if (!applyOrderScopeFilter(wrapper, null, effectiveFactoryType)) {
            return Result.success(Collections.emptyList());
        }

        String ctxFactoryIdSummary = UserContext.factoryId();
        if (StringUtils.isNotBlank(ctxFactoryIdSummary)) {
            wrapper.eq(FinishedProductSettlement::getFactoryId, ctxFactoryIdSummary);
        }

        wrapper.orderByDesc(FinishedProductSettlement::getCreateTime);
        wrapper.last("LIMIT 5000");
        List<FinishedProductSettlement> allData = settlementService.list(wrapper);

        Set<String> approvedSettlementIds = approvalStatusService.getApprovedIds(tenantId);

        Map<String, Map<String, Object>> grouped = new LinkedHashMap<>();
        for (FinishedProductSettlement item : allData) {
            boolean isApproved = StringUtils.isNotBlank(item.getOrderId())
                    && approvedSettlementIds.contains(item.getOrderId());
            if (!isApproved) {
                continue;
            }

            String fName = StringUtils.isNotBlank(item.getFactoryName())
                    ? item.getFactoryName() : "未分配工厂";
            String fId = item.getFactoryId() != null ? item.getFactoryId() : "";

            grouped.computeIfAbsent(fName, k -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("factoryId", fId);
                m.put("factoryName", k);
                m.put("orderCount", 0);
                m.put("totalOrderQuantity", 0);
                m.put("totalWarehousedQuantity", 0);
                m.put("totalDefectQuantity", 0);
                m.put("totalMaterialCost", java.math.BigDecimal.ZERO);
                m.put("totalProductionCost", java.math.BigDecimal.ZERO);
                m.put("totalAmount", java.math.BigDecimal.ZERO);
                m.put("totalProfit", java.math.BigDecimal.ZERO);
                m.put("orderNos", new ArrayList<String>());
                m.put("approvedOrderNos", new ArrayList<String>());
                return m;
            });

            Map<String, Object> row = grouped.get(fName);
            row.put("orderCount", (int) row.get("orderCount") + 1);
            row.put("totalOrderQuantity",
                    (int) row.get("totalOrderQuantity") + (item.getOrderQuantity() != null ? item.getOrderQuantity() : 0));
            row.put("totalWarehousedQuantity",
                    (int) row.get("totalWarehousedQuantity") + (item.getWarehousedQuantity() != null ? item.getWarehousedQuantity() : 0));
            row.put("totalDefectQuantity",
                    (int) row.get("totalDefectQuantity") + (item.getDefectQuantity() != null ? item.getDefectQuantity() : 0));
            row.put("totalMaterialCost",
                    ((java.math.BigDecimal) row.get("totalMaterialCost")).add(
                            item.getMaterialCost() != null ? item.getMaterialCost() : java.math.BigDecimal.ZERO));
            row.put("totalProductionCost",
                    ((java.math.BigDecimal) row.get("totalProductionCost")).add(
                            item.getProductionCost() != null ? item.getProductionCost() : java.math.BigDecimal.ZERO));
            row.put("totalAmount",
                    ((java.math.BigDecimal) row.get("totalAmount")).add(
                            item.getTotalAmount() != null ? item.getTotalAmount() : java.math.BigDecimal.ZERO));
            row.put("totalProfit",
                    ((java.math.BigDecimal) row.get("totalProfit")).add(
                            item.getProfit() != null ? item.getProfit() : java.math.BigDecimal.ZERO));
            @SuppressWarnings("unchecked")
            List<String> orderNos = (List<String>) row.get("orderNos");
            if (StringUtils.isNotBlank(item.getOrderNo())) {
                orderNos.add(item.getOrderNo());
            }
            @SuppressWarnings("unchecked")
            List<String> approvedNos = (List<String>) row.get("approvedOrderNos");
            if (StringUtils.isNotBlank(item.getOrderNo())) {
                approvedNos.add(item.getOrderNo());
            }
        }

        // 批量查询工厂类型：factoryType（INTERNAL=本厂内部/EXTERNAL=外部工厂）
        Set<String> factoryIds = new HashSet<>();
        Set<String> orderIds = new HashSet<>();
        for (Map<String, Object> row : grouped.values()) {
            String fId = (String) row.get("factoryId");
            if (StringUtils.isNotBlank(fId)) factoryIds.add(fId);
        }
        for (FinishedProductSettlement item : allData) {
            if (item != null && StringUtils.isNotBlank(item.getOrderId())) {
                orderIds.add(item.getOrderId());
            }
        }

        Map<String, ProductionOrder> orderMap = new HashMap<>();
        if (!orderIds.isEmpty()) {
            productionOrderService.listByIds(orderIds).forEach(order -> orderMap.put(order.getId(), order));
        }

        // 批量加载外发工厂实体（供 factoryType / parentOrgUnitName 查询）
        Map<String, Factory> factoryMap = factoryIds.isEmpty() ? Collections.emptyMap() :
                factoryService.listByIds(factoryIds).stream()
                        .filter(f -> StringUtils.isNotBlank(f.getId()))
                        .collect(Collectors.toMap(Factory::getId, f -> f, (a, b) -> a));

        for (Map<String, Object> row : grouped.values()) {
            String fId = (String) row.get("factoryId");
            Factory factory = StringUtils.isNotBlank(fId) ? factoryMap.get(fId) : null;

            // 优先从工厂实体取 factoryType；factoryId 为空（INTERNAL 模式）时从关联订单推断
            String resolvedType = null;
            if (factory != null && StringUtils.isNotBlank(factory.getFactoryType())) {
                resolvedType = factory.getFactoryType();
            } else if (StringUtils.isBlank(fId)) {
                // INTERNAL 订单：factory_id 为空，从 orderMap 中按 orderNo 匹配推断
                @SuppressWarnings("unchecked")
                List<String> rowOrderNos = (List<String>) row.get("orderNos");
                if (rowOrderNos != null) {
                    for (ProductionOrder order : orderMap.values()) {
                        if (rowOrderNos.contains(order.getOrderNo())
                                && StringUtils.isNotBlank(order.getFactoryType())) {
                            resolvedType = order.getFactoryType();
                            break;
                        }
                    }
                }
            }
            row.put("factoryType", resolvedType != null ? resolvedType : "EXTERNAL");
            row.put("parentOrgUnitName", factory != null ? factory.getParentOrgUnitName() : null);
            row.put("orgPath", resolveOrgPathForFactory(row, allData, orderMap));
        }

        return Result.success(new ArrayList<>(grouped.values()));
    }

    private boolean applyOrderScopeFilter(LambdaQueryWrapper<FinishedProductSettlement> wrapper,
            String parentOrgUnitId,
            String factoryType) {
        if (StringUtils.isBlank(parentOrgUnitId) && StringUtils.isBlank(factoryType)) {
            return true;
        }

        LambdaQueryWrapper<ProductionOrder> orderWrapper = new LambdaQueryWrapper<ProductionOrder>()
                .select(ProductionOrder::getId)
                .eq(StringUtils.isNotBlank(parentOrgUnitId), ProductionOrder::getParentOrgUnitId, parentOrgUnitId)
                .and(w -> w.isNull(ProductionOrder::getDeleteFlag).or().eq(ProductionOrder::getDeleteFlag, 0));

        // INTERNAL=本厂内部(null factoryType)，EXTERNAL=外发工厂
        if ("INTERNAL".equals(factoryType)) {
            orderWrapper.and(w -> w.isNull(ProductionOrder::getFactoryType)
                    .or().eq(ProductionOrder::getFactoryType, "")
                    .or().eq(ProductionOrder::getFactoryType, "INTERNAL"));
        } else if (StringUtils.isNotBlank(factoryType)) {
            orderWrapper.eq(ProductionOrder::getFactoryType, factoryType);
        }

        // 使用 @InterceptorIgnore 方法绕过 TenantInterceptor，避免超管（tenantId=null）被注入
        // AND tenant_id IS NULL 而导致查不到任何业务订单。租户隔离由 orderWrapper 中
        // 的 eq(TenantId, tenantId) 条件（普通用户分支）保证；超管有权看所有租户数据。
        Long tenantId = UserContext.tenantId();
        if (tenantId != null) {
            orderWrapper.eq(ProductionOrder::getTenantId, tenantId);
        }
        List<String> orderIds = productionOrderMapper.listForFinanceScope(orderWrapper).stream()
                .map(ProductionOrder::getId)
                .filter(StringUtils::isNotBlank)
                .collect(Collectors.toList());

        if (orderIds.isEmpty()) {
            return false;
        }
        wrapper.in(FinishedProductSettlement::getOrderId, orderIds);
        return true;
    }

    private void enrichSettlementRecords(List<FinishedProductSettlement> records) {
        if (records == null || records.isEmpty()) {
            return;
        }

        Long tenantId = UserContext.tenantId();
        Set<String> approvedIds = approvalStatusService.getApprovedIds(tenantId);

        Set<String> orderIds = records.stream()
                .map(FinishedProductSettlement::getOrderId)
                .filter(StringUtils::isNotBlank)
                .collect(Collectors.toSet());
        Map<String, ProductionOrder> orderMap = new HashMap<>();
        if (!orderIds.isEmpty()) {
            productionOrderService.listByIds(orderIds).forEach(order -> orderMap.put(order.getId(), order));
        }

        Set<String> factoryIds = records.stream()
                .map(FinishedProductSettlement::getFactoryId)
                .filter(StringUtils::isNotBlank)
                .collect(Collectors.toSet());
        Map<String, Factory> factoryMap = new HashMap<>();
        if (!factoryIds.isEmpty()) {
            factoryService.listByIds(factoryIds).forEach(factory -> factoryMap.put(factory.getId(), factory));
        }

        for (FinishedProductSettlement record : records) {
            ProductionOrder order = orderMap.get(record.getOrderId());
            Factory factory = factoryMap.get(record.getFactoryId());
            record.setFactoryType(StringUtils.isNotBlank(order != null ? order.getFactoryType() : null)
                    ? order.getFactoryType()
                    : factory != null ? factory.getFactoryType() : null);
            record.setParentOrgUnitId(StringUtils.isNotBlank(order != null ? order.getParentOrgUnitId() : null)
                ? order.getParentOrgUnitId()
                : factory != null ? factory.getParentOrgUnitId() : null);
            record.setParentOrgUnitName(StringUtils.isNotBlank(order != null ? order.getParentOrgUnitName() : null)
                    ? order.getParentOrgUnitName()
                    : factory != null ? factory.getParentOrgUnitName() : null);
            record.setOrgPath(StringUtils.isNotBlank(order != null ? order.getOrgPath() : null)
                    ? order.getOrgPath()
                    : factory != null ? factory.getOrgPath() : null);
            record.setApprovalStatus(approvedIds.contains(record.getOrderId()) ? "APPROVED" : "PENDING");
            applyLockedOrderPrice(record, order);
        }
    }

    private void applyLockedOrderPrice(FinishedProductSettlement record, ProductionOrder order) {
        if (record == null || order == null) {
            return;
        }
        BigDecimal lockedUnitPrice = OrderPricingSnapshotUtils.resolveLockedOrderUnitPrice(
                order.getFactoryUnitPrice(),
                order.getOrderDetails());
        if (lockedUnitPrice.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        int warehousedQty = record.getWarehousedQuantity() != null ? record.getWarehousedQuantity() : 0;
        if (warehousedQty <= 0) {
            record.setStyleFinalPrice(lockedUnitPrice.setScale(2, RoundingMode.HALF_UP));
            record.setTotalAmount(BigDecimal.ZERO);
            record.setProfit(BigDecimal.ZERO);
            record.setProfitMargin(BigDecimal.ZERO);
            return;
        }
        BigDecimal totalAmount = lockedUnitPrice.multiply(BigDecimal.valueOf(warehousedQty)).setScale(2, RoundingMode.HALF_UP);
        BigDecimal materialCost = record.getMaterialCost() == null ? BigDecimal.ZERO : record.getMaterialCost();
        BigDecimal productionCost = record.getProductionCost() == null ? BigDecimal.ZERO : record.getProductionCost();
        BigDecimal defectLoss = record.getDefectLoss() == null ? BigDecimal.ZERO : record.getDefectLoss();
        BigDecimal totalCost = materialCost.add(productionCost).add(defectLoss).setScale(2, RoundingMode.HALF_UP);
        BigDecimal profit = totalAmount.subtract(totalCost).setScale(2, RoundingMode.HALF_UP);
        BigDecimal margin = totalAmount.compareTo(BigDecimal.ZERO) > 0
                ? profit.multiply(BigDecimal.valueOf(100)).divide(totalAmount, 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        record.setStyleFinalPrice(lockedUnitPrice.setScale(2, RoundingMode.HALF_UP));
        record.setTotalAmount(totalAmount);
        record.setProfit(profit);
        record.setProfitMargin(margin);
    }

    private String resolveOrgPathForFactory(Map<String, Object> row, List<FinishedProductSettlement> allData,
            Map<String, ProductionOrder> orderMap) {
        @SuppressWarnings("unchecked")
        List<String> orderNos = (List<String>) row.get("orderNos");
        if (orderNos == null || orderNos.isEmpty()) {
            return null;
        }
        for (FinishedProductSettlement item : allData) {
            if (item == null || !orderNos.contains(item.getOrderNo())) {
                continue;
            }
            ProductionOrder order = orderMap.get(item.getOrderId());
            if (order == null) {
                continue;
            }
            if (StringUtils.isBlank((String) row.get("parentOrgUnitName")) && StringUtils.isNotBlank(order.getParentOrgUnitName())) {
                row.put("parentOrgUnitName", order.getParentOrgUnitName());
            }
            if (StringUtils.isNotBlank(order.getOrgPath())) {
                return order.getOrgPath();
            }
        }
        return null;
    }

    @Operation(summary = "取消成品结算单")
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/cancel")
    public Result<Void> cancel(@PathVariable String id) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可取消结算单");
        }
        TenantAssert.assertTenantContext();
        if (StringUtils.isBlank(id)) {
            return Result.fail("结算单ID不能为空");
        }
        FinishedProductSettlement settlement = settlementService.getById(id.trim());
        if (settlement == null) {
            return Result.fail("未找到该结算单");
        }
        TenantAssert.assertBelongsToCurrentTenant(settlement.getTenantId(), "结算单");

        String currentStatus = settlement.getStatus();
        if ("cancelled".equalsIgnoreCase(currentStatus) || "CANCELLED".equals(currentStatus)) {
            return Result.fail("该结算单已取消，无需重复操作");
        }

        FinishedProductSettlement patch = new FinishedProductSettlement();
        patch.setOrderId(settlement.getOrderId());
        patch.setStatus("cancelled");
        patch.setUpdateTime(LocalDateTime.now());
        settlementService.updateById(patch);

        return Result.success(null);
    }
}
