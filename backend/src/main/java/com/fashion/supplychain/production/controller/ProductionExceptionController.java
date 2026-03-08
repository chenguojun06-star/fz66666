package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.ExceptionReportRequest;
import com.fashion.supplychain.production.entity.ProductionExceptionReport;
import com.fashion.supplychain.production.orchestration.ExceptionReportOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

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
}
