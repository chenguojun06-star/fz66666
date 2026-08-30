package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.finance.dto.DailyFlowItem;
import com.fashion.supplychain.finance.orchestration.DailyFlowOrchestrator;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * D-245：每日经营流水。
 * <p>
 * 一张大表聚合「生产扫码 / 物料采购 / 物料入库 / 物料出库 / 成品入库 / 成品出库」
 * 六类流水，按时间倒序，供对账与导出。
 */
@Tag(name = "每日经营流水")
@RestController
@RequestMapping("/api/finance/daily-flow")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class DailyFlowController {

    private final DailyFlowOrchestrator dailyFlowOrchestrator;

    @Operation(summary = "每日经营流水（生产扫码 / 物料采购 / 物料出入库 / 成品出入库）")
    @GetMapping
    public Result<List<DailyFlowItem>> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            /** 逗号分隔的业务类型，留空表示全部；可选值见 DailyFlowOrchestrator 的 T_* 常量 */
            @RequestParam(required = false) String bizTypes) {
        LocalDate end = endDate != null ? endDate : LocalDate.now();
        // 默认近 30 天
        LocalDate start = startDate != null ? startDate : end.minusDays(29);
        Set<String> types = null;
        if (bizTypes != null && !bizTypes.trim().isEmpty()) {
            types = Arrays.stream(bizTypes.split(","))
                    .map(String::trim)
                    .filter(s -> !s.isEmpty())
                    .collect(Collectors.toSet());
        }
        return Result.success(dailyFlowOrchestrator.query(start, end, types));
    }
}
