package com.fashion.supplychain.system.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.system.entity.AnnouncementRead;
import com.fashion.supplychain.system.entity.PlatformAnnouncement;
import com.fashion.supplychain.system.mapper.AnnouncementReadMapper;
import com.fashion.supplychain.system.mapper.PlatformAnnouncementMapper;
import com.fashion.supplychain.system.service.PlatformAnnouncementService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
public class PlatformAnnouncementServiceImpl extends ServiceImpl<PlatformAnnouncementMapper, PlatformAnnouncement>
        implements PlatformAnnouncementService {

    @Autowired
    private AnnouncementReadMapper announcementReadMapper;

    @Override
    public List<PlatformAnnouncement> getActiveAnnouncements(Long tenantId, String userId) {
        LocalDateTime now = LocalDateTime.now();

        // 查询用户已读的公告ID列表
        List<Long> readIds = getReadAnnouncementIds(userId, tenantId);

        LambdaQueryWrapper<PlatformAnnouncement> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(PlatformAnnouncement::getActive, 1)
                .and(w -> w.isNull(PlatformAnnouncement::getTenantId)
                        .or()
                        .eq(PlatformAnnouncement::getTenantId, tenantId))
                .and(w -> w.isNull(PlatformAnnouncement::getStartTime)
                        .or()
                        .le(PlatformAnnouncement::getStartTime, now))
                .and(w -> w.isNull(PlatformAnnouncement::getEndTime)
                        .or()
                        .ge(PlatformAnnouncement::getEndTime, now));

        if (!readIds.isEmpty()) {
            wrapper.notIn(PlatformAnnouncement::getId, readIds);
        }

        wrapper.orderByDesc(PlatformAnnouncement::getCreatedAt);

        return list(wrapper);
    }

    @Override
    public void markAsRead(Long announcementId, String userId, Long tenantId) {
        // 幂等：先查是否已读
        LambdaQueryWrapper<AnnouncementRead> checkWrapper = new LambdaQueryWrapper<>();
        checkWrapper.eq(AnnouncementRead::getAnnouncementId, announcementId)
                .eq(AnnouncementRead::getUserId, userId);
        Long count = announcementReadMapper.selectCount(checkWrapper);
        if (count > 0) {
            return;
        }

        AnnouncementRead read = new AnnouncementRead();
        read.setAnnouncementId(announcementId);
        read.setUserId(userId);
        read.setTenantId(tenantId);
        read.setReadAt(LocalDateTime.now());
        announcementReadMapper.insert(read);
    }

    @Override
    public PlatformAnnouncement createAnnouncement(PlatformAnnouncement announcement) {
        if (announcement.getActive() == null) {
            announcement.setActive(1);
        }
        if (announcement.getType() == null) {
            announcement.setType("info");
        }
        announcement.setCreatedAt(LocalDateTime.now());
        announcement.setUpdatedAt(LocalDateTime.now());
        save(announcement);
        return announcement;
    }

    @Override
    public void deactivateAnnouncement(Long id) {
        PlatformAnnouncement announcement = getById(id);
        if (announcement == null) {
            return;
        }
        announcement.setActive(0);
        announcement.setUpdatedAt(LocalDateTime.now());
        updateById(announcement);
    }

    @Override
    public List<PlatformAnnouncement> listAll(Long tenantId) {
        LambdaQueryWrapper<PlatformAnnouncement> wrapper = new LambdaQueryWrapper<>();
        wrapper.and(w -> w.isNull(PlatformAnnouncement::getTenantId)
                        .or()
                        .eq(PlatformAnnouncement::getTenantId, tenantId))
                .orderByDesc(PlatformAnnouncement::getCreatedAt);
        return list(wrapper);
    }

    private List<Long> getReadAnnouncementIds(String userId, Long tenantId) {
        LambdaQueryWrapper<AnnouncementRead> readWrapper = new LambdaQueryWrapper<>();
        readWrapper.eq(AnnouncementRead::getUserId, userId);
        if (tenantId != null) {
            readWrapper.and(w -> w.isNull(AnnouncementRead::getTenantId)
                    .or()
                    .eq(AnnouncementRead::getTenantId, tenantId));
        }
        List<AnnouncementRead> readList = announcementReadMapper.selectList(readWrapper);
        if (readList.isEmpty()) {
            return Collections.emptyList();
        }
        return readList.stream().map(AnnouncementRead::getAnnouncementId).collect(Collectors.toList());
    }
}
