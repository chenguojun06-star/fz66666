package com.fashion.supplychain.production.service.impl;

import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.fashion.supplychain.production.entity.AttendanceSupplementApply;
import com.fashion.supplychain.production.mapper.AttendanceSupplementApplyMapper;
import com.fashion.supplychain.production.service.AttendanceSupplementApplyService;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.util.Collections;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

/**
 * 补卡申请 Service 实现
 * <p>
 * 纯业务逻辑，无 @Transactional（事务在 Orchestrator 层，符合 D-001）
 */
@Service
public class AttendanceSupplementApplyServiceImpl
        extends ServiceImpl<AttendanceSupplementApplyMapper, AttendanceSupplementApply>
        implements AttendanceSupplementApplyService {

    @Override
    public AttendanceSupplementApply findPendingByUserDate(Long tenantId, String userId, LocalDate workDate) {
        if (tenantId == null || userId == null || workDate == null) return null;
        return baseMapper.selectPendingByUserDate(tenantId, userId, workDate);
    }

    @Override
    public List<AttendanceSupplementApply> listMyApplies(Long tenantId, String userId, String month) {
        if (tenantId == null || userId == null) return Collections.emptyList();
        LocalDate monthDate = parseMonth(month);
        if (monthDate == null) monthDate = LocalDate.now();
        YearMonth ym = YearMonth.from(monthDate);
        LocalDate monthStart = ym.atDay(1);
        LocalDate monthEnd = ym.atEndOfMonth();
        return baseMapper.selectMyApplies(tenantId, userId, monthStart, monthEnd);
    }

    @Override
    public List<AttendanceSupplementApply> listPending(Long tenantId, LocalDate startDate, LocalDate endDate) {
        if (tenantId == null || startDate == null || endDate == null) return Collections.emptyList();
        return baseMapper.selectPendingList(tenantId, startDate, endDate);
    }

    /**
     * 解析月份字符串（yyyy-MM），失败返回 null
     */
    private LocalDate parseMonth(String monthStr) {
        if (!StringUtils.hasText(monthStr)) return null;
        try {
            return LocalDate.parse(monthStr + "-01", DateTimeFormatter.ofPattern("yyyy-MM-dd"));
        } catch (Exception e) {
            return null;
        }
    }
}
