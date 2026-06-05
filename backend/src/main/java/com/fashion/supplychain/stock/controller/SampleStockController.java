package com.fashion.supplychain.stock.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.stock.dto.SampleStockInboundBatchRequest;
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

    @PostMapping("/inbound/batch")
    public Result<Void> inboundBatch(@RequestBody SampleStockInboundBatchRequest request) {
        sampleStockService.inboundBatch(request);
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

    @PostMapping("/destroy")
    public Result<Void> destroy(@RequestBody Map<String, Object> params) {
        String stockId = params.get("stockId") == null ? null : String.valueOf(params.get("stockId"));
        String remark = params.get("remark") == null ? null : String.valueOf(params.get("remark"));
        sampleStockService.destroy(stockId, remark);
        return Result.success();
    }

    @GetMapping("/loan/list")
    public Result<List<SampleLoan>> listLoans(@RequestParam String sampleStockId) {
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        LambdaQueryWrapper<SampleLoan> wrapper = new LambdaQueryWrapper<SampleLoan>()
            .eq(SampleLoan::getSampleStockId, sampleStockId)
            .eq(SampleLoan::getTenantId, tenantId)
            .eq(SampleLoan::getDeleteFlag, 0)
            .orderByDesc(SampleLoan::getCreateTime);
        return Result.success(sampleLoanMapper.selectList(wrapper));
    }

    @PostMapping("/scan-query")
    public Result<Map<String, Object>> scanQuery(@RequestBody Map<String, String> params) {
        String styleNo = params.get("styleNo");
        String color = params.get("color");
        String size = params.get("size");
        return Result.success(sampleStockService.scanQuery(styleNo, color, size));
    }

    /**
     * 样衣转成品出库
     */
    @PostMapping("/transfer-to-outstock")
    public Result<Map<String, Object>> transferToOutstock(@RequestBody Map<String, Object> params) {
        String stockId = params.get("stockId") == null ? null : String.valueOf(params.get("stockId"));
        Integer quantity = params.get("quantity") != null ? Integer.parseInt(String.valueOf(params.get("quantity"))) : null;
        String customerName = (String) params.get("customerName");
        String customerPhone = (String) params.get("customerPhone");
        String shippingAddress = (String) params.get("shippingAddress");
        String trackingNo = (String) params.get("trackingNo");
        String expressCompany = (String) params.get("expressCompany");
        String remark = (String) params.get("remark");

        String outstockId = sampleStockService.transferToOutstock(
                stockId, quantity, customerName, customerPhone,
                shippingAddress, trackingNo, expressCompany, remark);

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("outstockId", outstockId);
        return Result.success(result);
    }
}
