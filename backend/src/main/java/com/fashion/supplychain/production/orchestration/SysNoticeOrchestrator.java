package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SysNoticeService;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;

/**
 * 站内通知编排器 — 跟单员收件箱
 *
 * 场景：管理员/主管发现某订单停滞/临期，点击"通知跟单员"，
 *       由本编排器写入 t_sys_notice，跟单员下次登录即可在
 *       SmartAlertBell 的"我的通知"Tab 看到并行动。
 */
@Slf4j
@Service
public class SysNoticeOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("MM-dd");

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private SysNoticeService sysNoticeService;

    @Autowired
    private UserService userService;

    // ──────────────────────────────────────────────────────────────────────
    // 发送通知
    // ──────────────────────────────────────────────────────────────────────

    /**
     * 发送通知给跟单员
     *
     * @param orderNo    目标订单号
     * @param noticeType 通知类型（stagnant / deadline / quality / manual）
     */
    @Transactional(rollbackFor = Exception.class)
    public void send(String orderNo, String noticeType) {
        Long tenantId = UserContext.tenantId();
        String senderUsername = UserContext.username();

        // 解析发送人显示名（可选：能查到就用真实姓名，查不到用登录名）
        String fromName = resolveDisplayName(senderUsername, tenantId);

        // 查询订单
        ProductionOrder order = productionOrderService.lambdaQuery()
                .eq(ProductionOrder::getOrderNo, orderNo)
                .eq(ProductionOrder::getTenantId, tenantId)
                .one();
        if (order == null) {
            throw new IllegalArgumentException("订单不存在: " + orderNo);
        }

        String merchandiser = order.getMerchandiser();
        if (merchandiser == null || merchandiser.isBlank()) {
            throw new IllegalArgumentException("该订单未设置跟单员，无法发送通知");
        }

        String title   = buildTitle(noticeType, order);
        String content = buildContent(noticeType, order);

        SysNotice notice = new SysNotice();
        notice.setTenantId(tenantId);
        notice.setToName(merchandiser);
        notice.setFromName(fromName);
        notice.setOrderNo(orderNo);
        notice.setTitle(title);
        notice.setContent(content);
        notice.setNoticeType(noticeType);
        notice.setIsRead(0);
        notice.setCreatedAt(LocalDateTime.now());

        sysNoticeService.save(notice);
        log.info("[SysNotice] 通知已发送 orderNo={} to={} type={}", orderNo, merchandiser, noticeType);
    }

    /**
     * 系统自动发送通知（不依赖 UserContext，专供定时任务调用）
     *
     * @param tenantId   租户ID
     * @param order      目标订单（已持有完整字段）
     * @param noticeType 通知类型（stagnant / deadline）
     */
    @Transactional(rollbackFor = Exception.class)
    public void sendAuto(Long tenantId, ProductionOrder order, String noticeType) {
        String merchandiser = order.getMerchandiser();
        if (merchandiser == null || merchandiser.isBlank()) return;

        SysNotice notice = new SysNotice();
        notice.setTenantId(tenantId);
        notice.setToName(merchandiser);
        notice.setFromName("系统自动检测");
        notice.setOrderNo(order.getOrderNo());
        notice.setTitle(buildTitle(noticeType, order));
        notice.setContent(buildContent(noticeType, order));
        notice.setNoticeType(noticeType);
        notice.setIsRead(0);
        notice.setCreatedAt(LocalDateTime.now());

        sysNoticeService.save(notice);
        log.info("[SmartNotify] 自动通知已发送 orderNo={} to={} type={}",
                order.getOrderNo(), merchandiser, noticeType);
    }

    /**
     * 系统自动发送给操作工人（停滞时直接通知最后扫码工人，AI 直达手机，无需管理者转达）
     *
     * @param tenantId   租户ID
     * @param workerName 工人显示名（来自 ScanRecord.operatorName）
     * @param order      目标订单
     */
    @Transactional(rollbackFor = Exception.class)
    public void sendWorkerAlert(Long tenantId, String workerName, ProductionOrder order) {
        if (workerName == null || workerName.isBlank()) return;

        int prog = order.getProductionProgress() != null ? order.getProductionProgress() : 0;

        SysNotice notice = new SysNotice();
        notice.setTenantId(tenantId);
        notice.setToName(workerName);
        notice.setFromName("系统自动检测");
        notice.setOrderNo(order.getOrderNo());
        notice.setTitle("⚠️ 生产提醒 — 订单 " + order.getOrderNo());
        notice.setContent(String.format(
                "你参与的订单 %s（%s/%s）已多天无进展，当前进度 %d%%。请确认生产状态或联系跟单员。",
                order.getOrderNo(),
                order.getStyleNo() != null ? order.getStyleNo() : "-",
                order.getStyleName() != null ? order.getStyleName() : "-",
                prog));
        notice.setNoticeType("worker_alert");
        notice.setIsRead(0);
        notice.setCreatedAt(LocalDateTime.now());

        sysNoticeService.save(notice);
        log.info("[SmartNotify] 工人提醒已发送 orderNo={} to={}", order.getOrderNo(), workerName);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 查询
    // ──────────────────────────────────────────────────────────────────────

    /**
     * 获取当前登录用户的通知列表（最近30条）
     */
    public List<SysNotice> getMyNotices() {
        Long tenantId  = UserContext.tenantId();
        String[] names = resolveMyNames(tenantId);
        return sysNoticeService.queryForUser(tenantId, names[0], names[1]);
    }

    /**
     * 获取当前登录用户的未读通知数
     */
    public long getUnreadCount() {
        Long tenantId  = UserContext.tenantId();
        String[] names = resolveMyNames(tenantId);
        return sysNoticeService.countUnread(tenantId, names[0], names[1]);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 标记已读
    // ──────────────────────────────────────────────────────────────────────

    @Transactional(rollbackFor = Exception.class)
    public void markRead(Long id) {
        sysNoticeService.markRead(id, UserContext.tenantId());
    }

    // ──────────────────────────────────────────────────────────────────────
    // 私有辅助
    // ──────────────────────────────────────────────────────────────────────

    /**
     * 返回 [displayName, username]，用于收件箱查询时双字段 OR 匹配
     */
    private String[] resolveMyNames(Long tenantId) {
        String loginUsername = UserContext.username();
        User me = userService.lambdaQuery()
                .eq(User::getUsername, loginUsername)
                .eq(User::getTenantId, tenantId)
                .one();
        String displayName = (me != null && me.getName() != null) ? me.getName() : loginUsername;
        return new String[]{displayName, loginUsername};
    }

    /**
     * 将 loginUsername 解析为可读显示名
     */
    private String resolveDisplayName(String loginUsername, Long tenantId) {
        if (loginUsername == null) return "系统";
        User user = userService.lambdaQuery()
                .eq(User::getUsername, loginUsername)
                .eq(User::getTenantId, tenantId)
                .one();
        return (user != null && user.getName() != null) ? user.getName() : loginUsername;
    }

    private String buildTitle(String noticeType, ProductionOrder order) {
        return switch (noticeType) {
            case "stagnant" -> "⏸ 停滞预警 — 订单 " + order.getOrderNo();
            case "deadline" -> "⏰ 临期提醒 — 订单 " + order.getOrderNo();
            case "quality"  -> "🔴 质量问题 — 订单 " + order.getOrderNo();
            default         -> "📢 通知 — 订单 " + order.getOrderNo();
        };
    }

    private String buildContent(String noticeType, ProductionOrder order) {
        int prog = order.getProductionProgress() != null ? order.getProductionProgress() : 0;
        String factory = order.getFactoryName() != null ? order.getFactoryName() : "—";

        return switch (noticeType) {
            case "stagnant" -> String.format(
                    "订单 %s（%s/%s）已多天无扫码记录，当前进度 %d%%，工厂：%s。请跟进确认生产状态。",
                    order.getOrderNo(), order.getStyleNo(), order.getStyleName(), prog, factory);
            case "deadline" -> {
                String deadline = order.getPlannedEndDate() != null
                        ? order.getPlannedEndDate().format(DATE_FMT) : "未知";
                long daysLeft = order.getPlannedEndDate() != null
                        ? ChronoUnit.DAYS.between(LocalDateTime.now(), order.getPlannedEndDate()) : 0;
                yield String.format(
                        "订单 %s（%s）计划交期 %s（剩 %d 天），当前进度 %d%%，请加急跟进。",
                        order.getOrderNo(), order.getStyleNo(), deadline, daysLeft, prog);
            }
            case "quality"  -> String.format(
                    "订单 %s（%s）存在质量问题需关注，当前进度 %d%%，工厂：%s。请及时处理。",
                    order.getOrderNo(), order.getStyleNo(), prog, factory);
            default         -> String.format(
                    "订单 %s（%s）需要您关注，当前进度 %d%%。",
                    order.getOrderNo(), order.getStyleNo(), prog);
        };
    }
}
