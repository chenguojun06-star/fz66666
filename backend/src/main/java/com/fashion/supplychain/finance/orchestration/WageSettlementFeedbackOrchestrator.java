package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.finance.entity.WageSettlementFeedback;
import com.fashion.supplychain.finance.service.WageSettlementFeedbackService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class WageSettlementFeedbackOrchestrator {

    @Autowired
    private WageSettlementFeedbackService feedbackService;

    public WageSettlementFeedback submitFeedback(Map<String, Object> params) {
        Long tenantId = TenantAssert.requireTenantIdOrSuperAdmin();
        if (tenantId == null) {
            throw new BusinessException("超管无法提交工资结算反馈");
        }

        String settlementId = (String) params.get("settlementId");
        String feedbackType = (String) params.get("feedbackType");
        String feedbackContent = (String) params.get("feedbackContent");

        if (settlementId == null || settlementId.trim().isEmpty()) {
            throw new BusinessException("结算单ID不能为空");
        }
        if (feedbackType == null || feedbackType.trim().isEmpty()) {
            throw new BusinessException("反馈类型不能为空");
        }
        if (!"CONFIRM".equals(feedbackType) && !"OBJECTION".equals(feedbackType)) {
            throw new BusinessException("反馈类型只能为 CONFIRM 或 OBJECTION");
        }
        if ("OBJECTION".equals(feedbackType) && (feedbackContent == null || feedbackContent.trim().isEmpty())) {
            throw new BusinessException("提出异议时必须填写反馈内容");
        }

        String operatorId = UserContext.userId();
        String operatorName = UserContext.username();

        LambdaQueryWrapper<WageSettlementFeedback> existsQw = new LambdaQueryWrapper<>();
        existsQw.eq(WageSettlementFeedback::getTenantId, tenantId)
                 .eq(WageSettlementFeedback::getSettlementId, settlementId)
                 .eq(WageSettlementFeedback::getOperatorId, operatorId)
                 .last("LIMIT 1");
        WageSettlementFeedback existing = feedbackService.getOne(existsQw);
        if (existing != null) {
            throw new BusinessException("您已对该结算单提交过反馈");
        }

        WageSettlementFeedback feedback = new WageSettlementFeedback();
        feedback.setSettlementId(settlementId);
        feedback.setOperatorId(operatorId);
        feedback.setOperatorName(operatorName);
        feedback.setFeedbackType(feedbackType);
        feedback.setFeedbackContent(feedbackContent);
        feedback.setStatus("PENDING");
        feedback.setTenantId(tenantId);
        feedbackService.save(feedback);

        log.info("[工资结算反馈] 提交成功: id={}, type={}, operator={}", feedback.getId(), feedbackType, operatorName);
        return feedback;
    }

    public List<WageSettlementFeedback> listMyFeedback(Map<String, Object> params) {
        Long tenantId = TenantAssert.requireTenantIdOrSuperAdmin();
        if (tenantId == null) {
            return List.of();
        }

        String operatorId = UserContext.userId();
        LambdaQueryWrapper<WageSettlementFeedback> qw = new LambdaQueryWrapper<>();
        qw.eq(WageSettlementFeedback::getTenantId, tenantId)
          .eq(WageSettlementFeedback::getOperatorId, operatorId);

        String status = (String) params.get("status");
        if (status != null && !status.trim().isEmpty()) {
            qw.eq(WageSettlementFeedback::getStatus, status);
        }
        String settlementId = (String) params.get("settlementId");
        if (settlementId != null && !settlementId.trim().isEmpty()) {
            qw.eq(WageSettlementFeedback::getSettlementId, settlementId);
        }

        qw.orderByDesc(WageSettlementFeedback::getCreateTime);
        qw.last("LIMIT 200");
        return feedbackService.list(qw);
    }

    public List<WageSettlementFeedback> listAllFeedback(Map<String, Object> params) {
        Long tenantId = TenantAssert.requireTenantIdOrSuperAdmin();
        if (tenantId == null) {
            return List.of();
        }

        LambdaQueryWrapper<WageSettlementFeedback> qw = new LambdaQueryWrapper<>();
        qw.eq(WageSettlementFeedback::getTenantId, tenantId);

        String status = (String) params.get("status");
        if (status != null && !status.trim().isEmpty()) {
            qw.eq(WageSettlementFeedback::getStatus, status);
        }
        String operatorId = (String) params.get("operatorId");
        if (operatorId != null && !operatorId.trim().isEmpty()) {
            qw.eq(WageSettlementFeedback::getOperatorId, operatorId);
        }
        String settlementId = (String) params.get("settlementId");
        if (settlementId != null && !settlementId.trim().isEmpty()) {
            qw.eq(WageSettlementFeedback::getSettlementId, settlementId);
        }

        qw.orderByDesc(WageSettlementFeedback::getCreateTime);
        qw.last("LIMIT 500");
        return feedbackService.list(qw);
    }

    public Map<String, Object> getFeedbackStats() {
        Long tenantId = TenantAssert.requireTenantIdOrSuperAdmin();
        Map<String, Object> result = new LinkedHashMap<>();

        if (tenantId == null) {
            result.put("totalCount", 0);
            result.put("pendingCount", 0);
            result.put("resolvedCount", 0);
            result.put("rejectedCount", 0);
            return result;
        }

        result.put("totalCount", feedbackService.count(new LambdaQueryWrapper<WageSettlementFeedback>()
                .eq(WageSettlementFeedback::getTenantId, tenantId)));
        result.put("pendingCount", feedbackService.count(new LambdaQueryWrapper<WageSettlementFeedback>()
                .eq(WageSettlementFeedback::getTenantId, tenantId)
                .eq(WageSettlementFeedback::getStatus, "PENDING")));
        result.put("resolvedCount", feedbackService.count(new LambdaQueryWrapper<WageSettlementFeedback>()
                .eq(WageSettlementFeedback::getTenantId, tenantId)
                .eq(WageSettlementFeedback::getStatus, "RESOLVED")));
        result.put("rejectedCount", feedbackService.count(new LambdaQueryWrapper<WageSettlementFeedback>()
                .eq(WageSettlementFeedback::getTenantId, tenantId)
                .eq(WageSettlementFeedback::getStatus, "REJECTED")));
        return result;
    }

    public WageSettlementFeedback resolveFeedback(String id, Map<String, Object> params) {
        Long tenantId = TenantAssert.requireTenantId();
        String resolveRemark = (String) params.get("resolveRemark");
        String action = (String) params.get("action");

        if (action == null || (!"RESOLVED".equals(action) && !"REJECTED".equals(action))) {
            throw new BusinessException("处理动作只能为 RESOLVED 或 REJECTED");
        }

        WageSettlementFeedback feedback = feedbackService.lambdaQuery()
                .eq(WageSettlementFeedback::getId, id)
                .eq(WageSettlementFeedback::getTenantId, tenantId)
                .one();
        if (feedback == null) {
            throw new BusinessException("反馈记录不存在");
        }

        if (!"PENDING".equals(feedback.getStatus())) {
            throw new BusinessException("该反馈已处理，无法重复操作");
        }

        feedback.setStatus(action);
        feedback.setResolveRemark(resolveRemark);
        feedback.setResolverId(UserContext.userId());
        feedback.setResolverName(UserContext.username());
        feedback.setResolveTime(LocalDateTime.now());
        feedbackService.updateById(feedback);

        log.info("[工资结算反馈] 处理完成: id={}, action={}, resolver={}", id, action, UserContext.username());
        return feedback;
    }
}
