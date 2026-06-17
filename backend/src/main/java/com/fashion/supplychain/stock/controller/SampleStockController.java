package com.fashion.supplychain.stock.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.stock.dto.SampleStockInboundBatchRequest;
import com.fashion.supplychain.stock.entity.SampleLoan;
import com.fashion.supplychain.stock.entity.SampleStock;
import com.fashion.supplychain.stock.mapper.SampleLoanMapper;
import com.fashion.supplychain.stock.orchestration.SampleStockOrchestrator;
import com.fashion.supplychain.stock.service.SampleStockService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import org.springframework.security.access.prepost.PreAuthorize;

@RestController
@RequestMapping("/api/stock/sample")
@PreAuthorize("isAuthenticated()")
@Tag(name = "样衣库存", description = "样衣库存的入库、借出、归还、转移、销毁等操作")
public class SampleStockController {

    @Autowired
    private SampleStockService sampleStockService;

    @Autowired
    private SampleLoanMapper sampleLoanMapper;

    @Autowired
    private SampleStockOrchestrator sampleStockOrchestrator;

    @GetMapping("/list")
    @Operation(summary = "查询样衣库存列表", description = "分页查询样衣库存列表")
    public Result<IPage<SampleStock>> list(@Parameter(description = "查询参数") @RequestParam Map<String, Object> params) {
        return Result.success(sampleStockService.queryPage(params));
    }

    @PostMapping("/inbound")
    @Operation(summary = "样衣入库", description = "单个样衣入库操作")
    public Result<Void> inbound(@RequestBody SampleStock stock) {
        sampleStockOrchestrator.inbound(stock);
        return Result.success();
    }

    @PostMapping("/inbound/batch")
    @Operation(summary = "批量样衣入库", description = "批量样衣入库操作")
    public Result<Void> inboundBatch(@RequestBody SampleStockInboundBatchRequest request) {
        sampleStockOrchestrator.inboundBatch(request);
        return Result.success();
    }

    @PostMapping("/loan")
    @Operation(summary = "样衣借出", description = "样衣借出操作")
    public Result<Void> loan(@RequestBody SampleLoan loan) {
        sampleStockOrchestrator.loan(loan);
        return Result.success();
    }

    @PostMapping("/return")
    @Operation(summary = "样衣归还", description = "样衣归还操作")
    public Result<Void> returnSample(@RequestBody Map<String, Object> params) {
        String loanId = (String) params.get("loanId");
        Integer returnQuantity = params.get("returnQuantity") != null ? Integer.parseInt(params.get("returnQuantity").toString()) : null;
        String remark = (String) params.get("remark");
        sampleStockOrchestrator.returnSample(loanId, returnQuantity, remark);
        return Result.success();
    }

    @PostMapping("/transfer")
    @Operation(summary = "样衣转移", description = "样衣借出转移操作")
    public Result<Void> transferLoan(@RequestBody Map<String, Object> params) {
        String sourceLoanId = (String) params.get("sourceLoanId");
        SampleLoan newLoan = new SampleLoan();
        newLoan.setLendTo((String) params.get("lendTo"));
        newLoan.setLendToId(params.get("lendToId") != null ? String.valueOf(params.get("lendToId")) : null);
        newLoan.setLendToType((String) params.get("lendToType"));
        newLoan.setLendToFactoryId(params.get("lendToFactoryId") != null ? String.valueOf(params.get("lendToFactoryId")) : null);
        newLoan.setLendToFactoryName((String) params.get("lendToFactoryName"));
        newLoan.setQuantity(params.get("quantity") != null ? Integer.parseInt(String.valueOf(params.get("quantity"))) : null);
        newLoan.setBorrower((String) params.get("borrower"));
        newLoan.setBorrowerId(params.get("borrowerId") != null ? String.valueOf(params.get("borrowerId")) : null);
        newLoan.setExpectedReturnDate(params.get("expectedReturnDate") != null
                ? java.time.LocalDateTime.parse((String) params.get("expectedReturnDate"), java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"))
                : null);
        newLoan.setRemark((String) params.get("remark"));
        newLoan.setWarehouseAreaId(params.get("warehouseAreaId") != null ? String.valueOf(params.get("warehouseAreaId")) : null);
        sampleStockOrchestrator.transferLoan(sourceLoanId, newLoan);
        return Result.success();
    }

    @PostMapping("/destroy")
    public Result<Void> destroy(@RequestBody Map<String, Object> params) {
        String stockId = params.get("stockId") == null ? null : String.valueOf(params.get("stockId"));
        String remark = params.get("remark") == null ? null : String.valueOf(params.get("remark"));
        sampleStockOrchestrator.destroy(stockId, remark);
        return Result.success();
    }

    @GetMapping("/loan/list")
    @Operation(summary = "查询借出记录", description = "查询样衣的借出记录列表")
    public Result<List<SampleLoan>> listLoans(@Parameter(description = "样衣库存ID") @RequestParam String sampleStockId) {
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
        return Result.success(sampleStockOrchestrator.scanQuery(styleNo, color, size));
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

        String outstockId = sampleStockOrchestrator.transferToOutstock(
                stockId, quantity, customerName, customerPhone,
                shippingAddress, trackingNo, expressCompany, remark);

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("outstockId", outstockId);
        return Result.success(result);
    }
}
