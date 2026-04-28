package com.fashion.supplychain.system.importer;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.common.tenant.TenantFilePathResolver;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

@Component
@Slf4j
public class StyleExcelImporter {

    private static final String[] STYLE_HEADERS = {
            "款号*", "款名", "品类", "单价", "颜色", "码数", "季节", "客户", "描述"
    };
    private static final String[] STYLE_EXAMPLES = {
            "FZ2024001", "春季连衣裙", "连衣裙", "128.50", "红色,白色", "S,M,L,XL", "春季", "张三服装", "2024春季新款"
    };

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private CosService cosService;

    @Autowired
    private ExcelImportHelper importHelper;

    @Value("${fashion.upload-path:./uploads/}")
    private String uploadPath;

    public ExcelImportHelper.TemplateConfig getTemplateConfig() {
        ExcelImportHelper.TemplateConfig config = new ExcelImportHelper.TemplateConfig();
        config.headers = STYLE_HEADERS;
        config.examples = STYLE_EXAMPLES;
        config.sheetName = "款式资料";
        config.notes = new String[]{
                "款号*: 必填，唯一标识，不能重复",
                "款名: 选填，为空时自动用款号填充",
                "品类: 选填，如连衣裙、衬衫、裤子等",
                "单价: 选填，填数字",
                "颜色: 选填，多个用逗号分隔",
                "码数: 选填，多个用逗号分隔",
                "季节: 选填，如春季、夏季、秋季、冬季",
                "客户: 选填，客户名称",
                "描述: 选填"
        };
        return config;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importStyles(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = importHelper.parseExcel(file, STYLE_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据（第1行为表头，请从第2行开始填写）");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String styleNo = importHelper.safe(item.get("款号*"));
                if (!StringUtils.hasText(styleNo)) {
                    throw new IllegalArgumentException("款号不能为空");
                }

                StyleInfo existing = styleInfoService.getOne(
                        new LambdaQueryWrapper<StyleInfo>()
                                .eq(StyleInfo::getStyleNo, styleNo)
                                .eq(StyleInfo::getTenantId, tenantId)
                                .last("LIMIT 1")
                );
                if (existing != null) {
                    throw new IllegalArgumentException("款号已存在: " + styleNo);
                }

                StyleInfo style = new StyleInfo();
                style.setStyleNo(styleNo);
                style.setStyleName(StringUtils.hasText(importHelper.safe(item.get("款名"))) ? importHelper.safe(item.get("款名")) : styleNo);
                style.setCategory(importHelper.safe(item.get("品类")));
                style.setColor(importHelper.safe(item.get("颜色")));
                style.setSize(importHelper.safe(item.get("码数")));
                style.setSeason(importHelper.safe(item.get("季节")));
                style.setCustomer(importHelper.safe(item.get("客户")));
                style.setDescription(StringUtils.hasText(importHelper.safe(item.get("描述"))) ? importHelper.safe(item.get("描述")) : "[Excel导入]");

                BigDecimal price = importHelper.parseDecimal(item.get("单价"));
                if (price != null) style.setPrice(price);

                style.setYear(LocalDate.now().getYear());
                style.setMonth(LocalDate.now().getMonthValue());
                style.setStatus("ENABLED");
                style.setCreateTime(LocalDateTime.now());
                style.setUpdateTime(LocalDateTime.now());

                boolean saved = styleInfoService.save(style);
                if (!saved) throw new RuntimeException("保存失败");

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("styleNo", styleNo);
                success.put("styleName", style.getStyleName());
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("styleNo", item.get("款号*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        return importHelper.buildResult(rows.size(), successRecords, failedRecords, "款式");
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importStylesFromZip(Long tenantId, MultipartFile zipFile) {
        ZipExtractResult extracted = extractZipContent(zipFile);
        if (extracted.excelBytes == null) {
            throw new IllegalArgumentException("ZIP 包内未找到 Excel 文件（.xlsx 或 .xls），请确认 ZIP 内容");
        }
        log.info("[ZIP导入] 租户={}, Excel={}, 图片数={}", tenantId, extracted.excelName, extracted.imageMap.size());

        MultipartFile excelMultipart = wrapAsMultipartFile(extracted.excelBytes, extracted.excelName);
        List<Map<String, String>> rows = importHelper.parseExcel(excelMultipart, STYLE_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel 文件中没有数据（第1行为表头，请从第2行开始填写）");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();
        List<String> imageErrors = new ArrayList<>();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                StyleImportResult importResult = saveStyleFromZipRow(tenantId, item, extracted.imageMap);
                if (importResult.imageError != null) {
                    imageErrors.add(importResult.imageError);
                }
                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("styleNo", importResult.styleNo);
                success.put("styleName", importResult.styleName);
                success.put("hasCover", importResult.hasCover);
                success.put("isUpdate", importResult.isUpdate);
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("styleNo", item.get("款号*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        return buildZipImportResult(rows.size(), successRecords, failedRecords, extracted.imageMap, imageErrors);
    }

    private static class ZipExtractResult {
        byte[] excelBytes;
        String excelName;
        Map<String, byte[]> imageMap = new LinkedHashMap<>();
    }

    private ZipExtractResult extractZipContent(MultipartFile zipFile) {
        ZipExtractResult result = new ZipExtractResult();
        Set<String> imageExts = new HashSet<>(Arrays.asList("jpg", "jpeg", "png", "gif", "webp"));
        try (ZipInputStream zis = new ZipInputStream(zipFile.getInputStream())) {
            ZipEntry entry;
            while ((entry = zis.getNextEntry()) != null) {
                if (entry.isDirectory()) { zis.closeEntry(); continue; }
                String entryName = entry.getName();
                if (entryName.contains("__MACOSX") || entryName.startsWith(".")) { zis.closeEntry(); continue; }
                String baseName = entryName.contains("/")
                        ? entryName.substring(entryName.lastIndexOf('/') + 1)
                        : entryName;
                if (baseName.startsWith(".") || baseName.isEmpty()) { zis.closeEntry(); continue; }

                byte[] bytes = zis.readAllBytes();
                String lowerName = baseName.toLowerCase();

                if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
                    if (result.excelBytes == null) {
                        result.excelBytes = bytes;
                        result.excelName = baseName;
                    }
                } else {
                    int dotIdx = lowerName.lastIndexOf('.');
                    if (dotIdx > 0) {
                        String ext = lowerName.substring(dotIdx + 1);
                        if (imageExts.contains(ext)) {
                            String styleNo = baseName.substring(0, baseName.lastIndexOf('.'));
                            result.imageMap.put(styleNo, bytes);
                        }
                    }
                }
                zis.closeEntry();
            }
        } catch (Exception e) {
            throw new RuntimeException("ZIP 文件解压失败: " + e.getMessage(), e);
        }
        return result;
    }

    private MultipartFile wrapAsMultipartFile(byte[] excelBytes, String excelName) {
        final byte[] finalBytes = excelBytes;
        final String finalName = excelName;
        return new MultipartFile() {
            @Override public String getName() { return "file"; }
            @Override public String getOriginalFilename() { return finalName; }
            @Override public String getContentType() { return "application/octet-stream"; }
            @Override public boolean isEmpty() { return finalBytes.length == 0; }
            @Override public long getSize() { return finalBytes.length; }
            @Override public byte[] getBytes() { return finalBytes; }
            @Override public InputStream getInputStream() { return new ByteArrayInputStream(finalBytes); }
            @Override public void transferTo(File dest) throws IOException {
                java.nio.file.Files.write(dest.toPath(), finalBytes);
            }
        };
    }

    private static class StyleImportResult {
        String styleNo;
        String styleName;
        boolean hasCover;
        boolean isUpdate;
        String imageError;
    }

    private StyleImportResult saveStyleFromZipRow(Long tenantId, Map<String, String> item, Map<String, byte[]> imageMap) {
        StyleImportResult result = new StyleImportResult();
        String styleNo = importHelper.safe(item.get("款号*"));
        if (!StringUtils.hasText(styleNo)) throw new IllegalArgumentException("款号不能为空");

        StyleInfo existing = styleInfoService.getOne(
                new LambdaQueryWrapper<StyleInfo>()
                        .eq(StyleInfo::getStyleNo, styleNo)
                        .eq(StyleInfo::getTenantId, tenantId)
                        .last("LIMIT 1"));

        StyleInfo style = existing != null ? existing : new StyleInfo();
        boolean isUpdate = existing != null;

        style.setStyleNo(styleNo);
        style.setStyleName(StringUtils.hasText(importHelper.safe(item.get("款名"))) ? importHelper.safe(item.get("款名")) : styleNo);
        style.setCategory(importHelper.safe(item.get("品类")));
        style.setColor(importHelper.safe(item.get("颜色")));
        style.setSize(importHelper.safe(item.get("码数")));
        style.setSeason(importHelper.safe(item.get("季节")));
        style.setCustomer(importHelper.safe(item.get("客户")));
        style.setDescription(StringUtils.hasText(importHelper.safe(item.get("描述"))) ? importHelper.safe(item.get("描述")) : "[ZIP导入]");
        BigDecimal price = importHelper.parseDecimal(item.get("单价"));
        if (price != null) style.setPrice(price);
        style.setUpdateTime(LocalDateTime.now());
        if (!isUpdate) {
            style.setYear(LocalDate.now().getYear());
            style.setMonth(LocalDate.now().getMonthValue());
            style.setStatus("ENABLED");
            style.setCreateTime(LocalDateTime.now());
        }

        boolean saved = isUpdate ? styleInfoService.updateById(style) : styleInfoService.save(style);
        if (!saved) throw new RuntimeException(isUpdate ? "更新失败" : "保存失败");
        if (isUpdate) log.info("[ZIP导入] 款号={} 已存在，执行覆盖更新", styleNo);

        result.styleNo = styleNo;
        result.styleName = style.getStyleName();
        result.isUpdate = isUpdate;
        result.hasCover = false;

        if (imageMap.containsKey(styleNo)) {
            result.imageError = uploadCoverImage(tenantId, style, styleNo, imageMap.get(styleNo), isUpdate);
            result.hasCover = style.getCover() != null;
        }
        return result;
    }

    private String uploadCoverImage(Long tenantId, StyleInfo style, String styleNo, byte[] imgBytes, boolean isUpdate) {
        try {
            String newFilename = UUID.randomUUID().toString() + ".jpg";
            String contentType = "image/jpeg";

            if (cosService.isEnabled()) {
                cosService.upload(tenantId, newFilename, imgBytes, contentType);
            } else {
                File dest = TenantFilePathResolver.resolveStoragePath(uploadPath, newFilename);
                java.nio.file.Files.write(dest.toPath(), imgBytes);
                cosService.safeRefreshTenantStorageUsage(tenantId);
            }
            String coverUrl = TenantFilePathResolver.buildDownloadUrl(newFilename);
            style.setCover(coverUrl);
            styleInfoService.updateById(style);

            if (isUpdate && style.getId() != null) {
                styleAttachmentService.remove(
                    new LambdaQueryWrapper<StyleAttachment>()
                        .eq(StyleAttachment::getStyleId, String.valueOf(style.getId()))
                        .eq(StyleAttachment::getBizType, "general")
                );
            }
            StyleAttachment attachment = new StyleAttachment();
            attachment.setStyleId(String.valueOf(style.getId()));
            attachment.setFileName(styleNo + ".jpg");
            attachment.setFileUrl(coverUrl);
            attachment.setFileType("image/jpeg");
            attachment.setBizType("general");
            attachment.setVersion(1);
            attachment.setCreateTime(LocalDateTime.now());
            styleAttachmentService.save(attachment);
            log.info("[ZIP导入] 款号={} 封面图已上传并写入附件记录: {}", styleNo, coverUrl);
            return null;
        } catch (Exception imgEx) {
            log.warn("[ZIP导入] 款号={} 封面图上传失败，跳过图片: {}", styleNo, imgEx.getMessage());
            return styleNo + ": " + imgEx.getMessage();
        }
    }

    private Map<String, Object> buildZipImportResult(int totalRows, List<Map<String, Object>> successRecords,
                                                      List<Map<String, Object>> failedRecords,
                                                      Map<String, byte[]> imageMap, List<String> imageErrors) {
        long withCover = successRecords.stream().filter(r -> Boolean.TRUE.equals(r.get("hasCover"))).count();
        Map<String, Object> result = importHelper.buildResult(totalRows, successRecords, failedRecords, "款式(ZIP)");
        result.put("imageCount", imageMap.size());
        result.put("withCoverCount", withCover);
        if (!imageErrors.isEmpty()) {
            result.put("imageErrors", imageErrors);
        }
        long updateCount = successRecords.stream().filter(r -> Boolean.TRUE.equals(r.get("isUpdate"))).count();
        if (updateCount > 0) {
            result.put("updateCount", updateCount);
        }
        String msg = (String) result.get("message");
        if (withCover > 0) msg = msg + "，共关联封面图 " + withCover + " 张";
        if (updateCount > 0) msg = msg + "（其中覆盖更新 " + updateCount + " 条）";
        result.put("message", msg);
        return result;
    }
}
