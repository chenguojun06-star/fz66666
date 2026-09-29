package com.fashion.supplychain.procurement.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
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
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;

@Slf4j
@Service
public class SupplierUserOrchestrator {

    @Autowired
    private SupplierUserService supplierUserService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private PasswordEncoder passwordEncoder;

    /**
     * 某供应商下的账号列表（先校验供应商归属当前租户且为面辅料类型）。
     */
    public Result<List<Map<String, Object>>> listBySupplier(String supplierId) {
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

    /**
     * 全租户供应商账号分页列表（带供应商名称富化）。
     *
     * <p>用 {@code LIMIT offset, size} 手写分页而非 MyBatis-Plus {@code Page}，
     * 与重构前逐字一致（保持返回结构与 total 口径不变）。
     */
    public Result<Map<String, Object>> listAll(String keyword, String status, String supplierId,
                                               int page, int pageSize) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("请先登录");
        }

        LambdaQueryWrapper<SupplierUser> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SupplierUser::getTenantId, tenantId)
                .eq(SupplierUser::getDeleteFlag, 0);
        applyFilters(wrapper, keyword, status, supplierId);

        int offset = (page - 1) * pageSize;
        wrapper.orderByDesc(SupplierUser::getCreateTime)
                .last("LIMIT " + offset + ", " + pageSize);

        List<SupplierUser> users = supplierUserService.list(wrapper);

        LambdaQueryWrapper<SupplierUser> countWrapper = new LambdaQueryWrapper<>();
        countWrapper.eq(SupplierUser::getTenantId, tenantId)
                .eq(SupplierUser::getDeleteFlag, 0);
        applyFilters(countWrapper, keyword, status, supplierId);
        long total = supplierUserService.count(countWrapper);

        // 批量查询供应商名称（避免 N+1）
        List<String> supplierIds = users.stream()
                .map(SupplierUser::getSupplierId)
                .filter(Objects::nonNull)
                .distinct()
                .collect(Collectors.toList());

        Map<String, String> supplierNameMap = new HashMap<>();
        if (!supplierIds.isEmpty()) {
            List<Factory> factories = factoryService.listByIds(supplierIds);
            for (Factory factory : factories) {
                supplierNameMap.put(factory.getId(), factory.getFactoryName());
            }
        }

        List<Map<String, Object>> dataList = users.stream()
                .map(u -> {
                    Map<String, Object> m = buildUserView(u);
                    m.put("supplierName", supplierNameMap.getOrDefault(u.getSupplierId(), ""));
                    return m;
                })
                .collect(Collectors.toList());

        Map<String, Object> result = new HashMap<>();
        result.put("list", dataList);
        result.put("total", total);

        return Result.success(result);
    }

    /** 列表 / 计数共用的过滤条件（keyword / status / supplierId）。 */
    private void applyFilters(LambdaQueryWrapper<SupplierUser> wrapper, String keyword,
                              String status, String supplierId) {
        if (status != null && !status.isEmpty()) {
            wrapper.eq(SupplierUser::getStatus, status);
        }
        if (supplierId != null && !supplierId.isEmpty()) {
            wrapper.eq(SupplierUser::getSupplierId, supplierId);
        }
        if (keyword != null && !keyword.isEmpty()) {
            String likeKeyword = "%" + keyword.trim() + "%";
            wrapper.and(w -> w
                    .like(SupplierUser::getUsername, likeKeyword)
                    .or()
                    .like(SupplierUser::getContactPerson, likeKeyword)
                    .or()
                    .like(SupplierUser::getContactPhone, likeKeyword)
            );
        }
    }

    /** 供应商账号对外视图（列表接口与新建/重置密码接口共用）。 */
    public Map<String, Object> buildUserView(SupplierUser u) {
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

        user.setUpdateTime(LocalDateTime.now());
        supplierUserService.updateById(user);
        // D-363d：逻辑删除空操作修复
        supplierUserService.removeById(user.getId());

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
