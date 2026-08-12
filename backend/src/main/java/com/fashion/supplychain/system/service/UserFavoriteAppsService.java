package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
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
     * 模式：先更新 → 0行则插入 → 插入遇唯一键冲突则重试更新（兜底并发竞态）
     */
    public void saveMyFavorites(String favoriteData) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();

        // 路径1：先尝试按唯一键更新（大多数情况走这里，0行影响说明无记录）
        LambdaUpdateWrapper<UserFavoriteApps> uw = new LambdaUpdateWrapper<UserFavoriteApps>()
                .eq(UserFavoriteApps::getTenantId, tenantId)
                .eq(UserFavoriteApps::getUserId, userId)
                .eq(UserFavoriteApps::getDeleteFlag, 0)
                .set(UserFavoriteApps::getFavoriteData, favoriteData);
        boolean updated = update(uw);
        if (updated) {
            return;
        }

        // 路径2：更新0行 → 尝试新插入
        try {
            UserFavoriteApps entity = new UserFavoriteApps();
            entity.setTenantId(tenantId);
            entity.setUserId(userId);
            entity.setFavoriteData(favoriteData);
            save(entity);
        } catch (org.springframework.dao.DuplicateKeyException dke) {
            // 路径3（兜底）：并发下另一个请求先插入成功，唯一键冲突 → 重新执行一次 update
            log.warn("[UserFavoriteApps] 并发兜底：唯一键冲突，回退为 update  tenantId={} userId={}",
                    tenantId, userId);
            update(new LambdaUpdateWrapper<UserFavoriteApps>()
                    .eq(UserFavoriteApps::getTenantId, tenantId)
                    .eq(UserFavoriteApps::getUserId, userId)
                    .eq(UserFavoriteApps::getDeleteFlag, 0)
                    .set(UserFavoriteApps::getFavoriteData, favoriteData));
        }
    }
}
