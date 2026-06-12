package com.fashion.supplychain.intelligence.engine.push;

import com.fashion.supplychain.intelligence.entity.PushTimingEntity;
import com.fashion.supplychain.intelligence.mapper.PushTimingMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@Lazy
@RequiredArgsConstructor
public class PushTimingService {

    private final PushTimingMapper pushTimingMapper;

    public boolean shouldPushNow(Long tenantId, String userId, String pushType) {
        if (tenantId == null || userId == null) return true;
        try {
            PushTimingEntity t = pushTimingMapper.findByUserAndType(tenantId, userId, pushType);
            if (t == null || t.getEnabled() == null || t.getEnabled() == 0) return true;
            LocalDateTime now = LocalDateTime.now();
            int weekdayBit = 1 << (now.getDayOfWeek().getValue() - 1);
            if ((t.getWeekdayMask() & weekdayBit) == 0) return false;
            if (t.getQuietHoursStart() != null && t.getQuietHoursEnd() != null) {
                int hour = now.getHour();
                if (t.getQuietHoursStart() < t.getQuietHoursEnd()) {
                    if (hour >= t.getQuietHoursStart() && hour < t.getQuietHoursEnd()) return false;
                } else {
                    if (hour >= t.getQuietHoursStart() || hour < t.getQuietHoursEnd()) return false;
                }
            }
            if (t.getPreferredHour() != null) {
                int diff = Math.abs(now.getHour() - t.getPreferredHour());
                if (diff > 2 && diff < 22) return false;
            }
            return true;
        } catch (Exception e) {
            log.debug("[PushTiming] shouldPushNow failed: {}", e.getMessage());
            return true;
        }
    }

    public PushTimingEntity getOrCreate(Long tenantId, String userId, String pushType) {
        if (tenantId == null || userId == null || pushType == null) return null;
        try {
            PushTimingEntity existing = pushTimingMapper.findByUserAndType(tenantId, userId, pushType);
            if (existing != null) return existing;
            PushTimingEntity entity = new PushTimingEntity();
            entity.setTenantId(tenantId);
            entity.setUserId(userId);
            entity.setPushType(pushType);
            entity.setPreferredHour(9);
            entity.setPreferredMinute(0);
            entity.setWeekdayMask(127);
            entity.setQuietHoursStart(22);
            entity.setQuietHoursEnd(7);
            entity.setPushCount(0);
            entity.setOpenCount(0);
            entity.setOpenRate(0.0);
            entity.setEnabled(1);
            entity.setCreateTime(LocalDateTime.now());
            entity.setUpdateTime(LocalDateTime.now());
            pushTimingMapper.insert(entity);
            return entity;
        } catch (Exception e) {
            log.debug("[PushTiming] getOrCreate failed: {}", e.getMessage());
            return null;
        }
    }

    public void recordPush(Long tenantId, String userId, String pushType) {
        if (tenantId == null || userId == null) return;
        try {
            PushTimingEntity t = pushTimingMapper.findByUserAndType(tenantId, userId, pushType);
            if (t == null) {
                getOrCreate(tenantId, userId, pushType);
                t = pushTimingMapper.findByUserAndType(tenantId, userId, pushType);
            }
            if (t != null) pushTimingMapper.incrementPush(t.getId());
        } catch (Exception e) {
            log.debug("[PushTiming] recordPush failed: {}", e.getMessage());
        }
    }

    public void recordOpen(Long tenantId, String userId, String pushType) {
        if (tenantId == null || userId == null) return;
        try {
            PushTimingEntity t = pushTimingMapper.findByUserAndType(tenantId, userId, pushType);
            if (t != null) pushTimingMapper.incrementOpen(t.getId());
        } catch (Exception e) {
            log.debug("[PushTiming] recordOpen failed: {}", e.getMessage());
        }
    }

    public PushTimingEntity recordOpenAndAdjust(Long tenantId, String userId, String pushType) {
        if (tenantId == null || userId == null) return null;
        try {
            PushTimingEntity t = pushTimingMapper.findByUserAndType(tenantId, userId, pushType);
            if (t == null) return getOrCreate(tenantId, userId, pushType);
            pushTimingMapper.incrementOpen(t.getId());
            LocalDateTime now = LocalDateTime.now();
            int newPref = (t.getPreferredHour() == null ? now.getHour()
                    : (t.getPreferredHour() + now.getHour()) / 2);
            t.setPreferredHour(newPref);
            t.setUpdateTime(LocalDateTime.now());
            pushTimingMapper.updateById(t);
            return t;
        } catch (Exception e) {
            log.debug("[PushTiming] recordOpenAndAdjust failed: {}", e.getMessage());
            return null;
        }
    }

    public int totalEnabledRules(Long tenantId, String userId) {
        if (tenantId == null || userId == null) return 0;
        try {
            return pushTimingMapper.findEnabledByUser(tenantId, userId).size();
        } catch (Exception e) {
            return 0;
        }
    }

    public DayOfWeek today() {
        return LocalDateTime.now().getDayOfWeek();
    }
}
