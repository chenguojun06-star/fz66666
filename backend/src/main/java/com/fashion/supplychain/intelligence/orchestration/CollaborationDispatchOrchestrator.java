package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.dto.ActionCenterResponse;
import com.fashion.supplychain.intelligence.dto.CollaborationDispatchRequest;
import com.fashion.supplychain.intelligence.dto.CollaborationDispatchResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SysNoticeService;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Slf4j
public class CollaborationDispatchOrchestrator {

    @Autowired
    private UserService userService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private SysNoticeService sysNoticeService;

    @Autowired
    private FollowupTaskOrchestrator followupTaskOrchestrator;

    @Autowired
    private CollaborationTaskLifecycleOrchestrator collaborationTaskLifecycleOrchestrator;

    @Transactional(rollbackFor = Exception.class)
    public CollaborationDispatchResponse dispatch(CollaborationDispatchRequest request) {
        CollaborationDispatchResponse response = new CollaborationDispatchResponse();
        Long tenantId = UserContext.tenantId();
        String orderNo = trim(request.getOrderNo());
        String instruction = trim(request.getInstruction());
        String targetUser = trim(request.getTargetUser());
        ProductionOrder order = findOrder(tenantId, orderNo);
        String ownerRole = resolveOwnerRole(trim(request.getTargetRole()), instruction, order);
        List<User> matchedUsers = resolveRecipients(tenantId, ownerRole, targetUser, order);

        response.setOrderNo(orderNo);
        response.setOwnerRole(ownerRole);
        response.setRoutePath(resolveRoutePath(ownerRole));

        if (matchedUsers.isEmpty()) {
            response.setSuccess(false);
            response.setDispatched(false);
            response.getUnmatchedReasons().add(buildUnmatchedReason(ownerRole, targetUser, order));
            response.setSummary(buildFailureSummary(ownerRole, targetUser, order));
            return response;
        }

        String title = resolveTitle(trim(request.getTitle()), instruction, ownerRole, order);
        String content = resolveContent(trim(request.getContent()), instruction, ownerRole, order);
        String dueHint = hasText(request.getDueHint()) ? request.getDueHint().trim() : resolveDueHint(ownerRole);
        String fromName = resolveSenderName();
        response.setCurrentStage("已通知");
        response.setNextStep("等待责任人接收并按要求处理");
        response.setDueHint(dueHint);

        int noticeCount = 0;
        Set<String> recipientLabels = new LinkedHashSet<>();
        for (User user : matchedUsers) {
            SysNotice notice = upsertNotice(tenantId, user, orderNo, title, content, fromName, ownerRole);
            if (notice != null) {
                noticeCount++;
            }
            recipientLabels.add(resolveDisplayName(user));
            response.getRecipients().add(toRecipient(user, dueHint));
        }

        response.setMatchedCount(matchedUsers.size());
        response.setNoticeCount(noticeCount);
        response.setSuccess(true);
        response.setDispatched(noticeCount > 0);
        response.setCollaborationTask(buildTask(ownerRole, instruction, orderNo, dueHint));
        response.setSummary(buildSuccessSummary(instruction, ownerRole, recipientLabels, dueHint, orderNo));
        collaborationTaskLifecycleOrchestrator.initialize(request, response);
        log.info("[CollaborationDispatch] tenant={} role={} targetUser={} matched={} notices={} orderNo={}",
                tenantId, ownerRole, targetUser, matchedUsers.size(), noticeCount, orderNo);
        return response;
    }

    public CollaborationDispatchResponse queryStatus(String orderNo, String targetRole) {
        CollaborationDispatchResponse cached = collaborationTaskLifecycleOrchestrator.query(orderNo, targetRole);
        if (cached != null) {
            return cached;
        }
        CollaborationDispatchResponse response = new CollaborationDispatchResponse();
        Long tenantId = UserContext.tenantId();
        String normalizedRole = hasText(targetRole) ? normalizeRole(targetRole) : null;
        List<SysNotice> notices = sysNoticeService.lambdaQuery()
                .eq(SysNotice::getTenantId, tenantId)
                .eq(hasText(orderNo), SysNotice::getOrderNo, trim(orderNo))
                .like(SysNotice::getTitle, "小云协同派单")
                .eq(hasText(normalizedRole), SysNotice::getNoticeType, resolveNoticeType(normalizedRole))
                .orderByDesc(SysNotice::getCreatedAt)
                .last("LIMIT 20")
                .list();

        response.setOrderNo(trim(orderNo));
        response.setOwnerRole(normalizedRole);
        response.setRoutePath(resolveRoutePath(normalizedRole));
        response.setNoticeCount(notices.size());
        response.setMatchedCount(notices.size());
        response.setSuccess(!notices.isEmpty());
        response.setDispatched(!notices.isEmpty());

        if (notices.isEmpty()) {
            response.setCurrentStage("未找到协同记录");
            response.setNextStep("请重新派单或确认订单号/岗位");
            response.setSummary("当前没有找到这条协同任务的派单记录。");
            return response;
        }

        boolean anyRead = notices.stream().anyMatch(n -> Integer.valueOf(1).equals(n.getIsRead()));
        boolean allRead = notices.stream().allMatch(n -> Integer.valueOf(1).equals(n.getIsRead()));
        response.setCurrentStage(allRead ? "处理中" : anyRead ? "部分接收" : "已通知");
        response.setNextStep(allRead ? "等待责任人处理并回写结果" : anyRead ? "继续跟进未接收人员" : "等待责任人接收");
        response.setDueHint(normalizedRole == null ? "尽快处理" : resolveDueHint(normalizedRole));
        response.setSummary(buildQuerySummary(notices.size(), response.getCurrentStage(), response.getNextStep(), trim(orderNo)));

        for (SysNotice notice : notices) {
            CollaborationDispatchResponse.Recipient recipient = new CollaborationDispatchResponse.Recipient();
            recipient.setDisplayName(notice.getToName());
            recipient.setRoleName(normalizedRole);
            recipient.setDispatchStatus(Integer.valueOf(1).equals(notice.getIsRead()) ? "已接收" : "已通知");
            recipient.setProcessingStage(Integer.valueOf(1).equals(notice.getIsRead()) ? "处理中" : "待接收并处理");
            recipient.setDueHint(response.getDueHint());
            recipient.setNextAction(Integer.valueOf(1).equals(notice.getIsRead()) ? "继续处理并回写结果" : "尽快查看并接手处理");
            response.getRecipients().add(recipient);
        }
        return response;
    }

    public CollaborationDispatchResponse updateStatus(String orderNo, String targetRole, String targetUser, String action, String remark) {
        return collaborationTaskLifecycleOrchestrator.update(orderNo, targetRole, targetUser, action, remark);
    }

    public List<CollaborationDispatchResponse> listTasks(String orderNo, String targetRole, int limit) {
        return collaborationTaskLifecycleOrchestrator.listTasks(orderNo, targetRole, limit);
    }

    private ProductionOrder findOrder(Long tenantId, String orderNo) {
        if (!hasText(orderNo)) {
            return null;
        }
        QueryWrapper<ProductionOrder> query = new QueryWrapper<>();
        query.eq("order_no", orderNo)
                .eq("delete_flag", 0);
        if (tenantId != null) {
            query.eq("tenant_id", tenantId);
        }
        return productionOrderService.getOne(query, false);
    }

    private String resolveOwnerRole(String requestedRole, String instruction, ProductionOrder order) {
        if (hasText(requestedRole)) {
            return normalizeRole(requestedRole);
        }
        String text = lower(instruction);
        if (containsAny(text, "采购", "补料", "缺料", "面料", "辅料", "供应商")) {
            return "采购";
        }
        if (containsAny(text, "财务", "付款", "回款", "对账", "结算")) {
            return "财务";
        }
        if (containsAny(text, "仓库", "入库", "出库", "库存")) {
            return "仓库";
        }
        if (containsAny(text, "质检", "品控", "返工", "次品", "质量")) {
            return "质检";
        }
        if (containsAny(text, "工厂", "车间", "排产", "生产主管", "厂长")) {
            return "生产主管";
        }
        if (order != null && hasText(order.getMerchandiser())) {
            return "跟单";
        }
        return "跟单";
    }

    private String normalizeRole(String value) {
        String text = lower(value);
        if (containsAny(text, "merch", "跟单")) {
            return "跟单";
        }
        if (containsAny(text, "采购", "procure", "purchase")) {
            return "采购";
        }
        if (containsAny(text, "财务", "finance")) {
            return "财务";
        }
        if (containsAny(text, "仓库", "warehouse", "仓管")) {
            return "仓库";
        }
        if (containsAny(text, "质检", "quality", "qc", "品控")) {
            return "质检";
        }
        if (containsAny(text, "工厂", "生产", "supervisor", "manager", "厂长")) {
            return "生产主管";
        }
        return value.trim();
    }

    private List<User> resolveRecipients(Long tenantId, String ownerRole, String targetUser, ProductionOrder order) {
        if (hasText(targetUser)) {
            return queryUsersByName(tenantId, targetUser, 3);
        }
        if ("跟单".equals(ownerRole) && order != null && hasText(order.getMerchandiser())) {
            List<User> merchandisers = queryUsersByName(tenantId, order.getMerchandiser(), 3);
            if (!merchandisers.isEmpty()) {
                return merchandisers;
            }
        }
        List<User> activeUsers = queryActiveUsers(tenantId);
        List<User> matched = new ArrayList<>();
        for (User user : activeUsers) {
            String roleName = lower(user.getRoleName());
            String name = lower(user.getName());
            String username = lower(user.getUsername());
            if ("跟单".equals(ownerRole) && (containsAny(roleName, "跟单", "merch") || containsAny(name, "跟单") || containsAny(username, "merch"))) {
                matched.add(user);
            } else if ("采购".equals(ownerRole) && containsAny(roleName, "采购", "procure", "purchase")) {
                matched.add(user);
            } else if ("财务".equals(ownerRole) && containsAny(roleName, "财务", "finance")) {
                matched.add(user);
            } else if ("仓库".equals(ownerRole) && containsAny(roleName, "仓", "warehouse")) {
                matched.add(user);
            } else if ("质检".equals(ownerRole) && containsAny(roleName, "质检", "quality", "qc", "品控")) {
                matched.add(user);
            } else if ("生产主管".equals(ownerRole) && containsAny(roleName, "生产", "主管", "厂长", "manager", "supervisor")) {
                matched.add(user);
            }
            if (matched.size() >= 3) {
                break;
            }
        }
        return matched;
    }

    private List<User> queryUsersByName(Long tenantId, String keyword, int limit) {
        QueryWrapper<User> query = new QueryWrapper<>();
        if (tenantId != null) {
            query.eq("tenant_id", tenantId);
        }
        query.eq("status", "active")
                .and(wrapper -> wrapper.like("name", keyword).or().like("username", keyword))
                .last("LIMIT " + Math.max(limit, 1));
        return userService.list(query);
    }

    private List<User> queryActiveUsers(Long tenantId) {
        QueryWrapper<User> query = new QueryWrapper<>();
        if (tenantId != null) {
            query.eq("tenant_id", tenantId);
        }
        query.eq("status", "active")
                .last("LIMIT 50");
        return userService.list(query);
    }

    private SysNotice upsertNotice(Long tenantId, User user, String orderNo, String title, String content, String fromName, String ownerRole) {
        String toName = resolveDisplayName(user);
        SysNotice existing = sysNoticeService.lambdaQuery()
                .eq(SysNotice::getTenantId, tenantId)
                .eq(SysNotice::getToName, toName)
                .eq(SysNotice::getTitle, title)
                .eq(SysNotice::getIsRead, 0)
                .eq(hasText(orderNo), SysNotice::getOrderNo, orderNo)
                .last("LIMIT 1")
                .one();
        if (existing != null) {
            existing.setContent(content);
            existing.setCreatedAt(LocalDateTime.now());
            sysNoticeService.updateById(existing);
            return existing;
        }

        SysNotice notice = new SysNotice();
        notice.setTenantId(tenantId);
        notice.setToName(toName);
        notice.setFromName(fromName);
        notice.setOrderNo(orderNo);
        notice.setTitle(title);
        notice.setContent(content);
        notice.setNoticeType(resolveNoticeType(ownerRole));
        notice.setIsRead(0);
        notice.setCreatedAt(LocalDateTime.now());
        sysNoticeService.save(notice);
        return notice;
    }

    private CollaborationDispatchResponse.Recipient toRecipient(User user, String dueHint) {
        CollaborationDispatchResponse.Recipient recipient = new CollaborationDispatchResponse.Recipient();
        recipient.setUserId(user.getId());
        recipient.setUsername(user.getUsername());
        recipient.setName(user.getName());
        recipient.setRoleName(user.getRoleName());
        recipient.setDisplayName(resolveDisplayName(user));
        recipient.setDispatchStatus("已通知");
        recipient.setProcessingStage("待接收并处理");
        recipient.setDueHint(dueHint);
        recipient.setNextAction("进入对应业务页面处理并回写结果");
        return recipient;
    }

    private ActionCenterResponse.ActionTask buildTask(String ownerRole, String instruction, String orderNo, String dueHint) {
        String summary = hasText(instruction) ? instruction : "收到来自小云的协同处理任务";
        return followupTaskOrchestrator.buildTask(
                "ai_team_dispatch",
                resolveDomain(ownerRole),
                "high",
                "L2",
                ownerRole,
                "小云协同派单",
                summary,
                "根据用户指令已自动分派到对应岗位处理",
                resolveRoutePath(ownerRole),
                orderNo,
                dueHint,
                false
        );
    }

    private String resolveTitle(String title, String instruction, String ownerRole, ProductionOrder order) {
        if (hasText(title)) {
            return title;
        }
        if (order != null && hasText(order.getOrderNo())) {
            return "小云协同派单 — " + order.getOrderNo();
        }
        if (hasText(instruction)) {
            return "小云协同派单 — " + truncate(instruction, 18);
        }
        return "小云协同派单 — " + ownerRole;
    }

    private String resolveContent(String content, String instruction, String ownerRole, ProductionOrder order) {
        if (hasText(content)) {
            return content;
        }
        StringBuilder builder = new StringBuilder("请按小云派单要求尽快处理。");
        if (hasText(instruction)) {
            builder.append("任务内容：").append(instruction).append("。");
        }
        if (order != null) {
            builder.append("相关订单：").append(order.getOrderNo());
            if (hasText(order.getStyleNo())) {
                builder.append(" / ").append(order.getStyleNo());
            }
            if (hasText(order.getFactoryName())) {
                builder.append(" / ").append(order.getFactoryName());
            }
            builder.append("。");
        }
        builder.append("责任岗位：").append(ownerRole).append("。处理后请回写最新结果。");
        return builder.toString();
    }

    private String buildFailureSummary(String ownerRole, String targetUser, ProductionOrder order) {
        if (hasText(targetUser)) {
            return "我理解了要找 " + targetUser + " 处理，但当前租户下没匹配到可接收任务的人员。";
        }
        if ("跟单".equals(ownerRole) && order != null && hasText(order.getMerchandiser())) {
            return "我识别到这单应该由跟单继续处理，但系统里没找到与“" + order.getMerchandiser() + "”匹配的活跃账号。";
        }
        return "我理解了要把任务分给" + ownerRole + "，但当前租户里还没找到可接手的活跃账号。";
    }

    private String buildSuccessSummary(String instruction, String ownerRole, Set<String> recipients, String dueHint, String orderNo) {
        StringBuilder builder = new StringBuilder("已把任务分派给");
        builder.append(String.join("、", recipients));
        builder.append("处理");
        if (hasText(orderNo)) {
            builder.append("，关联订单 ").append(orderNo);
        }
        builder.append("。责任岗位：").append(ownerRole).append("。");
        if (hasText(instruction)) {
            builder.append("执行要求：").append(instruction).append("。");
        }
        builder.append("建议时效：").append(dueHint).append("。");
        return builder.toString();
    }

    private String buildUnmatchedReason(String ownerRole, String targetUser, ProductionOrder order) {
        if (hasText(targetUser)) {
            return "未找到指定人员：" + targetUser;
        }
        if ("跟单".equals(ownerRole) && order != null && hasText(order.getMerchandiser())) {
            return "未匹配到订单跟单员账号：" + order.getMerchandiser();
        }
        return "未匹配到岗位账号：" + ownerRole;
    }

    private String buildQuerySummary(int noticeCount, String currentStage, String nextStep, String orderNo) {
        StringBuilder builder = new StringBuilder("当前已找到 ");
        builder.append(noticeCount).append(" 条协同记录");
        if (hasText(orderNo)) {
            builder.append("，关联订单 ").append(orderNo);
        }
        builder.append("。当前阶段：").append(currentStage).append("。下一步：").append(nextStep).append("。");
        return builder.toString();
    }

    private String resolveRoutePath(String ownerRole) {
        if (!hasText(ownerRole)) {
            return "/dashboard";
        }
        if ("财务".equals(ownerRole)) {
            return "/finance";
        }
        if ("仓库".equals(ownerRole)) {
            return "/warehouse";
        }
        if ("采购".equals(ownerRole)) {
            return "/production";
        }
        if ("质检".equals(ownerRole) || "生产主管".equals(ownerRole) || "跟单".equals(ownerRole)) {
            return "/production";
        }
        return "/dashboard";
    }

    private String resolveNoticeType(String ownerRole) {
        if ("采购".equals(ownerRole)) {
            return "procurement_dispatch";
        }
        if ("财务".equals(ownerRole)) {
            return "finance_dispatch";
        }
        if ("仓库".equals(ownerRole)) {
            return "warehouse_dispatch";
        }
        if ("质检".equals(ownerRole)) {
            return "quality_dispatch";
        }
        if ("生产主管".equals(ownerRole)) {
            return "production_dispatch";
        }
        return "manual";
    }

    private String resolveDueHint(String ownerRole) {
        if ("财务".equals(ownerRole)) {
            return "今日内确认";
        }
        if ("采购".equals(ownerRole) || "仓库".equals(ownerRole) || "质检".equals(ownerRole)) {
            return "2小时内响应";
        }
        return "1小时内跟进";
    }

    private String resolveDomain(String ownerRole) {
        if ("财务".equals(ownerRole)) {
            return "finance";
        }
        if ("采购".equals(ownerRole)) {
            return "procurement";
        }
        if ("仓库".equals(ownerRole)) {
            return "warehouse";
        }
        return "production";
    }

    private String resolveSenderName() {
        if (hasText(UserContext.username())) {
            return "小云AI助手（代" + UserContext.username().trim() + "）";
        }
        return "小云AI助手";
    }

    private String resolveDisplayName(User user) {
        if (user == null) {
            return "";
        }
        if (hasText(user.getName())) {
            return user.getName().trim();
        }
        return user.getUsername();
    }

    private String trim(String value) {
        return value == null ? null : value.trim();
    }

    private boolean hasText(String value) {
        return value != null && !value.trim().isEmpty();
    }

    private String lower(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }

    private boolean containsAny(String text, String... keywords) {
        for (String keyword : keywords) {
            if (text.contains(keyword.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private String truncate(String value, int max) {
        if (!hasText(value) || value.length() <= max) {
            return value;
        }
        return value.substring(0, max) + "…";
    }
}
