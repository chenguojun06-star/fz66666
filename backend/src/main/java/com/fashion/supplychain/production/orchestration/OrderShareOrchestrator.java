package com.fashion.supplychain.production.orchestration;

import cn.hutool.jwt.JWT;
import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.OrderShareResponse;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.production.service.ScanRecordService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.Date;
import java.util.List;

/**
 * 客户订单分享编排器
 *
 * <p>核心功能：
 * <ul>
 *   <li>generateShareToken：为订单生成 30 天有效的 JWT 分享令牌（需要登录，仅订单所属租户可生成）</li>
 *   <li>resolveShareOrder：通过令牌获取可公开的订单摘要（无需登录）</li>
 * </ul>
 *
 * <p>安全设计：
 * <ul>
 *   <li>使用与系统相同的 JWT secret，令牌不可伪造</li>
 *   <li>令牌 payload 包含 type=share + orderId + tenantId，防止跨租户越权</li>
 *   <li>公开接口 (resolveShareOrder) 仅返回 OrderShareResponse 中定义的字段，严禁泄露价格/工人信息</li>
 * </ul>
 */
@Service
@Slf4j
public class OrderShareOrchestrator {

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter DATETIME_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final long SHARE_TTL_MS = 30L * 24 * 60 * 60 * 1000; // 30 天

    private final byte[] jwtSecret;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private ScanRecordService scanRecordService;

    public OrderShareOrchestrator(@Value("${app.auth.jwt-secret:}") String secret) {
        this.jwtSecret = (secret == null ? "" : secret.trim()).getBytes(StandardCharsets.UTF_8);
    }

    // ───────────────────────────────────────────────────
    // 生成分享令牌（需要登录，只能分享自己租户的订单）
    // ───────────────────────────────────────────────────

    /**
     * 为指定订单生成分享令牌（30 天有效）
     *
     * @param orderId 订单 ID
     * @return share URL 中使用的 JWT token 字符串
     */
    public String generateShareToken(String orderId) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            throw new IllegalStateException("未登录，无法生成分享链接");
        }

        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            throw new IllegalArgumentException("订单不存在");
        }
        // 租户隔离：只能分享自己租户下的订单
        if (!String.valueOf(tenantId).equals(String.valueOf(order.getTenantId()))) {
            throw new SecurityException("无权限分享此订单");
        }

        long now = System.currentTimeMillis();
        String token = JWT.create()
                .setPayload("type", "share")
                .setPayload("orderId", orderId)
                .setPayload("tenantId", String.valueOf(tenantId))
                .setPayload("iat", new Date(now))
                .setPayload("exp", new Date(now + SHARE_TTL_MS))
                .setKey(jwtSecret)
                .sign();

        log.info("[OrderShare] 生成分享令牌 orderId={} tenantId={}", orderId, tenantId);
        return token;
    }

    // ───────────────────────────────────────────────────
    // 通过令牌获取公开订单摘要（无需登录）
    // ───────────────────────────────────────────────────

    /**
     * 使用分享令牌获取可公开的订单摘要
     *
     * @param token 前端 URL path 中的令牌
     * @return 脱敏后的订单快照，或错误提示
     */
    public Result<OrderShareResponse> resolveShareOrder(String token) {
        // 1. 验证令牌
        JWT jwt;
        try {
            jwt = JWT.of(token).setKey(jwtSecret);
        } catch (Exception e) {
            return Result.fail("分享链接无效");
        }

        boolean valid;
        try {
            valid = jwt.verify() && jwt.validate(0);
        } catch (Exception e) {
            valid = false;
        }
        if (!valid) {
            return Result.fail("分享链接已失效或格式错误");
        }

        // 2. 类型检查
        Object type = jwt.getPayload("type");
        if (!"share".equals(type)) {
            return Result.fail("分享链接类型无效");
        }

        // 3. 提取 orderId
        String orderId = jwt.getPayload("orderId") == null
                ? null : String.valueOf(jwt.getPayload("orderId"));
        if (orderId == null) {
            return Result.fail("分享链接损坏");
        }

        // 4. 查询订单
        ProductionOrder order = productionOrderService.getById(orderId);
        if (order == null) {
            return Result.fail("订单不存在或已删除");
        }

        // 5. 查询最近一条扫码记录
        String latestScanTime = null;
        String latestScanStage = null;
        try {
            QueryWrapper<ScanRecord> qw = new QueryWrapper<>();
            qw.eq("order_id", orderId)
              .eq("scan_result", "success")
              .eq("delete_flag", 0)
              .orderByDesc("scan_time")
              .last("LIMIT 1");
            List<ScanRecord> scans = scanRecordService.list(qw);
            if (!scans.isEmpty()) {
                ScanRecord latest = scans.get(0);
                if (latest.getScanTime() != null) {
                    latestScanTime = latest.getScanTime().format(DATETIME_FMT);
                }
                latestScanStage = latest.getProgressStage() != null
                        ? latest.getProgressStage()
                        : latest.getProcessName();
            }
        } catch (Exception e) {
            log.debug("[OrderShare] 查询扫码记录失败，跳过 orderId={}", orderId);
        }

        // 6. 组装响应（只暴露公开安全字段）
        OrderShareResponse resp = new OrderShareResponse();
        resp.setToken(token);
        resp.setOrderNo(order.getOrderNo());
        resp.setStyleNo(order.getStyleNo());
        resp.setStyleName(order.getStyleName());
        resp.setColor(order.getColor());
        resp.setSize(order.getSize());
        resp.setOrderQuantity(order.getOrderQuantity());
        resp.setCompletedQuantity(order.getCompletedQuantity());
        resp.setProductionProgress(order.getProductionProgress());
        resp.setStatusText(mapStatusText(order.getStatus()));
        resp.setFactoryName(order.getFactoryName());
        resp.setCompanyName(order.getCompany());
        resp.setLatestScanTime(latestScanTime);
        resp.setLatestScanStage(latestScanStage);

        Object expObj = jwt.getPayload("exp");
        long expMs = expObj instanceof Date ? ((Date) expObj).getTime() : ((Number) expObj).longValue();
        resp.setExpiresAt(expMs);

        if (order.getPlannedEndDate() != null) {
            resp.setPlannedEndDate(order.getPlannedEndDate().format(DATE_FMT));
        }
        if (order.getActualEndDate() != null) {
            resp.setActualEndDate(order.getActualEndDate().format(DATE_FMT));
        }
        if (order.getCreateTime() != null) {
            resp.setCreateTime(order.getCreateTime().format(DATE_FMT));
        }

        return Result.success(resp);
    }

    // ───────────────────────────────────────────────────
    // 私有辅助
    // ───────────────────────────────────────────────────

    private String mapStatusText(String status) {
        if (status == null) return "未知";
        return switch (status) {
            case "pending"    -> "待开始";
            case "production" -> "生产中";
            case "completed"  -> "已完成";
            case "delayed"    -> "延期中";
            case "closed"     -> "已关单";
            default           -> status;
        };
    }
}
