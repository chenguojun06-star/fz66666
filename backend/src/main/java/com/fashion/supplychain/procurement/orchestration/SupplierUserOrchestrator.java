package com.fashion.supplychain.procurement.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.procurement.entity.SupplierUser;
import com.fashion.supplychain.procurement.service.SupplierUserService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

@Slf4j
@Service
public class SupplierUserOrchestrator {

    @Autowired
    private SupplierUserService supplierUserService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Transactional(rollbackFor = Exception.class)
    public SupplierUser createUser(String supplierId, String username, String password,
                                   String contactPerson, String contactPhone, String contactEmail) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("请先登录");
        }

        Factory supplier = factoryService.getById(supplierId);
        if (supplier == null || !tenantId.equals(supplier.getTenantId())) {
            throw new IllegalArgumentException("供应商不存在");
        }
        if (!"MATERIAL".equals(supplier.getSupplierType())) {
            throw new IllegalArgumentException("仅面辅料供应商支持创建账号");
        }

        LambdaQueryWrapper<SupplierUser> existWrapper = new LambdaQueryWrapper<>();
        existWrapper.eq(SupplierUser::getUsername, username.trim())
                .eq(SupplierUser::getDeleteFlag, 0);
        if (supplierUserService.count(existWrapper) > 0) {
            throw new IllegalArgumentException("用户名已存在");
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
        return user;
    }

    @Transactional(rollbackFor = Exception.class)
    public SupplierUser resetPassword(String userId, String newPassword) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("请先登录");
        }

        SupplierUser user = supplierUserService.getById(userId);
        if (user == null || !tenantId.equals(user.getTenantId())
                || (user.getDeleteFlag() != null && user.getDeleteFlag() == 1)) {
            throw new IllegalArgumentException("用户不存在");
        }

        user.setPasswordHash(passwordEncoder.encode(newPassword));
        user.setUpdateTime(LocalDateTime.now());
        supplierUserService.updateById(user);

        log.info("[供应商账号] 密码重置: userId={}, operator={}", userId, UserContext.username());
        return user;
    }

    @Transactional(rollbackFor = Exception.class)
    public void toggleStatus(String userId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("请先登录");
        }

        SupplierUser user = supplierUserService.getById(userId);
        if (user == null || !tenantId.equals(user.getTenantId())
                || (user.getDeleteFlag() != null && user.getDeleteFlag() == 1)) {
            throw new IllegalArgumentException("用户不存在");
        }

        String oldStatus = user.getStatus();
        String newStatus = "ACTIVE".equals(oldStatus) ? "INACTIVE" : "ACTIVE";
        user.setStatus(newStatus);
        user.setUpdateTime(LocalDateTime.now());
        supplierUserService.updateById(user);

        log.info("[供应商账号] 状态变更: userId={}, {} -> {}, operator={}",
                userId, oldStatus, newStatus, UserContext.username());
    }

    @Transactional(rollbackFor = Exception.class)
    public void deleteUser(String userId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("请先登录");
        }

        SupplierUser user = supplierUserService.getById(userId);
        if (user == null || !tenantId.equals(user.getTenantId())
                || (user.getDeleteFlag() != null && user.getDeleteFlag() == 1)) {
            throw new IllegalArgumentException("用户不存在");
        }

        user.setDeleteFlag(1);
        user.setUpdateTime(LocalDateTime.now());
        supplierUserService.updateById(user);

        log.info("[供应商账号] 删除: userId={}, operator={}", userId, UserContext.username());
    }

    @Transactional(rollbackFor = Exception.class)
    public void updateLastLoginTime(String userId) {
        if (!StringUtils.hasText(userId)) {
            return;
        }
        SupplierUser user = supplierUserService.getById(userId);
        if (user == null) {
            return;
        }
        user.setLastLoginTime(LocalDateTime.now());
        user.setUpdateTime(LocalDateTime.now());
        supplierUserService.updateById(user);
    }
}
