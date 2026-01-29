package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.orchestration.StyleInfoOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

/**
 * 款号资料Controller
 */
@RestController
@RequestMapping("/api/style/info")
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

    @PostMapping("/{id}/pattern/start")
    public Result<?> startPattern(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.startPattern(id));
    }

    @PostMapping("/{id}/pattern/complete")
    public Result<?> completePattern(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.completePattern(id));
    }

    @PostMapping("/{id}/pattern/reset")
    public Result<?> resetPattern(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.resetPattern(id, body));
    }

    @PostMapping("/{id}/sample/start")
    public Result<?> startSample(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.startSample(id));
    }

    @PostMapping("/{id}/sample/progress")
    public Result<?> updateSampleProgress(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.updateSampleProgress(id, body));
    }

    @PostMapping("/{id}/sample/complete")
    public Result<?> completeSample(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.completeSample(id));
    }

    @PostMapping("/{id}/sample/reset")
    public Result<?> resetSample(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.resetSample(id, body));
    }

    @PostMapping("/{id}/bom/start")
    public Result<?> startBom(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.startBom(id));
    }

    @PostMapping("/{id}/bom/complete")
    public Result<?> completeBom(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.completeBom(id));
    }

    @PostMapping("/{id}/process/start")
    public Result<?> startProcess(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.startProcess(id));
    }

    @PostMapping("/{id}/process/complete")
    public Result<?> completeProcess(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.completeProcess(id));
    }

    @PostMapping("/{id}/secondary/start")
    public Result<?> startSecondary(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.startSecondary(id));
    }

    @PostMapping("/{id}/secondary/complete")
    public Result<?> completeSecondary(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.completeSecondary(id));
    }

    @PostMapping("/{id}/secondary/skip")
    public Result<?> skipSecondary(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.skipSecondary(id));
    }

    /**
     * 检查生产要求是否被锁定（是否被订单引用）
     */
    @GetMapping("/{id}/production-req/lock")
    public Result<?> checkProductionReqLock(@PathVariable Long id) {
        boolean locked = styleInfoOrchestrator.isProductionReqLocked(id);
        return Result.success(Map.of("locked", locked));
    }

    /**
     * 根据ID删除款号资料
     */
    @DeleteMapping("/{id}")
    public Result<?> delete(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.delete(id));
    }
}
