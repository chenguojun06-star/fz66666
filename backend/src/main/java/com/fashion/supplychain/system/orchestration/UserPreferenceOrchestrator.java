package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.dto.UserPreferenceSaveRequest;
import com.fashion.supplychain.system.entity.UserPreference;
import com.fashion.supplychain.system.service.UserPreferenceService;
import java.time.LocalDateTime;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 用户偏好编排器
 * 持久化用户级表格列显隐/列顺序/分页大小/筛选器等显示偏好
 * 替代散落的 localStorage（pageSizeStore/列顺序/列显隐）
 */
@Slf4j
@Service
public class UserPreferenceOrchestrator {

    @Autowired
    private UserPreferenceService userPreferenceService;

    /** 查询当前用户在某页面的所有偏好 */
    public List<UserPreference> listByPage(String pageKey) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(pageKey)) {
            throw new IllegalArgumentException("pageKey 必填");
        }
        Long tenantId = TenantAssert.requireTenantId();
        String userId = UserContext.userId();
        if (userId == null) {
            throw new IllegalStateException("用户未登录");
        }
        return userPreferenceService.list(
                new LambdaQueryWrapper<UserPreference>()
                        .eq(UserPreference::getTenantId, tenantId)
                        .eq(UserPreference::getUserId, userId)
                        .eq(UserPreference::getPageKey, pageKey)
        );
    }

    /** 保存/更新单条偏好（按 pageKey + preferenceType 唯一） */
    public UserPreference save(UserPreferenceSaveRequest request) {
        TenantAssert.assertTenantContext();
        if (request == null || !StringUtils.hasText(request.getPageKey())
                || !StringUtils.hasText(request.getPreferenceType())) {
            throw new IllegalArgumentException("pageKey / preferenceType 必填");
        }
        Long tenantId = TenantAssert.requireTenantId();
        String userId = UserContext.userId();
        if (userId == null) {
            throw new IllegalStateException("用户未登录");
        }

        UserPreference existing = userPreferenceService.getOne(
                new LambdaQueryWrapper<UserPreference>()
                        .eq(UserPreference::getTenantId, tenantId)
                        .eq(UserPreference::getUserId, userId)
                        .eq(UserPreference::getPageKey, request.getPageKey())
                        .eq(UserPreference::getPreferenceType, request.getPreferenceType())
                        .last("LIMIT 1")
        );

        LocalDateTime now = LocalDateTime.now();
        if (existing == null) {
            existing = new UserPreference();
            existing.setTenantId(tenantId);
            existing.setUserId(userId);
            existing.setBizType(StringUtils.hasText(request.getBizType()) ? request.getBizType() : "common");
            existing.setPageKey(request.getPageKey());
            existing.setPreferenceType(request.getPreferenceType());
            existing.setCreateTime(now);
        }
        existing.setPreferenceValue(request.getPreferenceValue());
        existing.setUpdateTime(now);

        userPreferenceService.saveOrUpdate(existing);
        log.info("[UserPreference] 保存偏好 tenantId={} userId={} page={} type={}",
                tenantId, userId, request.getPageKey(), request.getPreferenceType());
        return existing;
    }

    /** 删除单条偏好 */
    public void delete(String pageKey, String preferenceType) {
        TenantAssert.assertTenantContext();
        Long tenantId = TenantAssert.requireTenantId();
        String userId = UserContext.userId();
        if (userId == null) return;
        userPreferenceService.remove(
                new LambdaQueryWrapper<UserPreference>()
                        .eq(UserPreference::getTenantId, tenantId)
                        .eq(UserPreference::getUserId, userId)
                        .eq(UserPreference::getPageKey, pageKey)
                        .eq(UserPreference::getPreferenceType, preferenceType)
        );
    }
}
