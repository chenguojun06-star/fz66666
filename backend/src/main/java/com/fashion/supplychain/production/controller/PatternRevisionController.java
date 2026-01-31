package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.PatternRevision;
import com.fashion.supplychain.production.service.PatternRevisionService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 纸样修改记录控制器
 * 
 * @author system
 * @date 2026-01-31
 */
@RestController
@RequestMapping("/api/pattern-revision")
public class PatternRevisionController {

    @Autowired
    private PatternRevisionService patternRevisionService;

    /**
     * 分页查询
     */
    @GetMapping("/list")
    @PreAuthorize("hasAuthority('PATTERN_REVISION_VIEW')")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        int page = Integer.parseInt(String.valueOf(params.getOrDefault("page", 1)));
        int pageSize = Integer.parseInt(String.valueOf(params.getOrDefault("pageSize", 10)));

        String styleNo = String.valueOf(params.getOrDefault("styleNo", "")).trim();
        String status = String.valueOf(params.getOrDefault("status", "")).trim();
        String revisionType = String.valueOf(params.getOrDefault("revisionType", "")).trim();
        String maintainerName = String.valueOf(params.getOrDefault("maintainerName", "")).trim();

        LambdaQueryWrapper<PatternRevision> wrapper = new LambdaQueryWrapper<>();
        wrapper.like(StringUtils.hasText(styleNo), PatternRevision::getStyleNo, styleNo)
                .eq(StringUtils.hasText(status), PatternRevision::getStatus, status)
                .eq(StringUtils.hasText(revisionType), PatternRevision::getRevisionType, revisionType)
                .like(StringUtils.hasText(maintainerName), PatternRevision::getMaintainerName, maintainerName)
                .orderByDesc(PatternRevision::getCreateTime);

        IPage<PatternRevision> result = patternRevisionService.page(new Page<>(page, pageSize), wrapper);
        return Result.success(result);
    }

    /**
     * 查询详情
     */
    @GetMapping("/{id}")
    @PreAuthorize("hasAuthority('PATTERN_REVISION_VIEW')")
    public Result<?> detail(@PathVariable String id) {
        PatternRevision revision = patternRevisionService.getById(id);
        if (revision == null) {
            return Result.fail("记录不存在");
        }
        return Result.success(revision);
    }

    /**
     * 创建记录
     */
    @PostMapping
    @PreAuthorize("hasAuthority('PATTERN_REVISION_CREATE')")
    public Result<?> create(@RequestBody PatternRevision revision) {
        // 自动生成版本号
        if (!StringUtils.hasText(revision.getRevisionNo()) && StringUtils.hasText(revision.getStyleNo())) {
            String nextVersion = patternRevisionService.generateNextRevisionNo(revision.getStyleNo());
            revision.setRevisionNo(nextVersion);
        }

        // 设置初始状态
        if (!StringUtils.hasText(revision.getStatus())) {
            revision.setStatus("DRAFT");
        }

        boolean success = patternRevisionService.save(revision);
        if (!success) {
            return Result.fail("创建失败");
        }
        return Result.success(revision);
    }

    /**
     * 更新记录
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAuthority('PATTERN_REVISION_UPDATE')")
    public Result<?> update(@PathVariable String id, @RequestBody PatternRevision revision) {
        PatternRevision existing = patternRevisionService.getById(id);
        if (existing == null) {
            return Result.fail("记录不存在");
        }

        // 只有草稿状态才能修改
        if (!"DRAFT".equals(existing.getStatus())) {
            return Result.fail("只有草稿状态才能修改");
        }

        revision.setId(id);
        boolean success = patternRevisionService.updateById(revision);
        if (!success) {
            return Result.fail("更新失败");
        }
        return Result.success(revision);
    }

    /**
     * 删除记录
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAuthority('PATTERN_REVISION_DELETE')")
    public Result<?> delete(@PathVariable String id) {
        PatternRevision existing = patternRevisionService.getById(id);
        if (existing == null) {
            return Result.fail("记录不存在");
        }

        // 只有草稿状态才能删除
        if (!"DRAFT".equals(existing.getStatus())) {
            return Result.fail("只有草稿状态才能删除");
        }

        boolean success = patternRevisionService.removeById(id);
        if (!success) {
            return Result.fail("删除失败");
        }
        return Result.success();
    }

    /**
     * 提交审核
     */
    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('PATTERN_REVISION_SUBMIT')")
    public Result<?> submit(@PathVariable String id) {
        try {
            boolean success = patternRevisionService.submitForApproval(id);
            if (!success) {
                return Result.fail("提交失败");
            }
            return Result.success();
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 审核通过
     */
    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('PATTERN_REVISION_APPROVE')")
    public Result<?> approve(@PathVariable String id, @RequestBody Map<String, String> params) {
        String comment = params.getOrDefault("comment", "");
        try {
            boolean success = patternRevisionService.approve(id, comment);
            if (!success) {
                return Result.fail("审核失败");
            }
            return Result.success();
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 审核拒绝
     */
    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('PATTERN_REVISION_REJECT')")
    public Result<?> reject(@PathVariable String id, @RequestBody Map<String, String> params) {
        String comment = params.getOrDefault("comment", "");
        if (!StringUtils.hasText(comment)) {
            return Result.fail("请填写拒绝原因");
        }
        try {
            boolean success = patternRevisionService.reject(id, comment);
            if (!success) {
                return Result.fail("拒绝失败");
            }
            return Result.success();
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 完成修改
     */
    @PostMapping("/{id}/complete")
    @PreAuthorize("hasAuthority('PATTERN_REVISION_COMPLETE')")
    public Result<?> complete(@PathVariable String id) {
        try {
            boolean success = patternRevisionService.complete(id);
            if (!success) {
                return Result.fail("完成失败");
            }
            return Result.success();
        } catch (Exception e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 获取下一个版本号
     */
    @GetMapping("/next-version")
    @PreAuthorize("hasAuthority('PATTERN_REVISION_VIEW')")
    public Result<?> getNextVersion(@RequestParam String styleNo) {
        if (!StringUtils.hasText(styleNo)) {
            return Result.fail("款号不能为空");
        }
        String nextVersion = patternRevisionService.generateNextRevisionNo(styleNo);
        return Result.success(nextVersion);
    }
}
