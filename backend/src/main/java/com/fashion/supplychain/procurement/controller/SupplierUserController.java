package com.fashion.supplychain.procurement.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.procurement.entity.SupplierUser;
import com.fashion.supplychain.procurement.orchestration.SupplierUserOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 供应商账号管理控制器
 *
 * <p>本类只做「租户上下文校验 + 参数校验 + 调 Orchestrator + 组装 Result」。
 * 查询类接口原先直接注入 SupplierUserService / FactoryService（D-630 规则6 违规），
 * 已下沉到 {@link SupplierUserOrchestrator}。
 */
@Slf4j
@RestController
@RequestMapping("/api/supplier-user")
@PreAuthorize("isAuthenticated()")
public class SupplierUserController {

    @Autowired
    private SupplierUserOrchestrator supplierUserOrchestrator;

    @GetMapping("/list")
    public Result<List<Map<String, Object>>> list(@RequestParam String supplierId) {
        return supplierUserOrchestrator.listBySupplier(supplierId);
    }

    @GetMapping("/all-list")
    public Result<Map<String, Object>> listAll(
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) String supplierId,
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "100") int pageSize) {
        return supplierUserOrchestrator.listAll(keyword, status, supplierId, page, pageSize);
    }

    @PostMapping("/create")
    public Result<Map<String, Object>> create(@RequestBody Map<String, String> request) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }

        String supplierId = request.get("supplierId");
        String username = request.get("username");
        String password = request.get("password");
        String contactPerson = request.get("contactPerson");
        String contactPhone = request.get("contactPhone");
        String contactEmail = request.get("contactEmail");

        if (supplierId == null || supplierId.isEmpty() || username == null || username.isEmpty() || password == null || password.isEmpty()) {
            return Result.fail("供应商ID、用户名和密码不能为空");
        }
        if (username.trim().length() < 3 || username.trim().length() > 50) {
            return Result.fail("用户名需3-50位");
        }
        if (password.length() < 6 || password.length() > 20) {
            return Result.fail("密码需6-20位");
        }

        SupplierUser user;
        try {
            user = supplierUserOrchestrator.createUser(supplierId, username, password, contactPerson, contactPhone, contactEmail);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        }

        Map<String, Object> result = supplierUserOrchestrator.buildUserView(user);
        result.put("initialPassword", password);
        return Result.success(result);
    }

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

        SupplierUser user;
        try {
            user = supplierUserOrchestrator.resetPassword(userId, newPassword);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        }

        Map<String, Object> result = new HashMap<>();
        result.put("id", user.getId());
        result.put("username", user.getUsername());
        result.put("newPassword", newPassword);
        return Result.success(result);
    }

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
            supplierUserOrchestrator.toggleStatus(userId);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        }

        return Result.success(null);
    }

    @DeleteMapping("/{userId}")
    public Result<Void> delete(@PathVariable String userId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }

        try {
            supplierUserOrchestrator.deleteUser(userId);
        } catch (IllegalArgumentException | IllegalStateException e) {
            return Result.fail(e.getMessage());
        }

        return Result.success(null);
    }
}
