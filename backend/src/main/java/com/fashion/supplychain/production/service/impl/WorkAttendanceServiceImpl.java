package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.WorkAttendance;
import com.fashion.supplychain.production.mapper.WorkAttendanceMapper;
import com.fashion.supplychain.production.service.WorkAttendanceService;
import java.time.LocalDate;
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
    public WorkAttendance findLatestOpen(Long tenantId, String userId) {
        if (tenantId == null || userId == null) return null;
        return baseMapper.selectLatestOpen(tenantId, userId);
    }

    @Override
    public Map<String, Object> monthlyStats(Long tenantId, String userId, LocalDate month) {
        if (tenantId == null || userId == null || month == null) return java.util.Collections.emptyMap();
        return baseMapper.selectMonthlyStats(tenantId, userId, month);
    }
}
