package com.fashion.supplychain.finance.controller;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import com.fashion.supplychain.finance.orchestration.SettlementOrchestrator;
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
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 成品结算控制器
 *
 * <p>全部业务逻辑（列表/详情/导出/审批/工厂汇总/财务看板/取消）委托给
 * {@link SettlementOrchestrator}，Controller 仅负责参数校验、权限短路与返回包装。
 *
 * <p>D-652：原类直接注入 6 个 Service（FinishedProductSettlementService /
 * FinishedProductSettlementExportService / FinishedSettlementApprovalStatusService /
 * FactoryService / ProductionOrderService / ShipmentReconciliationService）+ 2 个 Mapper
 * （ProductionOrderMapper / DeductionItemMapper），违反 ArchUnit 规则6 与规则1。
 * 已全部下沉，现计数 Service = 0、Mapper = 0。
 *
 * <p>⚠️ {@code /batch-approve} 的循环刻意留在 Controller：它逐条调用编排层的
 * {@link SettlementOrchestrator#approveOne(String)}，属<b>跨 Bean 调用</b>，
 * 能保证 approveOne 上的 {@code @Transactional} 通过 Spring AOP 生效；
 * 若把循环也搬进编排层，就变成同类自调用 → 事务失效。
 */
@Tag(name = "成品结算管理")
@RestController
@RequestMapping("/api/finance/finished-settlement")
@RequiredArgsConstructor
@lombok.extern.slf4j.Slf4j
@PreAuthorize("isAuthenticated()")
public class FinishedProductSettlementController {

    private final SettlementOrchestrator settlementOrchestrator;

    @Operation(summary = "分页查询成品结算列表")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/list")
    public Result<Page<FinishedProductSettlement>> page(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) String orderNo,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String parentOrgUnitId,
            @RequestParam(required = false) String factoryType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false) String factoryId
    ) {
        return Result.success(settlementOrchestrator.pageSettlements(
                page, pageSize, orderNo, styleNo, status,
                parentOrgUnitId, factoryType, startDate, endDate, factoryId));
    }

    @Operation(summary = "根据订单号获取结算详情")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/detail/{orderNo}")
    public Result<FinishedProductSettlement> getByOrderNo(@PathVariable String orderNo) {
        FinishedProductSettlement settlement = settlementOrchestrator.getDetailByOrderNoOrNull(orderNo);
        if (settlement == null) {
            return Result.fail("未找到该订单的结算数据");
        }
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
        byte[] excelBytes = settlementOrchestrator.exportToExcelBytes(
                orderNo, styleNo, status, parentOrgUnitId, factoryType, startDate, endDate);

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

        String error = settlementOrchestrator.approveOne(id);
        if (error != null) {
            return Result.fail(error);
        }
        return Result.success();
    }

    /**
     * D-471：批量审批成品结算。
     *
     * <p>原实现在前端用 {@code Promise.allSettled} 对每条记录各发一次 {@code /approve}，
     * 勾选 36 条就是 36 个并发 HTTP 请求 —— 2核4G 机器瞬时扛不住，后面的请求直接超时/500，
     * 用户看到的就是"批量审批失败"。改为一次请求在服务端循环处理：
     * 网络开销从 N 次降为 1 次，数据库访问也由服务端串行控制，不再冲击连接池。
     *
     * @param params {"ids": ["id1","id2",...]}
     * @return 成功条数 / 失败条数 / 每条失败原因
     */
    @Operation(summary = "批量审批核实成品结算")
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/batch-approve")
    public Result<Map<String, Object>> batchApprove(@RequestBody Map<String, Object> params) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可审批结算");
        }
        List<String> ids = new ArrayList<>();
        Object raw = params == null ? null : params.get("ids");
        if (raw instanceof java.util.Collection<?> coll) {
            for (Object o : coll) {
                if (o == null) {
                    continue;
                }
                String s = String.valueOf(o).trim();
                if (!s.isEmpty()) {
                    ids.add(s);
                }
            }
        }
        if (ids.isEmpty()) {
            return Result.fail("请选择要审批的订单");
        }

        int success = 0;
        List<Map<String, String>> failures = new ArrayList<>();
        for (String id : ids) {
            try {
                // 跨 Bean 调用 → approveOne 的 @Transactional 正常生效
                String error = settlementOrchestrator.approveOne(id);
                if (error == null) {
                    success++;
                } else {
                    Map<String, String> m = new HashMap<>();
                    m.put("id", id);
                    m.put("reason", error);
                    failures.add(m);
                }
            } catch (Exception e) {
                // 单条失败不影响其余记录（如租户校验抛异常）
                log.warn("[FinishedSettlement] 批量审批跳过: id={}, reason={}", id, e.getMessage());
                Map<String, String> m = new HashMap<>();
                m.put("id", id);
                m.put("reason", e.getMessage() == null ? "审批异常" : e.getMessage());
                failures.add(m);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("total", ids.size());
        result.put("successCount", success);
        result.put("failedCount", failures.size());
        result.put("failures", failures);
        return Result.success(result);
    }

    @Operation(summary = "获取审批状态")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/approval-status/{id}")
    public Result<Map<String, Object>> getApprovalStatus(@PathVariable String id) {
        Long tenantId = UserContext.tenantId();
        String status = settlementOrchestrator.getApprovalStatusOf(id, tenantId);
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
        return Result.success(settlementOrchestrator.factorySummary(
                factoryName, status, startDate, endDate, factoryType));
    }

    @Operation(summary = "取消成品结算单")
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/{id}/cancel")
    public Result<Void> cancel(@PathVariable String id) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.fail("仅主管及以上可取消结算单");
        }
        String error = settlementOrchestrator.cancelSettlementChecked(id);
        if (error != null) {
            return Result.fail(error);
        }
        return Result.success(null);
    }

    /**
     * 财务看板汇总数据
     * 返回统计卡片、趋势图、排名所需的数据
     */
    @Operation(summary = "财务看板汇总")
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/summary")
    public Result<Map<String, Object>> summary(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(required = false, defaultValue = "amount") String dimension
    ) {
        return Result.success(settlementOrchestrator.dashboardSummary(startDate, endDate, dimension));
    }
}
