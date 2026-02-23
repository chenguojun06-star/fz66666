package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.orchestration.StyleInfoOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/**
 * 款号资料Controller
 */
@RestController
@RequestMapping("/api/style/info")
@PreAuthorize("isAuthenticated()")
public class StyleInfoController {

    @Autowired
    private StyleInfoOrchestrator styleInfoOrchestrator;

    /**
     * 分页查询款号资料列表
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<StyleInfo> page = styleInfoOrchestrator.list(params);
        return Result.success(page);
    }

    /**
     * 获取样衣开发费用统计
     */
    @GetMapping("/development-stats")
    public Result<?> getDevelopmentStats(@RequestParam(defaultValue = "day") String rangeType) {
        return Result.success(styleInfoOrchestrator.getDevelopmentStats(rangeType));
    }

    /**
     * 根据ID查询款号资料详情
     */
    @GetMapping("/{id}")
    public Result<?> detail(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.detail(id));
    }

    /**
     * 新增款号资料
     */
    @PostMapping
    @PreAuthorize("hasAuthority('STYLE_CREATE')")
    public Result<?> save(@RequestBody StyleInfo styleInfo) {
        styleInfoOrchestrator.save(styleInfo);
        return Result.success(styleInfo);
    }

    /**
     * 更新款号资料
     */
    @PutMapping
    public Result<?> update(@RequestBody StyleInfo styleInfo) {
        styleInfoOrchestrator.update(styleInfo);
        return Result.successMessage("操作成功");
    }

    @PutMapping("/{id}/production-requirements")
    public Result<?> updateProductionRequirements(@PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.updateProductionRequirements(id, body));
    }

    @PostMapping("/{id}/production-requirements/rollback")
    public Result<?> rollbackProductionRequirements(@PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.rollbackProductionRequirements(id, body));
    }

    /**
     * 统一的阶段操作端点（替代14个分散端点）
     *
     * @param id 款式ID
     * @param stage 阶段：pattern/sample/bom/process/secondary
     * @param action 操作：start/complete/reset/progress/skip
     * @param body 可选参数（用于progress和reset）
     * @return 操作结果
     */
    @PostMapping("/{id}/stage-action")
    public Result<?> stageAction(
            @PathVariable Long id,
            @RequestParam String stage,
            @RequestParam String action,
            @RequestBody(required = false) Map<String, Object> body) {

        // 智能路由到对应的Orchestrator方法
        switch (stage.toLowerCase()) {
            case "pattern":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startPattern(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completePattern(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetPattern(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "sample":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startSample(id));
                    case "progress": return Result.success(styleInfoOrchestrator.updateSampleProgress(id, body));
                    case "complete": return Result.success(styleInfoOrchestrator.completeSample(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetSample(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "bom":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startBom(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeBom(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetBom(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "process":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startProcess(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeProcess(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetProcess(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "size-price":
            case "sizeprice":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startSizePrice(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeSizePrice(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetSizePrice(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "secondary":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startSecondary(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeSecondary(id));
                    case "skip": return Result.success(styleInfoOrchestrator.skipSecondary(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetSecondary(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "size":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startSize(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeSize(id));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "production":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startProductionStage(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeProductionStage(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetProductionStage(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            default:
                return Result.fail("不支持的阶段: " + stage);
        }
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=pattern&action=start
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/pattern/start")
    public Result<?> startPattern(@PathVariable Long id) {
        return stageAction(id, "pattern", "start", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=pattern&action=complete
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/pattern/complete")
    public Result<?> completePattern(@PathVariable Long id) {
        return stageAction(id, "pattern", "complete", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=pattern&action=reset
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/pattern/reset")
    public Result<?> resetPattern(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return stageAction(id, "pattern", "reset", body);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=sample&action=start
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/sample/start")
    public Result<?> startSample(@PathVariable Long id) {
        return stageAction(id, "sample", "start", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=sample&action=progress
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/sample/progress")
    public Result<?> updateSampleProgress(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return stageAction(id, "sample", "progress", body);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=sample&action=complete
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/sample/complete")
    public Result<?> completeSample(@PathVariable Long id) {
        return stageAction(id, "sample", "complete", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=sample&action=reset
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/sample/reset")
    public Result<?> resetSample(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return stageAction(id, "sample", "reset", body);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=bom&action=start
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/bom/start")
    public Result<?> startBom(@PathVariable Long id) {
        return stageAction(id, "bom", "start", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=bom&action=complete
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/bom/complete")
    public Result<?> completeBom(@PathVariable Long id) {
        return stageAction(id, "bom", "complete", null);
    }

    /**
     * 开始配置尺寸表
     * @deprecated 请使用 POST /{id}/stage-action?stage=size&action=start
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/size/start")
    public Result<?> startSize(@PathVariable Long id) {
        return stageAction(id, "size", "start", null);
    }

    /**
     * 完成尺寸表配置
     * @deprecated 请使用 POST /{id}/stage-action?stage=size&action=complete
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/size/complete")
    public Result<?> completeSize(@PathVariable Long id) {
        return stageAction(id, "size", "complete", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=process&action=start
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/process/start")
    public Result<?> startProcess(@PathVariable Long id) {
        return stageAction(id, "process", "start", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=process&action=complete
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/process/complete")
    public Result<?> completeProcess(@PathVariable Long id) {
        return stageAction(id, "process", "complete", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=secondary&action=start
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/secondary/start")
    public Result<?> startSecondary(@PathVariable Long id) {
        return stageAction(id, "secondary", "start", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=secondary&action=complete
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/secondary/complete")
    public Result<?> completeSecondary(@PathVariable Long id) {
        return stageAction(id, "secondary", "complete", null);
    }

    /**
     * @deprecated 请使用 POST /{id}/stage-action?stage=secondary&action=skip
     * 将在 2026-05-01 移除
     */
    @Deprecated
    @PostMapping("/{id}/secondary/skip")
    public Result<?> skipSecondary(@PathVariable Long id) {
        return stageAction(id, "secondary", "skip", null);
    }

    /**
     * 检查生产要求是否被锁定（是否被订单引用）
     */
    @GetMapping("/{id}/production-req/lock")
    public Result<?> checkProductionReqLock(@PathVariable Long id) {
        boolean locked = styleInfoOrchestrator.isProductionReqLocked(id);
        return Result.success(Map.of("locked", locked));
    }

    /** 工序单价退回维护（主管权限） */
    @PostMapping("/{id}/process/reset")
    public Result<?> resetProcess(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return stageAction(id, "process", "reset", body);
    }

    /** 码数单价开始 */
    @PostMapping("/{id}/size-price/start")
    public Result<?> startSizePrice(@PathVariable Long id) {
        return stageAction(id, "size-price", "start", null);
    }

    /** 码数单价完成 */
    @PostMapping("/{id}/size-price/complete")
    public Result<?> completeSizePrice(@PathVariable Long id) {
        return stageAction(id, "size-price", "complete", null);
    }

    /** 码数单价退回维护（主管权限） */
    @PostMapping("/{id}/size-price/reset")
    public Result<?> resetSizePrice(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return stageAction(id, "size-price", "reset", body);
    }

    /**
     * 根据ID删除款号资料
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('STYLE_DELETE')")
    public Result<?> delete(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.delete(id));
    }
}
