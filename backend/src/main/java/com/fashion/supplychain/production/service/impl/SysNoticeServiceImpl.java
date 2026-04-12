package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.mapper.SysNoticeMapper;
import com.fashion.supplychain.production.service.SysNoticeService;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 站内通知 ServiceImpl
 */
@Service
public class SysNoticeServiceImpl extends ServiceImpl<SysNoticeMapper, SysNotice>
        implements SysNoticeService {

    @Override
    public List<SysNotice> queryForUser(Long tenantId, String name, String username) {
        // system_broadcast（超管全局公告）对同租户所有用户可见；
        // 其他类型通知只匹配当前用户的 displayName 或 username
        return lambdaQuery()
                .eq(SysNotice::getTenantId, tenantId)
                .and(w -> w
                        .eq(SysNotice::getNoticeType, "system_broadcast")
                        .or(inner -> inner
                                .ne(SysNotice::getNoticeType, "system_broadcast")
                                .and(u -> u.eq(SysNotice::getToName, name)
                                           .or().eq(SysNotice::getToName, username))))
                .orderByDesc(SysNotice::getCreatedAt)
                .last("LIMIT 30")
                .list();
    }

    @Override
    public long countUnread(Long tenantId, String name, String username) {
        // system_broadcast 对同租户所有用户计入未读数
        return lambdaQuery()
                .eq(SysNotice::getTenantId, tenantId)
                .eq(SysNotice::getIsRead, 0)
                .and(w -> w
                        .eq(SysNotice::getNoticeType, "system_broadcast")
                        .or(inner -> inner
                                .ne(SysNotice::getNoticeType, "system_broadcast")
                                .and(u -> u.eq(SysNotice::getToName, name)
                                           .or().eq(SysNotice::getToName, username))))
                .count();
    }

    @Override
    public boolean markRead(Long id, Long tenantId) {
        return lambdaUpdate()
                .eq(SysNotice::getId, id)
                .eq(SysNotice::getTenantId, tenantId)
                .set(SysNotice::getIsRead, 1)
                .update();
    }
}
