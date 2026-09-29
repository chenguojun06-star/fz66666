package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.dto.PatternDevelopmentStatsDTO;
import com.fashion.supplychain.production.orchestration.PatternProductionOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 样板生产控制器
 * <p>
 * 全部端点委托给 {@link PatternProductionOrchestrator}，Controller 仅负责参数校验、
 * 权限短路与返回包装。
 * <p>
 * D-651：原类直接注入了 5 个 Service（PatternProductionService / PatternScanRecordService /
 * ProductionOrderService / StyleInfoService / StyleAttachmentService），违反 ArchUnit 规则6
 * 「Controller 不得直接依赖多个 Service」，已全部下沉到编排层 —— 该编排器本已持有其中 3 个，
 * 仅新增 ProductionOrderService / CuttingWorkflowBuilderHelper / StyleAttachmentService。
 * 现计数 Service = 0。
 */
@RestController
@RequestMapping("/api/production/pattern")
@Slf4j
@PreAuthorize("isAuthenticated()")
public class PatternProductionController {

    @Autowired
    private PatternProductionOrchestrator patternProductionOrchestrator;

    /**
     * 获取样衣开发费用统计
     */
    @GetMapping("/development-stats")
    public Result<PatternDevelopmentStatsDTO> getDevelopmentStats(
            @RequestParam(defaultValue = "day") String rangeType) {
        try {
            PatternDevelopmentStatsDTO stats = patternProductionOrchestrator.getDevelopmentStats(rangeType);
            return Result.success(stats);
        } catch (Exception e) {
            log.error("获取样衣开发费用统计失败", e);
            throw new BusinessException("获取统计失败: " + e.getMessage(), e);
        }
    }

    /**
     * 样衣开发统计（与 PC 端 StyleInfoList activeStyles 逻辑一致）
     * 返回：activeCount（开发中）/ completedCount（已完成）/ overdueCount（已延期）/ warningCount（临近交期）
     */
    @GetMapping("/sample-stats")
    public Result<Map<String, Object>> sampleStats() {
        if (DataPermissionHelper.isFactoryAccount()) {
            return Result.success(Map.of("activeCount", 0, "completedCount", 0, "overdueCount", 0, "warningCount", 0));
        }
        return Result.success(patternProductionOrchestrator.calcSampleStats());
    }

    /**
     * 分页查询样板生产记录（丰富关联数据）
     */
    @GetMapping("/list")
    public Result<Map<String, Object>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        if (DataPermissionHelper.isFactoryAccount()) {
            return Result.success(Map.of("records", java.util.List.of(), "total", 0, "page", page, "size", size));
        }
        Map<String, Object> result = patternProductionOrchestrator.listWithEnrichment(
                page, size, keyword, status, startDate, endDate);
        return Result.success(result);
    }

    /**
     * 根据款式ID获取纸样生产记录（多色多码：返回该款式全部色码记录列表）
     * 兼容：只有 1 条记录时也返回数组，由前端适配
     */
    @GetMapping("/by-style/{styleId}")
    public Result<List<Map<String, Object>>> getByStyleId(@PathVariable String styleId) {
        return Result.success(patternProductionOrchestrator.listByStyleId(styleId));
    }

    /**
     * 获取单条记录详情
     */
    @GetMapping("/{id}")
    public Result<Map<String, Object>> getById(@PathVariable String id) {
        Map<String, Object> detail = patternProductionOrchestrator.getRecordDetailOrNull(id);
        if (detail == null) {
            return Result.fail("记录不存在");
        }
        return Result.success(detail);
    }

    /**
     * 创建样衣生产订单（统一到大货订单体系）
     * sourceBizType=SAMPLE，复用大货的工序跟进、预算天数、扫码、入库全流程
     */
    @PostMapping("/create-sample-order")
    public Result<Map<String, Object>> createSampleOrder(@RequestBody Map<String, Object> request) {
        String styleId = request.get("styleId") != null ? String.valueOf(request.get("styleId")).trim() : null;
        if (!StringUtils.hasText(styleId)) {
            return Result.fail("样衣ID不能为空");
        }
        return patternProductionOrchestrator.createSampleOrderFromStyle(styleId);
    }

    /**
     * 获取样衣动态工序配置（对齐大货动态工序）
     */
    @GetMapping("/{id}/process-config")
    public Result<List<Map<String, Object>>> getProcessConfig(@PathVariable String id) {
        try {
            List<Map<String, Object>> config = patternProductionOrchestrator.getPatternProcessConfig(id);
            return Result.success(config);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(e.getMessage(), e);
        } catch (Exception e) {
            log.error("获取样衣工序配置失败: id={}", id, e);
            throw new BusinessException("获取工序配置失败", e);
        }
    }

    /**
     * 获取样板生产时间线（联表 t_pattern_scan_record 聚合各节点时间，不新增字段）。
     * <p>
     * 返回：patternId / styleNo / status / nodes / anomalies
     * <ul>
     *   <li>nodes：创建 → 领取 → 制作开始 → 制作完成 → 审核 → 入库 → 出库 → 归还（缺失节点跳过）</li>
     *   <li>每个节点附 operator 和 durationHours（与上一节点时间差）</li>
     *   <li>anomalies：节点间隔超阈值的异常提示</li>
     * </ul>
     */
    @GetMapping("/{id}/timeline")
    public Result<Map<String, Object>> getTimeline(@PathVariable String id) {
        try {
            Map<String, Object> timeline = patternProductionOrchestrator.getPatternTimeline(id);
            return Result.success(timeline);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(e.getMessage(), e);
        } catch (Exception e) {
            log.error("获取样板时间线失败: id={}", id, e);
            throw new BusinessException("获取时间线失败: " + e.getMessage(), e);
        }
    }

    /**
     * @deprecated 样衣不再自动创建大货订单。保留端点仅作历史兼容。
     */
    @Deprecated
    @PostMapping("/{id}/create-sample-order")
    public Result<Map<String, Object>> createSampleOrder(@PathVariable String id) {
        log.warn("[Deprecated] /api/production/pattern/{}/create-sample-order 已废弃", id);
        Map<String, Object> result = new HashMap<>();
        result.put("deprecated", true);
        result.put("orderId", null);
        result.put("orderNo", null);
        result.put("patternId", id);
        result.put("message", "样衣已独立运行，不再自动创建大货订单。请到款式详情点击「推送到下单管理」后由用户手动下单。");
        return Result.success(result);
    }

    /**
     * @deprecated 样衣不再自动关联大货订单。
     */
    @Deprecated
    @GetMapping("/{id}/linked-order")
    public Result<Map<String, Object>> getLinkedOrder(@PathVariable String id) {
        log.warn("[Deprecated] /api/production/pattern/{}/linked-order 已废弃", id);
        Map<String, Object> data = new HashMap<>();
        data.put("linked", false);
        data.put("deprecated", true);
        data.put("message", "样衣已独立运行，不再自动关联大货订单。");
        return Result.success(data);
    }

    /**
     * 获取指定样衣的扫码记录
     */
    @GetMapping("/{id}/scan-records")
    public Result<List<Map<String, Object>>> getScanRecords(@PathVariable String id) {
        List<Map<String, Object>> records = patternProductionOrchestrator.listScanRecordsOrNull(id);
        if (records == null) {
            return Result.fail("样板生产记录不存在");
        }
        return Result.success(records);
    }

    /**
     * 统一的样板工作流操作端点
     */
    @PostMapping("/{id}/workflow-action")
    public Result<?> workflowAction(
            @PathVariable String id,
            @RequestParam String action,
            @RequestBody(required = false) Map<String, Object> request) {
        try {
            switch (action.toLowerCase()) {
                case "complete":
                    Map<String, Object> completeResult = patternProductionOrchestrator.submitScan(
                            id, "COMPLETE", "PLATE_WORKER", null, null, null, null, null, null, null, null, null, null);
                    return Result.success(completeResult);
                case "warehouse-in":
                    String remark = request != null ? (String) request.get("remark") : null;
                    String warehouseCode = request != null ? (String) request.get("warehouseCode") : null;
                    String warehouseAreaId = request != null ? (String) request.get("warehouseAreaId") : null;
                    String warehouseLocationCode = request != null ? (String) request.get("warehouseLocationCode") : null;
                    Map<String, Object> whResult = patternProductionOrchestrator.warehouseIn(
                            id, remark, warehouseCode, warehouseAreaId, warehouseLocationCode);
                    return Result.success(whResult);
                case "review":
                    String reviewResultVal = request != null ? (String) request.get("result") : null;
                    String reviewRemark = request != null ? (String) request.get("remark") : null;
                    Map<String, Object> reviewResult = patternProductionOrchestrator.reviewPattern(id, reviewResultVal, reviewRemark);
                    return Result.success(reviewResult);
                case "maintenance":
                    if (request == null || !request.containsKey("reason")) {
                        return Result.fail("请输入维护原因");
                    }
                    patternProductionOrchestrator.maintenance(id, String.valueOf(request.get("reason")));
                    return Result.success();
                default:
                    return Result.fail("不支持的操作: " + action);
            }
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new BusinessException(e.getMessage(), e);
        } catch (Exception e) {
            log.error("工作流操作失败: id={}, action={}", id, action, e);
            throw new BusinessException("操作失败: " + e.getMessage(), e);
        }
    }

    /**
     * 样衣制作完成（按钮触发，需要先有扫码记录）
     * 注意：旧的「领取样板」端点已删除 — 现在统一走工序级扫码流程
     * 工序级领取/完成/入库都通过 submitScan + 扫码二维码完成
     */
    @PostMapping("/{id}/complete")
    public Result<Map<String, Object>> completeByTask(@PathVariable String id) {
        try {
            Map<String, Object> result = patternProductionOrchestrator.completeByTask(id);
            return Result.success(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new BusinessException(e.getMessage(), e);
        }
    }

    /**
     * 更新工序进度
     */
    @PostMapping("/{id}/progress")
    public Result<String> updateProgress(
            @PathVariable String id,
            @RequestBody Map<String, Integer> progressNodes) {
        try {
            String msg = patternProductionOrchestrator.updateProgress(id, progressNodes);
            return Result.success(msg);
        } catch (Exception e) {
            throw new BusinessException(e.getMessage(), e);
        }
    }

    /**
     * 更新是否有二次工艺标志
     */
    @PostMapping("/{id}/secondary-flag")
    public Result<String> updateSecondaryFlag(
            @PathVariable String id,
            @RequestParam(defaultValue = "1") int hasSecondaryProcess) {
        try {
            patternProductionOrchestrator.updateSecondaryFlag(id, hasSecondaryProcess);
            return Result.success(hasSecondaryProcess == 1 ? "已设置有二次工艺" : "已设置无二次工艺");
        } catch (Exception e) {
            throw new BusinessException(e.getMessage(), e);
        }
    }

    /**
     * 删除记录（软删除）
     */
    @DeleteMapping("/{id}")
    public Result<String> delete(@PathVariable String id) {
        try {
            patternProductionOrchestrator.delete(id);
            return Result.success("删除成功");
        } catch (Exception e) {
            throw new BusinessException(e.getMessage(), e);
        }
    }

    // ==================== 扫码记录相关API ====================

    /**
     * D-167：软删 CLAIM 模型上线前（2026-07-01 前）的历史测试扫码记录（幂等，仅管理员）
     */
    @PostMapping("/cleanup-legacy-scans")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> cleanupLegacyScans() {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.forbidden("仅主管及以上权限可执行历史数据清理");
        }
        TenantAssert.assertTenantContext();
        return Result.success(patternProductionOrchestrator.cleanupLegacyScanRecords());
    }

    /**
     * D-174：修正样衣扫码计件工资镜像的历史脏数据（幂等，仅主管及以上）
     * 修正规则：数量虚增（计划数量→1件）/ 单价回填（工序配置价）/ 金额对齐（单价×数量）。
     * dryRun 默认 true 只读预览；确认清单无误后传 {"dryRun": false} 实际执行。
     */
    @PostMapping("/fix-scan-wage-data")
    @PreAuthorize("isAuthenticated()")
    public Result<Map<String, Object>> fixScanWageData(@RequestBody Map<String, Object> body) {
        if (!UserContext.isSupervisorOrAbove()) {
            return Result.forbidden("仅主管及以上权限可执行工资数据修正");
        }
        TenantAssert.assertTenantContext();
        boolean dryRun = true;
        if (body != null && body.get("dryRun") != null) {
            dryRun = !"false".equalsIgnoreCase(String.valueOf(body.get("dryRun")));
        }
        return Result.success(patternProductionOrchestrator.fixPatternScanWageData(dryRun));
    }

    /**
     * 提交样板生产扫码记录
     */
    @PostMapping("/scan")
    public Result<Map<String, Object>> submitScan(@RequestBody Map<String, Object> request) {
        try {
            String patternId = (String) request.get("patternId");
            String operationType = (String) request.get("operationType");
            String operatorRole = (String) request.get("operatorRole");
            String remark = (String) request.get("remark");
            String warehouseCode = request.get("warehouseCode") == null
                    ? null
                    : String.valueOf(request.get("warehouseCode"));
            String warehouseAreaId = request.get("warehouseAreaId") == null
                    ? null
                    : String.valueOf(request.get("warehouseAreaId"));
            String warehouseLocationCode = request.get("warehouseLocationCode") == null
                    ? null
                    : String.valueOf(request.get("warehouseLocationCode"));
            Integer quantity = null;
            Object quantityObj = request.get("quantity");
            if (quantityObj != null) {
                quantity = Integer.parseInt(String.valueOf(quantityObj));
            }
            java.math.BigDecimal unitPrice = null;
            Object unitPriceObj = request.get("unitPrice");
            if (unitPriceObj != null) {
                try { unitPrice = new java.math.BigDecimal(String.valueOf(unitPriceObj)); } catch (Exception e) { log.warn("[样衣扫码] 单价解析失败: unitPriceObj={}", unitPriceObj, e.getMessage()); }
            }
            // 接收前端传入的颜色/尺码，用于覆盖样板单的默认值（兜底场景：样板单未填色/码）
            String color = request.get("color") == null ? null : String.valueOf(request.get("color")).trim();
            String size = request.get("size") == null ? null : String.valueOf(request.get("size")).trim();
            // 接收前端工序系统传入的工序名/阶段（动态工序场景），为空时后端按 operationType 映射
            String processName = request.get("processName") == null ? null : String.valueOf(request.get("processName")).trim();
            String progressStage = request.get("progressStage") == null ? null : String.valueOf(request.get("progressStage")).trim();

            Map<String, Object> result = patternProductionOrchestrator.submitScan(
                    patternId, operationType, operatorRole, remark, quantity, color, size,
                    warehouseCode, warehouseAreaId, warehouseLocationCode, unitPrice,
                    processName, progressStage);
            return Result.success(result);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(e.getMessage(), e);
        } catch (Exception e) {
            log.error("样板生产扫码失败", e);
            throw new BusinessException("扫码失败: " + e.getMessage(), e);
        }
    }

    /**
     * D-380：批量提交样板生产扫码记录（多色多码一次提交，替代 N 条并发请求）
     *
     * <p>外单/亚马逊常见齐码齐色（颜色 × 码数可达上百组合），逐条提交会慢、且中途失败会出现
     * 「报了一半」。本端点把整批放进同一个事务，任一条校验失败整批回滚。
     * 入参：{patternId, operationType, operatorRole, remark, processName, progressStage,
     *        warehouseCode, warehouseAreaId, warehouseLocationCode, unitPrice,
     *        items: [{color, size, quantity}, ...]}
     */
    @PostMapping("/scan-batch")
    public Result<Map<String, Object>> submitScanBatch(@RequestBody Map<String, Object> request) {
        try {
            String patternId = (String) request.get("patternId");
            String operationType = (String) request.get("operationType");
            String operatorRole = (String) request.get("operatorRole");
            String remark = (String) request.get("remark");
            String warehouseCode = request.get("warehouseCode") == null
                    ? null : String.valueOf(request.get("warehouseCode"));
            String warehouseAreaId = request.get("warehouseAreaId") == null
                    ? null : String.valueOf(request.get("warehouseAreaId"));
            String warehouseLocationCode = request.get("warehouseLocationCode") == null
                    ? null : String.valueOf(request.get("warehouseLocationCode"));
            java.math.BigDecimal unitPrice = null;
            Object unitPriceObj = request.get("unitPrice");
            if (unitPriceObj != null) {
                try {
                    unitPrice = new java.math.BigDecimal(String.valueOf(unitPriceObj));
                } catch (Exception e) {
                    log.warn("[样衣批量扫码] 单价解析失败: unitPriceObj={}", unitPriceObj);
                }
            }
            String processName = request.get("processName") == null
                    ? null : String.valueOf(request.get("processName")).trim();
            String progressStage = request.get("progressStage") == null
                    ? null : String.valueOf(request.get("progressStage")).trim();

            java.util.List<Map<String, Object>> items = new java.util.ArrayList<>();
            Object itemsObj = request.get("items");
            if (itemsObj instanceof java.util.List) {
                for (Object o : (java.util.List<?>) itemsObj) {
                    if (o instanceof Map) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> m = (Map<String, Object>) o;
                        items.add(m);
                    }
                }
            }

            Map<String, Object> result = patternProductionOrchestrator.submitScanBatch(
                    patternId, operationType, operatorRole, remark, items,
                    warehouseCode, warehouseAreaId, warehouseLocationCode, unitPrice,
                    processName, progressStage);
            return Result.success(result);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(e.getMessage(), e);
        } catch (Exception e) {
            log.error("样板生产批量扫码失败", e);
            throw new BusinessException("批量扫码失败: " + e.getMessage(), e);
        }
    }


    /**
     * 获取当前员工的样板扫码历史
     */
    @GetMapping("/scan-records/my-history")
    public Result<List<Map<String, Object>>> myPatternScanHistory(
            @RequestParam(required = false) String startTime,
            @RequestParam(required = false) String endTime) {
        try {
            List<Map<String, Object>> result = patternProductionOrchestrator.getMyPatternScanHistory(
                    UserContext.userId(), startTime, endTime);
            return Result.success(result);
        } catch (Exception e) {
            log.error("获取样板扫码历史失败", e);
            throw new BusinessException("获取失败: " + e.getMessage(), e);
        }
    }

    /**
     * 撤销样衣扫码记录
     */
    @DeleteMapping("/{patternId}/scan-records/{scanRecordId}")
    public Result<Map<String, Object>> undoScanRecord(
            @PathVariable String patternId,
            @PathVariable String scanRecordId) {
        try {
            Map<String, Object> result = patternProductionOrchestrator.undoPatternScan(scanRecordId);
            return Result.success(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new BusinessException(e.getMessage(), e);
        } catch (Exception e) {
            log.error("撤销样衣扫码记录失败: patternId={} scanRecordId={}", patternId, scanRecordId, e);
            throw new BusinessException("撤销失败: " + e.getMessage(), e);
        }
    }

    /**
     * D-363：行级撤回——按工序行抹掉其名下全部实际记录（完成报工+领取+历史记录），
     * 状态由扫码记录推导，抹掉后行自动回到待领取。仅管理角色可调。
     */
    @PostMapping("/{patternId}/undo-process")
    public Result<Map<String, Object>> undoPatternScanRow(
            @PathVariable String patternId,
            @RequestBody Map<String, String> request) {
        try {
            String processName = request.get("processName");
            // D-382：可选颜色——多色多码时只撤回该颜色的记录；不传则撤回该工序名下全部颜色（兼容旧行为）
            String color = request.get("color");
            Map<String, Object> result = patternProductionOrchestrator.undoPatternScanRow(patternId, processName, color);
            return Result.success(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new BusinessException(e.getMessage(), e);
        } catch (Exception e) {
            log.error("行级撤回失败: patternId={} processName={}", patternId, request.get("processName"), e);
            throw new BusinessException("撤回失败: " + e.getMessage(), e);
        }
    }

    /**
     * D-384：查询某条样板记录的工序指派明细（张三 2 件 / 李四 1 件）
     */
    @GetMapping("/{patternId}/assignments")
    public Result<List<Map<String, Object>>> listProcessAssignments(@PathVariable String patternId) {
        try {
            return Result.success(patternProductionOrchestrator.listProcessAssignments(patternId));
        } catch (Exception e) {
            log.error("查询工序指派明细失败: patternId={}", patternId, e);
            throw new BusinessException("查询指派明细失败: " + e.getMessage(), e);
        }
    }

    /**
     * 编辑样衣基本信息
     */
    @PutMapping("/{id}/basic-info")
    public Result<String> updateBasicInfo(
            @PathVariable String id,
            @RequestBody Map<String, String> request) {
        try {
            String field = request.get("field");
            String value = request.get("value");
            patternProductionOrchestrator.updateBasicInfo(id, field, value);
            return Result.success("更新成功");
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new BusinessException(e.getMessage(), e);
        } catch (Exception e) {
            log.error("更新样板基本信息失败: id={}", id, e);
            throw new BusinessException("更新失败: " + e.getMessage(), e);
        }
    }

    /**
     * 指派样板生产给指定人员
     * D-P2-7：扩展接收 quantity（多色多码场景下让用户在弹窗里确认/调整数量）
     * color/size 已在 PatternProduction 表里，弹窗只读展示，不在此接口修改
     */
    @PutMapping("/{patternId}/assignee")
    public Result<String> assignPattern(
            @PathVariable String patternId,
            @RequestBody Map<String, Object> request) {
        try {
            String assignee = (String) request.get("assignee");
            if (!StringUtils.hasText(assignee)) {
                return Result.fail("指派人员不能为空");
            }
            // 数量可选：用户在弹窗里可微调（如原样板 10 件，本次只指派 5 件给该工人）
            Integer quantity = null;
            Object qtyRaw = request.get("quantity");
            if (qtyRaw != null) {
                try {
                    quantity = Integer.valueOf(String.valueOf(qtyRaw).trim());
                } catch (NumberFormatException ignored) {
                }
            }
            // D-384：接收工序名/编码——指派数量是「该工序」的固定任务量（一道工序可指派多人分工）
            String processName = request.get("processName") == null ? null : String.valueOf(request.get("processName")).trim();
            String processCode = request.get("processCode") == null ? null : String.valueOf(request.get("processCode")).trim();
            patternProductionOrchestrator.assignPattern(patternId, assignee, quantity, processName, processCode);
            return Result.success("指派成功");
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new BusinessException(e.getMessage(), e);
        } catch (Exception e) {
            log.error("指派失败: patternId={}", patternId, e);
            throw new BusinessException("指派失败: " + e.getMessage(), e);
        }
    }

}
