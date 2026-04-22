package com.fashion.supplychain.procurement.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.procurement.entity.SupplierUser;
import com.fashion.supplychain.procurement.service.SupplierUserService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequestMapping("/api/supplier-user")
@PreAuthorize("isAuthenticated()")
public class SupplierUserController {

    @Autowired
    private SupplierUserService supplierUserService;
    @Autowired
    private FactoryService factoryService;
    @Autowired
    private PasswordEncoder passwordEncoder;

    @GetMapping("/list")
    public Result<List<Map<String, Object>>> list(@RequestParam String supplierId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }
        Factory supplier = factoryService.getById(supplierId);
        if (supplier == null || !tenantId.equals(supplier.getTenantId())) {
            return Result.fail("供应商不存在");
        }
        if (!"MATERIAL".equals(supplier.getSupplierType())) {
            return Result.fail("仅面辅料供应商支持账号管理");
        }

        LambdaQueryWrapper<SupplierUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SupplierUser::getSupplierId, supplierId)
                .eq(SupplierUser::getTenantId, tenantId)
                .eq(SupplierUser::getDeleteFlag, 0)
                .orderByDesc(SupplierUser::getCreateTime);
        List<SupplierUser> users = supplierUserService.list(wrapper);

        return Result.success(users.stream().map(this::buildUserView).collect(Collectors.toList()));
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

        if (!StringUtils.hasText(supplierId) || !StringUtils.hasText(username) || !StringUtils.hasText(password)) {
            return Result.fail("供应商ID、用户名和密码不能为空");
        }
        if (username.trim().length() < 3 || username.trim().length() > 50) {
            return Result.fail("用户名需3-50位");
        }
        if (password.length() < 6 || password.length() > 20) {
            return Result.fail("密码需6-20位");
        }

        Factory supplier = factoryService.getById(supplierId);
        if (supplier == null || !tenantId.equals(supplier.getTenantId())) {
            return Result.fail("供应商不存在");
        }
        if (!"MATERIAL".equals(supplier.getSupplierType())) {
            return Result.fail("仅面辅料供应商支持创建账号");
        }

        LambdaQueryWrapper<SupplierUser> existWrapper = new LambdaQueryWrapper<>();
        existWrapper.eq(SupplierUser::getUsername, username.trim())
                .eq(SupplierUser::getDeleteFlag, 0);
        if (supplierUserService.count(existWrapper) > 0) {
            return Result.fail("用户名已存在");
        }

        SupplierUser user = new SupplierUser();
        user.setSupplierId(supplierId);
        user.setTenantId(tenantId);
        user.setUsername(username.trim());
        user.setPasswordHash(passwordEncoder.encode(password));
        user.setContactPerson(contactPerson);
        user.setContactPhone(contactPhone);
        user.setContactEmail(contactEmail);
        user.setStatus("ACTIVE");
        user.setDeleteFlag(0);
        user.setCreateTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        supplierUserService.save(user);

        log.info("[供应商账号] 创建成功: username={}, supplierId={}, tenantId={}, operator={}",
                username, supplierId, tenantId, UserContext.username());

        Map<String, Object> result = buildUserView(user);
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

        if (!StringUtils.hasText(userId) || !StringUtils.hasText(newPassword)) {
            return Result.fail("用户ID和新密码不能为空");
        }
        if (newPassword.length() < 6 || newPassword.length() > 20) {
            return Result.fail("密码需6-20位");
        }

        SupplierUser user = supplierUserService.getById(userId);
        if (user == null || !tenantId.equals(user.getTenantId()) || (user.getDeleteFlag() != null && user.getDeleteFlag() == 1)) {
            return Result.fail("用户不存在");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setUpdateTime(LocalDateTime.now());
        supplierUserService.updateById(user);

        log.info("[供应商账号] 密码重置: userId={}, operator={}", userId, UserContext.username());

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
        if (!StringUtils.hasText(userId)) {
            return Result.fail("用户ID不能为空");
        }

        SupplierUser user = supplierUserService.getById(userId);
        if (user == null || !tenantId.equals(user.getTenantId()) || (user.getDeleteFlag() != null && user.getDeleteFlag() == 1)) {
            return Result.fail("用户不存在");
        }

        String oldStatus = user.getStatus();
        String newStatus = "ACTIVE".equals(oldStatus) ? "INACTIVE" : "ACTIVE";
        user.setStatus(newStatus);
        user.setUpdateTime(LocalDateTime.now());
        supplierUserService.updateById(user);

        log.info("[供应商账号] 状态变更: userId={}, {} -> {}, operator={}",
                userId, oldStatus, newStatus, UserContext.username());
        return Result.success(null);
    }

    @DeleteMapping("/{userId}")
    public Result<Void> delete(@PathVariable String userId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }

        SupplierUser user = supplierUserService.getById(userId);
        if (user == null || !tenantId.equals(user.getTenantId()) || (user.getDeleteFlag() != null && user.getDeleteFlag() == 1)) {
            return Result.fail("用户不存在");
        }

        user.setDeleteFlag(1);
        user.setUpdateTime(LocalDateTime.now());
        supplierUserService.updateById(user);

        log.info("[供应商账号] 删除: userId={}, operator={}", userId, UserContext.username());
        return Result.success(null);
    }

    private Map<String, Object> buildUserView(SupplierUser u) {
        Map<String, Object> m = new HashMap<>();
        m.put("id", u.getId());
        m.put("supplierId", u.getSupplierId());
        m.put("tenantId", u.getTenantId());
        m.put("username", u.getUsername());
        m.put("contactPerson", u.getContactPerson());
        m.put("contactPhone", u.getContactPhone());
        m.put("contactEmail", u.getContactEmail());
        m.put("status", u.getStatus());
        m.put("lastLoginTime", u.getLastLoginTime());
        m.put("createTime", u.getCreateTime());
        return m;
    }
}
