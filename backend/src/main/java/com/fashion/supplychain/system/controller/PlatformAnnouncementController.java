package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.system.entity.PlatformAnnouncement;
import com.fashion.supplychain.system.service.PlatformAnnouncementService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/system/announcement")
@PreAuthorize("isAuthenticated()")
public class PlatformAnnouncementController {

    @Autowired
    private PlatformAnnouncementService platformAnnouncementService;

    /**
     * 获取当前生效的未读公告（普通用户）
     */
    @PostMapping("/active")
    public Result<List<PlatformAnnouncement>> getActiveAnnouncements() {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        List<PlatformAnnouncement> list = platformAnnouncementService.getActiveAnnouncements(tenantId, userId);
        return Result.success(list);
    }

    /**
     * 标记已读
     */
    @PostMapping("/{id}/read")
    public Result<Void> markAsRead(@PathVariable Long id) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        platformAnnouncementService.markAsRead(id, userId, tenantId);
        return Result.success();
    }

    /**
     * 创建公告
     *
     * <p>D-513 权限修正（二次）：
     * ① 原为 {@code hasRole('ADMIN')}——本项目不存在 ROLE_ADMIN，租户主账号发不了公告；
     * ② 改为 {@code hasRole('TENANT_OWNER')} 后实测仍 403：Spring 的 hasRole('TENANT_OWNER')
     *    校验的是 authority <b>ROLE_TENANT_OWNER（大写）</b>，而项目
     *    {@code SecurityConstants.TENANT_OWNER_ROLES} 中登记的是小写 {@code ROLE_tenant_owner}，
     *    大小写不匹配 → 拒绝。
     *
     * <p>最终方案：<b>不再在方法级重复声明角色</b>——
     * {@code SecurityConstants.TENANT_OWNER_ENDPOINTS} 已包含 {@code /api/system/**}，
     * 由 SecurityConfig 的 URL 级规则统一把关（等价于 SUPER_ADMIN 或租户主账号）；
     * 方法内再用 UserContext 做一次业务层保险，避免依赖脆弱的角色名映射。
     */
    @PostMapping("/")
    public Result<PlatformAnnouncement> createAnnouncement(@RequestBody Map<String, Object> params) {
        // 业务层保险：仅平台超管或租户主账号可发布
        if (!UserContext.isSuperAdmin() && !UserContext.isTenantOwner()) {
            return Result.fail("无权发布公告");
        }
        String title = params.get("title") != null ? params.get("title").toString() : null;
        if (!StringUtils.hasText(title)) {
            return Result.fail("公告标题不能为空");
        }

        PlatformAnnouncement announcement = new PlatformAnnouncement();
        announcement.setTitle(title);
        announcement.setContent(params.get("content") != null ? params.get("content").toString() : null);
        announcement.setType(params.get("type") != null ? params.get("type").toString() : "info");
        announcement.setCreatedBy(UserContext.userId());

        // tenantId: 不传或传null表示全局公告，传具体值表示租户级公告
        if (UserContext.isSuperAdmin()) {
            // 平台超管：可发全局（tenantId=null）或指定租户
            if (params.containsKey("tenantId") && params.get("tenantId") != null) {
                announcement.setTenantId(Long.parseLong(params.get("tenantId").toString()));
            }
        } else {
            // 租户主账号：只能发本租户公告，忽略入参中的 tenantId（防越权）
            Long ownTenantId = UserContext.tenantId();
            if (ownTenantId == null) {
                return Result.fail("无法确定所属租户，禁止发布公告");
            }
            announcement.setTenantId(ownTenantId);
        }

        if (params.containsKey("startTime") && params.get("startTime") != null) {
            announcement.setStartTime(java.time.LocalDateTime.parse(params.get("startTime").toString()));
        }
        if (params.containsKey("endTime") && params.get("endTime") != null) {
            announcement.setEndTime(java.time.LocalDateTime.parse(params.get("endTime").toString()));
        }

        PlatformAnnouncement created = platformAnnouncementService.createAnnouncement(announcement);
        return Result.success(created);
    }

    /**
     * 下架公告
     *
     * <p>D-513：权限同创建（交由 URL 级规则）；并补租户归属校验——
     * 原实现直接按 id 下架，租户主账号将可下架他人/全局公告（越权）。
     */
    @PutMapping("/{id}/deactivate")
    public Result<Void> deactivateAnnouncement(@PathVariable Long id) {
        if (!UserContext.isSuperAdmin() && !UserContext.isTenantOwner()) {
            return Result.fail("无权下架公告");
        }
        PlatformAnnouncement existing = platformAnnouncementService.getById(id);
        if (existing == null) {
            return Result.fail("公告不存在");
        }
        if (!UserContext.isSuperAdmin()) {
            Long ownTenantId = UserContext.tenantId();
            // 全局公告（tenantId=null）仅平台超管可下架
            if (ownTenantId == null || !ownTenantId.equals(existing.getTenantId())) {
                return Result.fail("无权操作该公告");
            }
        }
        platformAnnouncementService.deactivateAnnouncement(id);
        return Result.success();
    }

    /**
     * 查看所有公告（管理端）——权限交由 URL 级规则（/api/system/**）
     */
    @PostMapping("/list")
    public Result<List<PlatformAnnouncement>> listAll() {
        Long tenantId = TenantAssert.requireTenantId();
        List<PlatformAnnouncement> list = platformAnnouncementService.listAll(tenantId);
        return Result.success(list);
    }
}
