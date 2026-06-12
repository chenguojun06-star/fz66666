package com.fashion.supplychain.system.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.system.entity.PlatformAnnouncement;

import java.util.List;

public interface PlatformAnnouncementService extends IService<PlatformAnnouncement> {

    /**
     * 查询当前生效且用户未读的公告列表
     */
    List<PlatformAnnouncement> getActiveAnnouncements(Long tenantId, String userId);

    /**
     * 标记公告已读
     */
    void markAsRead(Long announcementId, String userId, Long tenantId);

    /**
     * 创建公告
     */
    PlatformAnnouncement createAnnouncement(PlatformAnnouncement announcement);

    /**
     * 下架公告
     */
    void deactivateAnnouncement(Long id);

    /**
     * 管理员查看所有公告
     */
    List<PlatformAnnouncement> listAll(Long tenantId);
}
