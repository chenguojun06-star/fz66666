package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.ChangeApproval;
import com.fashion.supplychain.system.entity.OrganizationUnit;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.ChangeApprovalService;
import com.fashion.supplychain.system.service.OrganizationUnitService;
import com.fashion.supplychain.system.service.UserService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

/**
 * 变更审批编排器
 * 负责审批流的创建、审批通过/驳回，以及审批通过后执行真实操作。
 *
 * 核心流程：
 *   操作发起 → checkAndCreateIfNeeded() 判断是否需要审批
 *   → 若需要：持久化 t_change_approval(PENDING)，由前端提示"等待主管审批"
 *   → 管理人 approve() / reject()
 *   → approve() 解析 operationData，调用目标 Orchestrator 执行真实操作
 */
@Slf4j
@Service
public class ChangeApprovalOrchestrator {

    @Autowired
    private ChangeApprovalService changeApprovalService;

    @Autowired
    private OrganizationUnitService organizationUnitService;

    @Autowired
    private UserService userService;

    @Autowired
    private ObjectMapper objectMapper;

    // 延迟注入，防止循环依赖
    @Lazy
    @Autowired(required = false)
    private com.fashion.supplychain.production.orchestration.ScanRecordOrchestrator scanRecordOrchestrator;

    @Lazy
    @Autowired(required = false)
    private com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator productionOrderOrchestrator;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 公共入口：提交审批申请
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * 检查当前操作是否需要审批，若需要则创建申请记录并返回审批信息。
     *
     * @param operationType 操作类型（SCAN_UNDO / ORDER_DELETE / STYLE_DELETE / SAMPLE_DELETE）
     * @param targetId      被操作记录ID
     * @param targetNo      业务单号（显示用）
     * @param operationData 操作参数（审批通过后执行用）
     * @param reason        申请说明
     * @return 若不需要审批返回 null；否则返回含 needApproval=true + approvalId 的 Map
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> checkAndCreateIfNeeded(
            String operationType, String targetId, String targetNo,
            Object operationData, String reason) {

        UserContext ctx = UserContext.get();
        if (ctx == null) return null;

        // 管理员/租户主不需要走审批（直接执行）
        if (UserContext.isTenantOwner() || UserContext.isSuperAdmin()) {
            return null;
        }

        User user = userService.getById(ctx.getUserId());
        if (user == null || !StringUtils.hasText(user.getOrgUnitId())) {
            return null; // 未加入组织，直接执行
        }

        // 沿层级向上查找审批人
        User approver = findApproverUpChain(user.getOrgUnitId(), ctx.getUserId(), ctx.getTenantId());
        if (approver == null) {
            return null; // 无审批人，直接执行
        }

        // 序列化操作参数
        String dataJson;
        try {
            if (operationData instanceof String) {
                dataJson = (String) operationData;
            } else {
                dataJson = objectMapper.writeValueAsString(operationData);
            }
        } catch (Exception e) {
            log.warn("[ChangeApproval] 序列化操作参数失败: {}", e.getMessage());
            dataJson = "{}";
        }

        // 查看是否已有 PENDING 的同类申请（避免重复提交）
        long existing = changeApprovalService.count(new LambdaQueryWrapper<ChangeApproval>()
                .eq(ChangeApproval::getTargetId, targetId)
                .eq(ChangeApproval::getOperationType, operationType)
                .eq(ChangeApproval::getStatus, "PENDING")
                .eq(ChangeApproval::getDeleteFlag, 0));
        if (existing > 0) {
            Map<String, Object> resp = new HashMap<>();
            resp.put("needApproval", true);
            resp.put("message", "该操作已有待审批申请，请等待主管审批");
            return resp;
        }

        // 查找申请人所属组织名称
        OrganizationUnit orgUnit = organizationUnitService.getById(user.getOrgUnitId());

        ChangeApproval approval = new ChangeApproval();
        approval.setTenantId(ctx.getTenantId());
        approval.setOperationType(operationType);
        approval.setTargetId(targetId);
        approval.setTargetNo(targetNo);
        approval.setOperationData(dataJson);
        approval.setApplicantId(ctx.getUserId());
        approval.setApplicantName(ctx.getUsername());
        approval.setOrgUnitId(user.getOrgUnitId());
        approval.setOrgUnitName(orgUnit != null ? orgUnit.getNodeName() : null);
        approval.setApproverId(String.valueOf(approver.getId()));
        approval.setApproverName(approver.getUsername());
        approval.setApplyReason(reason);
        approval.setStatus("PENDING");
        approval.setApplyTime(LocalDateTime.now());
        approval.setCreateTime(LocalDateTime.now());
        approval.setUpdateTime(LocalDateTime.now());
        approval.setDeleteFlag(0);
        changeApprovalService.save(approval);

        log.info("[ChangeApproval] 创建审批申请 id={} type={} target={} applicant={} approver={}",
                approval.getId(), operationType, targetId, ctx.getUserId(), approver.getId());

        Map<String, Object> resp = new HashMap<>();
        resp.put("needApproval", true);
        resp.put("approvalId", approval.getId());
        resp.put("approverName", approver.getUsername());
        resp.put("message", "操作申请已提交，等待主管【" + approver.getUsername() + "】审批");
        return resp;
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 审批操作
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * 审批通过，审批通过后自动执行被拦截的操作。
     */
    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> approve(String approvalId, String remark) {
        ChangeApproval approval = getAndValidateForApprover(approvalId);

        approval.setStatus("APPROVED");
        approval.setReviewRemark(remark);
        approval.setReviewTime(LocalDateTime.now());
        approval.setUpdateTime(LocalDateTime.now());
        changeApprovalService.updateById(approval);

        log.info("[ChangeApproval] 审批通过 id={} type={} target={}", approvalId,
                approval.getOperationType(), approval.getTargetId());

        // 执行真实操作
        Map<String, Object> execResult = executeApprovedOperation(approval);
        Map<String, Object> resp = new HashMap<>();
        resp.put("approved", true);
        resp.put("executeResult", execResult);
        resp.put("message", "审批通过，操作已执行");
        return resp;
    }

    /**
     * 驳回审批申请。
     */
    @Transactional(rollbackFor = Exception.class)
    public void reject(String approvalId, String reason) {
        ChangeApproval approval = getAndValidateForApprover(approvalId);

        approval.setStatus("REJECTED");
        approval.setReviewRemark(reason);
        approval.setReviewTime(LocalDateTime.now());
        approval.setUpdateTime(LocalDateTime.now());
        changeApprovalService.updateById(approval);

        log.info("[ChangeApproval] 审批驳回 id={} reason={}", approvalId, reason);
    }

    /**
     * 申请人撤销自己的申请（仅限 PENDING 状态）。
     */
    @Transactional(rollbackFor = Exception.class)
    public void cancel(String approvalId) {
        ChangeApproval approval = changeApprovalService.getById(approvalId);
        if (approval == null || approval.getDeleteFlag() != 0) {
            throw new IllegalArgumentException("审批申请不存在");
        }
        String currentUserId = UserContext.userId();
        if (!approval.getApplicantId().equals(currentUserId)) {
            throw new SecurityException("无权撤销该申请");
        }
        if (!"PENDING".equals(approval.getStatus())) {
            throw new IllegalStateException("只能撤销待审批的申请");
        }
        approval.setStatus("CANCELLED");
        approval.setUpdateTime(LocalDateTime.now());
        changeApprovalService.updateById(approval);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 查询接口
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /** 待我审批的列表（管理人视角） */
    public IPage<ChangeApproval> listPendingForMe(int page, int size) {
        String userId = UserContext.userId();
        return changeApprovalService.page(new Page<>(page, size),
                new LambdaQueryWrapper<ChangeApproval>()
                        .eq(ChangeApproval::getApproverId, userId)
                        .eq(ChangeApproval::getStatus, "PENDING")
                        .eq(ChangeApproval::getDeleteFlag, 0)
                        .orderByDesc(ChangeApproval::getApplyTime));
    }

    /** 我提交的申请列表（申请人视角） */
    public IPage<ChangeApproval> listMyRequests(int page, int size) {
        String userId = UserContext.userId();
        return changeApprovalService.page(new Page<>(page, size),
                new LambdaQueryWrapper<ChangeApproval>()
                        .eq(ChangeApproval::getApplicantId, userId)
                        .eq(ChangeApproval::getDeleteFlag, 0)
                        .orderByDesc(ChangeApproval::getApplyTime));
    }

    /** 渲染用：待我审批数量（Top bar 红点） */
    public long pendingCountForMe() {
        String userId = UserContext.userId();
        if (!StringUtils.hasText(userId)) return 0L;
        return changeApprovalService.count(new LambdaQueryWrapper<ChangeApproval>()
                .eq(ChangeApproval::getApproverId, userId)
                .eq(ChangeApproval::getStatus, "PENDING")
                .eq(ChangeApproval::getDeleteFlag, 0));
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 内部辅助方法
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    /**
     * 沿组织层级向上查找审批人（有 managerUserId 的最近祖先节点的管理人）。
     * 若找到的 manager 就是操作人自己，则继续往上找（管理人自己操作不需要自己审批）。
     */
    private User findApproverUpChain(String orgUnitId, String applicantUserId, Long tenantId) {
        String currentUnitId = orgUnitId;
        int maxDepth = 10; // 防止无限循环
        while (StringUtils.hasText(currentUnitId) && maxDepth-- > 0) {
            OrganizationUnit unit = organizationUnitService.getById(currentUnitId);
            if (unit == null || unit.getDeleteFlag() != null && unit.getDeleteFlag() != 0) break;

            if (StringUtils.hasText(unit.getManagerUserId())) {
                String managerId = unit.getManagerUserId();
                // 管理人不能是申请人自己
                if (!managerId.equals(applicantUserId)) {
                    User manager = userService.getById(managerId);
                    if (manager != null && !"inactive".equals(manager.getStatus())) {
                        return manager;
                    }
                }
            }
            // 往上找父节点
            currentUnitId = unit.getParentId();
        }
        return null;
    }

    /** 校验并获取审批记录（校验审批人身份） */
    private ChangeApproval getAndValidateForApprover(String approvalId) {
        ChangeApproval approval = changeApprovalService.getById(approvalId);
        if (approval == null || approval.getDeleteFlag() != 0) {
            throw new IllegalArgumentException("审批申请不存在");
        }
        if (!"PENDING".equals(approval.getStatus())) {
            throw new IllegalStateException("该申请已" + statusLabel(approval.getStatus()) + "，无法再操作");
        }
        String currentUserId = UserContext.userId();
        if (!approval.getApproverId().equals(currentUserId) && !UserContext.isTenantOwner()) {
            throw new SecurityException("无权审批该申请");
        }
        return approval;
    }

    /** 审批通过后执行真实操作 */
    @SuppressWarnings("unchecked")
    private Map<String, Object> executeApprovedOperation(ChangeApproval approval) {
        String type = approval.getOperationType();
        String dataJson = approval.getOperationData();
        Map<String, Object> result = new HashMap<>();
        try {
            switch (type) {
                case "SCAN_UNDO": {
                    if (scanRecordOrchestrator == null) {
                        result.put("error", "ScanRecordOrchestrator 未加载");
                        break;
                    }
                    Map<String, Object> params = objectMapper.readValue(dataJson,
                            new TypeReference<Map<String, Object>>() {});
                    result = scanRecordOrchestrator.undoDirectly(params);
                    break;
                }
                case "ORDER_DELETE": {
                    if (productionOrderOrchestrator == null) {
                        result.put("error", "ProductionOrderOrchestrator 未加载");
                        break;
                    }
                    Map<String, Object> params = objectMapper.readValue(dataJson,
                            new TypeReference<Map<String, Object>>() {});
                    String orderId = (String) params.get("orderId");
                    productionOrderOrchestrator.deleteById(orderId);
                    result.put("success", true);
                    break;
                }
                default:
                    log.warn("[ChangeApproval] 未知操作类型，审批通过但无法自动执行: type={}", type);
                    result.put("warning", "审批已通过，请手动执行操作");
            }
        } catch (Exception e) {
            log.error("[ChangeApproval] 执行审批操作异常 id={} type={}", approval.getId(), type, e);
            result.put("error", "执行操作失败: " + e.getMessage());
        }
        return result;
    }

    private String statusLabel(String status) {
        switch (status) {
            case "APPROVED": return "审批通过";
            case "REJECTED": return "驳回";
            case "CANCELLED": return "撤销";
            default: return status;
        }
    }
}
