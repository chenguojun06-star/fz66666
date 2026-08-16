package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.AttendanceSupplementApply;
import com.fashion.supplychain.production.entity.WorkAttendance;
import com.fashion.supplychain.production.service.AttendanceSupplementApplyService;
import com.fashion.supplychain.production.service.WorkAttendanceService;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/** 补卡审批编排器（事务边界，符合 D-001）。流程：员工提交申请 → 管理员审批 → 通过后自动写入 t_work_attendance。 */
@Slf4j
@Component
public class AttendanceSupplementApplyOrchestrator {
    @Autowired
    private AttendanceSupplementApplyService applyService;
    @Autowired
    private WorkAttendanceService workAttendanceService;
    /** 员工提交补卡申请（仅过去日期，当天应直接打卡） */
    public Map<String, Object> submitApply(LocalDate workDate, LocalDateTime clockInTime,
                                           LocalDateTime clockOutTime, String reason) {
        UserContext ctx = requireUserContext();
        Long tenantId = UserContext.tenantId();
        String userId = ctx.getUserId();
        if (workDate == null) throw new IllegalArgumentException("请选择补卡日期");
        if (clockInTime == null && clockOutTime == null) {
            throw new IllegalArgumentException("上班时间和下班时间至少填一项");
        }
        if (workDate.isAfter(LocalDate.now())) throw new IllegalArgumentException("不允许补未来日期");
        if (workDate.equals(LocalDate.now())) throw new IllegalArgumentException("当天请直接打卡，无需补卡申请");
        if (applyService.findPendingByUserDate(tenantId, userId, workDate) != null) {
            throw new IllegalStateException("该日期已有待审批的补卡申请，请等待审批结果");
        }
        AttendanceSupplementApply apply = new AttendanceSupplementApply();
        apply.setTenantId(tenantId); apply.setUserId(userId); apply.setUserName(ctx.getUsername());
        apply.setFactoryId(UserContext.factoryId()); apply.setWorkDate(workDate);
        apply.setClockInTime(clockInTime); apply.setClockOutTime(clockOutTime);
        apply.setReason(reason); apply.setStatus("PENDING"); apply.setDeleteFlag(0);
        applyService.save(apply);
        log.info("[submitApply] tenantId={} userId={} workDate={}", tenantId, userId, workDate);
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", "补卡申请已提交，请等待管理员审批");
        resp.put("applyId", apply.getId());
        return resp;
    }
    /** 员工查看我的申请列表 */
    public Map<String, Object> myApplies(String month) {
        UserContext ctx = requireUserContext();
        List<AttendanceSupplementApply> list = applyService.listMyApplies(UserContext.tenantId(), ctx.getUserId(), month);
        return listResp(list);
    }
    /** 管理员待审批列表 */
    public Map<String, Object> pendingList(LocalDate startDate, LocalDate endDate) {
        UserContext ctx = requireAdminContext();
        if (startDate == null) startDate = LocalDate.now().minusDays(30);
        if (endDate == null) endDate = LocalDate.now();
        List<AttendanceSupplementApply> list = applyService.listPending(UserContext.tenantId(), startDate, endDate);
        return listResp(list);
    }
    /** 管理员审批通过（事务边界 D-001）：更新申请 + 创建打卡记录 + 关联 attendance_id 三步原子 */
    @Transactional
    public Map<String, Object> approve(Long applyId, String approveRemark) {
        UserContext ctx = requireAdminContext();
        Long tenantId = UserContext.tenantId();
        AttendanceSupplementApply apply = requirePendingApply(tenantId, applyId);
        apply.setStatus("APPROVED"); apply.setApproverId(ctx.getUserId()); apply.setApproverName(ctx.getUsername());
        apply.setApproveTime(LocalDateTime.now()); apply.setApproveRemark(approveRemark);
        applyService.updateById(apply);
        WorkAttendance r = new WorkAttendance();
        r.setTenantId(tenantId); r.setUserId(apply.getUserId()); r.setUserName(apply.getUserName());
        r.setFactoryId(apply.getFactoryId()); r.setWorkDate(apply.getWorkDate());
        r.setClockInTime(apply.getClockInTime()); r.setClockOutTime(apply.getClockOutTime());
        r.setWorkMinutes(computeWorkMinutes(apply.getClockInTime(), apply.getClockOutTime()));
        r.setSource("supplement_approved"); r.setStatus("ADJUSTED");
        r.setOperatorId(ctx.getUserId()); r.setOperatorName(ctx.getUsername());
        r.setOperateTime(LocalDateTime.now()); r.setRemark("补卡申请审批通过 #" + apply.getId());
        r.setDeleteFlag(0);
        workAttendanceService.save(r);
        apply.setAttendanceId(r.getId());
        applyService.updateById(apply);
        log.info("[approve] applyId={} tenantId={} approver={} attendanceId={}",
                applyId, tenantId, ctx.getUserId(), r.getId());
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", "审批通过，已自动生成打卡记录");
        resp.put("attendanceId", r.getId());
        return resp;
    }
    /** 管理员审批拒绝 */
    public Map<String, Object> reject(Long applyId, String approveRemark) {
        UserContext ctx = requireAdminContext();
        AttendanceSupplementApply apply = requirePendingApply(UserContext.tenantId(), applyId);
        apply.setStatus("REJECTED"); apply.setApproverId(ctx.getUserId()); apply.setApproverName(ctx.getUsername());
        apply.setApproveTime(LocalDateTime.now()); apply.setApproveRemark(approveRemark);
        applyService.updateById(apply);
        log.info("[reject] applyId={} tenantId={} approver={}", applyId, UserContext.tenantId(), ctx.getUserId());
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("message", "已拒绝补卡申请");
        return resp;
    }
    private Map<String, Object> listResp(List<AttendanceSupplementApply> list) {
        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("list", list); resp.put("total", list.size());
        return resp;
    }
    private AttendanceSupplementApply requirePendingApply(Long tenantId, Long applyId) {
        if (applyId == null) throw new IllegalArgumentException("申请ID不能为空");
        AttendanceSupplementApply apply = applyService.getById(applyId);
        if (apply == null || !tenantId.equals(apply.getTenantId())) {
            throw new IllegalStateException("申请不存在或无权访问");
        }
        if (!"PENDING".equals(apply.getStatus())) {
            throw new IllegalStateException("申请已处理，不能重复审批");
        }
        return apply;
    }
    private int computeWorkMinutes(LocalDateTime clockIn, LocalDateTime clockOut) {
        if (clockIn == null || clockOut == null) return 0;
        long m = Duration.between(clockIn, clockOut).toMinutes();
        return (m < 0) ? 0 : (m > 1440 ? 1440 : (int) m);
    }
    private UserContext requireUserContext() {
        UserContext ctx = UserContext.get();
        if (ctx == null || !StringUtils.hasText(ctx.getUserId()) || UserContext.tenantId() == null) {
            throw new org.springframework.security.access.AccessDeniedException("未登录");
        }
        TenantAssert.assertTenantContext();
        return ctx;
    }
    /** 管理员校验（P0 铁律：权限交给后端，统一用 isSupervisorOrAbove） */
    private UserContext requireAdminContext() {
        UserContext ctx = requireUserContext();
        if (!UserContext.isSupervisorOrAbove()) {
            throw new org.springframework.security.access.AccessDeniedException("无权限：仅管理员可操作");
        }
        return ctx;
    }
}
