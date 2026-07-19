package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleOperationLog;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleOperationLogService;
import com.fashion.supplychain.system.entity.OrderRemark;
import com.fashion.supplychain.system.orchestration.OrderRemarkOrchestrator;
import com.fashion.supplychain.system.service.OrderRemarkService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import lombok.extern.slf4j.Slf4j;

@Slf4j
@RestController
@RequestMapping("/api/system/order-remark")
@PreAuthorize("isAuthenticated()")
public class OrderRemarkController {

    @Autowired
    private OrderRemarkService orderRemarkService;

    @Autowired
    private OrderRemarkOrchestrator orderRemarkOrchestrator;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleOperationLogService styleOperationLogService;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private com.fashion.supplychain.production.service.PatternProductionService patternProductionService;

    // 兼容两种格式：
    // 1. 旧格式：[MM-DD HH:mm] 或 [MM-DD HH:mm:ss]
    // 2. 新格式：[yyyy-MM-dd HH:mm:ss]（与 OperationLogAppendUtil / OrderRemarkHelper 统一）
    // 3. 可选 AI巡检 前缀
    private static final Pattern REMARK_LINE_PATTERN = Pattern.compile(
            "^\\[(?:(AI巡检)\\s*)?((?:\\d{4}-)?\\d{2}-\\d{2}\\s+\\d{2}:\\d{2}(?::\\d{2})?)\\]\\s*(.+)$"
    );

    @PostMapping("/list")
    public Result<List<OrderRemark>> list(@RequestBody Map<String, Object> params) {
        String targetType = (String) params.get("targetType");
        String targetNo = (String) params.get("targetNo");
        if (!StringUtils.hasText(targetType) || !StringUtils.hasText(targetNo)) {
            return Result.fail("targetType 和 targetNo 不能为空");
        }
        Long tenantId = TenantAssert.requireTenantId();

        // 工厂账号只能查看自己订单的备注
        if ("order".equals(targetType) && com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
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
                    return Result.success(java.util.Collections.emptyList());
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
            List<OrderRemark> inlineRemarks = extractOrderInlineRemarks(targetNo);
            result.addAll(inlineRemarks);
            // 合并采购单备注：t_material_purchase.remark → 统一展示在订单备注时间线中
            result.addAll(extractPurchaseRemarks(targetNo));
            result.sort(Comparator.comparing(OrderRemark::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder())));
        } else if ("style".equals(targetType)) {
            List<OrderRemark> inlineRemarks = extractStyleInlineRemarks(targetNo);
            result.addAll(inlineRemarks);
            result.sort(Comparator.comparing(OrderRemark::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder())));
        } else if ("pattern".equals(targetType)) {
            // 样衣开发：合并 t_pattern_production.remarks 拆行展示
            List<OrderRemark> inlineRemarks = extractPatternInlineRemarks(targetNo);
            result.addAll(inlineRemarks);
            result.sort(Comparator.comparing(OrderRemark::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder())));
        }

        return Result.success(result);
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
            for (StyleOperationLog log : opLogs) {
                OrderRemark r = new OrderRemark();
                r.setTargetType("style");
                r.setTargetNo(styleNo);
                String content = log.getAction();
                if (StringUtils.hasText(log.getRemark())) {
                    content += "：" + log.getRemark();
                }
                r.setContent(content);
                r.setAuthorName(log.getOperator());
                r.setAuthorRole(log.getBizType());
                r.setCreateTime(log.getCreateTime());
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
        com.fashion.supplychain.production.entity.PatternProduction pattern = patternProductionService.lambdaQuery()
                .select(com.fashion.supplychain.production.entity.PatternProduction::getId,
                        com.fashion.supplychain.production.entity.PatternProduction::getRemarks)
                .eq(com.fashion.supplychain.production.entity.PatternProduction::getId, patternId)
                .eq(com.fashion.supplychain.production.entity.PatternProduction::getTenantId, tenantId)
                .eq(com.fashion.supplychain.production.entity.PatternProduction::getDeleteFlag, 0)
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
                try { return LocalDateTime.parse(trimmed, fmtSec); } catch (Exception ignored) {}
                try { return LocalDateTime.parse(trimmed, fmtMin); } catch (Exception ignored) {}
            }
            // 旧格式无年份：MM-DD HH:mm 或 MM-DD HH:mm:ss,补当前年份
            int currentYear = LocalDateTime.now().getYear();
            String fullTimeStr = currentYear + "-" + trimmed;
            DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
            DateTimeFormatter fmtSec = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
            try { return LocalDateTime.parse(fullTimeStr, fmtSec); } catch (Exception ignored) {}
            return LocalDateTime.parse(fullTimeStr, fmt);
        } catch (Exception e) {
            log.debug("[OrderRemark] parseTimeStr失败: timeStr={}", timeStr);
            return null;
        }
    }

    @PostMapping("/add")
    public Result<OrderRemark> add(@RequestBody OrderRemark remark) {
        if (!StringUtils.hasText(remark.getTargetType()) || !StringUtils.hasText(remark.getTargetNo())) {
            return Result.fail("targetType 和 targetNo 不能为空");
        }
        if (!StringUtils.hasText(remark.getContent())) {
            return Result.fail("备注内容不能为空");
        }

        // 写操作统一走 Orchestrator，确保事务一致性与多租户上下文校验
        OrderRemark saved = orderRemarkOrchestrator.save(remark);
        return Result.success(saved);
    }

    @PostMapping("/batch-latest")
    public Result<Map<String, String>> batchLatest(@RequestBody Map<String, Object> params) {
        String targetType = (String) params.get("targetType");
        @SuppressWarnings("unchecked")
        List<String> targetNos = (List<String>) params.get("targetNos");
        if (!StringUtils.hasText(targetType) || targetNos == null || targetNos.isEmpty()) {
            return Result.success(new HashMap<>());
        }
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
        return Result.success(result);
    }
}
