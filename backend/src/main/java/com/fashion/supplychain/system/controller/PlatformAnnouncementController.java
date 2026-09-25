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
     * <p>D-513 权限修正（最终）：<b>仅平台超管（云裳智链）可发布</b>。
     * 上一版误开放给租户主账号，属于需求理解错误——「平台通知」是平台方
     * 面向所有租户发布的更新通知，租户侧只能查看，不应有发布入口。
     *
     * <p>实现选择 UserContext.isSuperAdmin() 业务判断而非注解角色名：
     * 本项目角色名字符串映射不可靠（存在 {@code ROLE_tenant_owner} 小写、
     * {@code ROLE_1} 数字角色等），且 hasRole 大小写敏感已踩过 403 的坑。
     * UserContext.isSuperAdmin() 依赖登录时写入的 superAdmin 标志，稳定可靠。
     */
    @PostMapping("/")
    public Result<PlatformAnnouncement> createAnnouncement(@RequestBody Map<String, Object> params) {
        if (!UserContext.isSuperAdmin()) {
            return Result.fail("仅平台方可以发布平台通知");
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

        /*
         * tenantId：不传或传 null = 全局公告（所有租户可见）——
         * 平台发布更新通知的场景默认就是全局，因此保持不设值即可。
         * 如需定向到某个租户，才传 tenantId。
         */
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
     * 下架公告（仅平台超管）
     */
    @PutMapping("/{id}/deactivate")
    public Result<Void> deactivateAnnouncement(@PathVariable Long id) {
        if (!UserContext.isSuperAdmin()) {
            return Result.fail("仅平台方可以下架平台通知");
        }
        PlatformAnnouncement existing = platformAnnouncementService.getById(id);
        if (existing == null) {
            return Result.fail("公告不存在");
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
