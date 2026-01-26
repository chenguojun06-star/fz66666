package com.fashion.supplychain.finance.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.ShipmentReconciliation;
import com.fashion.supplychain.finance.helper.OrderReconciliationApprovalHelper;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.ShipmentReconciliationService;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.NoSuchElementException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
public class ReconciliationStatusOrchestrator {

    private enum Scope {
        MATERIAL,
        SHIPMENT,
        AUTO
    }

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    @Autowired
    private ShipmentReconciliationService shipmentReconciliationService;

    @Autowired
    private OrderReconciliationApprovalHelper orderReconciliationApprovalHelper;

    public String updateMaterialStatus(String id, String status) {
        return updateStatus(Scope.MATERIAL, id, status);
    }

    public String updateShipmentStatus(String id, String status) {
        return updateStatus(Scope.SHIPMENT, id, status);
    }

    public String updateStatusCompat(String id, String status) {
        return updateStatus(Scope.AUTO, id, status);
    }

    public String returnMaterialToPrevious(String id, String reason) {
        return returnToPrevious(Scope.MATERIAL, id, reason);
    }

    public String returnShipmentToPrevious(String id, String reason) {
        return returnToPrevious(Scope.SHIPMENT, id, reason);
    }

    public String returnCompat(String id, String reason) {
        return returnToPrevious(Scope.AUTO, id, reason);
    }

    private String updateStatus(Scope scope, String id, String status) {
        if (id == null || id.trim().isEmpty() || status == null || status.trim().isEmpty()) {
            throw new IllegalArgumentException("参数错误");
        }

        String rid = id.trim();
        String to = status.trim();
        LocalDateTime now = LocalDateTime.now();

        if (scope == Scope.MATERIAL || scope == Scope.AUTO) {
            MaterialReconciliation mr = materialReconciliationService.getById(rid);
            if (mr != null) {
                guardTransition(mr.getStatus(), to);
                if ("rejected".equals(to) && !UserContext.isSupervisorOrAbove()) {
                    throw new AccessDeniedException("仅主管级别及以上可执行驳回");
                }
                String from = mr.getStatus() == null ? "" : mr.getStatus().trim();
                mr.setStatus(to);
                mr.setUpdateTime(now);
                String uid = null;
                try {
                    UserContext ctx = UserContext.get();
                    uid = ctx == null ? null : ctx.getUserId();
                    uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
                } catch (Exception ignored) {
                    uid = null;
                }
                if (uid != null) {
                    mr.setUpdateBy(uid);
                    if ((mr.getCreateBy() == null || mr.getCreateBy().trim().isEmpty())) {
                        mr.setCreateBy(uid);
                    }
                }
                if (!from.equals(to)) {
                    mr.setRemark(appendAuditRemark(mr.getRemark(), "STATUS", from + " -> " + to));
                }

                if ("rejected".equals(from) && "pending".equals(to)) {
                    mr.setVerifiedAt(null);
                    mr.setApprovedAt(null);
                    mr.setPaidAt(null);
                }
                if ("verified".equals(to) && mr.getVerifiedAt() == null) {
                    mr.setVerifiedAt(now);
                }
                if ("approved".equals(to) && mr.getApprovedAt() == null) {
                    mr.setApprovedAt(now);
                }
                if ("paid".equals(to)) {
                    mr.setPaidAt(now);
                }
                boolean ok = materialReconciliationService.updateById(mr);
                if (!ok) {
                    throw new IllegalStateException("状态更新失败");
                }
                return "状态更新成功";
            }
            if (scope == Scope.MATERIAL) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        if (scope == Scope.SHIPMENT || scope == Scope.AUTO) {
            ShipmentReconciliation sr = shipmentReconciliationService.getById(rid);
            if (sr != null) {
                guardTransition(sr.getStatus(), to);
                if ("rejected".equals(to) && !UserContext.isSupervisorOrAbove()) {
                    throw new AccessDeniedException("仅主管级别及以上可执行驳回");
                }
                String from = sr.getStatus() == null ? "" : sr.getStatus().trim();
                sr.setStatus(to);
                sr.setUpdateTime(now);
                String uid = null;
                try {
                    UserContext ctx = UserContext.get();
                    uid = ctx == null ? null : ctx.getUserId();
                    uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
                } catch (Exception ignored) {
                    uid = null;
                }
                if (uid != null) {
                    sr.setUpdateBy(uid);
                    if ((sr.getCreateBy() == null || sr.getCreateBy().trim().isEmpty())) {
                        sr.setCreateBy(uid);
                    }
                }
                if (!from.equals(to)) {
                    sr.setRemark(appendAuditRemark(sr.getRemark(), "STATUS", from + " -> " + to));
                }

                if ("rejected".equals(from) && "pending".equals(to)) {
                    sr.setVerifiedAt(null);
                    sr.setApprovedAt(null);
                    sr.setPaidAt(null);
                }
                if ("verified".equals(to) && sr.getVerifiedAt() == null) {
                    sr.setVerifiedAt(now);
                }
                if ("approved".equals(to) && sr.getApprovedAt() == null) {
                    sr.setApprovedAt(now);
                }
                if ("paid".equals(to)) {
                    sr.setPaidAt(now);
                }
                boolean ok = shipmentReconciliationService.updateById(sr);
                if (!ok) {
                    throw new IllegalStateException("状态更新失败");
                }

                // 订单结算审核通过后，自动创建审批付款记录
                if ("approved".equals(to)) {
                    try {
                        orderReconciliationApprovalHelper.createApprovalOnReconciliationApproved(rid);
                    } catch (Exception e) {
                        log.error("创建订单结算审批付款记录失败: reconciliationId={}, error={}", rid, e.getMessage(), e);
                        // 不影响主流程，仅记录错误
                    }
                }

                return "状态更新成功";
            }
            if (scope == Scope.SHIPMENT) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        throw new NoSuchElementException("对账单不存在");
    }

    private String returnToPrevious(Scope scope, String id, String reason) {
        if (id == null || id.trim().isEmpty()) {
            throw new IllegalArgumentException("参数错误");
        }
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("仅主管级别及以上可执行退回");
        }

        String rid = id.trim();
        LocalDateTime now = LocalDateTime.now();

        if (scope == Scope.MATERIAL || scope == Scope.AUTO) {
            MaterialReconciliation mr = materialReconciliationService.getById(rid);
            if (mr != null) {
                String from = mr.getStatus();
                String to = previousStatus(mr.getStatus());
                if (to == null) {
                    throw new IllegalStateException("当前状态不允许退回");
                }
                mr.setStatus(to);
                mr.setUpdateTime(now);
                mr.setRemark(appendAuditRemark(mr.getRemark(), "RETURN", reason));
                String uid = null;
                try {
                    UserContext ctx = UserContext.get();
                    uid = ctx == null ? null : ctx.getUserId();
                    uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
                } catch (Exception ignored) {
                    uid = null;
                }
                if (uid != null) {
                    mr.setUpdateBy(uid);
                    if ((mr.getCreateBy() == null || mr.getCreateBy().trim().isEmpty())) {
                        mr.setCreateBy(uid);
                    }
                }

                if ("verified".equals(from)) {
                    mr.setVerifiedAt(null);
                } else if ("approved".equals(from)) {
                    mr.setApprovedAt(null);
                } else if ("paid".equals(from)) {
                    mr.setPaidAt(null);
                }

                if ("paid".equals(from)) {
                    mr.setReReviewAt(now);
                    mr.setReReviewReason(reason);
                }
                boolean ok = materialReconciliationService.updateById(mr);
                if (!ok) {
                    throw new IllegalStateException("退回失败");
                }
                return "退回成功";
            }
            if (scope == Scope.MATERIAL) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        if (scope == Scope.SHIPMENT || scope == Scope.AUTO) {
            ShipmentReconciliation sr = shipmentReconciliationService.getById(rid);
            if (sr != null) {
                String from = sr.getStatus();
                String to = previousStatus(sr.getStatus());
                if (to == null) {
                    throw new IllegalStateException("当前状态不允许退回");
                }
                sr.setStatus(to);
                sr.setUpdateTime(now);
                sr.setRemark(appendAuditRemark(sr.getRemark(), "RETURN", reason));
                String uid = null;
                try {
                    UserContext ctx = UserContext.get();
                    uid = ctx == null ? null : ctx.getUserId();
                    uid = (uid == null || uid.trim().isEmpty()) ? null : uid.trim();
                } catch (Exception ignored) {
                    uid = null;
                }
                if (uid != null) {
                    sr.setUpdateBy(uid);
                    if ((sr.getCreateBy() == null || sr.getCreateBy().trim().isEmpty())) {
                        sr.setCreateBy(uid);
                    }
                }

                if ("verified".equals(from)) {
                    sr.setVerifiedAt(null);
                } else if ("approved".equals(from)) {
                    sr.setApprovedAt(null);
                } else if ("paid".equals(from)) {
                    sr.setPaidAt(null);
                }

                if ("paid".equals(from)) {
                    sr.setReReviewAt(now);
                    sr.setReReviewReason(reason);
                }
                boolean ok = shipmentReconciliationService.updateById(sr);
                if (!ok) {
                    throw new IllegalStateException("退回失败");
                }
                return "退回成功";
            }
            if (scope == Scope.SHIPMENT) {
                throw new NoSuchElementException("对账单不存在");
            }
        }

        throw new NoSuchElementException("对账单不存在");
    }

    private void guardTransition(String from, String to) {
        if (!isAllowedStatusTransition(from, to)) {
            if (isBackwardTransition(from, to)) {
                throw new IllegalStateException("不允许回退状态，请使用退回操作");
            }
            throw new IllegalStateException("不允许的状态流转");
        }
    }

    private boolean isAllowedStatusTransition(String from, String to) {
        if (to == null || to.isEmpty()) {
            return false;
        }
        if (from == null || from.isEmpty()) {
            return true;
        }
        if (from.equals(to)) {
            return true;
        }
        if ("rejected".equals(from)) {
            return "pending".equals(to);
        }
        if ("pending".equals(from)) {
            return "verified".equals(to) || "rejected".equals(to);
        }
        if ("verified".equals(from)) {
            return "approved".equals(to) || "rejected".equals(to);
        }
        if ("approved".equals(from)) {
            return "paid".equals(to) || "rejected".equals(to);
        }
        return false;
    }

    private boolean isBackwardTransition(String from, String to) {
        if (from == null || to == null) {
            return false;
        }
        int fromRank = statusRank(from);
        int toRank = statusRank(to);
        return toRank >= 0 && fromRank >= 0 && toRank < fromRank;
    }

    private int statusRank(String status) {
        if ("pending".equals(status)) {
            return 0;
        }
        if ("verified".equals(status)) {
            return 1;
        }
        if ("approved".equals(status)) {
            return 2;
        }
        if ("paid".equals(status)) {
            return 3;
        }
        if ("rejected".equals(status)) {
            return 99;
        }
        return -1;
    }

    private String previousStatus(String status) {
        if ("verified".equals(status)) {
            return "pending";
        }
        if ("approved".equals(status)) {
            return "verified";
        }
        if ("paid".equals(status)) {
            return "approved";
        }
        return null;
    }

    private String appendAuditRemark(String oldRemark, String action, String reason) {
        String ts = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        UserContext ctx = UserContext.get();
        String who = ctx == null ? "" : (ctx.getUsername() == null ? "" : ctx.getUsername());
        String r = reason == null ? "" : reason.trim();
        String line = "[" + ts + "]" + (who.isEmpty() ? "" : "[" + who + "]") + "[" + action + "]"
                + (r.isEmpty() ? "" : " " + r);
        if (oldRemark == null || oldRemark.trim().isEmpty()) {
            return line;
        }
        return oldRemark + "\n" + line;
    }
}
