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

    /**
     * 保存样衣审核结论（评语选填）
     * 调用方式：POST /api/style/info/{id}/sample-review
     * Body：{ "reviewStatus": "PASS|REWORK|REJECT", "reviewComment": "..." }
     */
    @PostMapping("/{id}/sample-review")
    public Result<?> saveSampleReview(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        String reviewStatus  = body != null ? (String) body.get("reviewStatus")  : null;
        String reviewComment = body != null ? (String) body.get("reviewComment") : null;
        return Result.success(styleInfoOrchestrator.saveSampleReview(id, reviewStatus, reviewComment));
    }
}
