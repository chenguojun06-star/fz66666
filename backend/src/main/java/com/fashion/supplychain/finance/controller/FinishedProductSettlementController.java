package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.service.FinishedProductSettlementService;
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
import java.util.List;

/**
 * 成品结算控制器
 */
@Tag(name = "成品结算管理")
@RestController
@RequestMapping("/api/finance/finished-settlement")
@RequiredArgsConstructor
public class FinishedProductSettlementController {

    private final FinishedProductSettlementService settlementService;
    private final FinishedProductSettlementExportService exportService;

    @Operation(summary = "分页查询成品结算列表")
    @GetMapping("/page")
    @PreAuthorize("hasAuthority('FINANCE_SETTLEMENT_VIEW')")
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
    @PreAuthorize("hasAuthority('FINANCE_SETTLEMENT_VIEW')")
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
    @PreAuthorize("hasAuthority('FINANCE_SETTLEMENT_VIEW')")
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
}
