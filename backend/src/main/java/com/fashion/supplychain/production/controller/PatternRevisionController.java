package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.PatternRevision;
import com.fashion.supplychain.production.orchestration.PatternRevisionOrchestrator;
import com.fashion.supplychain.production.service.PatternRevisionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 纸样修改记录控制器
 */
@RestController
@RequestMapping("/api/pattern-revision")
@PreAuthorize("isAuthenticated()")
public class PatternRevisionController {

    @Autowired
    private PatternRevisionService patternRevisionService;

    @Autowired
    private PatternRevisionOrchestrator patternRevisionOrchestrator;

    /**
     * 分页查询
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();

        int page = Integer.parseInt(String.valueOf(params.getOrDefault("page", 1)));
        int pageSize = Integer.parseInt(String.valueOf(params.getOrDefault("pageSize", 10)));

        String styleId = String.valueOf(params.getOrDefault("styleId", "")).trim();
        String styleNo = String.valueOf(params.getOrDefault("styleNo", "")).trim();
        String status = String.valueOf(params.getOrDefault("status", "")).trim();
        String revisionType = String.valueOf(params.getOrDefault("revisionType", "")).trim();
        String maintainerName = String.valueOf(params.getOrDefault("maintainerName", "")).trim();

        LambdaQueryWrapper<PatternRevision> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PatternRevision::getTenantId, tenantId)
                .eq(StringUtils.hasText(styleId), PatternRevision::getStyleId, styleId)
                .like(StringUtils.hasText(styleNo), PatternRevision::getStyleNo, styleNo)
                .eq(StringUtils.hasText(status), PatternRevision::getStatus, status)
                .eq(StringUtils.hasText(revisionType), PatternRevision::getRevisionType, revisionType)
                .like(StringUtils.hasText(maintainerName), PatternRevision::getMaintainerName, maintainerName)
                .orderByDesc(PatternRevision::getCreateTime);

        IPage<PatternRevision> result = patternRevisionService.page(new Page<>(page, pageSize), wrapper);
        return Result.success(result);
    }

    /**
     * 根据款式ID查询最新纸样修订记录
     */
    @GetMapping("/by-style/{styleId}")
    public Result<?> getByStyleId(@PathVariable String styleId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        PatternRevision revision = patternRevisionService.lambdaQuery()
                .eq(PatternRevision::getStyleId, styleId)
                .eq(PatternRevision::getTenantId, tenantId)
                .orderByDesc(PatternRevision::getCreateTime)
                .last("LIMIT 1")
                .one();
        return Result.success(revision);
    }

    /**
     * 查询详情
     */
    @GetMapping("/{id}")
    public Result<?> detail(@PathVariable String id) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        PatternRevision revision = patternRevisionService.lambdaQuery()
                .eq(PatternRevision::getId, id)
                .eq(PatternRevision::getTenantId, tenantId)
                .one();
        if (revision == null) {
            return Result.fail("记录不存在");
        }
        return Result.success(revision);
    }

    /**
     * 创建记录
     */
    @PostMapping
    public Result<?> create(@RequestBody PatternRevision revision) {
        try {
            Map<String, Object> result = patternRevisionOrchestrator.create(revision);
            return Result.success(result);
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 更新记录
     */
    @PutMapping("/{id}")
    public Result<?> update(@PathVariable String id, @RequestBody PatternRevision revision) {
        try {
            PatternRevision updated = patternRevisionOrchestrator.update(id, revision);
            return Result.success(updated);
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 删除记录
     */
    @DeleteMapping("/{id}")
    public Result<?> delete(@PathVariable String id) {
        try {
            patternRevisionOrchestrator.delete(id);
            return Result.success();
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 统一的工作流操作端点
     */
    @PostMapping("/{id}/workflow")
    public Result<?> workflow(
            @PathVariable String id,
            @RequestParam String action,
            @RequestBody(required = false) Map<String, String> params) {

        try {
            switch (action.toLowerCase()) {
                case "submit":
                    boolean submitSuccess = patternRevisionService.submitForApproval(id);
                    return submitSuccess ? Result.success() : Result.fail("提交失败");

                case "approve":
                    String approveComment = params != null ? params.getOrDefault("comment", "") : "";
                    boolean approveSuccess = patternRevisionService.approve(id, approveComment);
                    return approveSuccess ? Result.success() : Result.fail("审核失败");

                case "reject":
                    String rejectComment = params != null ? params.getOrDefault("comment", "") : "";
                    if (!StringUtils.hasText(rejectComment)) {
                        return Result.fail("请填写拒绝原因");
                    }
                    boolean rejectSuccess = patternRevisionService.reject(id, rejectComment);
                    return rejectSuccess ? Result.success() : Result.fail("拒绝失败");

                case "complete":
                    boolean completeSuccess = patternRevisionService.complete(id);
                    return completeSuccess ? Result.success() : Result.fail("完成失败");

                default:
                    return Result.fail("不支持的操作: " + action);
            }
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 获取下一个版本号
     */
    @GetMapping("/next-version")
    public Result<?> getNextVersion(@RequestParam String styleNo) {
        if (!StringUtils.hasText(styleNo)) {
            return Result.fail("款号不能为空");
        }
        String nextVersion = patternRevisionService.generateNextRevisionNo(styleNo);
        return Result.success(nextVersion);
    }
}
