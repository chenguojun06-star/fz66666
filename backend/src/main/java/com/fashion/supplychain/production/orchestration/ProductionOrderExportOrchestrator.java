package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.ProductionOrder;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class ProductionOrderExportOrchestrator {

    @Autowired
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    public byte[] exportProductionOrders(Map<String, Object> params) {
        params.put("page", 1);
        params.put("size", 10000); // 导出大量数据

        IPage<ProductionOrder> page = productionOrderOrchestrator.queryPage(params);
        List<ProductionOrder> orders = page.getRecords();

        try (Workbook wb = new XSSFWorkbook()) {
            Sheet sheet = wb.createSheet("生产订单数据");

            // 表头样式
            CellStyle headerStyle = wb.createCellStyle();
            Font font = wb.createFont();
            font.setBold(true);
            headerStyle.setFont(font);
            headerStyle.setFillForegroundColor(IndexedColors.GREY_25_PERCENT.getIndex());
            headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);

            String[] headers = {"订单号", "款号", "款式名称", "工厂", "跟单员", "总数量", "已完成", "进度", "状态", "生产交期", "建单时间"};
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(headers[i]);
                cell.setCellStyle(headerStyle);
                sheet.setColumnWidth(i, 4000);
            }
            sheet.setColumnWidth(2, 6000);
            sheet.setColumnWidth(9, 5000);
            sheet.setColumnWidth(10, 5000);

            int rowIdx = 1;
            for (ProductionOrder o : orders) {
                Row r = sheet.createRow(rowIdx++);
                r.createCell(0).setCellValue(safe(o.getOrderNo()));
                r.createCell(1).setCellValue(safe(o.getStyleNo()));
                r.createCell(2).setCellValue(safe(o.getStyleName()));
                r.createCell(3).setCellValue(safe(o.getFactoryName()));
                r.createCell(4).setCellValue(safe(o.getMerchandiser()));
                r.createCell(5).setCellValue(o.getOrderQuantity() != null ? o.getOrderQuantity() : 0);
                r.createCell(6).setCellValue(o.getCompletedQuantity() != null ? o.getCompletedQuantity() : 0);
                r.createCell(7).setCellValue((o.getProductionProgress() != null ? o.getProductionProgress() : 0) + "%");

                String statusLabel = switch (safe(o.getStatus())) {
                    case "PENDING" -> "待开始";
                    case "IN_PROGRESS" -> "进行中";
                    case "COMPLETED" -> "已完成";
                    case "CANCELLED" -> "已取消";
                    default -> safe(o.getStatus());
                };
                r.createCell(8).setCellValue(statusLabel);
                r.createCell(9).setCellValue(o.getPlannedEndDate() != null ? o.getPlannedEndDate().toString().replace("T", " ") : "");
                r.createCell(10).setCellValue(o.getCreateTime() != null ? o.getCreateTime().toString().replace("T", " ") : "");
            }

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            wb.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            log.error("[ProductionOrderExport] 导出生产订单异常", e);
            throw new RuntimeException("导出Excel失败: " + e.getMessage());
        }
    }

    private String safe(String val) {
        return val != null ? val : "";
    }
}
