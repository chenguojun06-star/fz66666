package com.fashion.supplychain.production.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.fashion.supplychain.production.entity.AttendanceSupplementApply;
import java.time.LocalDate;
import java.util.List;

/**
 * 补卡申请 Service
 * <p>
 * 纯业务逻辑，无 @Transactional（事务在 Orchestrator 层，符合 D-001）
 */
public interface AttendanceSupplementApplyService extends IService<AttendanceSupplementApply> {

    /**
     * 查询某员工某天的待审批申请（用于提交时检查重复）
     */
    AttendanceSupplementApply findPendingByUserDate(Long tenantId, String userId, LocalDate workDate);

    /**
     * 员工查看自己的申请列表（按月筛选）
     * @param month 格式 yyyy-MM；null 时默认当月
     */
    List<AttendanceSupplementApply> listMyApplies(Long tenantId, String userId, String month);

    /**
     * 管理员待审批列表
     */
    List<AttendanceSupplementApply> listPending(Long tenantId, LocalDate startDate, LocalDate endDate);
}
