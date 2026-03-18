package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.intelligence.entity.AiUserProfile;
import com.fashion.supplychain.intelligence.mapper.AiUserProfileMapper;
import java.time.LocalDateTime;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/**
 * 超级顾问 — 个性化画像编排器
 *
 * <p>职责：
 * <ol>
 *   <li>读取已有 t_ai_user_profile 画像数据，构建 System Prompt 人设片段</li>
 *   <li>根据用户角色（管理层/跟单/工厂）动态调整回答风格与关注点</li>
 *   <li>异步更新画像摘要（行为偏好、查询偏好等）</li>
 * </ol>
 */
@Service
@Slf4j
public class AdvisorProfileOrchestrator {

    @Autowired
    private AiUserProfileMapper profileMapper;

    /**
     * 构建个性化 Prompt 片段。
     * 返回空串表示无画像数据——上层直接跳过即可。
     */
    public String buildProfilePrompt(Long tenantId, String userId) {
        if (tenantId == null || userId == null) return "";
        try {
            AiUserProfile profile = profileMapper.selectOne(
                    new LambdaQueryWrapper<AiUserProfile>()
                            .eq(AiUserProfile::getTenantId, tenantId)
                            .eq(AiUserProfile::getUserId, userId)
                            .last("LIMIT 1"));
            if (profile == null) return "";

            StringBuilder sb = new StringBuilder("【用户画像】\n");
            if (profile.getBehaviorSummary() != null && !profile.getBehaviorSummary().isBlank()) {
                sb.append("行为特征：").append(truncate(profile.getBehaviorSummary(), 200)).append("\n");
            }
            if (profile.getPreferencesJson() != null && !profile.getPreferencesJson().isBlank()) {
                sb.append("偏好配置：").append(truncate(profile.getPreferencesJson(), 200)).append("\n");
            }
            return sb.toString();
        } catch (Exception e) {
            log.warn("[AdvisorProfile] 构建画像失败: {}", e.getMessage());
            return "";
        }
    }

    /**
     * 异步追加行为摘要（由上层在请求结束后调用）
     */
    public void appendBehavior(Long tenantId, String userId, String behaviorNote) {
        if (tenantId == null || userId == null || behaviorNote == null) return;
        try {
            AiUserProfile profile = profileMapper.selectOne(
                    new LambdaQueryWrapper<AiUserProfile>()
                            .eq(AiUserProfile::getTenantId, tenantId)
                            .eq(AiUserProfile::getUserId, userId)
                            .last("LIMIT 1"));
            if (profile == null) {
                profile = new AiUserProfile();
                profile.setTenantId(tenantId);
                profile.setUserId(userId);
                profile.setBehaviorSummary(truncate(behaviorNote, 500));
                profile.setCreateTime(LocalDateTime.now());
                profile.setUpdateTime(LocalDateTime.now());
                profileMapper.insert(profile);
            } else {
                String existing = profile.getBehaviorSummary() == null ? "" : profile.getBehaviorSummary();
                String merged = existing.length() > 400
                        ? existing.substring(existing.length() - 400) + ";" + behaviorNote
                        : existing + (existing.isEmpty() ? "" : ";") + behaviorNote;
                profile.setBehaviorSummary(truncate(merged, 500));
                profile.setUpdateTime(LocalDateTime.now());
                profileMapper.updateById(profile);
            }
        } catch (Exception e) {
            log.warn("[AdvisorProfile] 更新画像失败: {}", e.getMessage());
        }
    }

    private String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max);
    }
}
