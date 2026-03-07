package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.SysNotice;

import java.util.List;

/**
 * 站内通知 Service
 */
public interface SysNoticeService extends IService<SysNotice> {

    /**
     * 查询指定用户的通知列表（匹配 name 或 username 任意一个）
     *
     * @param tenantId 租户ID
     * @param name     用户显示名
     * @param username 用户登录名
     * @return 最近30条，按时间倒序
     */
    List<SysNotice> queryForUser(Long tenantId, String name, String username);

    /**
     * 统计指定用户的未读通知数
     */
    long countUnread(Long tenantId, String name, String username);

    /**
     * 将指定通知标记为已读（带租户校验）
     */
    boolean markRead(Long id, Long tenantId);
}
