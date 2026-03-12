package com.fashion.supplychain.intelligence.orchestration;

import lombok.extern.slf4j.Slf4j;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * 文件分析编排器：解析 Excel/CSV 文件，返回 Markdown 表格格式供 AI 分析。
 * 支持格式：.xlsx / .xls / .csv / 图片（返回提示文字）
 */
@Slf4j
@Service
public class FileAnalysisOrchestrator {

    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024L; // 5MB
    private static final int MAX_ROWS = 50;
    private static final int MAX_COLS = 20;
    private static final int MAX_SHEETS = 3;

    /** 分析上传文件，返回 Markdown 格式内容供注入到 AI 对话上下文 */
    public String analyzeFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return "【错误】未收到文件";
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            return "【错误】文件超出5MB限制，请压缩后上传";
        }

        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename() : "file";
        String lower = filename.toLowerCase();

        try {
            if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
                return parseExcel(file, filename, lower.endsWith(".xlsx"));
            } else if (lower.endsWith(".csv")) {
                return parseCsv(file, filename);
            } else if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")
                    || lower.endsWith(".png") || lower.endsWith(".gif") || lower.endsWith(".webp")) {
                return "【收到图片文件：" + filename + "】\n（图片内容识别正在集成中，请用文字描述图片内容，我可以基于描述帮你分析）";
            } else {
                return "【不支持的文件类型：" + filename + "】\n支持格式：.xlsx / .xls / .csv / 图片（jpg/png/gif）";
            }
        } catch (Exception e) {
            log.error("[FileAnalysis] 解析文件失败: {}", filename, e);
            return "【文件解析失败：" + filename + "】错误：" + e.getMessage();
        }
    }

    private String parseExcel(MultipartFile file, String filename, boolean isXlsx) throws Exception {
        StringBuilder sb = new StringBuilder("【文件内容：").append(filename).append("】\n\n");
        try (InputStream is = file.getInputStream();
             Workbook workbook = isXlsx ? new XSSFWorkbook(is) : new HSSFWorkbook(is)) {

            int sheetCount = Math.min(workbook.getNumberOfSheets(), MAX_SHEETS);
            for (int si = 0; si < sheetCount; si++) {
                Sheet sheet = workbook.getSheetAt(si);
                if (sheet == null) continue;

                sb.append("**").append(sheet.getSheetName()).append("**\n\n");
                int rowCount = Math.min(sheet.getLastRowNum() + 1, MAX_ROWS);
                boolean headerDone = false;

                for (int ri = 0; ri < rowCount; ri++) {
                    Row row = sheet.getRow(ri);
                    if (row == null) continue;

                    int colCount = Math.min(row.getLastCellNum(), MAX_COLS);
                    List<String> cells = new ArrayList<>(colCount);
                    for (int ci = 0; ci < colCount; ci++) {
                        cells.add(getCellValue(row.getCell(ci)));
                    }
                    sb.append("| ").append(String.join(" | ", cells)).append(" |\n");
                    if (!headerDone) {
                        sb.append("|").append(" --- |".repeat(cells.size())).append("\n");
                        headerDone = true;
                    }
                }
                sb.append("\n");
            }
        }
        return sb.toString();
    }

    private String parseCsv(MultipartFile file, String filename) throws Exception {
        StringBuilder sb = new StringBuilder("【文件内容：").append(filename).append("】\n\n");
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            int rowCount = 0;
            boolean headerDone = false;
            while ((line = reader.readLine()) != null && rowCount < MAX_ROWS) {
                String[] cols = line.split(",", -1);
                sb.append("| ").append(String.join(" | ", cols)).append(" |\n");
                if (!headerDone) {
                    sb.append("|").append(" --- |".repeat(cols.length)).append("\n");
                    headerDone = true;
                }
                rowCount++;
            }
        }
        return sb.toString();
    }

    private String getCellValue(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue().trim();
            case NUMERIC -> {
                if (DateUtil.isCellDateFormatted(cell)) {
                    yield cell.getLocalDateTimeCellValue().toLocalDate().toString();
                }
                double val = cell.getNumericCellValue();
                yield (val == Math.floor(val) && !Double.isInfinite(val))
                        ? String.valueOf((long) val)
                        : String.valueOf(val);
            }
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> {
                try {
                    yield String.valueOf(cell.getNumericCellValue());
                } catch (Exception e) {
                    try { yield cell.getStringCellValue(); } catch (Exception e2) { yield ""; }
                }
            }
            default -> "";
        };
    }
}
