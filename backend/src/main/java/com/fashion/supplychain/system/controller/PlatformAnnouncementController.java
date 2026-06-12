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
     * 创建公告（ADMIN）
     */
    @PreAuthorize("hasRole('ADMIN')")
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
        if (params.containsKey("tenantId") && params.get("tenantId") != null) {
            announcement.setTenantId(Long.parseLong(params.get("tenantId").toString()));
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
     * 下架公告（ADMIN）
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/{id}/deactivate")
    public Result<Void> deactivateAnnouncement(@PathVariable Long id) {
        platformAnnouncementService.deactivateAnnouncement(id);
        return Result.success();
    }

    /**
     * 管理员查看所有公告（ADMIN）
     */
    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping("/list")
    public Result<List<PlatformAnnouncement>> listAll() {
        Long tenantId = TenantAssert.requireTenantId();
        List<PlatformAnnouncement> list = platformAnnouncementService.listAll(tenantId);
        return Result.success(list);
    }
}
