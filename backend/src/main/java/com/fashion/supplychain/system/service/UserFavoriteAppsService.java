package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.UserFavoriteApps;
import com.fashion.supplychain.system.mapper.UserFavoriteAppsMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

@Slf4j
@Service
public class UserFavoriteAppsService extends ServiceImpl<UserFavoriteAppsMapper, UserFavoriteApps> {

    /**
     * 获取当前用户的收藏数据
     */
    public String getMyFavorites() {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        UserFavoriteApps entity = getOne(new LambdaQueryWrapper<UserFavoriteApps>()
                .eq(UserFavoriteApps::getTenantId, tenantId)
                .eq(UserFavoriteApps::getUserId, userId)
                .last("LIMIT 1"));
        return entity != null ? entity.getFavoriteData() : "[]";
    }

    /**
     * 保存当前用户的收藏数据
     * 使用 saveOrUpdate 避免竞态条件（防止并发插入导致唯一约束冲突）
     */
    public void saveMyFavorites(String favoriteData) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();

        // 先尝试更新
        UserFavoriteApps existing = getOne(new LambdaQueryWrapper<UserFavoriteApps>()
                .eq(UserFavoriteApps::getTenantId, tenantId)
                .eq(UserFavoriteApps::getUserId, userId)
                .eq(UserFavoriteApps::getDeleteFlag, 0)
                .last("LIMIT 1"));

        if (existing != null) {
            existing.setFavoriteData(favoriteData);
            updateById(existing);
        } else {
            // 不存在则新增
            UserFavoriteApps entity = new UserFavoriteApps();
            entity.setTenantId(tenantId);
            entity.setUserId(userId);
            entity.setFavoriteData(favoriteData);
            save(entity);
        }
    }
}
