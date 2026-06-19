package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.UserFeedback;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserFeedbackService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;

/**
 * 用户反馈编排器 — 负责反馈提交、回复、状态变更等业务逻辑。
 * Controller 只负责路由、参数校验与权限检查，业务落库统一由本编排器处理。
 */
@Slf4j
@Service
public class UserFeedbackOrchestrator {

    @Autowired
    private UserFeedbackService userFeedbackService;

    @Autowired
    private TenantService tenantService;

    /**
     * 提交反馈（保存到数据库）。
     * 前置校验（标题/内容非空）由 Controller 负责。
     */
    @Transactional(rollbackFor = Exception.class)
    public UserFeedback submit(UserFeedback feedback) {
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            feedback.setUserId(ctx.getUserId() != null ? Long.parseLong(ctx.getUserId()) : null);
            feedback.setUserName(ctx.getUsername());
            feedback.setTenantId(ctx.getTenantId());
            if (ctx.getTenantId() != null) {
                Tenant tenant = tenantService.getById(ctx.getTenantId());
                if (tenant != null) {
                    feedback.setTenantName(tenant.getTenantName());
                }
            }
        }

        if (!StringUtils.hasText(feedback.getSource())) {
            feedback.setSource("PC");
        }
        if (!StringUtils.hasText(feedback.getCategory())) {
            feedback.setCategory("BUG");
        }
        feedback.setStatus("PENDING");
        feedback.setCreateTime(LocalDateTime.now());
        feedback.setUpdateTime(LocalDateTime.now());

        userFeedbackService.save(feedback);
        log.info("[UserFeedback] 提交反馈 id={} user={}", feedback.getId(), feedback.getUserName());
        return feedback;
    }

    /**
     * 回复反馈（超管）。
     *
     * @param id    反馈ID
     * @param reply 回复内容
     * @param status 新状态（可选，默认 RESOLVED）
     * @return 更新后的反馈；若反馈不存在则返回 null
     */
    @Transactional(rollbackFor = Exception.class)
    public UserFeedback reply(Long id, String reply, String status) {
        UserFeedback feedback = userFeedbackService.getById(id);
        if (feedback == null) {
            return null;
        }

        UserContext ctx = UserContext.get();
        feedback.setReply(reply);
        feedback.setReplyTime(LocalDateTime.now());
        feedback.setReplyUserId(ctx != null && ctx.getUserId() != null ? Long.parseLong(ctx.getUserId()) : null);
        feedback.setStatus(StringUtils.hasText(status) ? status : "RESOLVED");
        feedback.setUpdateTime(LocalDateTime.now());

        userFeedbackService.updateById(feedback);
        log.info("[UserFeedback] 回复反馈 id={} status={}", id, feedback.getStatus());
        return feedback;
    }

    /**
     * 修改反馈状态（超管）。
     *
     * @param id     反馈ID
     * @param status 新状态
     * @return 更新后的反馈；若反馈不存在则返回 null
     */
    @Transactional(rollbackFor = Exception.class)
    public UserFeedback updateStatus(Long id, String status) {
        UserFeedback feedback = userFeedbackService.getById(id);
        if (feedback == null) {
            return null;
        }

        feedback.setStatus(status);
        feedback.setUpdateTime(LocalDateTime.now());
        userFeedbackService.updateById(feedback);
        log.info("[UserFeedback] 更新状态 id={} status={}", id, status);
        return feedback;
    }
}
