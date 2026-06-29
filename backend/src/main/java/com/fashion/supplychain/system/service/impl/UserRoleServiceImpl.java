package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.UserRole;
import com.fashion.supplychain.system.mapper.UserRoleMapper;
import com.fashion.supplychain.system.service.UserRoleService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * 用户角色关联 Service 实现
 *
 * P0 铁律 #2：Service 层禁止 @Transactional。
 * 多步写操作（replaceUserRoles/addRoles）的事务边界由 UserRoleOrchestrator 承接。
 * Service 层只做纯业务逻辑（CRUD + 查询），不开启事务。
 */
@Slf4j
@Service
public class UserRoleServiceImpl extends ServiceImpl<UserRoleMapper, UserRole>
        implements UserRoleService {

    @Override
    public List<Long> getRoleIdsByUserId(Long userId, Long tenantId) {
        if (userId == null) {
            return Collections.emptyList();
        }
        LambdaQueryWrapper<UserRole> wrapper = new LambdaQueryWrapper<UserRole>()
                .eq(UserRole::getUserId, userId)
                .eq(UserRole::getDeleteFlag, 0)
                .and(w -> w.isNull(UserRole::getExpireTime).or().gt(UserRole::getExpireTime, LocalDateTime.now()))
                .orderByDesc(UserRole::getIsPrimary);
        if (tenantId != null) {
            wrapper.eq(UserRole::getTenantId, tenantId);
        }
        return this.list(wrapper).stream().map(UserRole::getRoleId).filter(v -> v != null).distinct().toList();
    }

    @Override
    public Long getPrimaryRoleId(Long userId, Long tenantId) {
        if (userId == null) {
            return null;
        }
        LambdaQueryWrapper<UserRole> wrapper = new LambdaQueryWrapper<UserRole>()
                .eq(UserRole::getUserId, userId)
                .eq(UserRole::getIsPrimary, 1)
                .eq(UserRole::getDeleteFlag, 0)
                .and(w -> w.isNull(UserRole::getExpireTime).or().gt(UserRole::getExpireTime, LocalDateTime.now()))
                .last("LIMIT 1");
        if (tenantId != null) {
            wrapper.eq(UserRole::getTenantId, tenantId);
        }
        UserRole ur = this.getOne(wrapper, false);
        return ur != null ? ur.getRoleId() : null;
    }

    @Override
    public void replaceUserRoles(Long userId, Long tenantId, List<Long> roleIds) {
        if (userId == null) {
            return;
        }
        // 软删除现有所有角色关联
        LambdaUpdateWrapper<UserRole> deleteWrapper = new LambdaUpdateWrapper<UserRole>()
                .eq(UserRole::getUserId, userId)
                .set(UserRole::getDeleteFlag, 1);
        if (tenantId != null) {
            deleteWrapper.eq(UserRole::getTenantId, tenantId);
        }
        this.update(deleteWrapper);

        // 写入新角色关联
        if (roleIds == null || roleIds.isEmpty()) {
            return;
        }
        Set<Long> seen = new HashSet<>();
        List<UserRole> toInsert = new ArrayList<>();
        for (int i = 0; i < roleIds.size(); i++) {
            Long roleId = roleIds.get(i);
            if (roleId == null || !seen.add(roleId)) {
                continue;
            }
            UserRole ur = new UserRole();
            ur.setTenantId(tenantId);
            ur.setUserId(userId);
            ur.setRoleId(roleId);
            ur.setIsPrimary(i == 0 ? 1 : 0); // 第一个为主角色
            ur.setSource("manual");
            ur.setEffectiveFrom(LocalDateTime.now());
            ur.setDeleteFlag(0);
            toInsert.add(ur);
        }
        if (!toInsert.isEmpty()) {
            this.saveBatch(toInsert);
        }
    }

    @Override
    public void addRoles(Long userId, Long tenantId, List<Long> roleIds, boolean primary) {
        if (userId == null || roleIds == null || roleIds.isEmpty()) {
            return;
        }
        List<UserRole> existing = this.list(new LambdaQueryWrapper<UserRole>()
                .eq(UserRole::getUserId, userId)
                .eq(UserRole::getDeleteFlag, 0));
        Set<Long> existingRoleIds = new HashSet<>();
        for (UserRole ur : existing) {
            if (ur.getRoleId() != null) {
                existingRoleIds.add(ur.getRoleId());
            }
        }

        List<UserRole> toInsert = new ArrayList<>();
        for (Long roleId : roleIds) {
            if (roleId == null || existingRoleIds.contains(roleId)) {
                continue;
            }
            UserRole ur = new UserRole();
            ur.setTenantId(tenantId);
            ur.setUserId(userId);
            ur.setRoleId(roleId);
            ur.setIsPrimary(primary ? 1 : 0);
            ur.setSource("manual");
            ur.setEffectiveFrom(LocalDateTime.now());
            ur.setDeleteFlag(0);
            toInsert.add(ur);
        }
        if (!toInsert.isEmpty()) {
            this.saveBatch(toInsert);
        }
    }

    @Override
    public void removeRoles(Long userId, Long tenantId, List<Long> roleIds) {
        if (userId == null || roleIds == null || roleIds.isEmpty()) {
            return;
        }
        LambdaUpdateWrapper<UserRole> wrapper = new LambdaUpdateWrapper<UserRole>()
                .eq(UserRole::getUserId, userId)
                .in(UserRole::getRoleId, roleIds)
                .set(UserRole::getDeleteFlag, 1);
        if (tenantId != null) {
            wrapper.eq(UserRole::getTenantId, tenantId);
        }
        this.update(wrapper);
    }
}
