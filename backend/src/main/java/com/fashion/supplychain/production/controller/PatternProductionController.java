package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.dto.PatternDevelopmentStatsDTO;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.orchestration.PatternProductionOrchestrator;
import com.fashion.supplychain.production.service.PatternProductionService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 样板生产控制器
 * <p>
 * 跨服务业务逻辑委托给 PatternProductionOrchestrator
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
        Map<String, Object> result = patternProductionOrchestrator.listWithEnrichment(
                page, size, keyword, status, startDate, endDate);
        return Result.success(result);
    }

    /**
     * 获取单条记录详情
     */
    @GetMapping("/{id}")
    public Result<PatternProduction> getById(@PathVariable String id) {
        PatternProduction record = patternProductionService.getById(id);
        if (record == null || record.getDeleteFlag() == 1) {
            return Result.fail("记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(record.getTenantId(), "纸样");
        return Result.success(record);
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
     * 统一的样板工作流操作端点（替代5个分散端点）
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
                        id, "COMPLETE", "PLATE_WORKER", null, null, null);
                    return Result.success(completeResult);
                case "warehouse-in":
                    String remark = request != null ? (String) request.get("remark") : null;
                    Map<String, Object> whResult = patternProductionOrchestrator.warehouseIn(id, remark);
                    return Result.success(whResult);
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
     * 删除记录（软删除）
     */
    @DeleteMapping("/{id}")
    public Result<String> delete(@PathVariable String id) {
        PatternProduction record = patternProductionService.getById(id);
        if (record == null) {
            return Result.fail("记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(record.getTenantId(), "纸样");

        record.setDeleteFlag(1);
        record.setUpdateBy(UserContext.username());
        record.setUpdateTime(LocalDateTime.now());
        patternProductionService.updateById(record);

        log.info("Pattern production deleted: id={}", id);
        return Result.success("删除成功");
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
            Integer quantity = null;
            Object quantityObj = request.get("quantity");
            if (quantityObj != null) {
                quantity = Integer.parseInt(String.valueOf(quantityObj));
            }

            Map<String, Object> result = patternProductionOrchestrator.submitScan(
                    patternId, operationType, operatorRole, remark, quantity, warehouseCode);
            return Result.success(result);
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("样板生产扫码失败", e);
            return Result.fail("扫码失败: " + e.getMessage());
        }
    }

    /**
     * 获取样板生产的扫码记录列表
     */
    @GetMapping("/{patternId}/scan-records")
    public Result<List<com.fashion.supplychain.production.entity.PatternScanRecord>> getScanRecords(
            @PathVariable String patternId) {
        try {
            com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<com.fashion.supplychain.production.entity.PatternScanRecord> wrapper =
                    new com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper<>();
            wrapper.eq(com.fashion.supplychain.production.entity.PatternScanRecord::getPatternProductionId, patternId)
                    .eq(com.fashion.supplychain.production.entity.PatternScanRecord::getDeleteFlag, 0)
                    .orderByDesc(com.fashion.supplychain.production.entity.PatternScanRecord::getScanTime);

            List<com.fashion.supplychain.production.entity.PatternScanRecord> records = patternScanRecordService.list(wrapper);
            return Result.success(records);
        } catch (Exception e) {
            log.error("获取样板扫码记录失败: patternId={}", patternId, e);
            return Result.fail("获取扫码记录失败");
        }
    }

    // ==================== 废弃端点（委托到 workflow-action） ====================

    /**
     * @deprecated 请使用 POST /{id}/workflow-action?action=receive
     *             将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{patternId}/receive")
    public Result<?> receivePattern(@PathVariable String patternId) {
        return workflowAction(patternId, "receive", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/workflow-action?action=complete
     *             将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{patternId}/complete")
    public Result<?> completePattern(@PathVariable String patternId) {
        return workflowAction(patternId, "complete", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/workflow-action?action=warehouse-in
     *             将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{patternId}/warehouse-in")
    public Result<?> warehouseIn(
            @PathVariable String patternId,
            @RequestBody(required = false) Map<String, Object> request) {
        return workflowAction(patternId, "warehouse-in", request);
    }

    /**
     * @deprecated 请使用 POST /{id}/workflow-action?action=maintenance
     *             将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/maintenance")
    public Result<Void> maintenance(@PathVariable String id, @RequestBody Map<String, String> request) {
        try {
            String reason = request.get("reason");
            if (!StringUtils.hasText(reason)) {
                return Result.fail("请输入维护原因");
            }
            patternProductionOrchestrator.maintenance(id, reason);
            return Result.success();
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        } catch (Exception e) {
            log.error("样板生产维护失败: id={}", id, e);
            return Result.fail("维护失败: " + e.getMessage());
        }
    }
}
