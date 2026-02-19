package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleQuotation;
import com.fashion.supplychain.style.orchestration.StyleQuotationOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/style/quotation")
@PreAuthorize("isAuthenticated()")
public class StyleQuotationController {

    @Autowired
    private StyleQuotationOrchestrator styleQuotationOrchestrator;

    @GetMapping
    @PreAuthorize("hasAuthority('STYLE_VIEW')")
    public Result<StyleQuotation> getByStyleId(@RequestParam Long styleId) {
        StyleQuotation quotation = styleQuotationOrchestrator.getByStyleId(styleId);
        return Result.success(quotation);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<Boolean> saveOrUpdate(@RequestBody StyleQuotation styleQuotation) {
        return Result.success(styleQuotationOrchestrator.saveOrUpdate(styleQuotation));
    }

    @PutMapping
    @PreAuthorize("hasAuthority('STYLE_UPDATE')")
    public Result<Boolean> update(@RequestBody StyleQuotation styleQuotation) {
        return Result.success(styleQuotationOrchestrator.saveOrUpdate(styleQuotation));
    }
}
