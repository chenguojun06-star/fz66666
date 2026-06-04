package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.service.QdrantService;
import com.fashion.supplychain.intelligence.service.VisionAnalysisService;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.hssf.usermodel.HSSFWorkbook;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Base64;
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

    @Autowired
    private VisionAnalysisService visionAnalysisService;

    @Autowired
    private QdrantService qdrantService;

    @Autowired
    private CosService cosService;

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
                return analyzeImageFile(file, filename);
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

    private String analyzeImageFile(MultipartFile file, String filename) {
        if (!visionAnalysisService.isAvailable()) {
            return "【收到图片文件：" + filename + "】\n（视觉AI未配置，请用文字描述图片内容，我可以基于描述帮你分析）";
        }
        try {
            String base64 = "data:" + file.getContentType() + ";base64,"
                    + Base64.getEncoder().encodeToString(file.getBytes());
            VisionAnalysisService.VisionResult result = visionAnalysisService.analyzeGeneric(
                    base64, "用户上传了一张图片，请分析图片内容并用中文简要描述。如果是服装/布料相关图片，" +
                            "请重点分析款式、颜色、面料、缺陷等信息。如果不是服装相关图片，请简要描述图片包含的内容。");
            if (!result.isAvailable() || result.getConfidence() == 0) {
                return "【收到图片文件：" + filename + "】\n视觉分析未能识别图片内容，请用文字描述图片内容";
            }
            StringBuilder sb = new StringBuilder();
            sb.append("【图片文件：").append(filename).append("】\n");
            sb.append("视觉分析结果：\n");
            sb.append(result.getReport());
            if (result.getRecommendation() != null && !result.getRecommendation().isBlank()) {
                sb.append("\n\n建议：").append(result.getRecommendation());
            }

            // 以图搜款：如果是服装相关图片，自动搜索相似款式
            String styleSearchResult = searchSimilarStyles(file, filename);
            if (styleSearchResult != null) {
                sb.append("\n\n").append(styleSearchResult);
            }

            return sb.toString();
        } catch (Exception e) {
            log.warn("[FileAnalysis] 图片视觉分析失败 fileName={}: {}", filename, e.getMessage());
            return "【收到图片文件：" + filename + "】\n（图片分析暂时不可用，请用文字描述图片内容）";
        }
    }

    /**
     * 以图搜款：将图片上传到COS获取公网URL，生成多模态向量，搜索相似款式。
     * 返回格式化的相似款式信息，或null（搜索不可用/失败时）。
     */
    private String searchSimilarStyles(MultipartFile file, String filename) {
        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            log.debug("[FileAnalysis] 以图搜款跳过：租户信息缺失");
            return null;
        }
        try {
            // 1. 上传到COS获取公网URL（向量搜索需要公网可访问的URL）
            String imageUrl = uploadToCosForSearch(file, filename);
            if (imageUrl == null || imageUrl.isBlank()) {
                log.debug("[FileAnalysis] 以图搜款跳过：图片上传COS失败");
                return null;
            }

            // 2. 生成多模态向量
            float[] embedding = qdrantService.computeMultimodalEmbedding(imageUrl);
            if (embedding == null || embedding.length == 0) {
                log.debug("[FileAnalysis] 以图搜款跳过：向量生成返回空");
                return null;
            }

            // 3. 搜索相似款式
            List<QdrantService.SimilarStyle> similar = qdrantService.searchSimilarStyleImages(embedding, 5, tenantId);
            if (similar.isEmpty()) {
                log.debug("[FileAnalysis] 以图搜款：未找到相似款式");
                return "🔍 以图搜款：系统中暂未找到视觉相似的历史款式（可能向量库中还没有足够的款式图片数据）";
            }

            // 4. 格式化结果
            StringBuilder sb = new StringBuilder();
            sb.append("🔍 以图搜款结果（找到 ").append(similar.size()).append(" 个相似款式）：\n");
            for (int i = 0; i < similar.size(); i++) {
                QdrantService.SimilarStyle ss = similar.get(i);
                sb.append(i + 1).append(". 款号：").append(ss.getStyleNo().isEmpty() ? "[无款号]" : ss.getStyleNo());
                sb.append(" | 难度：").append(ss.getDifficultyScore()).append("/10（").append(ss.getDifficultyLevel()).append("）");
                sb.append(" | 视觉相似度：").append(String.format("%.0f%%", ss.getSimilarity() * 100));
                sb.append("\n");
            }
            sb.append("（相似度≥72%为高相似，可重点关注）");
            log.info("[FileAnalysis] 以图搜款成功 匹配{}个款式", similar.size());
            return sb.toString();
        } catch (IllegalStateException e) {
            // Voyage API Key 未配置
            log.debug("[FileAnalysis] 以图搜款跳过：{}", e.getMessage());
            return null;
        } catch (Exception e) {
            log.warn("[FileAnalysis] 以图搜款异常（不影响主流程）: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 将图片上传到COS，返回公网可访问的URL，供向量搜索使用。
     * 如果COS不可用则返回null（不影响主流程）。
     */
    private String uploadToCosForSearch(MultipartFile file, String filename) {
        try {
            if (cosService == null || !cosService.isEnabled()) return null;
            Long tenantId = UserContext.tenantId();
            if (tenantId == null) return null;
            String cosKey = "ai-vision-search/" + System.currentTimeMillis() + "-" + filename;
            cosService.upload(tenantId, cosKey, file);
            return cosService.getPresignedUrl(tenantId, cosKey);
        } catch (Exception e) {
            log.debug("[FileAnalysis] COS上传跳过: {}", e.getMessage());
            return null;
        }
    }
}
