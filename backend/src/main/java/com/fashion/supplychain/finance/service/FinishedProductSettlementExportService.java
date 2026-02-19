package com.fashion.supplychain.finance.service;

import com.fashion.supplychain.finance.entity.FinishedProductSettlement;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.util.List;

/**
 * 成品结算导出服务
 */
@Service
public class FinishedProductSettlementExportService {

    /**
     * 导出为Excel
     */
    public byte[] exportToExcel(List<FinishedProductSettlement> data) throws IOException {
        try (Workbook workbook = new XSSFWorkbook()) {
            Sheet sheet = workbook.createSheet("成品结算汇总");

            // 创建样式
            CellStyle headerStyle = createHeaderStyle(workbook);
            CellStyle numberStyle = createNumberStyle(workbook);
            CellStyle moneyStyle = createMoneyStyle(workbook);
            CellStyle percentStyle = createPercentStyle(workbook);

            // 创建表头
            Row headerRow = sheet.createRow(0);
            String[] headers = {
                "订单号", "款号", "状态", "颜色", "下单数", "入库数", "次品数",
                "款式单价", "面辅料成本", "生产成本", "次品报废", "总金额", "利润", "利润率(%)"
            };

            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
            }

            // 填充数据
            int rowNum = 1;
            for (FinishedProductSettlement item : data) {
                Row row = sheet.createRow(rowNum++);

                int colNum = 0;

                // 订单号
                createCell(row, colNum++, item.getOrderNo(), null);

                // 款号
                createCell(row, colNum++, item.getStyleNo(), null);

                // 状态
                createCell(row, colNum++, getStatusText(item.getStatus()), null);

                // 颜色
                createCell(row, colNum++, item.getColors(), null);

                // 下单数
                createCell(row, colNum++, item.getOrderQuantity(), numberStyle);

                // 入库数
                createCell(row, colNum++, item.getWarehousedQuantity(), numberStyle);

                // 次品数
                createCell(row, colNum++, item.getDefectQuantity(), numberStyle);

                // 款式单价
                createCell(row, colNum++, item.getStyleFinalPrice(), moneyStyle);

                // 面辅料成本
                createCell(row, colNum++, item.getMaterialCost(), moneyStyle);

                // 生产成本
                createCell(row, colNum++, item.getProductionCost(), moneyStyle);

                // 次品报废
                createCell(row, colNum++, item.getDefectLoss(), moneyStyle);

                // 总金额
                createCell(row, colNum++, item.getTotalAmount(), moneyStyle);

                // 利润
                createCell(row, colNum++, item.getProfit(), moneyStyle);

                // 利润率
                createCell(row, colNum++, item.getProfitMargin(), percentStyle);
            }

            // 自动调整列宽
            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
                // 设置最小宽度
                if (sheet.getColumnWidth(i) < 3000) {
                    sheet.setColumnWidth(i, 3000);
                }
            }

            // 写入字节数组
            ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
            workbook.write(outputStream);
            return outputStream.toByteArray();
        }
    }

    /**
     * 创建单元格
     */
    private void createCell(Row row, int column, Object value, CellStyle style) {
        Cell cell = row.createCell(column);

        if (value == null) {
            cell.setCellValue("");
        } else if (value instanceof String) {
            cell.setCellValue((String) value);
        } else if (value instanceof Integer) {
            cell.setCellValue((Integer) value);
            if (style != null) {
                cell.setCellStyle(style);
            }
        } else if (value instanceof BigDecimal) {
            cell.setCellValue(((BigDecimal) value).doubleValue());
            if (style != null) {
                cell.setCellStyle(style);
            }
        }
    }

    /**
     * 创建表头样式
     */
    private CellStyle createHeaderStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        Font font = workbook.createFont();
        font.setBold(true);
        font.setFontHeightInPoints((short) 12);
        style.setFont(font);
        style.setAlignment(HorizontalAlignment.CENTER);
        style.setVerticalAlignment(VerticalAlignment.CENTER);
        style.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
        style.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        style.setBorderTop(BorderStyle.THIN);
        style.setBorderBottom(BorderStyle.THIN);
        style.setBorderLeft(BorderStyle.THIN);
        style.setBorderRight(BorderStyle.THIN);
        return style;
    }

    /**
     * 创建数字样式
     */
    private CellStyle createNumberStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setAlignment(HorizontalAlignment.RIGHT);
        DataFormat format = workbook.createDataFormat();
        style.setDataFormat(format.getFormat("#,##0"));
        return style;
    }

    /**
     * 创建金额样式
     */
    private CellStyle createMoneyStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setAlignment(HorizontalAlignment.RIGHT);
        DataFormat format = workbook.createDataFormat();
        style.setDataFormat(format.getFormat("¥#,##0.00"));
        return style;
    }

    /**
     * 创建百分比样式
     */
    private CellStyle createPercentStyle(Workbook workbook) {
        CellStyle style = workbook.createCellStyle();
        style.setAlignment(HorizontalAlignment.RIGHT);
        DataFormat format = workbook.createDataFormat();
        style.setDataFormat(format.getFormat("0.00"));
        return style;
    }

    /**
     * 获取状态文本
     */
    private String getStatusText(String status) {
        if (status == null) {
            return "";
        }
        switch (status) {
            case "PENDING":
                return "待确认";
            case "CONFIRMED":
                return "已确认";
            case "IN_PRODUCTION":
                return "生产中";
            case "COMPLETED":
                return "已完成";
            case "CANCELLED":
                return "已取消";
            default:
                return status;
        }
    }
}
