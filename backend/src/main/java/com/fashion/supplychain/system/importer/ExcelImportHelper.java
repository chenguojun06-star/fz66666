package com.fashion.supplychain.system.importer;

import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.math.BigDecimal;
import java.util.*;

@Component
@Slf4j
public class ExcelImportHelper {

    public static class TemplateConfig {
        public String[] headers;
        public String[] examples;
        public String sheetName;
        public String[] notes;
    }

    public byte[] generateTemplate(TemplateConfig config) {
        try (XSSFWorkbook workbook = new XSSFWorkbook()) {
            buildDataSheet(workbook, config);
            buildNoteSheet(workbook, config.notes);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            workbook.write(out);
            return out.toByteArray();
        } catch (Exception e) {
            throw new RuntimeException("生成模板失败: " + e.getMessage(), e);
        }
    }

    public void buildDataSheet(XSSFWorkbook workbook, TemplateConfig config) {
        Sheet dataSheet = workbook.createSheet(config.sheetName);

        CellStyle headerStyle = workbook.createCellStyle();
        Font headerFont = workbook.createFont();
        headerFont.setBold(true);
        headerFont.setFontHeightInPoints((short) 12);
        headerStyle.setFont(headerFont);
        headerStyle.setFillForegroundColor(IndexedColors.LIGHT_CORNFLOWER_BLUE.getIndex());
        headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        headerStyle.setBorderBottom(BorderStyle.THIN);
        headerStyle.setBorderTop(BorderStyle.THIN);
        headerStyle.setBorderLeft(BorderStyle.THIN);
        headerStyle.setBorderRight(BorderStyle.THIN);

        CellStyle exampleStyle = workbook.createCellStyle();
        Font exampleFont = workbook.createFont();
        exampleFont.setColor(IndexedColors.GREY_50_PERCENT.getIndex());
        exampleFont.setItalic(true);
        exampleStyle.setFont(exampleFont);

        Row headerRow = dataSheet.createRow(0);
        for (int i = 0; i < config.headers.length; i++) {
            Cell cell = headerRow.createCell(i);
            cell.setCellValue(config.headers[i]);
            cell.setCellStyle(headerStyle);
            dataSheet.setColumnWidth(i, 5000);
        }

        Row exampleRow = dataSheet.createRow(1);
        for (int i = 0; i < config.examples.length; i++) {
            Cell cell = exampleRow.createCell(i);
            cell.setCellValue(config.examples[i]);
            cell.setCellStyle(exampleStyle);
        }
    }

    public void buildNoteSheet(XSSFWorkbook workbook, String[] notes) {
        Sheet noteSheet = workbook.createSheet("填写说明");
        CellStyle noteHeaderStyle = workbook.createCellStyle();
        Font noteHeaderFont = workbook.createFont();
        noteHeaderFont.setBold(true);
        noteHeaderFont.setFontHeightInPoints((short) 14);
        noteHeaderStyle.setFont(noteHeaderFont);

        Row noteTitleRow = noteSheet.createRow(0);
        Cell titleCell = noteTitleRow.createCell(0);
        titleCell.setCellValue("填写说明");
        titleCell.setCellStyle(noteHeaderStyle);

        for (int i = 0; i < notes.length; i++) {
            Row noteRow = noteSheet.createRow(i + 2);
            noteRow.createCell(0).setCellValue(notes[i]);
        }
        noteSheet.setColumnWidth(0, 15000);
    }

    public List<Map<String, String>> parseExcel(MultipartFile file, String[] expectedHeaders) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择要上传的文件");
        }

        String filename = file.getOriginalFilename();
        if (filename == null || (!filename.endsWith(".xlsx") && !filename.endsWith(".xls"))) {
            throw new IllegalArgumentException("仅支持 .xlsx 或 .xls 格式的Excel文件");
        }

        try (InputStream is = file.getInputStream(); Workbook workbook = WorkbookFactory.create(is)) {
            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null || sheet.getPhysicalNumberOfRows() < 2) {
                throw new IllegalArgumentException("Excel文件为空或缺少数据行");
            }

            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                throw new IllegalArgumentException("缺少表头行");
            }

            Map<Integer, String> colIndexToHeader = new LinkedHashMap<>();
            for (int i = 0; i < headerRow.getLastCellNum(); i++) {
                Cell cell = headerRow.getCell(i);
                if (cell != null) {
                    String headerValue = getCellStringValue(cell).trim();
                    if (StringUtils.hasText(headerValue)) {
                        colIndexToHeader.put(i, headerValue);
                    }
                }
            }

            Set<String> foundHeaders = new HashSet<>(colIndexToHeader.values());
            for (String expected : expectedHeaders) {
                if (expected.endsWith("*") && !foundHeaders.contains(expected)) {
                    throw new IllegalArgumentException("缺少必填列: " + expected + "。请使用系统提供的模板。");
                }
            }

            List<Map<String, String>> result = new ArrayList<>();
            for (int rowIdx = 1; rowIdx <= sheet.getLastRowNum(); rowIdx++) {
                Row row = sheet.getRow(rowIdx);
                if (row == null) continue;

                Map<String, String> rowData = new LinkedHashMap<>();
                boolean hasData = false;
                for (Map.Entry<Integer, String> entry : colIndexToHeader.entrySet()) {
                    Cell cell = row.getCell(entry.getKey());
                    String value = cell != null ? getCellStringValue(cell).trim() : "";
                    rowData.put(entry.getValue(), value);
                    if (StringUtils.hasText(value)) hasData = true;
                }

                if (!hasData) continue;
                result.add(rowData);
            }

            return result;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException("解析Excel文件失败: " + e.getMessage(), e);
        }
    }

    public String getCellStringValue(Cell cell) {
        if (cell == null) return "";
        switch (cell.getCellType()) {
            case STRING:
                return cell.getStringCellValue();
            case NUMERIC:
                if (DateUtil.isCellDateFormatted(cell)) {
                    return cell.getLocalDateTimeCellValue().toLocalDate().toString();
                }
                double num = cell.getNumericCellValue();
                if (num == Math.floor(num) && !Double.isInfinite(num)) {
                    return String.valueOf((long) num);
                }
                return String.valueOf(num);
            case BOOLEAN:
                return String.valueOf(cell.getBooleanCellValue());
            case FORMULA:
                try {
                    return cell.getStringCellValue();
                } catch (Exception e) {
                    try {
                        return String.valueOf(cell.getNumericCellValue());
                    } catch (Exception e2) {
                        log.debug("[Excel导入] 公式单元格数值读取失败: {}", e2.getMessage());
                        return "";
                    }
                }
            default:
                return "";
        }
    }

    public Map<String, Object> buildResult(int total, List<Map<String, Object>> success, List<Map<String, Object>> failed, String typeName) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("total", total);
        result.put("successCount", success.size());
        result.put("failedCount", failed.size());
        result.put("successRecords", success);
        result.put("failedRecords", failed);
        result.put("message", failed.isEmpty()
                ? typeName + "导入成功，共 " + success.size() + " 条"
                : typeName + "导入完成：成功 " + success.size() + " 条，失败 " + failed.size() + " 条");
        log.info("[Excel导入] 类型={}, 总数={}, 成功={}, 失败={}", typeName, total, success.size(), failed.size());
        return result;
    }

    public String safe(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    public Integer parseInteger(String value) {
        if (!StringUtils.hasText(value)) return null;
        try {
            return Integer.parseInt(value.trim());
        } catch (Exception e) {
            log.debug("[Excel导入] 整数解析失败: value={}", value);
            return null;
        }
    }

    public BigDecimal parseDecimal(String value) {
        if (!StringUtils.hasText(value)) return null;
        try {
            return new BigDecimal(value.trim());
        } catch (Exception e) {
            log.debug("[Excel导入] 小数解析失败: value={}", value);
            return null;
        }
    }
}
