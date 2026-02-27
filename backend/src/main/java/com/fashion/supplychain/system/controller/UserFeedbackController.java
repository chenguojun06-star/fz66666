package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.UserFeedback;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserFeedbackService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 用户反馈 Controller
 * - 普通用户：提交反馈、查看自己的反馈
 * - 超管：查看所有反馈、回复、修改状态
 */
@RestController
@RequestMapping("/api/system/feedback")
@PreAuthorize("isAuthenticated()")
public class UserFeedbackController {

    @Autowired
    private UserFeedbackService userFeedbackService;

    @Autowired
    private TenantService tenantService;

    /**
     * 提交反馈（所有登录用户可用，PC端和小程序统一入口）
     */
    @PostMapping("/submit")
    public Result<?> submit(@RequestBody UserFeedback feedback) {
        if (!StringUtils.hasText(feedback.getTitle())) {
            return Result.fail("标题不能为空");
        }
        if (!StringUtils.hasText(feedback.getContent())) {
            return Result.fail("内容不能为空");
        }

        UserContext ctx = UserContext.get();
        if (ctx != null) {
            feedback.setUserId(ctx.getUserId() != null ? Long.parseLong(ctx.getUserId()) : null);
            feedback.setUserName(ctx.getUsername());
            feedback.setTenantId(ctx.getTenantId());
            // 冗余存储租户名称，方便管理端查询
            if (ctx.getTenantId() != null) {
                Tenant tenant = tenantService.getById(ctx.getTenantId());
                if (tenant != null) {
                    feedback.setTenantName(tenant.getTenantName());
                }
            }
        }

        // 设置默认值
        if (!StringUtils.hasText(feedback.getSource())) {
            feedback.setSource("PC");
        }
        if (!StringUtils.hasText(feedback.getCategory())) {
            feedback.setCategory("BUG");
        }
        feedback.setStatus("PENDING");
        feedback.setCreateTime(LocalDateTime.now());
        feedback.setUpdateTime(LocalDateTime.now());

        userFeedbackService.save(feedback);
        return Result.success(feedback);
    }

    /**
     * 我的反馈列表（当前用户提交的反馈）
     */
    @PostMapping("/my-list")
    public Result<?> myList(@RequestBody(required = false) Map<String, Object> params) {
        int page = 1;
        int pageSize = 20;
        if (params != null) {
            page = params.get("page") != null ? Integer.parseInt(params.get("page").toString()) : 1;
            pageSize = params.get("pageSize") != null ? Integer.parseInt(params.get("pageSize").toString()) : 20;
        }

        UserContext ctx = UserContext.get();
        String userId = ctx != null ? ctx.getUserId() : null;
        if (userId == null) {
            return Result.fail("未登录");
        }

        LambdaQueryWrapper<UserFeedback> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(UserFeedback::getUserId, Long.parseLong(userId));
        wrapper.orderByDesc(UserFeedback::getCreateTime);

        Page<UserFeedback> result = userFeedbackService.page(new Page<>(page, pageSize), wrapper);
        return Result.success(result);
    }

    /**
     * 反馈列表（超管查看所有租户的反馈）
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/list")
    public Result<?> list(@RequestBody(required = false) Map<String, Object> params) {
        int page = 1;
        int pageSize = 20;
        String status = null;
        String tenantName = null;
        String category = null;

        if (params != null) {
            page = params.get("page") != null ? Integer.parseInt(params.get("page").toString()) : 1;
            pageSize = params.get("pageSize") != null ? Integer.parseInt(params.get("pageSize").toString()) : 20;
            status = params.get("status") != null ? params.get("status").toString() : null;
            tenantName = params.get("tenantName") != null ? params.get("tenantName").toString() : null;
            category = params.get("category") != null ? params.get("category").toString() : null;
        }

        LambdaQueryWrapper<UserFeedback> wrapper = new LambdaQueryWrapper<>();
        if (StringUtils.hasText(status)) {
            wrapper.eq(UserFeedback::getStatus, status);
        }
        if (StringUtils.hasText(tenantName)) {
            wrapper.like(UserFeedback::getTenantName, tenantName);
        }
        if (StringUtils.hasText(category)) {
            wrapper.eq(UserFeedback::getCategory, category);
        }
        wrapper.orderByDesc(UserFeedback::getCreateTime);

        Page<UserFeedback> result = userFeedbackService.page(new Page<>(page, pageSize), wrapper);
        return Result.success(result);
    }

    /**
     * 回复反馈（超管）
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/{id}/reply")
    public Result<?> reply(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String reply = body.get("reply");
        String status = body.get("status");

        if (!StringUtils.hasText(reply)) {
            return Result.fail("回复内容不能为空");
        }

        UserFeedback feedback = userFeedbackService.getById(id);
        if (feedback == null) {
            return Result.fail("反馈不存在");
        }

        UserContext ctx = UserContext.get();
        feedback.setReply(reply);
        feedback.setReplyTime(LocalDateTime.now());
        feedback.setReplyUserId(ctx != null && ctx.getUserId() != null ? Long.parseLong(ctx.getUserId()) : null);
        feedback.setStatus(StringUtils.hasText(status) ? status : "RESOLVED");
        feedback.setUpdateTime(LocalDateTime.now());

        userFeedbackService.updateById(feedback);
        return Result.success(feedback);
    }

    /**
     * 修改反馈状态（超管）
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @PostMapping("/{id}/status")
    public Result<?> updateStatus(@PathVariable Long id, @RequestBody Map<String, String> body) {
        String status = body.get("status");
        if (!StringUtils.hasText(status)) {
            return Result.fail("状态不能为空");
        }

        UserFeedback feedback = userFeedbackService.getById(id);
        if (feedback == null) {
            return Result.fail("反馈不存在");
        }

        feedback.setStatus(status);
        feedback.setUpdateTime(LocalDateTime.now());
        userFeedbackService.updateById(feedback);
        return Result.success(feedback);
    }

    /**
     * 反馈统计（超管仪表盘用）
     */
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    @GetMapping("/stats")
    public Result<?> stats() {
        long total = userFeedbackService.count();
        long pending = userFeedbackService.count(
                new LambdaQueryWrapper<UserFeedback>().eq(UserFeedback::getStatus, "PENDING"));
        long processing = userFeedbackService.count(
                new LambdaQueryWrapper<UserFeedback>().eq(UserFeedback::getStatus, "PROCESSING"));
        long resolved = userFeedbackService.count(
                new LambdaQueryWrapper<UserFeedback>().eq(UserFeedback::getStatus, "RESOLVED"));

        return Result.success(Map.of(
                "total", total,
                "pending", pending,
                "processing", processing,
                "resolved", resolved
        ));
    }
}
