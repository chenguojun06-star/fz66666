package com.fashion.supplychain.system.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.DataPermissionHelper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.PatternProduction;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.PatternProductionService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleOperationLog;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.service.OrderRemarkService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 订单备注编排器 — 统一负责 t_order_remark 的读写，
 * 确保事务一致性与多租户上下文校验。
 *
 * <p><b>写操作</b>（{@link #save}）必须走本编排器，保证所有写入经过同一入口，
 * 便于后续扩展（多端同步推送、审计日志等）。
 *
 * <p><b>D-641 读操作下沉</b>：原先「备注时间线聚合」全部写在
 * {@code OrderRemarkController} 里，且该 Controller 直接注入了
 * OrderRemarkService / ProductionOrderService / StyleInfoService /
 * StyleOperationLogService / MaterialPurchaseService / PatternProductionService
 * 共 6 个 Service，属「Controller 依赖多个 Service」。
 * 现把聚合逻辑整体搬进本编排器，Controller 只保留端点声明与参数校验。
 *
 * <p>时间线口径：除 {@code t_order_remark} 主表外，还会合并三处「行内备注」——
 * 订单 remarks 字段拆行、款式操作日志 + 三种退回评语、样衣 remarks 字段拆行，
 * 以及该订单下所有采购条目的 remark（D-375 起 authorRole 语义为「角色/工序」）。
 */
@Slf4j
@Service
public class OrderRemarkOrchestrator {

    @Autowired
    private OrderRemarkService orderRemarkService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleOperationLogService styleOperationLogService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private PatternProductionService patternProductionService;

    // 兼容两种格式：
    // 1. 旧格式：[MM-DD HH:mm] 或 [MM-DD HH:mm:ss]
    // 2. 新格式：[yyyy-MM-dd HH:mm:ss]（与 OperationLogAppendUtil / OrderRemarkHelper 统一）
    // 3. 可选 AI巡检 前缀
    private static final Pattern REMARK_LINE_PATTERN = Pattern.compile(
            "^\\[(?:(AI巡检)\\s*)?((?:\\d{4}-)?\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}(?::\\d{2})?)\\]\\s*(.+)$"
    );

    /**
     * 保存一条订单/款号备注。
     *
     * 自动注入作者信息（id / name / role）、租户ID、创建时间、
     * 以及软删除标记。保证所有写操作经过同一入口，便于后续扩展
     * （例如：多端同步推送、审计日志等）。
     *
     * @param remark 客户端提交的备注对象（targetType / targetNo / content 为必填）
     */
    @Transactional(rollbackFor = Exception.class)
    public OrderRemark save(OrderRemark remark) {
        TenantAssert.assertTenantContext();

        // 基本参数校验（Controller 侧已有，但编排器再做一次防御性校验）
        if (!StringUtils.hasText(remark.getTargetType())
                || !StringUtils.hasText(remark.getTargetNo())
                || !StringUtils.hasText(remark.getContent())) {
            throw new IllegalArgumentException("targetType / targetNo / content 不能为空");
        }

        // 从 UserContext 注入作者与租户信息
        UserContext ctx = UserContext.get();
        if (ctx != null) {
            remark.setAuthorId(ctx.getUserId());
            remark.setAuthorName(ctx.getUsername());
            if (!StringUtils.hasText(remark.getAuthorRole())) {
                remark.setAuthorRole(ctx.getRole());
            }
            remark.setTenantId(ctx.getTenantId());
        }
        remark.setCreateTime(LocalDateTime.now());
        remark.setDeleteFlag(0);

        orderRemarkService.save(remark);

        log.info("[OrderRemark] 已保存备注 id={} targetType={} targetNo={} authorName={}",
                remark.getId(), remark.getTargetType(), remark.getTargetNo(), remark.getAuthorName());
        return remark;
    }

    /**
     * 按订单号查询该订单下所有备注（含订单内嵌备注与采购备注）。
     * 注意：本方法仅返回 t_order_remark 表中存储的记录，
     * 订单内嵌文本解析、采购单 remark 合并等逻辑仍由 Controller 完成。
     */
    public List<OrderRemark> queryByOrderId(String orderNo) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(orderNo)) {
            return java.util.Collections.emptyList();
        }
        Long tenantId = UserContext.tenantId();
        return orderRemarkService.list(new LambdaQueryWrapper<OrderRemark>()
                .eq(OrderRemark::getTenantId, tenantId)
                .eq(OrderRemark::getTargetType, "order")
                .eq(OrderRemark::getTargetNo, orderNo)
                .eq(OrderRemark::getDeleteFlag, 0)
                .orderByDesc(OrderRemark::getCreateTime));
    }

    /**
     * 按目标类型与目标编号查询备注列表。
     * 例如：targetType="style", targetNo=款号；targetType="order", targetNo=订单号。
     */
    public List<OrderRemark> queryByTargetNo(String targetType, String targetNo) {
        TenantAssert.assertTenantContext();
        if (!StringUtils.hasText(targetType) || !StringUtils.hasText(targetNo)) {
            return java.util.Collections.emptyList();
        }
        Long tenantId = UserContext.tenantId();
        return orderRemarkService.list(new LambdaQueryWrapper<OrderRemark>()
                .eq(OrderRemark::getTenantId, tenantId)
                .eq(OrderRemark::getTargetType, targetType)
                .eq(OrderRemark::getTargetNo, targetNo)
                .eq(OrderRemark::getDeleteFlag, 0)
                .orderByDesc(OrderRemark::getCreateTime));
    }

    // ===== D-641：以下聚合方法从 OrderRemarkController 下沉 =====

    /**
     * 备注时间线（主表记录 + 按 targetType 合并的行内备注），按创建时间倒序。
     *
     * <p>数据权限：工厂账号查看 {@code targetType="order"} 的备注时，
     * 只能看自己工厂订单的备注；不属于自己工厂则返回空列表（不报错，避免探测）。
     */
    public List<OrderRemark> listRemarks(String targetType, String targetNo) {
        Long tenantId = TenantAssert.requireTenantId();

        // 工厂账号只能查看自己订单的备注
        if ("order".equals(targetType) && DataPermissionHelper.isFactoryAccount()) {
            String ctxFactoryId = UserContext.factoryId();
            if (StringUtils.hasText(ctxFactoryId)) {
                ProductionOrder order = productionOrderService.lambdaQuery()
                        .select(ProductionOrder::getId, ProductionOrder::getFactoryId)
                        .eq(ProductionOrder::getOrderNo, targetNo)
                        .eq(ProductionOrder::getTenantId, tenantId)
                        .eq(ProductionOrder::getDeleteFlag, 0)
                        .last("LIMIT 1")
                        .one();
                if (order == null || !ctxFactoryId.equals(order.getFactoryId())) {
                    return Collections.emptyList();
                }
            }
        }

        List<OrderRemark> result = new ArrayList<>();

        LambdaQueryWrapper<OrderRemark> wrapper = new LambdaQueryWrapper<OrderRemark>()
                .eq(OrderRemark::getTenantId, tenantId)
                .eq(OrderRemark::getTargetType, targetType)
                .eq(OrderRemark::getTargetNo, targetNo)
                .eq(OrderRemark::getDeleteFlag, 0)
                .orderByDesc(OrderRemark::getCreateTime);
        result.addAll(orderRemarkService.list(wrapper));

        if ("order".equals(targetType)) {
            result.addAll(extractOrderInlineRemarks(targetNo));
            // 合并采购单备注：t_material_purchase.remark → 统一展示在订单备注时间线中
            result.addAll(extractPurchaseRemarks(targetNo));
            result.sort(Comparator.comparing(OrderRemark::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder())));
        } else if ("style".equals(targetType)) {
            result.addAll(extractStyleInlineRemarks(targetNo));
            result.sort(Comparator.comparing(OrderRemark::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder())));
        } else if ("pattern".equals(targetType)) {
            // 样衣开发：合并 t_pattern_production.remarks 拆行展示
            result.addAll(extractPatternInlineRemarks(targetNo));
            result.sort(Comparator.comparing(OrderRemark::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder())));
        }

        return result;
    }

    /**
     * 批量取多个目标的「最新一条备注内容」（targetNo → content）。
     *
     * <p>列表页角标用：每个 targetNo 只保留最新一条（createTime 倒序后 putIfAbsent）。
     * 单次上限 5000 条。
     */
    public Map<String, String> batchLatest(String targetType, List<String> targetNos) {
        Long tenantId = TenantAssert.requireTenantId();
        List<OrderRemark> all = orderRemarkService.lambdaQuery()
                .eq(OrderRemark::getTenantId, tenantId)
                .eq(OrderRemark::getTargetType, targetType)
                .in(OrderRemark::getTargetNo, targetNos)
                .eq(OrderRemark::getDeleteFlag, 0)
                .orderByDesc(OrderRemark::getCreateTime)
                .last("LIMIT 5000")
                .list();
        Map<String, String> result = new HashMap<>();
        for (OrderRemark r : all) {
            result.putIfAbsent(r.getTargetNo(), r.getContent());
        }
        return result;
    }

    /**
     * 从 t_material_purchase 提取该订单下所有采购条目的 remark 字段，
     * 合并进备注时间线，让各端点开备注都能看到采购相关说明。
     */
    private List<OrderRemark> extractPurchaseRemarks(String orderNo) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        List<MaterialPurchase> purchases = materialPurchaseService.lambdaQuery()
                .select(MaterialPurchase::getId, MaterialPurchase::getPurchaseNo,
                        MaterialPurchase::getMaterialName, MaterialPurchase::getRemark,
                        MaterialPurchase::getReceiverName, MaterialPurchase::getReceivedTime)
                .eq(MaterialPurchase::getOrderNo, orderNo)
                .eq(MaterialPurchase::getTenantId, tenantId)
                .isNotNull(MaterialPurchase::getRemark)
                .list();

        List<OrderRemark> result = new ArrayList<>();
        long seq = -1000;
        for (MaterialPurchase p : purchases) {
            String remarkText = p.getRemark();
            if (!StringUtils.hasText(remarkText)) continue;

            // 内容加上物料名称前缀，方便区分是哪个采购条目的备注
            String materialTag = StringUtils.hasText(p.getMaterialName())
                    ? "「采购·" + p.getMaterialName() + "」"
                    : "「采购备注」";
            OrderRemark r = new OrderRemark();
            r.setId(seq--);
            r.setTargetType("order");
            r.setTargetNo(orderNo);
            r.setContent(materialTag + remarkText);
            r.setAuthorName(StringUtils.hasText(p.getReceiverName()) ? p.getReceiverName() : "采购");
            r.setAuthorRole("采购备注");
            r.setCreateTime(p.getReceivedTime());
            r.setDeleteFlag(0);
            result.add(r);
        }
        return result;
    }

    private List<OrderRemark> extractOrderInlineRemarks(String orderNo) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        ProductionOrder order = productionOrderService.lambdaQuery()
                .select(ProductionOrder::getId, ProductionOrder::getOrderNo, ProductionOrder::getRemarks)
                .eq(ProductionOrder::getOrderNo, orderNo)
                .eq(ProductionOrder::getTenantId, tenantId)
                .eq(ProductionOrder::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (order == null || !StringUtils.hasText(order.getRemarks())) {
            return Collections.emptyList();
        }
        return parseInlineRemarks(order.getRemarks().trim(), "order", orderNo);
    }

    private List<OrderRemark> extractStyleInlineRemarks(String styleNo) {
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, styleNo)
                .last("LIMIT 1")
                .one();
        if (style == null) {
            return Collections.emptyList();
        }
        List<OrderRemark> result = new ArrayList<>();
        // 注意：style.getDescription() 是生产制单文档内容（大货工艺要求等），
        // 不是操作日志，不应拆成"历史备注"展示。只提取真正的操作记录。

        // 1. 查询 t_style_operation_log 表，把款式操作日志合并到备注列表
        try {
            List<StyleOperationLog> opLogs = styleOperationLogService.lambdaQuery()
                    .eq(StyleOperationLog::getStyleId, style.getId())
                    .orderByDesc(StyleOperationLog::getCreateTime)
                    .last("LIMIT 50")
                    .list();
            for (StyleOperationLog opLog : opLogs) {
                OrderRemark r = new OrderRemark();
                r.setTargetType("style");
                r.setTargetNo(styleNo);
                String content = opLog.getAction();
                if (StringUtils.hasText(opLog.getRemark())) {
                    content += "：" + opLog.getRemark();
                }
                r.setContent(content);
                r.setAuthorName(opLog.getOperator());
                // D-375：authorRole 语义是"角色/工序"（如 裁剪/车缝/AI巡检），
                // 原实现塞的是 log.getBizType()（业务类型，值为 "style"），
                // 导致备注列表里"操作人"一栏显示成 style——数据来源混淆。
                // 这里明确标记为「操作日志」来源，操作类型由 content 前缀(action)体现。
                r.setAuthorRole("操作日志");
                r.setCreateTime(opLog.getCreateTime());
                r.setDeleteFlag(0);
                result.add(r);
            }
        } catch (Exception e) {
            log.debug("查询款式操作日志失败: styleNo={}", styleNo, e);
        }

        // 2. 样衣审核评语
        if (StringUtils.hasText(style.getSampleReviewComment())) {
            OrderRemark r = new OrderRemark();
            r.setId(-1L);
            r.setTargetType("style");
            r.setTargetNo(styleNo);
            r.setContent(style.getSampleReviewComment());
            r.setAuthorName(style.getSampleReviewer());
            r.setAuthorRole("样衣审核");
            r.setCreateTime(style.getSampleReviewTime());
            r.setDeleteFlag(0);
            result.add(r);
        }
        // 3. 制单退回评语
        if (StringUtils.hasText(style.getDescriptionReturnComment())) {
            OrderRemark r = new OrderRemark();
            r.setId(-2L);
            r.setTargetType("style");
            r.setTargetNo(styleNo);
            r.setContent(style.getDescriptionReturnComment());
            r.setAuthorName(style.getDescriptionReturnBy());
            r.setAuthorRole("制单退回");
            r.setCreateTime(style.getDescriptionReturnTime());
            r.setDeleteFlag(0);
            result.add(r);
        }
        // 4. 纸样退回评语
        if (StringUtils.hasText(style.getPatternRevReturnComment())) {
            OrderRemark r = new OrderRemark();
            r.setId(-3L);
            r.setTargetType("style");
            r.setTargetNo(styleNo);
            r.setContent(style.getPatternRevReturnComment());
            r.setAuthorName(style.getPatternRevReturnBy());
            r.setAuthorRole("纸样退回");
            r.setCreateTime(style.getPatternRevReturnTime());
            r.setDeleteFlag(0);
            result.add(r);
        }
        return result;
    }

    /**
     * 样衣开发：从 t_pattern_production.remarks 提取行内备注
     * targetNo = patternProduction.id
     */
    private List<OrderRemark> extractPatternInlineRemarks(String patternId) {
        TenantAssert.assertTenantContext();
        Long tenantId = UserContext.tenantId();
        PatternProduction pattern = patternProductionService.lambdaQuery()
                .select(PatternProduction::getId, PatternProduction::getRemarks)
                .eq(PatternProduction::getId, patternId)
                .eq(PatternProduction::getTenantId, tenantId)
                .eq(PatternProduction::getDeleteFlag, 0)
                .last("LIMIT 1")
                .one();
        if (pattern == null || !StringUtils.hasText(pattern.getRemarks())) {
            return Collections.emptyList();
        }
        return parseInlineRemarks(pattern.getRemarks().trim(), "pattern", patternId);
    }

    private List<OrderRemark> parseInlineRemarks(String remarks, String targetType, String targetNo) {
        String[] lines = remarks.split("\\n");
        List<OrderRemark> result = new ArrayList<>();
        long seq = -10;
        for (String line : lines) {
            String trimmedLine = line.trim();
            if (trimmedLine.isEmpty()) continue;

            Matcher m = REMARK_LINE_PATTERN.matcher(trimmedLine);
            if (m.matches()) {
                String source = m.group(1);
                String timeStr = m.group(2);
                String content = m.group(3);

                OrderRemark r = new OrderRemark();
                r.setId(seq--);
                r.setTargetType(targetType);
                r.setTargetNo(targetNo);
                r.setContent(content);
                r.setAuthorName(source != null ? "AI巡检" : "系统记录");
                r.setAuthorRole(source != null ? "AI巡检" : "快速备注");
                r.setCreateTime(parseRemarkTime(timeStr));
                r.setDeleteFlag(0);
                result.add(r);
            } else {
                OrderRemark r = new OrderRemark();
                r.setId(seq--);
                r.setTargetType(targetType);
                r.setTargetNo(targetNo);
                r.setContent(trimmedLine);
                r.setAuthorName("系统记录");
                r.setAuthorRole("历史备注");
                r.setCreateTime(null);
                r.setDeleteFlag(0);
                result.add(r);
            }
        }
        return result;
    }

    private LocalDateTime parseRemarkTime(String timeStr) {
        try {
            if (timeStr == null || timeStr.trim().isEmpty()) return null;
            String trimmed = timeStr.trim();
            // 新格式已含年份：yyyy-MM-dd HH:mm:ss 或 yyyy-MM-dd HH:mm
            if (trimmed.matches("\\d{4}-\\d{2}-\\d{2}.*")) {
                DateTimeFormatter fmtSec = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
                DateTimeFormatter fmtMin = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
                try { return LocalDateTime.parse(trimmed, fmtSec); } catch (Exception e) {
                    log.warn("[OrderRemark] 解析时间(秒)失败: {}", e.getMessage());
                }
                try { return LocalDateTime.parse(trimmed, fmtMin); } catch (Exception e) {
                    log.warn("[OrderRemark] 解析时间(分)失败: {}", e.getMessage());
                }
            }
            // 旧格式无年份：MM-DD HH:mm 或 MM-DD HH:mm:ss,补当前年份
            int currentYear = LocalDateTime.now().getYear();
            String fullTimeStr = currentYear + "-" + trimmed;
            DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
            DateTimeFormatter fmtSec = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            try { return LocalDateTime.parse(fullTimeStr, fmtSec); } catch (Exception e) {
                log.warn("[OrderRemark] 解析补年份时间(秒)失败: {}", e.getMessage());
            }
            return LocalDateTime.parse(fullTimeStr, fmt);
        } catch (Exception e) {
            log.debug("[OrderRemark] parseTimeStr失败: timeStr={}", timeStr);
            return null;
        }
    }
}
