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
public class StyleInfoController {

    @Autowired
    private StyleInfoOrchestrator styleInfoOrchestrator;

    /**
     * 分页查询款号资料列表
     */
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<StyleInfo> page = styleInfoOrchestrator.list(params);
        return Result.success(page);
    }

    /**
     * 获取样衣开发费用统计
     */
    @GetMapping("/development-stats")
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
    public Result<?> getDevelopmentStats(@RequestParam(defaultValue = "day") String rangeType) {
        return Result.success(styleInfoOrchestrator.getDevelopmentStats(rangeType));
    }

    /**
     * 根据ID查询款号资料详情
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
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
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> update(@RequestBody StyleInfo styleInfo) {
        styleInfoOrchestrator.update(styleInfo);
        return Result.successMessage("操作成功");
    }

    @PutMapping("/{id}/production-requirements")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> updateProductionRequirements(@PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.updateProductionRequirements(id, body));
    }

    @PostMapping("/{id}/production-requirements/rollback")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> rollbackProductionRequirements(@PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.rollbackProductionRequirements(id, body));
    }

    @PostMapping("/{id}/pattern/start")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> startPattern(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.startPattern(id));
    }

    @PostMapping("/{id}/pattern/complete")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> completePattern(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.completePattern(id));
    }

    @PostMapping("/{id}/pattern/reset")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> resetPattern(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.resetPattern(id, body));
    }

    @PostMapping("/{id}/sample/start")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> startSample(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.startSample(id));
    }

    @PostMapping("/{id}/sample/progress")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> updateSampleProgress(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.updateSampleProgress(id, body));
    }

    @PostMapping("/{id}/sample/complete")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> completeSample(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.completeSample(id));
    }

    @PostMapping("/{id}/sample/reset")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> resetSample(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.resetSample(id, body));
    }

    @PostMapping("/{id}/bom/start")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> startBom(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.startBom(id));
    }

    @PostMapping("/{id}/bom/complete")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> completeBom(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.completeBom(id));
    }

    @PostMapping("/{id}/process/start")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> startProcess(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.startProcess(id));
    }

    @PostMapping("/{id}/process/complete")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> completeProcess(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.completeProcess(id));
    }

    @PostMapping("/{id}/secondary/start")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> startSecondary(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.startSecondary(id));
    }

    @PostMapping("/{id}/secondary/complete")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> completeSecondary(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.completeSecondary(id));
    }

    @PostMapping("/{id}/secondary/skip")
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<?> skipSecondary(@PathVariable Long id) {
        return Result.success(styleInfoOrchestrator.skipSecondary(id));
    }

    /**
     * 检查生产要求是否被锁定（是否被订单引用）
     */
    @GetMapping("/{id}/production-req/lock")
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
    public Result<?> checkProductionReqLock(@PathVariable Long id) {
        boolean locked = styleInfoOrchestrator.isProductionReqLocked(id);
        return Result.success(Map.of("locked", locked));
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
