package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.dto.ExceptionReportRequest;
import com.fashion.supplychain.production.entity.ProductionExceptionReport;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.ProductionExceptionReportService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
public class ExceptionReportOrchestrator {

    @Autowired
    private ProductionExceptionReportService exceptionReportService;

    @Autowired
    private ProductionOrderService productionOrderService;

    @Autowired
    private SysNoticeOrchestrator sysNoticeOrchestrator;

    @Transactional(rollbackFor = Exception.class)
    public ProductionExceptionReport reportException(ExceptionReportRequest request) {
        Long tenantId = UserContext.tenantId();
        String userId = UserContext.userId();
        String username = UserContext.username();

        // 工厂账号只能对本工厂的订单上报异常，防止跨工厂写入
        String userFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(userFactoryId)) {
            ProductionOrder scopeCheck = productionOrderService.getOne(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getOrderNo, request.getOrderNo())
                            .eq(ProductionOrder::getTenantId, tenantId)
                            .select(ProductionOrder::getFactoryId));
            if (scopeCheck == null || !userFactoryId.equals(scopeCheck.getFactoryId())) {
                throw new AccessDeniedException("无权对该订单上报异常");
            }
        }

        // 1. 保存异常记录
        ProductionExceptionReport report = new ProductionExceptionReport();
        report.setTenantId(tenantId);
        report.setOrderNo(request.getOrderNo());
        report.setProcessName(request.getProcessName());
        report.setWorkerId(userId);
        report.setWorkerName(username);
        report.setExceptionType(request.getExceptionType());
        report.setDescription(request.getDescription());
        report.setStatus("PENDING");
        exceptionReportService.save(report);

        // 2. 查询订单以获取更多上下文
        ProductionOrder order = productionOrderService.getByOrderNo(request.getOrderNo());

        // 3. 构建通知内容并发送给相关人员
        String typeDesc = mapExceptionType(request.getExceptionType());
        String title = "⚠️ 生产异常呼救: " + typeDesc;
        String content = String.format("订单【%s】的【%s】工序报告了异常。\n上报人: %s\n类型: %s\n描述: %s",
                request.getOrderNo(),
                request.getProcessName(),
                username,
                typeDesc,
                request.getDescription() != null ? request.getDescription() : "无");

        // 通知系统管理员或全员 (根据实际设定, 这里为了示例发个全局广播，或者给特定角色/订单发送)
        try {
            if (order != null) {
                sysNoticeOrchestrator.sendAuto(tenantId, order, "EXCEPTION_ALERT");
            }
            sysNoticeOrchestrator.broadcastGlobal("EXCEPTION", title, content);
        } catch (Exception e) {
            log.warn("无法发送异常通知: {}", e.getMessage());
        }

        return report;
    }

    private String mapExceptionType(String code) {
        if ("MATERIAL_SHORTAGE".equals(code)) return "缺面料/辅料";
        if ("MACHINE_FAULT".equals(code)) return "车床发生故障";
        if ("NEED_HELP".equals(code)) return "需指导/协助";
        return "未知异常";
    }

    /**
     * 异常报告分页列表（D-417 手机端独立处理页 / PC 列表共用）
     *
     * 权限与数据范围：MyBatis-Plus 多租户插件按 tenantId 自动隔离，
     * 工厂账号（UserContext.factoryId() 非空）额外按「本工厂订单」过滤，避免看到别家订单的异常。
     *
     * @param params 支持 status / orderNo / keyword / page / pageSize / size
     * @return 分页结果
     */
    public IPage<ProductionExceptionReport> list(Map<String, Object> params) {
        Map<String, Object> p = params == null ? new HashMap<>() : params;
        long pageNo = parseLong(p.get("page"), 1L);
        long pageSize = parseLong(p.get("pageSize") != null ? p.get("pageSize") : p.get("size"), 20L);
        // 防御：限制单页上限，避免移动端一次拉爆
        if (pageSize <= 0) pageSize = 20L;
        if (pageSize > 200L) pageSize = 200L;

        LambdaQueryWrapper<ProductionExceptionReport> wrapper = new LambdaQueryWrapper<>();
        String status = str(p.get("status"));
        if (StringUtils.hasText(status)) {
            wrapper.eq(ProductionExceptionReport::getStatus, status.trim().toUpperCase());
        }
        String orderNo = str(p.get("orderNo"));
        if (StringUtils.hasText(orderNo)) {
            wrapper.eq(ProductionExceptionReport::getOrderNo, orderNo.trim());
        }
        String keyword = str(p.get("keyword"));
        if (StringUtils.hasText(keyword)) {
            String kw = keyword.trim();
            wrapper.and(w -> w.like(ProductionExceptionReport::getOrderNo, kw)
                    .or().like(ProductionExceptionReport::getProcessName, kw)
                    .or().like(ProductionExceptionReport::getWorkerName, kw)
                    .or().like(ProductionExceptionReport::getDescription, kw));
        }

        // 工厂账号只能看本工厂订单的异常（与上报时的校验口径一致）
        String userFactoryId = UserContext.factoryId();
        if (StringUtils.hasText(userFactoryId)) {
            List<ProductionOrder> scoped = productionOrderService.list(
                    new LambdaQueryWrapper<ProductionOrder>()
                            .eq(ProductionOrder::getFactoryId, userFactoryId)
                            .select(ProductionOrder::getOrderNo));
            List<String> allowedOrderNos = scoped.stream()
                    .map(ProductionOrder::getOrderNo)
                    .filter(StringUtils::hasText)
                    .collect(Collectors.toList());
            if (allowedOrderNos.isEmpty()) {
                // 无归属订单 → 返回空页，不泄露任何数据
                return new Page<>(pageNo, pageSize, 0);
            }
            wrapper.in(ProductionExceptionReport::getOrderNo, allowedOrderNos);
        }

        // 未处理优先，其次按创建时间倒序（待处理顶上来）
        wrapper.orderByAsc(ProductionExceptionReport::getStatus).orderByDesc(ProductionExceptionReport::getCreateTime);
        return exceptionReportService.page(new Page<>(pageNo, pageSize), wrapper);
    }

    /**
     * 处理异常报告（D-417）：标记已解决 / 重新打开
     *
     * 业务约定：异常一旦上报就永久挂 PENDING 是此前的问题，本方法提供闭环。
     *   action = resolve → status=RESOLVED，写入处理人/说明/时间
     *   action = reopen  → status=PENDING，清空处理信息（误点恢复）
     *
     * 权限：仅主管及以上可处理（前端手机端同样只对 isAdminOrSupervisor 显示按钮）。
     *
     * @param id     异常报告 id
     * @param action resolve / reopen
     * @param note   处理说明（resolve 时建议必填）
     * @return 更新后的记录
     */
    @Transactional(rollbackFor = Exception.class)
    public ProductionExceptionReport handleException(Long id, String action, String note) {
        if (id == null) {
            throw new IllegalArgumentException("异常报告ID不能为空");
        }
        if (!UserContext.isSupervisorOrAbove()) {
            throw new AccessDeniedException("仅主管及以上可处理生产异常");
        }
        ProductionExceptionReport report = exceptionReportService.getById(id);
        if (report == null) {
            throw new IllegalArgumentException("异常报告不存在");
        }
        // 多租户保护：越租户直接拒绝（多租户插件通常已隔离，这里再加一道显式校验）
        Long tenantId = UserContext.tenantId();
        if (report.getTenantId() != null && tenantId != null && !tenantId.equals(report.getTenantId())) {
            throw new AccessDeniedException("无权处理该异常报告");
        }

        String act = StringUtils.hasText(action) ? action.trim().toLowerCase() : "resolve";
        if ("reopen".equals(act)) {
            report.setStatus("PENDING");
            report.setHandlerId(null);
            report.setHandlerName(null);
            report.setHandleNote(null);
            report.setHandleTime(null);
        } else {
            report.setStatus("RESOLVED");
            report.setHandlerId(UserContext.userId());
            report.setHandlerName(UserContext.username());
            report.setHandleNote(StringUtils.hasText(note) ? note.trim() : null);
            report.setHandleTime(LocalDateTime.now());
        }
        exceptionReportService.updateById(report);
        log.info("[D-417] 异常报告处理 id={} action={} status={} by={}",
                id, act, report.getStatus(), UserContext.username());
        return report;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static long parseLong(Object o, long def) {
        if (o == null) return def;
        try {
            return Long.parseLong(String.valueOf(o).trim());
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
