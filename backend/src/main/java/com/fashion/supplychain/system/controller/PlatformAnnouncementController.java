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
     * <p>D-513 权限修正：原为 {@code hasRole('ADMIN')}，但本项目角色体系是
     * SUPER_ADMIN（平台超管）/ TENANT_OWNER（租户主账号），并不存在 ROLE_ADMIN，
     * 导致租户主账号【发不了公告】——「常驻通知栏」因此始终无数据。
     * 现按项目惯例（见 ScanRecordController）放开为二者之一。
     *
     * <p>同时补租户隔离：非平台超管强制归属自己的租户，
     * 防止伪造 tenantId 向其他租户发布公告。
     */
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasRole('TENANT_OWNER')")
    @PostMapping("/")
    public Result<PlatformAnnouncement> createAnnouncement(@RequestBody Map<String, Object> params) {
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
     * <p>D-513：权限同创建；并补租户归属校验——原实现直接按 id 下架，
     * 放开权限后租户主账号将可下架他人/全局公告（越权）。
     */
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasRole('TENANT_OWNER')")
    @PutMapping("/{id}/deactivate")
    public Result<Void> deactivateAnnouncement(@PathVariable Long id) {
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
     * 查看所有公告（管理端）
     */
    @PreAuthorize("hasRole('SUPER_ADMIN') or hasRole('TENANT_OWNER')")
    @PostMapping("/list")
    public Result<List<PlatformAnnouncement>> listAll() {
        Long tenantId = TenantAssert.requireTenantId();
        List<PlatformAnnouncement> list = platformAnnouncementService.listAll(tenantId);
        return Result.success(list);
    }
}
