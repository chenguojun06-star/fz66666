package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
}
