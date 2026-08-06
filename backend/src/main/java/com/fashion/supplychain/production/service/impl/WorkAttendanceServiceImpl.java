package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.WorkAttendance;
import com.fashion.supplychain.production.mapper.WorkAttendanceMapper;
import com.fashion.supplychain.production.service.WorkAttendanceService;
import java.time.LocalDate;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/**
 * 员工打卡 Service 实现
 * 纯业务逻辑，无 @Transactional（事务在 Orchestrator 层）
 */
@Service
public class WorkAttendanceServiceImpl extends ServiceImpl<WorkAttendanceMapper, WorkAttendance>
        implements WorkAttendanceService {

    @Override
    public WorkAttendance findToday(Long tenantId, String userId, LocalDate workDate) {
        if (tenantId == null || userId == null || workDate == null) return null;
        return baseMapper.selectToday(tenantId, userId, workDate);
    }

    @Override
    public WorkAttendance findTodayIncludingCancelled(Long tenantId, String userId, LocalDate workDate) {
        if (tenantId == null || userId == null || workDate == null) return null;
        return baseMapper.selectTodayIncludingCancelled(tenantId, userId, workDate);
    }

    @Override
    public WorkAttendance findLatestOpen(Long tenantId, String userId) {
        if (tenantId == null || userId == null) return null;
        return baseMapper.selectLatestOpen(tenantId, userId);
    }

    @Override
    public Map<String, Object> monthlyStats(Long tenantId, String userId, LocalDate month) {
        if (tenantId == null || userId == null || month == null) return Collections.emptyMap();
        return baseMapper.selectMonthlyStats(tenantId, userId, month);
    }

    @Override
    public List<WorkAttendance> listMonthlyRecords(Long tenantId, String userId, LocalDate month) {
        if (tenantId == null || userId == null || month == null) return Collections.emptyList();
        return baseMapper.selectMonthlyRecords(tenantId, userId, month);
    }

    @Override
    public List<WorkAttendance> listForAdmin(Long tenantId, LocalDate startDate, LocalDate endDate,
                                             String userId, String status) {
        if (tenantId == null || startDate == null || endDate == null) return Collections.emptyList();
        return baseMapper.selectForAdmin(tenantId, startDate, endDate, userId, status);
    }

    @Override
    public Map<String, Object> adminStats(Long tenantId, LocalDate startDate, LocalDate endDate) {
        if (tenantId == null || startDate == null || endDate == null) return Collections.emptyMap();
        return baseMapper.selectAdminStats(tenantId, startDate, endDate);
    }

    @Override
    public List<WorkAttendance> listByUserAndDateRange(Long tenantId, String userId,
                                                       LocalDate startDate, LocalDate endDate) {
        if (tenantId == null || userId == null || startDate == null || endDate == null) {
            return Collections.emptyList();
        }
        return baseMapper.selectByUserAndDateRange(tenantId, userId, startDate, endDate);
    }
}
