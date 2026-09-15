package com.fashion.supplychain.production.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.ExceptionReportRequest;
import com.fashion.supplychain.production.entity.ProductionExceptionReport;
import com.fashion.supplychain.production.orchestration.ExceptionReportOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/production/exception")
@PreAuthorize("isAuthenticated()")
public class ProductionExceptionController {

    @Autowired
    private ExceptionReportOrchestrator exceptionReportOrchestrator;

    @PostMapping("/report")
    public Result<ProductionExceptionReport> reportException(@Validated @RequestBody ExceptionReportRequest request) {
        ProductionExceptionReport result = exceptionReportOrchestrator.reportException(request);
        return Result.success(result);
    }

    /**
     * 异常报告分页列表（D-417：手机端独立处理页数据源）
     * 支持 status / orderNo / keyword / page / pageSize；工厂账号仅返回本工厂订单的异常。
     *
     * @param params 查询参数
     * @return 分页结果
     */
    @GetMapping("/list")
    public Result<IPage<ProductionExceptionReport>> list(@RequestParam Map<String, Object> params) {
        return Result.success(exceptionReportOrchestrator.list(params));
    }

    /**
     * 处理异常报告（D-417）：action=resolve 标记已解决 / action=reopen 重新打开。
     * 权限在 Orchestrator 内校验（仅主管及以上）。
     *
     * @param id     异常报告ID
     * @param action 处理动作
     * @param note   处理说明
     * @return 更新后的记录
     */
    @PostMapping("/{id}/handle")
    public Result<ProductionExceptionReport> handle(
            @PathVariable Long id,
            @RequestParam String action,
            @RequestParam(required = false) String note) {
        return Result.success(exceptionReportOrchestrator.handleException(id, action, note));
    }
}
