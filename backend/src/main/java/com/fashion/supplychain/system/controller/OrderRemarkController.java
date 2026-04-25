package com.fashion.supplychain.system.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.OrderRemark;
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

@RestController
@RequestMapping("/api/system/order-remark")
@PreAuthorize("isAuthenticated()")
public class OrderRemarkController {

    @Autowired
    private OrderRemarkService orderRemarkService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private StyleInfoService styleInfoService;

    private static final Pattern REMARK_LINE_PATTERN = Pattern.compile(
            "^\\[(?:(AI巡检)\\s*)?(\\d{2}-\\d{2}\\s+\\d{2}:\\d{2})\\]\\s*(.+)$"
    );

    @PostMapping("/list")
    public Result<List<OrderRemark>> list(@RequestBody Map<String, Object> params) {
        String targetType = (String) params.get("targetType");
        String targetNo = (String) params.get("targetNo");
        if (!StringUtils.hasText(targetType) || !StringUtils.hasText(targetNo)) {
            return Result.fail("targetType 和 targetNo 不能为空");
        }
        Long tenantId = TenantAssert.requireTenantId();

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
            result.sort(Comparator.comparing(OrderRemark::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder())));
        } else if ("style".equals(targetType)) {
            List<OrderRemark> inlineRemarks = extractStyleInlineRemarks(targetNo);
            result.addAll(inlineRemarks);
            result.sort(Comparator.comparing(OrderRemark::getCreateTime, Comparator.nullsLast(Comparator.reverseOrder())));
        }

        return Result.success(result);
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
        if (StringUtils.hasText(style.getDescription())) {
            result.addAll(parseInlineRemarks(style.getDescription().trim(), "style", styleNo));
        }
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
            int currentYear = LocalDateTime.now().getYear();
            String fullTimeStr = currentYear + "-" + timeStr.trim();
            DateTimeFormatter fmt = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
            return LocalDateTime.parse(fullTimeStr, fmt);
        } catch (Exception e) {
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
        return Result.success(remark);
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
