package com.fashion.supplychain.finance.controller;

import com.fashion.supplychain.finance.orchestration.FinanceTaxExportOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.time.LocalDate;

/**
 * 财税导出 Controller
 * 订阅 FINANCE_TAX 应用后解锁此接口组
 */
@RestController
@RequestMapping("/api/finance/tax-export")
@PreAuthorize("isAuthenticated()")
public class FinanceTaxExportController {

    @Autowired
    private FinanceTaxExportOrchestrator taxExportOrchestrator;

    /**
     * 导出工资结算 Excel
     *
     * @param startDate 开始日期，格式 yyyy-MM-dd，默认当月1日
     * @param endDate   结束日期，格式 yyyy-MM-dd，默认今日
     * @param format    导出格式：STANDARD（默认）/ KINGDEE（金蝶KIS）/ UFIDA（用友T3）
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/payroll")
    public ResponseEntity<byte[]> exportPayroll(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "STANDARD") String format) throws IOException {

        String start = (startDate != null && !startDate.isBlank()) ? startDate
                : LocalDate.now().withDayOfMonth(1).toString();
        String end = (endDate != null && !endDate.isBlank()) ? endDate
                : LocalDate.now().toString();

        byte[] data = taxExportOrchestrator.exportPayrollExcel(start, end, format);
        String filename = buildFilename("工资结算", format, start, end);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodeFilename(filename))
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .contentLength(data.length)
                .body(data);
    }

    /**
     * 导出工资人员工序明细 Excel（金蝶KIS/用友T3/标准格式）
     * 按人员汇总生成凭证分录，附带工序明细核对表
     *
     * @param startDate 开始日期，格式 yyyy-MM-dd，默认当月1日
     * @param endDate   结束日期，格式 yyyy-MM-dd，默认今日
     * @param format    导出格式：STANDARD（默认）/ KINGDEE（金蝶KIS）/ UFIDA（用友T3）
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/payroll-detail")
    public ResponseEntity<byte[]> exportPayrollDetail(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "STANDARD") String format) throws IOException {

        String start = (startDate != null && !startDate.isBlank()) ? startDate
                : LocalDate.now().withDayOfMonth(1).toString();
        String end = (endDate != null && !endDate.isBlank()) ? endDate
                : LocalDate.now().toString();

        byte[] data = taxExportOrchestrator.exportPayrollDetailExcel(start, end, format);
        String filename = buildFilename("工资明细", format, start, end);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodeFilename(filename))
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .contentLength(data.length)
                .body(data);
    }

    /**
     * 导出物料对账 Excel
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/material")
    public ResponseEntity<byte[]> exportMaterial(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "STANDARD") String format) throws IOException {

        String start = (startDate != null && !startDate.isBlank()) ? startDate
                : LocalDate.now().withDayOfMonth(1).toString();
        String end = (endDate != null && !endDate.isBlank()) ? endDate
                : LocalDate.now().toString();

        byte[] data = taxExportOrchestrator.exportMaterialExcel(start, end, format);
        String filename = buildFilename("物料对账", format, start, end);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodeFilename(filename))
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .contentLength(data.length)
                .body(data);
    }

    /**
     * 导出供应商付款汇总 Excel
     * 含应付账款、已付款、逾期应付明细，适用于对账审计及供应商信用评估
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/supplier-payment")
    public ResponseEntity<byte[]> exportSupplierPayment(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "STANDARD") String format) throws IOException {

        String start = (startDate != null && !startDate.isBlank()) ? startDate
                : LocalDate.now().withDayOfMonth(1).toString();
        String end = (endDate != null && !endDate.isBlank()) ? endDate
                : LocalDate.now().toString();

        byte[] data = taxExportOrchestrator.exportSupplierPaymentExcel(start, end, format);
        String filename = buildFilename("供应商付款汇总", format, start, end);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodeFilename(filename))
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .contentLength(data.length)
                .body(data);
    }

    /**
     * 导出月度税务汇总 Excel
     * 含开票金额、税种税率、税额合计，可直接用于月度税务申报
     */
    @PreAuthorize("isAuthenticated()")
    @GetMapping("/tax-summary")
    public ResponseEntity<byte[]> exportTaxSummary(
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "STANDARD") String format) throws IOException {

        String start = (startDate != null && !startDate.isBlank()) ? startDate
                : LocalDate.now().withDayOfMonth(1).toString();
        String end = (endDate != null && !endDate.isBlank()) ? endDate
                : LocalDate.now().toString();

        byte[] data = taxExportOrchestrator.exportTaxSummaryExcel(start, end, format);
        String filename = buildFilename("月度税务汇总", format, start, end);

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodeFilename(filename))
                .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .contentLength(data.length)
                .body(data);
    }

    private String buildFilename(String prefix, String format, String start, String end) {
        String suffix = "KINGDEE".equalsIgnoreCase(format) ? "_金蝶KIS"
                : "UFIDA".equalsIgnoreCase(format) ? "_用友T3" : "";
        return prefix + suffix + "_" + start + "_" + end + ".xlsx";
    }

    private String encodeFilename(String name) {
        try {
            return java.net.URLEncoder.encode(name, "UTF-8").replace("+", "%20");
        } catch (Exception e) {
            return name;
        }
    }
}
