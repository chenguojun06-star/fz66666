package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
import com.fashion.supplychain.finance.service.FinishedSettlementApprovalStatusService;
import com.fashion.supplychain.finance.service.FinishedProductSettlementExportService;
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
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

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

    @Operation(summary = "分页查询成品结算列表")
    @GetMapping("/list")
    public Result<Page<FinishedProductSettlement>> page(
            @RequestParam(defaultValue = "1") Integer page,
            @RequestParam(defaultValue = "20") Integer pageSize,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate
    ) {
        Page<FinishedProductSettlement> pageObj = new Page<>(page, pageSize);
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();

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
        wrapper.notIn(FinishedProductSettlement::getStatus, "CANCELLED", "cancelled", "DELETED", "deleted", "scrapped");

        // 日期范围筛选
        if (StringUtils.isNotBlank(startDate)) {
            LocalDateTime startDateTime = LocalDate.parse(startDate).atStartOfDay();
            wrapper.ge(FinishedProductSettlement::getCreateTime, startDateTime);
        }
        if (StringUtils.isNotBlank(endDate)) {
            LocalDateTime endDateTime = LocalDate.parse(endDate).atTime(LocalTime.MAX);
            wrapper.le(FinishedProductSettlement::getCreateTime, endDateTime);
        }

        // 按创建时间倒序
        wrapper.orderByDesc(FinishedProductSettlement::getCreateTime);

        Page<FinishedProductSettlement> result = settlementService.page(pageObj, wrapper);
        return Result.success(result);
    }

    @Operation(summary = "根据订单号获取结算详情")
    @GetMapping("/detail/{orderNo}")
    public Result<FinishedProductSettlement> getByOrderNo(@PathVariable String orderNo) {
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(FinishedProductSettlement::getOrderNo, orderNo);
        FinishedProductSettlement settlement = settlementService.getOne(wrapper);

        if (settlement == null) {
            return Result.fail("未找到该订单的结算数据");
        }

        return Result.success(settlement);
    }

    @Operation(summary = "导出成品结算数据")
    @GetMapping("/export")
    public ResponseEntity<byte[]> export(
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate
    ) throws IOException {
        // 构建查询条件
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();

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
        wrapper.notIn(FinishedProductSettlement::getStatus, "CANCELLED", "cancelled", "DELETED", "deleted", "scrapped");
        if (StringUtils.isNotBlank(startDate)) {
            LocalDateTime startDateTime = LocalDate.parse(startDate).atStartOfDay();
            wrapper.ge(FinishedProductSettlement::getCreateTime, startDateTime);
        }
        if (StringUtils.isNotBlank(endDate)) {
            LocalDateTime endDateTime = LocalDate.parse(endDate).atTime(LocalTime.MAX);
            wrapper.le(FinishedProductSettlement::getCreateTime, endDateTime);
        }

        wrapper.orderByDesc(FinishedProductSettlement::getCreateTime);

        // 查询所有数据
        List<FinishedProductSettlement> data = settlementService.list(wrapper);

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
    @PostMapping("/approve")
    public Result<?> approve(@RequestBody Map<String, String> params) {
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
    @GetMapping("/factory-summary")
    public Result<List<Map<String, Object>>> factorySummary(
            @RequestParam(required = false) String factoryName,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate
    ) {
        LambdaQueryWrapper<FinishedProductSettlement> wrapper = new LambdaQueryWrapper<>();

        if (StringUtils.isNotBlank(factoryName)) {
            wrapper.like(FinishedProductSettlement::getFactoryName, factoryName);
        }
        if (StringUtils.isNotBlank(status)) {
            wrapper.eq(FinishedProductSettlement::getStatus, status);
        }
        // 排除已取消/报废的订单
        wrapper.notIn(FinishedProductSettlement::getStatus, "CANCELLED", "cancelled", "DELETED", "deleted", "scrapped");
        if (StringUtils.isNotBlank(startDate)) {
            wrapper.ge(FinishedProductSettlement::getCreateTime,
                    LocalDate.parse(startDate).atStartOfDay());
        }
        if (StringUtils.isNotBlank(endDate)) {
            wrapper.le(FinishedProductSettlement::getCreateTime,
                    LocalDate.parse(endDate).atTime(LocalTime.MAX));
        }

        wrapper.orderByDesc(FinishedProductSettlement::getCreateTime);
        List<FinishedProductSettlement> allData = settlementService.list(wrapper);

        // 按工厂聚合
        Map<String, Map<String, Object>> grouped = new LinkedHashMap<>();
        for (FinishedProductSettlement item : allData) {
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
        }

        return Result.success(new ArrayList<>(grouped.values()));
    }

    @Operation(summary = "取消成品结算单")
    @PostMapping("/{id}/cancel")
    public Result<Void> cancel(@PathVariable String id) {
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
        patch.setId(settlement.getId());
        patch.setStatus("cancelled");
        patch.setUpdateTime(LocalDateTime.now());
        settlementService.updateById(patch);

        return Result.success(null);
    }
}
