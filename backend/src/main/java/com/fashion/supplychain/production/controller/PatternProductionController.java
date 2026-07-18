package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.dto.PatternDevelopmentStatsDTO;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.PatternScanRecord;
import com.fashion.supplychain.production.orchestration.PatternProductionOrchestrator;
import com.fashion.supplychain.production.service.PatternProductionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 样板生产控制器
 * <p>
 * 写操作委托给 PatternProductionOrchestrator，Controller 仅负责参数校验与返回包装
 */
@RestController
@RequestMapping("/api/production/pattern")
@Slf4j
@PreAuthorize("isAuthenticated()")
public class PatternProductionController {

    @Autowired
    private PatternProductionService patternProductionService;

    @Autowired
    private PatternProductionOrchestrator patternProductionOrchestrator;

    @Autowired
    private com.fashion.supplychain.production.service.PatternScanRecordService patternScanRecordService;

    @Autowired
    private com.fashion.supplychain.production.helper.PatternEnrichmentHelper patternEnrichmentHelper;

    /**
     * 获取样衣开发费用统计
     */
    @GetMapping("/development-stats")
    public Result<PatternDevelopmentStatsDTO> getDevelopmentStats(
            @RequestParam(defaultValue = "day") String rangeType) {
        try {
            PatternDevelopmentStatsDTO stats = patternProductionService.getDevelopmentStats(rangeType);
            return Result.success(stats);
        } catch (Exception e) {
            log.error("获取样衣开发费用统计失败", e);
            return Result.fail("获取统计失败: " + e.getMessage());
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
     * 根据款式ID获取纸样生产记录
     */
    @GetMapping("/by-style/{styleId}")
    public Result<Map<String, Object>> getByStyleId(@PathVariable String styleId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        LambdaQueryWrapper<PatternProduction> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternProduction::getTenantId, tenantId)
                .eq(PatternProduction::getStyleId, styleId)
                .eq(PatternProduction::getDeleteFlag, 0)
                .orderByDesc(PatternProduction::getCreateTime)
                .last("LIMIT 1");
        PatternProduction record = patternProductionService.getOne(wrapper);
        if (record == null) {
            return Result.success(null);
        }
        return Result.success(patternEnrichmentHelper.enrichRecord(record));
    }

    /**
     * 获取单条记录详情
     */
    @GetMapping("/{id}")
    public Result<Map<String, Object>> getById(@PathVariable String id) {
        PatternProduction record = patternProductionService.getById(id);
        if (record == null || record.getDeleteFlag() == 1) {
            return Result.fail("记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(record.getTenantId(), "纸样");
        return Result.success(patternEnrichmentHelper.enrichRecord(record));
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
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("获取样衣工序配置失败: id={}", id, e);
            return Result.fail("获取工序配置失败");
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
        PatternProduction pattern = patternProductionService.getById(id);
        if (pattern == null || pattern.getDeleteFlag() == 1) {
            return Result.fail("样板生产记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(pattern.getTenantId(), "样衣");

        LambdaQueryWrapper<PatternScanRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternScanRecord::getPatternProductionId, id)
                .eq(PatternScanRecord::getDeleteFlag, 0)
                .eq(PatternScanRecord::getTenantId, UserContext.tenantId())
                .orderByAsc(PatternScanRecord::getScanTime)
                .orderByAsc(PatternScanRecord::getCreateTime)
                .last("LIMIT 5000");

        List<PatternScanRecord> records = patternScanRecordService.list(wrapper);
        DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
        List<Map<String, Object>> result = records.stream().map(r -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", r.getId());
            item.put("patternProductionId", r.getPatternProductionId());
            item.put("styleId", r.getStyleId());
            item.put("styleNo", r.getStyleNo());
            item.put("styleName", r.getStyleName());
            item.put("color", r.getColor());
            item.put("size", r.getSize());
            item.put("quantity", r.getQuantity());
            item.put("operationType", r.getOperationType());
            item.put("processName", r.getProcessName());
            item.put("progressStage", r.getProgressStage());
            item.put("processCode", r.getProcessCode());
            item.put("operatorId", r.getOperatorId());
            item.put("operatorName", r.getOperatorName());
            item.put("operatorRole", r.getOperatorRole());
            item.put("warehouseCode", r.getWarehouseCode());
            item.put("warehouseAreaId", r.getWarehouseAreaId());
            item.put("warehouseLocationCode", r.getWarehouseLocationCode());
            item.put("remark", r.getRemark());
            item.put("scanTime", r.getScanTime() != null ? r.getScanTime().format(fmt) : null);
            return item;
        }).collect(Collectors.toList());

        return Result.success(result);
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
                case "receive":
                    String receiveMsg = patternProductionOrchestrator.receivePattern(id, request);
                    return Result.success(receiveMsg);
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
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("工作流操作失败: id={}, action={}", id, action, e);
            return Result.fail("操作失败: " + e.getMessage());
        }
    }

    /**
     * 领取样板（纸样师傅领取）
     */
    @PostMapping("/{id}/receive")
    public Result<String> receive(
            @PathVariable String id,
            @RequestBody(required = false) Map<String, Object> params) {
        try {
            String msg = patternProductionOrchestrator.receivePattern(id, params);
            return Result.success(msg);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        }
    }

    @PostMapping("/{id}/complete")
    public Result<Map<String, Object>> completeByTask(@PathVariable String id) {
        try {
            Map<String, Object> result = patternProductionOrchestrator.completeByTask(id);
            return Result.success(result);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
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
            return Result.fail(e.getMessage());
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
            return Result.fail(e.getMessage());
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
            return Result.fail(e.getMessage());
        }
    }

    // ==================== 扫码记录相关API ====================

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
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("样板生产扫码失败", e);
            return Result.fail("扫码失败: " + e.getMessage());
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
            String operatorId = UserContext.userId();
            if (!StringUtils.hasText(operatorId)) {
                return Result.success(java.util.List.of());
            }

            LambdaQueryWrapper<PatternScanRecord> wrapper = new LambdaQueryWrapper<>();
            wrapper.eq(PatternScanRecord::getOperatorId, operatorId)
                    .eq(PatternScanRecord::getDeleteFlag, 0)
                    .eq(PatternScanRecord::getTenantId, UserContext.tenantId());

            DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            if (StringUtils.hasText(startTime)) {
                wrapper.ge(PatternScanRecord::getScanTime, LocalDateTime.parse(startTime, fmt));
            }
            if (StringUtils.hasText(endTime)) {
                wrapper.le(PatternScanRecord::getScanTime, LocalDateTime.parse(endTime, fmt));
            }
            wrapper.orderByDesc(PatternScanRecord::getScanTime);
            wrapper.last("LIMIT 5000");
            List<PatternScanRecord> records = patternScanRecordService.list(wrapper);

            java.util.Set<String> patternProductionIds = records.stream()
                    .map(PatternScanRecord::getPatternProductionId)
                    .filter(StringUtils::hasText)
                    .collect(java.util.stream.Collectors.toSet());

            java.util.Map<String, PatternProduction> productionMap = new HashMap<>();
            if (!patternProductionIds.isEmpty()) {
                patternProductionService.listByIds(patternProductionIds).forEach(p ->
                        productionMap.put(p.getId(), p));
            }

            List<Map<String, Object>> result = records.stream().map(r -> {
                Map<String, Object> item = new HashMap<>();
                item.put("id", r.getId());
                item.put("scanType", "pattern");
                item.put("scanResult", "success");
                item.put("operationType", r.getOperationType());

                // 工序名优先用记录自身字段；如果 processName 为空再兜底为 operationType
                String name = StringUtils.hasText(r.getProcessName()) ? r.getProcessName()
                        : (StringUtils.hasText(r.getOperationType()) ? r.getOperationType() : _patternOperationLabel(r.getOperationType()));
                item.put("processName", name);
                item.put("progressStage", StringUtils.hasText(r.getProgressStage()) ? r.getProgressStage() : name);

                item.put("operatorName", r.getOperatorName());
                item.put("operatorId", r.getOperatorId());
                item.put("styleId", r.getStyleId());
                item.put("styleNo", r.getStyleNo());
                item.put("styleName", r.getStyleName());
                item.put("color", r.getColor());
                item.put("size", r.getSize());
                item.put("warehouseCode", r.getWarehouseCode());
                item.put("remark", r.getRemark());
                item.put("scanTime", r.getScanTime() != null
                        ? r.getScanTime().format(fmt) : null);

                PatternProduction pp = r.getPatternProductionId() != null
                        ? productionMap.get(r.getPatternProductionId()) : null;
                // 数量优先使用记录自身字段；如果记录没有设置则用样衣表的数量
                int qty = (r.getQuantity() != null && r.getQuantity() > 0)
                        ? r.getQuantity()
                        : ((pp != null && pp.getQuantity() != null) ? pp.getQuantity() : 1);
                item.put("quantity", qty);
                item.put("unitPrice", null);
                item.put("patternProductionId", r.getPatternProductionId());
                item.put("orderId", pp != null ? pp.getId() : null);
                item.put("orderNo", r.getStyleNo());
                return item;
            }).collect(Collectors.toList());

            return Result.success(result);
        } catch (Exception e) {
            log.error("获取样板扫码历史失败", e);
            return Result.fail("获取失败: " + e.getMessage());
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
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("撤销样衣扫码记录失败: patternId={} scanRecordId={}", patternId, scanRecordId, e);
            return Result.fail("撤销失败: " + e.getMessage());
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
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("更新样板基本信息失败: id={}", id, e);
            return Result.fail("更新失败: " + e.getMessage());
        }
    }

    /**
     * 指派样板生产给指定人员
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
            patternProductionOrchestrator.assignPattern(patternId, assignee);
            return Result.success("指派成功");
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("指派失败: patternId={}", patternId, e);
            return Result.fail("指派失败: " + e.getMessage());
        }
    }

    private String _patternOperationLabel(String operationType) {
        if (operationType == null) return "样衣操作";
        switch (operationType) {
            case "RECEIVE":          return "领取样板";
            case "PLATE":            return "车板扫码";
            case "FOLLOW_UP":        return "跟单确认";
            case "COMPLETE":         return "完成确认";
            case "WAREHOUSE_IN":     return "样衣入库";
            case "WAREHOUSE_OUT":    return "样衣出库";
            case "WAREHOUSE_RETURN": return "样衣归还";
            default:                 return "样衣操作";
        }
    }

}
