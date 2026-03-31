package com.fashion.supplychain.finance.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.Invoice;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.entity.Payable;
import com.fashion.supplychain.finance.entity.PayrollSettlement;
import com.fashion.supplychain.finance.service.InvoiceService;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.finance.service.PayableService;
import com.fashion.supplychain.finance.service.PayrollSettlementService;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 财税导出编排器
 * 支持将工资结算、物料对账数据导出为金蝶KIS / 用友T3 / 标准 Excel 格式
 */
@Service
public class FinanceTaxExportOrchestrator {

    @Autowired
    private PayrollSettlementService payrollSettlementService;

    @Autowired
    private MaterialReconciliationService materialReconciliationService;

    @Autowired
    private PayableService payableService;

    @Autowired
    private InvoiceService invoiceService;

    private static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    /** 财税导出仅限管理层，工厂账户禁止访问 */
    private void assertNotFactoryAccount() {
        if (com.fashion.supplychain.common.DataPermissionHelper.isFactoryAccount()) {
            throw new org.springframework.security.access.AccessDeniedException("工厂账户无权访问财税导出");
        }
    }

    // -----------------------------------------------------------------------
    // 工资结算导出
    // -----------------------------------------------------------------------

    public byte[] exportPayrollExcel(String startDate, String endDate, String format) throws IOException {
        assertNotFactoryAccount();
        Long tenantId = UserContext.tenantId();
        QueryWrapper<PayrollSettlement> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId);
        // t_payroll_settlement 表无 delete_flag 列，不加此过滤
        if (startDate != null && !startDate.isBlank()) {
            qw.ge("create_time", startDate + " 00:00:00");
        }
        if (endDate != null && !endDate.isBlank()) {
            qw.le("create_time", endDate + " 23:59:59");
        }
        qw.orderByDesc("create_time");
        List<PayrollSettlement> list = payrollSettlementService.list(qw);

        return "KINGDEE".equalsIgnoreCase(format)
                ? buildPayrollKingdee(list)
                : "UFIDA".equalsIgnoreCase(format)
                        ? buildPayrollUfida(list)
                        : buildPayrollStandard(list);
    }

    /** 标准格式（兼容所有财务软件粘贴导入） */
    private byte[] buildPayrollStandard(List<PayrollSettlement> list) throws IOException {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("工资结算汇总");
            CellStyle headerStyle = createHeaderStyle(wb);
            CellStyle moneyStyle = createMoneyStyle(wb);
            CellStyle dateStyle = createDateStyle(wb);

            String[] headers = {"结算单号", "订单编号", "款式编号", "款式名称",
                    "结算开始日期", "结算截止日期", "总件数", "总金额(元)", "状态", "备注"};
            Row hRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell c = hRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 18 * 256);
            }

            int rowIdx = 1;
            BigDecimal totalAmt = BigDecimal.ZERO;
            for (PayrollSettlement s : list) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(safeStr(s.getSettlementNo()));
                row.createCell(1).setCellValue(safeStr(s.getOrderNo()));
                row.createCell(2).setCellValue(safeStr(s.getStyleNo()));
                row.createCell(3).setCellValue(safeStr(s.getStyleName()));
                row.createCell(4).setCellValue(formatDt(s.getStartTime()));
                row.createCell(5).setCellValue(formatDt(s.getEndTime()));
                Cell qtyCell = row.createCell(6);
                qtyCell.setCellValue(s.getTotalQuantity() != null ? s.getTotalQuantity() : 0);
                Cell amtCell = row.createCell(7);
                amtCell.setCellValue(s.getTotalAmount() != null ? s.getTotalAmount().doubleValue() : 0.0);
                amtCell.setCellStyle(moneyStyle);
                row.createCell(8).setCellValue(translateStatus(s.getStatus()));
                row.createCell(9).setCellValue(safeStr(s.getRemark()));
                if (s.getTotalAmount() != null) totalAmt = totalAmt.add(s.getTotalAmount());
            }

            // 合计行
            Row sumRow = sheet.createRow(rowIdx);
            Cell sumLabel = sumRow.createCell(0);
            sumLabel.setCellValue("合计 (" + list.size() + " 条)");
            sumLabel.setCellStyle(headerStyle);
            Cell sumAmt = sumRow.createCell(7);
            sumAmt.setCellValue(totalAmt.doubleValue());
            sumAmt.setCellStyle(moneyStyle);

            return toBytes(wb);
        }
    }

    /** 金蝶KIS导入格式（凭证模板）*/
    private byte[] buildPayrollKingdee(List<PayrollSettlement> list) throws IOException {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("金蝶KIS-工资凭证");
            CellStyle headerStyle = createHeaderStyle(wb);
            CellStyle moneyStyle = createMoneyStyle(wb);

            // 金蝶KIS 凭证导入列：日期,凭证字,附单据数,摘要,科目编码,借方金额,贷方金额
            String[] headers = {"日期", "凭证字", "附单据数", "摘要", "科目编码", "借方金额", "贷方金额"};
            Row hRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell c = hRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 18 * 256);
            }

            int rowIdx = 1;
            for (PayrollSettlement s : list) {
                // 借方：5501 生产成本-工资
                Row row1 = sheet.createRow(rowIdx++);
                row1.createCell(0).setCellValue(s.getCreateTime() != null ? s.getCreateTime().format(DATE_FMT) : "");
                row1.createCell(1).setCellValue("记");
                row1.createCell(2).setCellValue(1);
                row1.createCell(3).setCellValue("计提工资-" + safeStr(s.getStyleName()) + "/" + safeStr(s.getOrderNo()));
                row1.createCell(4).setCellValue("5501");
                Cell drCell = row1.createCell(5);
                drCell.setCellValue(s.getTotalAmount() != null ? s.getTotalAmount().doubleValue() : 0.0);
                drCell.setCellStyle(moneyStyle);
                row1.createCell(6).setCellValue(0.0);

                // 贷方：2211 应付职工薪酬
                Row row2 = sheet.createRow(rowIdx++);
                row2.createCell(0).setCellValue("");
                row2.createCell(1).setCellValue("");
                row2.createCell(2).setCellValue("");
                row2.createCell(3).setCellValue("计提工资-" + safeStr(s.getStyleName()) + "/" + safeStr(s.getOrderNo()));
                row2.createCell(4).setCellValue("2211");
                row2.createCell(5).setCellValue(0.0);
                Cell crCell = row2.createCell(6);
                crCell.setCellValue(s.getTotalAmount() != null ? s.getTotalAmount().doubleValue() : 0.0);
                crCell.setCellStyle(moneyStyle);
            }

            return toBytes(wb);
        }
    }

    /** 用友T3导入格式（凭证模板）*/
    private byte[] buildPayrollUfida(List<PayrollSettlement> list) throws IOException {
        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("用友T3-工资凭证");
            CellStyle headerStyle = createHeaderStyle(wb);
            CellStyle moneyStyle = createMoneyStyle(wb);

            // 用友T3 凭证导入列：日期,凭证类别,凭证编号,科目编码,摘要,借方,贷方
            String[] headers = {"日期", "凭证类别", "凭证编号", "科目编码", "摘要", "借方", "贷方"};
            Row hRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell c = hRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 18 * 256);
            }

            int rowIdx = 1;
            int voucherNo = 1;
            for (PayrollSettlement s : list) {
                String date = s.getCreateTime() != null ? s.getCreateTime().format(DATE_FMT) : "";
                String desc = "计提工资-" + safeStr(s.getStyleName());
                double amt = s.getTotalAmount() != null ? s.getTotalAmount().doubleValue() : 0.0;

                Row row1 = sheet.createRow(rowIdx++);
                row1.createCell(0).setCellValue(date);
                row1.createCell(1).setCellValue("记");
                row1.createCell(2).setCellValue(voucherNo);
                row1.createCell(3).setCellValue("5501");
                row1.createCell(4).setCellValue(desc);
                Cell drCell = row1.createCell(5);
                drCell.setCellValue(amt);
                drCell.setCellStyle(moneyStyle);
                row1.createCell(6).setCellValue(0.0);

                Row row2 = sheet.createRow(rowIdx++);
                row2.createCell(0).setCellValue(date);
                row2.createCell(1).setCellValue("记");
                row2.createCell(2).setCellValue(voucherNo);
                row2.createCell(3).setCellValue("2211");
                row2.createCell(4).setCellValue(desc);
                row2.createCell(5).setCellValue(0.0);
                Cell crCell = row2.createCell(6);
                crCell.setCellValue(amt);
                crCell.setCellStyle(moneyStyle);
                voucherNo++;
            }

            return toBytes(wb);
        }
    }

    // -----------------------------------------------------------------------
    // 物料对账导出
    // -----------------------------------------------------------------------

    public byte[] exportMaterialExcel(String startDate, String endDate, String format) throws IOException {
        assertNotFactoryAccount();
        Long tenantId = UserContext.tenantId();
        QueryWrapper<MaterialReconciliation> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId);
        qw.eq("delete_flag", 0);
        if (startDate != null && !startDate.isBlank()) {
            qw.ge("create_time", startDate + " 00:00:00");
        }
        if (endDate != null && !endDate.isBlank()) {
            qw.le("create_time", endDate + " 23:59:59");
        }
        qw.orderByDesc("create_time");
        List<MaterialReconciliation> list = materialReconciliationService.list(qw);

        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("物料对账");
            CellStyle headerStyle = createHeaderStyle(wb);
            CellStyle moneyStyle = createMoneyStyle(wb);

            String[] headers = {"对账单号", "供应商", "面料名称", "数量", "单价", "金额", "状态", "创建日期"};
            Row hRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell c = hRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 18 * 256);
            }

            int rowIdx = 1;
            for (MaterialReconciliation m : list) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(safeStr(m.getReconciliationNo()));
                row.createCell(1).setCellValue(safeStr(m.getSupplierName()));
                row.createCell(2).setCellValue(safeStr(m.getMaterialName()));
                row.createCell(3).setCellValue(m.getQuantity() != null ? m.getQuantity().doubleValue() : 0.0);
                Cell priceCell = row.createCell(4);
                priceCell.setCellValue(m.getUnitPrice() != null ? m.getUnitPrice().doubleValue() : 0.0);
                priceCell.setCellStyle(moneyStyle);
                Cell amtCell = row.createCell(5);
                amtCell.setCellValue(m.getTotalAmount() != null ? m.getTotalAmount().doubleValue() : 0.0);
                amtCell.setCellStyle(moneyStyle);
                row.createCell(6).setCellValue(translateStatus(m.getStatus()));
                row.createCell(7).setCellValue(m.getCreateTime() != null ? m.getCreateTime().format(DATE_FMT) : "");
            }

            return toBytes(wb);
        }
    }

    // -----------------------------------------------------------------------
    // 供应商付款汇总导出
    // -----------------------------------------------------------------------

    public byte[] exportSupplierPaymentExcel(String startDate, String endDate, String format) throws IOException {
        assertNotFactoryAccount();
        Long tenantId = UserContext.tenantId();
        QueryWrapper<Payable> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId);
        qw.eq("delete_flag", 0);
        if (startDate != null && !startDate.isBlank()) {
            qw.ge("create_time", startDate + " 00:00:00");
        }
        if (endDate != null && !endDate.isBlank()) {
            qw.le("create_time", endDate + " 23:59:59");
        }
        qw.orderByDesc("due_date");
        List<Payable> list = payableService.list(qw);

        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("供应商付款汇总");
            CellStyle headerStyle = createHeaderStyle(wb);
            CellStyle moneyStyle = createMoneyStyle(wb);

            String[] headers = {"应付单号", "供应商", "关联订单", "描述",
                    "应付金额(元)", "已付金额(元)", "未付金额(元)", "到期日", "状态"};
            Row hRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell c = hRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 18 * 256);
            }

            int rowIdx = 1;
            BigDecimal totalAmount = BigDecimal.ZERO;
            BigDecimal totalPaid = BigDecimal.ZERO;
            BigDecimal totalUnpaid = BigDecimal.ZERO;
            for (Payable p : list) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(safeStr(p.getPayableNo()));
                row.createCell(1).setCellValue(safeStr(p.getSupplierName()));
                row.createCell(2).setCellValue(safeStr(p.getOrderNo()));
                row.createCell(3).setCellValue(safeStr(p.getDescription()));
                BigDecimal amt = p.getAmount() != null ? p.getAmount() : BigDecimal.ZERO;
                BigDecimal paid = p.getPaidAmount() != null ? p.getPaidAmount() : BigDecimal.ZERO;
                BigDecimal unpaid = amt.subtract(paid);
                Cell amtCell = row.createCell(4);
                amtCell.setCellValue(amt.doubleValue());
                amtCell.setCellStyle(moneyStyle);
                Cell paidCell = row.createCell(5);
                paidCell.setCellValue(paid.doubleValue());
                paidCell.setCellStyle(moneyStyle);
                Cell unpaidCell = row.createCell(6);
                unpaidCell.setCellValue(unpaid.doubleValue());
                unpaidCell.setCellStyle(moneyStyle);
                row.createCell(7).setCellValue(p.getDueDate() != null ? p.getDueDate().toString() : "");
                row.createCell(8).setCellValue(translateStatus(p.getStatus()));
                totalAmount = totalAmount.add(amt);
                totalPaid = totalPaid.add(paid);
                totalUnpaid = totalUnpaid.add(unpaid);
            }

            Row sumRow = sheet.createRow(rowIdx);
            Cell sumLabel = sumRow.createCell(0);
            sumLabel.setCellValue("合计 (" + list.size() + " 条)");
            sumLabel.setCellStyle(headerStyle);
            Cell s4 = sumRow.createCell(4); s4.setCellValue(totalAmount.doubleValue()); s4.setCellStyle(moneyStyle);
            Cell s5 = sumRow.createCell(5); s5.setCellValue(totalPaid.doubleValue()); s5.setCellStyle(moneyStyle);
            Cell s6 = sumRow.createCell(6); s6.setCellValue(totalUnpaid.doubleValue()); s6.setCellStyle(moneyStyle);

            return toBytes(wb);
        }
    }

    // -----------------------------------------------------------------------
    // 月度税务汇总导出
    // -----------------------------------------------------------------------

    public byte[] exportTaxSummaryExcel(String startDate, String endDate, String format) throws IOException {
        assertNotFactoryAccount();
        Long tenantId = UserContext.tenantId();
        QueryWrapper<Invoice> qw = new QueryWrapper<>();
        qw.eq("tenant_id", tenantId);
        qw.eq("delete_flag", 0);
        if (startDate != null && !startDate.isBlank()) {
            qw.ge("create_time", startDate + " 00:00:00");
        }
        if (endDate != null && !endDate.isBlank()) {
            qw.le("create_time", endDate + " 23:59:59");
        }
        qw.orderByDesc("issue_date");
        List<Invoice> list = invoiceService.list(qw);

        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("月度税务汇总");
            CellStyle headerStyle = createHeaderStyle(wb);
            CellStyle moneyStyle = createMoneyStyle(wb);

            String[] headers = {"发票号", "发票类型", "购方名称", "购方税号",
                    "销方名称", "未税金额(元)", "税率(%)", "税额(元)", "价税合计(元)", "开票日期", "状态"};
            Row hRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell c = hRow.createCell(i);
                c.setCellValue(headers[i]);
                c.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 20 * 256);
            }

            int rowIdx = 1;
            BigDecimal totalAmount = BigDecimal.ZERO;
            BigDecimal totalTax = BigDecimal.ZERO;
            BigDecimal totalWithTax = BigDecimal.ZERO;
            for (Invoice inv : list) {
                Row row = sheet.createRow(rowIdx++);
                row.createCell(0).setCellValue(safeStr(inv.getInvoiceNo()));
                row.createCell(1).setCellValue(translateInvoiceType(inv.getInvoiceType()));
                row.createCell(2).setCellValue(safeStr(inv.getTitleName()));
                row.createCell(3).setCellValue(safeStr(inv.getTitleTaxNo()));
                row.createCell(4).setCellValue(safeStr(inv.getSellerName()));
                BigDecimal amt = inv.getAmount() != null ? inv.getAmount() : BigDecimal.ZERO;
                BigDecimal tax = inv.getTaxAmount() != null ? inv.getTaxAmount() : BigDecimal.ZERO;
                BigDecimal total = inv.getTotalAmount() != null ? inv.getTotalAmount() : amt.add(tax);
                // taxRate 存储为小数（如 0.13），显示为百分比
                double taxRatePct = inv.getTaxRate() != null ? inv.getTaxRate().multiply(new BigDecimal("100")).doubleValue() : 0.0;
                Cell amtCell = row.createCell(5); amtCell.setCellValue(amt.doubleValue()); amtCell.setCellStyle(moneyStyle);
                row.createCell(6).setCellValue(taxRatePct);
                Cell taxCell = row.createCell(7); taxCell.setCellValue(tax.doubleValue()); taxCell.setCellStyle(moneyStyle);
                Cell totalCell = row.createCell(8); totalCell.setCellValue(total.doubleValue()); totalCell.setCellStyle(moneyStyle);
                row.createCell(9).setCellValue(inv.getIssueDate() != null ? inv.getIssueDate().toString() : "");
                row.createCell(10).setCellValue(translateStatus(inv.getStatus()));
                totalAmount = totalAmount.add(amt);
                totalTax = totalTax.add(tax);
                totalWithTax = totalWithTax.add(total);
            }

            Row sumRow = sheet.createRow(rowIdx);
            Cell sumLabel = sumRow.createCell(0);
            sumLabel.setCellValue("合计 (" + list.size() + " 条)");
            sumLabel.setCellStyle(headerStyle);
            Cell s5 = sumRow.createCell(5); s5.setCellValue(totalAmount.doubleValue()); s5.setCellStyle(moneyStyle);
            Cell s7 = sumRow.createCell(7); s7.setCellValue(totalTax.doubleValue()); s7.setCellStyle(moneyStyle);
            Cell s8 = sumRow.createCell(8); s8.setCellValue(totalWithTax.doubleValue()); s8.setCellStyle(moneyStyle);

            return toBytes(wb);
        }
    }

    private String translateInvoiceType(String type) {
        if (type == null) return "";
        return switch (type) {
            case "SPECIAL" -> "增值税专用发票";
            case "NORMAL" -> "增值税普通发票";
            case "ELECTRONIC" -> "电子普通发票";
            case "ELECTRONIC_SPECIAL" -> "电子专用发票";
            default -> type;
        };
    }

    // -----------------------------------------------------------------------
    // 样式辅助方法
    // -----------------------------------------------------------------------

    private CellStyle createHeaderStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        Font font = wb.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 11);
        style.setFont(font);
        style.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        style.setAlignment(HorizontalAlignment.CENTER);
        return style;
    }

    private CellStyle createMoneyStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        DataFormat fmt = wb.createDataFormat();
        style.setDataFormat(fmt.getFormat("#,##0.00"));
        return style;
    }

    private CellStyle createDateStyle(Workbook wb) {
        CellStyle style = wb.createCellStyle();
        DataFormat fmt = wb.createDataFormat();
        style.setDataFormat(fmt.getFormat("yyyy-mm-dd"));
        return style;
    }

    private byte[] toBytes(Workbook wb) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        wb.write(out);
        return out.toByteArray();
    }

    private String safeStr(Object val) {
        return val == null ? "" : val.toString();
    }

    private String formatDt(LocalDateTime dt) {
        return dt == null ? "" : dt.format(FMT);
    }

    private String translateStatus(String status) {
        if (status == null) return "";
        return switch (status) {
            case "DRAFT" -> "草稿";
            case "PENDING" -> "待审核";
            case "APPROVED" -> "已审核";
            case "REJECTED" -> "已拒绝";
            case "PAID" -> "已付款";
            case "SETTLED" -> "已结算";
            default -> status;
        };
    }
}
