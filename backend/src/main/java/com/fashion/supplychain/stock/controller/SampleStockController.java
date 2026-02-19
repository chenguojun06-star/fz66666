package com.fashion.supplychain.stock.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.stock.entity.SampleLoan;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.mapper.SampleLoanMapper;
import com.fashion.supplychain.stock.service.SampleStockService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/api/stock/sample")
@PreAuthorize("isAuthenticated()")
public class SampleStockController {

    @Autowired
    private SampleStockService sampleStockService;

    @Autowired
    private SampleLoanMapper sampleLoanMapper;

    @GetMapping("/list")
    public Result<IPage<SampleStock>> list(@RequestParam Map<String, Object> params) {
        return Result.success(sampleStockService.queryPage(params));
    }

    @PostMapping("/inbound")
    public Result<Void> inbound(@RequestBody SampleStock stock) {
        sampleStockService.inbound(stock);
        return Result.success();
    }

    @PostMapping("/loan")
    public Result<Void> loan(@RequestBody SampleLoan loan) {
        sampleStockService.loan(loan);
        return Result.success();
    }

    @PostMapping("/return")
    public Result<Void> returnSample(@RequestBody Map<String, Object> params) {
        String loanId = (String) params.get("loanId");
        Integer returnQuantity = params.get("returnQuantity") != null ? Integer.parseInt(params.get("returnQuantity").toString()) : null;
        String remark = (String) params.get("remark");
        sampleStockService.returnSample(loanId, returnQuantity, remark);
        return Result.success();
    }

    @GetMapping("/loan/list")
    public Result<List<SampleLoan>> listLoans(@RequestParam String sampleStockId) {
        return Result.success(sampleLoanMapper.selectList(new LambdaQueryWrapper<SampleLoan>()
            .eq(SampleLoan::getSampleStockId, sampleStockId)
            .orderByDesc(SampleLoan::getCreateTime)));
    }
}
