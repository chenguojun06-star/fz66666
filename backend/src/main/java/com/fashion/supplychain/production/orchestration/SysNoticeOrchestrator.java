package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.MaterialPicking;
import com.fashion.supplychain.production.entity.MaterialPickingItem;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.SysNotice;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.SysNoticeService;
import com.fashion.supplychain.system.entity.Tenant;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.TenantService;
import com.fashion.supplychain.system.service.UserService;
import com.fashion.supplychain.wechat.service.WechatWorkNotifyService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

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

    @Autowired
    private TenantService tenantService;

    @Autowired
    private WechatWorkNotifyService wechatWorkNotifyService;

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

        // Upsert：已有未读同类通知时，刷新内容和时间而非新增行，防止每天重复堆积
        SysNotice existing = sysNoticeService.lambdaQuery()
                .eq(SysNotice::getTenantId, tenantId)
                .eq(SysNotice::getOrderNo, order.getOrderNo())
                .eq(SysNotice::getNoticeType, noticeType)
                .eq(SysNotice::getIsRead, 0)
                .last("LIMIT 1")
                .one();
        if (existing != null) {
            existing.setContent(buildContent(noticeType, order));
            existing.setCreatedAt(LocalDateTime.now());
            sysNoticeService.updateById(existing);
            log.debug("[SmartNotify] 刷新已有未读通知 orderNo={} type={}", order.getOrderNo(), noticeType);
            return;
        }

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

        // 同步推送到企业微信群（已配置时）
        wechatWorkNotifyService.sendOrderAlert(
                order.getOrderNo(),
                order.getStyleNo(),
                noticeType,
                notice.getContent());
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

        // Upsert：已有未读工人提醒时刷新内容，不重复新建行
        SysNotice existing = sysNoticeService.lambdaQuery()
                .eq(SysNotice::getTenantId, tenantId)
                .eq(SysNotice::getOrderNo, order.getOrderNo())
                .eq(SysNotice::getNoticeType, "worker_alert")
                .eq(SysNotice::getToName, workerName)
                .eq(SysNotice::getIsRead, 0)
                .last("LIMIT 1")
                .one();

        String content = String.format(
                "你参与的订单 %s（%s/%s）已多天无进展，当前进度 %d%%。请确认生产状态或联系跟单员。",
                order.getOrderNo(),
                order.getStyleNo() != null ? order.getStyleNo() : "-",
                order.getStyleName() != null ? order.getStyleName() : "-",
                prog);

        if (existing != null) {
            existing.setContent(content);
            existing.setCreatedAt(LocalDateTime.now());
            sysNoticeService.updateById(existing);
            log.debug("[SmartNotify] 刷新已有工人提醒 orderNo={} to={}", order.getOrderNo(), workerName);
            return;
        }

        SysNotice notice = new SysNotice();
        notice.setTenantId(tenantId);
        notice.setToName(workerName);
        notice.setFromName("系统自动检测");
        notice.setOrderNo(order.getOrderNo());
        notice.setTitle("⚠️ 生产提醒 — 订单 " + order.getOrderNo());
        notice.setContent(content);
        notice.setNoticeType("worker_alert");
        notice.setIsRead(0);
        notice.setCreatedAt(LocalDateTime.now());

        sysNoticeService.save(notice);
        log.info("[SmartNotify] 工人提醒已发送 orderNo={} to={}", order.getOrderNo(), workerName);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 物料领取通知 → 仓库
    // ──────────────────────────────────────────────────────────────────────

    /**
     * BOM领取时通知仓库人员出库
     *
     * @param tenantId 租户ID
     * @param picking  领料单（含 pickingNo / pickerName / styleNo / orderNo）
     * @param items    领料明细
     */
    public void sendPickupNotification(Long tenantId, MaterialPicking picking, List<MaterialPickingItem> items) {
        // 1. 查找仓库角色用户
        List<User> warehouseUsers = userService.lambdaQuery()
                .eq(User::getTenantId, tenantId)
                .like(User::getRoleName, "仓库")
                .eq(User::getStatus, "active")
                .list();

        // 兜底：无仓库用户时通知租户主账号
        if (warehouseUsers.isEmpty()) {
            User owner = userService.lambdaQuery()
                    .eq(User::getTenantId, tenantId)
                    .eq(User::getIsTenantOwner, true)
                    .last("LIMIT 1")
                    .one();
            if (owner != null) {
                warehouseUsers = List.of(owner);
            }
        }
        if (warehouseUsers.isEmpty()) {
            log.warn("[SysNotice] 无仓库用户也无租户主账号，跳过领取通知 pickingNo={}", picking.getPickingNo());
            return;
        }

        // 2. 构建通知内容
        String pickerName = picking.getPickerName() != null ? picking.getPickerName() : "未知";
        StringBuilder sb = new StringBuilder();
        sb.append(String.format("%s 发起了物料领取申请（单号：%s）", pickerName, picking.getPickingNo()));
        if (picking.getStyleNo() != null) {
            sb.append("，款号：").append(picking.getStyleNo());
        }
        if (picking.getOrderNo() != null) {
            sb.append("，订单：").append(picking.getOrderNo());
        }
        sb.append("。\n领取物料：");
        if (items != null && !items.isEmpty()) {
            for (MaterialPickingItem item : items) {
                sb.append(String.format("\n  · %s × %d%s",
                        item.getMaterialName() != null ? item.getMaterialName() : item.getMaterialCode(),
                        item.getQuantity() != null ? item.getQuantity() : 0,
                        item.getUnit() != null ? item.getUnit() : ""));
            }
        }
        sb.append("\n请及时确认出库。");

        String title = "📦 物料领取申请 — " + picking.getPickingNo();
        String content = sb.toString();

        // 3. 为每位仓库用户创建通知
        List<SysNotice> notices = new ArrayList<>();
        for (User u : warehouseUsers) {
            String toName = u.getName() != null ? u.getName() : u.getUsername();
            SysNotice notice = new SysNotice();
            notice.setTenantId(tenantId);
            notice.setToName(toName);
            notice.setFromName(pickerName);
            notice.setOrderNo(picking.getOrderNo() != null ? picking.getOrderNo() : "");
            notice.setTitle(title);
            notice.setContent(content);
            notice.setNoticeType("pending_pickup");
            notice.setIsRead(0);
            notice.setCreatedAt(LocalDateTime.now());
            notices.add(notice);
        }
        sysNoticeService.saveBatch(notices);
        log.info("[SysNotice] 物料领取通知已发送 pickingNo={} toCount={}", picking.getPickingNo(), notices.size());
    }

    // ──────────────────────────────────────────────────────────────────────
    // 查询
    // ──────────────────────────────────────────────────────────────────────

    // ──────────────────────────────────────────────────────────────────────
    // 定时任务：异常检测通知（精准推给生产负责人）
    // ──────────────────────────────────────────────────────────────────────

    /**
     * 将 AI 异常检测结果推送给生产相关负责人（不依赖 UserContext，供定时任务调用）
     * 优先推给：角色名含"生产"或"跟单"的活跃用户；兜底：租户主账号
     * 不做全局广播 — 只发给本租户有对应职责的人
     */
    public void sendAnomalyToManagers(Long tenantId, String orderNo, String title, String content) {
        // 1. 查找生产/跟单相关角色用户
        List<User> managers = userService.lambdaQuery()
                .eq(User::getTenantId, tenantId)
                .and(w -> w.like(User::getRoleName, "生产").or().like(User::getRoleName, "跟单"))
                .eq(User::getStatus, "active")
                .list();

        // 兜底：无匹配角色时通知租户主账号
        if (managers.isEmpty()) {
            User owner = userService.lambdaQuery()
                    .eq(User::getTenantId, tenantId)
                    .eq(User::getIsTenantOwner, true)
                    .last("LIMIT 1")
                    .one();
            if (owner != null) {
                managers = List.of(owner);
            }
        }
        if (managers.isEmpty()) {
            log.warn("[SysNotice] sendAnomalyToManagers: 租户 {} 无生产管理用户，跳过通知", tenantId);
            return;
        }

        // 2. 为每位负责人创建一条通知
        List<SysNotice> notices = new ArrayList<>();
        for (User u : managers) {
            String toName = u.getName() != null ? u.getName() : u.getUsername();
            SysNotice n = new SysNotice();
            n.setTenantId(tenantId);
            n.setToName(toName);
            n.setFromName("AI检测");
            n.setOrderNo(orderNo != null ? orderNo : "");
            n.setTitle(title);
            n.setContent(content);
            n.setNoticeType("anomaly");
            n.setIsRead(0);
            n.setCreatedAt(LocalDateTime.now());
            notices.add(n);
        }
        sysNoticeService.saveBatch(notices);
        log.info("[SysNotice] 异常检测通知已发送 title={} toCount={}", title, notices.size());

        // 同步推送到企业微信群（已配置时）
        String wechatContent = String.format("**%s — %s**\n>%s", title, orderNo != null ? orderNo : "", content);
        wechatWorkNotifyService.sendMarkdown(wechatContent);
    }

    // ──────────────────────────────────────────────────────────────────────
    // 超级管理员：全租户广播
    // ──────────────────────────────────────────────────────────────────────

    /**
     * 向所有活跃租户的主账号发送系统公告
     * 每个租户只写一条 notice（toName = ownerUsername）
     *
     * @param type    通知类型标签（upgrade / maintenance / announcement）
     * @param title   公告标题
     * @param content 公告正文
     * @return 发送的租户数量
     */
    @Transactional(rollbackFor = Exception.class)
    public int broadcastGlobal(String type, String title, String content) {
        List<Tenant> tenants = tenantService.lambdaQuery()
                .eq(Tenant::getStatus, "active")
                .list();

        List<SysNotice> notices = new ArrayList<>();
        for (Tenant t : tenants) {
            String toName = null;
            if (t.getOwnerUserId() != null) {
                User owner = userService.lambdaQuery()
                        .eq(User::getId, t.getOwnerUserId())
                        .one();
                if (owner != null) {
                    toName = owner.getName() != null ? owner.getName() : owner.getUsername();
                }
            }
            if (toName == null) toName = "管理员";

            SysNotice notice = new SysNotice();
            notice.setTenantId(t.getId());
            notice.setToName(toName);
            notice.setFromName("系统");
            notice.setOrderNo("");
            notice.setTitle(title);
            notice.setContent(content);
            notice.setNoticeType("system_broadcast");
            notice.setIsRead(0);
            notice.setCreatedAt(LocalDateTime.now());
            notices.add(notice);
        }

        if (!notices.isEmpty()) {
            sysNoticeService.saveBatch(notices);
        }
        log.info("[SysNotice] 全租户广播已发送 type={} tenantCount={}", type, notices.size());
        return notices.size();
    }

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
            case "stagnant"   -> "⏸ 停滞预警 — 订单 " + order.getOrderNo();
            case "deadline"   -> "⏰ 临期提醒 — 订单 " + order.getOrderNo();
            case "quality"    -> "🔴 质量问题 — 订单 " + order.getOrderNo();
            case "urge_order" -> "📦 催单提醒 — 订单 " + order.getOrderNo();
            default           -> "📢 通知 — 订单 " + order.getOrderNo();
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
                    order.getOrderNo(), order.getStyleNo(), prog, factory);            case "urge_order" -> {
                String shipDate = order.getExpectedShipDate() != null
                        ? order.getExpectedShipDate().format(java.time.format.DateTimeFormatter.ofPattern("MM-dd")) : "未定";
                yield String.format(
                        "订单 %s（%s）已更新预计出货日期为 %s，当前进度 %d%%，请确认排期并及时回复。",
                        order.getOrderNo(), order.getStyleNo(), shipDate, prog);
            }            default         -> String.format(
                    "订单 %s（%s）需要您关注，当前进度 %d%%。",
                    order.getOrderNo(), order.getStyleNo(), prog);
        };
    }
}
