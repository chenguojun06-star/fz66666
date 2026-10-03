package com.fashion.supplychain.crm.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.CustomerClientUser;
import com.fashion.supplychain.crm.orchestration.CustomerUserOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 客户门户账号管理控制器（D-732）
 *
 * <p>本类只做「登录校验 + 参数校验 + 调 Orchestrator + 组装 Result」，
 * 与 {@code SupplierUserController} 同构（规则6：Controller 不直接依赖多个 Service）。
 *
 * <p>用途：给客户开「客户门户」账号（h5 端 crm-client），客户凭账号登录后
 * 可查看自己的订单进度、发货记录与应收账款。
 * 此前该能力**完全缺失**，导致客户门户 0 账号、功能不可达。
 */
@Slf4j
@RestController
@RequestMapping("/api/customer-user")
@PreAuthorize("isAuthenticated()")
public class CustomerUserController {

    @Autowired
    private CustomerUserOrchestrator customerUserOrchestrator;

    /** 某客户下的门户账号列表 */
    @GetMapping("/list")
    public Result<List<Map<String, Object>>> list(@RequestParam String customerId) {
        return customerUserOrchestrator.listByCustomer(customerId);
    }

    /** 全租户客户账号分页列表（可按客户/关键字/状态过滤） */
    @GetMapping("/all-list")
    public Result<Map<String, Object>> listAll(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String customerId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int pageSize) {
        return customerUserOrchestrator.listAll(keyword, status, customerId, page, pageSize);
    }

    /** 开户：为客户创建门户账号 */
    @PostMapping("/create")
    public Result<Map<String, Object>> create(@RequestBody Map<String, String> request) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }

        String customerId = request.get("customerId");
        String username = request.get("username");
        String password = request.get("password");
        String contactPerson = request.get("contactPerson");
        String contactPhone = request.get("contactPhone");
        String contactEmail = request.get("contactEmail");

        if (customerId == null || customerId.isEmpty()
                || username == null || username.isEmpty()
                || password == null || password.isEmpty()) {
            return Result.fail("客户、用户名和密码不能为空");
        }
        if (username.trim().length() < 3 || username.trim().length() > 50) {
            return Result.fail("用户名需3-50位");
        }
        if (password.length() < 6 || password.length() > 20) {
            return Result.fail("密码需6-20位");
        }

        CustomerClientUser user;
        try {
            user = customerUserOrchestrator.createUser(customerId, username, password,
                    contactPerson, contactPhone, contactEmail);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        }

        Map<String, Object> result = customerUserOrchestrator.buildUserView(user);
        // 明文密码只在创建时回传一次，供管理员复制发给客户
        result.put("initialPassword", password);
        return Result.success(result);
    }

    /** 重置密码 */
    @PostMapping("/reset-password")
    public Result<Map<String, Object>> resetPassword(@RequestBody Map<String, String> request) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }

        String userId = request.get("userId");
        String newPassword = request.get("newPassword");
        if (userId == null || userId.isEmpty() || newPassword == null || newPassword.isEmpty()) {
            return Result.fail("用户ID和新密码不能为空");
        }
        if (newPassword.length() < 6 || newPassword.length() > 20) {
            return Result.fail("密码需6-20位");
        }

        CustomerClientUser user;
        try {
            user = customerUserOrchestrator.resetPassword(userId, newPassword);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("id", user.getId());
        result.put("username", user.getUsername());
        result.put("newPassword", newPassword);
        return Result.success(result);
    }

    /** 启用 / 停用 */
    @PostMapping("/toggle-status")
    public Result<Void> toggleStatus(@RequestBody Map<String, String> request) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }
        String userId = request.get("userId");
        if (userId == null || userId.isEmpty()) {
            return Result.fail("用户ID不能为空");
        }

        try {
            customerUserOrchestrator.toggleStatus(userId);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        }
        return Result.success(null);
    }

    /** 删除账号 */
    @DeleteMapping("/{userId}")
    public Result<Void> delete(@PathVariable String userId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }

        try {
            customerUserOrchestrator.deleteUser(userId);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        }
        return Result.success(null);
    }
}
