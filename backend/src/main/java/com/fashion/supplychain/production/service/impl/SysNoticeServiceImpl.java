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
        return lambdaQuery()
                .eq(SysNotice::getTenantId, tenantId)
                .and(w -> w.eq(SysNotice::getToName, name)
                           .or().eq(SysNotice::getToName, username))
                .orderByDesc(SysNotice::getCreatedAt)
                .last("LIMIT 30")
                .list();
    }

    @Override
    public long countUnread(Long tenantId, String name, String username) {
        return lambdaQuery()
                .eq(SysNotice::getTenantId, tenantId)
                .eq(SysNotice::getIsRead, 0)
                .and(w -> w.eq(SysNotice::getToName, name)
                           .or().eq(SysNotice::getToName, username))
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
