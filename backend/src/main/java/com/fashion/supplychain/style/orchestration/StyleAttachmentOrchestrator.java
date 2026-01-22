package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.io.File;
import java.nio.file.Files;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Service
@Slf4j
public class StyleAttachmentOrchestrator {

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Value("${fashion.upload-path}")
    private String uploadPath;

    public List<StyleAttachment> list(String styleId, String styleNo, String bizType) {
        String sid = styleId;
        if (!StringUtils.hasText(sid) && StringUtils.hasText(styleNo)) {
            StyleInfo style = styleInfoService.lambdaQuery().eq(StyleInfo::getStyleNo, styleNo.trim()).one();
            if (style == null) {
                throw new NoSuchElementException("款号不存在");
            }
            sid = String.valueOf(style.getId());
        }

        if (!StringUtils.hasText(sid)) {
            throw new IllegalArgumentException("缺少参数 styleId 或 styleNo");
        }

        String type = StringUtils.hasText(bizType) ? bizType.trim() : null;
        return styleAttachmentService.listByStyleId(sid.trim(), type);
    }

    public StyleAttachment upload(MultipartFile file, String styleId, String bizType) {
        return uploadWithVersion(file, styleId, bizType, null);
    }

    public StyleAttachment uploadWithVersion(MultipartFile file, String styleId, String bizType, String versionRemark) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件为空");
        }
        if (!StringUtils.hasText(styleId)) {
            throw new IllegalArgumentException("styleId不能为空");
        }

        String type = StringUtils.hasText(bizType) ? bizType.trim() : "general";
        if ("pattern".equalsIgnoreCase(type) && isPatternLocked(styleId)) {
            throw new IllegalStateException("纸样已完成，无法修改，请先回退");
        }

        try {
            File dir = new File(uploadPath);
            if (!dir.exists()) {
                dir.mkdirs();
            }

            String originalFilename = file.getOriginalFilename();
            String safeOriginal = originalFilename == null ? "file" : originalFilename;
            int dot = safeOriginal.lastIndexOf('.');
            String extension = dot >= 0 ? safeOriginal.substring(dot) : "";

            if (("pattern".equalsIgnoreCase(type) || "pattern_grading".equalsIgnoreCase(type)) 
                    && !isAllowedPatternExtension(extension)) {
                throw new IllegalArgumentException("纸样文件仅支持dxf/plt/ets格式");
            }

            String newFilename = UUID.randomUUID().toString() + extension;
            File dest = new File(dir, newFilename);
            file.transferTo(dest);

            // 获取当前版本号
            StyleAttachment latest = styleAttachmentService.getLatestPattern(styleId, type);
            int nextVersion = 1;
            String parentId = null;
            if (latest != null) {
                nextVersion = (latest.getVersion() == null ? 1 : latest.getVersion()) + 1;
                parentId = latest.getId();
                // 将旧版本状态改为archived
                latest.setStatus("archived");
                styleAttachmentService.updateById(latest);
            }

            StyleAttachment attachment = new StyleAttachment();
            attachment.setStyleId(styleId);
            attachment.setFileName(safeOriginal);
            attachment.setFileUrl("/api/common/download/" + newFilename);
            String contentType = file.getContentType();
            attachment.setFileType(contentType);
            attachment.setBizType(type);
            attachment.setFileSize(file.getSize());
            attachment.setVersion(nextVersion);
            attachment.setVersionRemark(StringUtils.hasText(versionRemark) ? versionRemark.trim() : null);
            attachment.setStatus("active");
            attachment.setParentId(parentId);
            UserContext ctx = UserContext.get();
            attachment.setUploader(ctx != null ? ctx.getUsername() : null);
            attachment.setCreateTime(LocalDateTime.now());

            styleAttachmentService.save(attachment);

            if (contentType != null && contentType.startsWith("image/")) {
                try {
                    Long sid = Long.valueOf(styleId);
                    styleInfoService.lambdaUpdate()
                            .eq(StyleInfo::getId, sid)
                            .set(StyleInfo::getCover, attachment.getFileUrl())
                            .update();
                } catch (Exception e) {
                    log.warn("Failed to update style cover: styleId={}, fileUrl={}", styleId, attachment.getFileUrl(),
                            e);
                }
            }

            return attachment;
        } catch (Exception e) {
            log.error("Upload style attachment failed: styleId={}, bizType={}, fileName={}", styleId, bizType,
                    file == null ? null : file.getOriginalFilename(), e);
            throw new IllegalStateException("文件上传失败");
        }
    }

    public StyleAttachment saveGenerated(byte[] content, String fileName, String styleId, String bizType,
            String contentType) {
        if (content == null) {
            throw new IllegalArgumentException("内容为空");
        }
        if (!StringUtils.hasText(styleId)) {
            throw new IllegalArgumentException("styleId不能为空");
        }

        String type = StringUtils.hasText(bizType) ? bizType.trim() : "general";
        if ("pattern".equalsIgnoreCase(type) && isPatternLocked(styleId)) {
            throw new IllegalStateException("纸样已完成，无法修改，请先回退");
        }

        String safeName = StringUtils.hasText(fileName) ? fileName.trim() : "file";
        int dot = safeName.lastIndexOf('.');
        String extension = dot >= 0 ? safeName.substring(dot) : "";

        try {
            File dir = new File(uploadPath);
            if (!dir.exists()) {
                dir.mkdirs();
            }

            String newFilename = UUID.randomUUID().toString() + extension;
            File dest = new File(dir, newFilename);
            Files.write(dest.toPath(), content);

            StyleAttachment attachment = new StyleAttachment();
            attachment.setStyleId(styleId);
            attachment.setFileName(safeName);
            attachment.setFileUrl("/api/common/download/" + newFilename);
            attachment.setFileType(StringUtils.hasText(contentType) ? contentType.trim() : "application/octet-stream");
            attachment.setBizType(type);
            attachment.setFileSize((long) content.length);
            UserContext ctx = UserContext.get();
            attachment.setUploader(ctx != null ? ctx.getUsername() : null);
            attachment.setCreateTime(LocalDateTime.now());

            styleAttachmentService.save(attachment);
            return attachment;
        } catch (Exception e) {
            log.error("Save generated style attachment failed: styleId={}, bizType={}, fileName={}", styleId, bizType,
                    safeName, e);
            throw new IllegalStateException("文件生成失败");
        }
    }

    public boolean delete(String id) {
        StyleAttachment current = styleAttachmentService.getById(id);
        if (current == null) {
            throw new NoSuchElementException("附件不存在");
        }
        String type = StringUtils.hasText(current.getBizType()) ? current.getBizType().trim() : null;
        if ("pattern".equalsIgnoreCase(type) && isPatternLocked(String.valueOf(current.getStyleId()))) {
            throw new IllegalStateException("纸样已完成，无法修改，请先回退");
        }
        boolean ok = styleAttachmentService.removeById(id);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        return true;
    }

    /**
     * 获取纸样版本历史
     */
    public List<StyleAttachment> listPatternVersions(String styleId, String bizType) {
        return styleAttachmentService.listPatternVersions(styleId, bizType);
    }

    /**
     * 检查纸样是否齐全
     */
    public Map<String, Object> checkPatternComplete(String styleId) {
        Map<String, Object> result = new java.util.HashMap<>();
        result.put("complete", false);
        result.put("missingItems", new java.util.ArrayList<>());

        if (!StringUtils.hasText(styleId)) {
            ((List<String>) result.get("missingItems")).add("styleId不能为空");
            return result;
        }

        List<String> missing = new java.util.ArrayList<>();
        StyleAttachment pattern = styleAttachmentService.getLatestPattern(styleId, "pattern");
        if (pattern == null) {
            missing.add("纸样文件");
        }

        StyleAttachment grading = styleAttachmentService.getLatestPattern(styleId, "pattern_grading");
        if (grading == null) {
            missing.add("放码文件");
        }

        result.put("missingItems", missing);
        result.put("complete", missing.isEmpty());
        result.put("patternFile", pattern);
        result.put("gradingFile", grading);
        return result;
    }

    /**
     * 将纸样资料流回资料中心（按款号）
     */
    public boolean flowPatternToDataCenter(String styleId) {
        if (!StringUtils.hasText(styleId)) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        // 检查纸样是否齐全
        Map<String, Object> check = checkPatternComplete(styleId);
        if (!(Boolean) check.get("complete")) {
            throw new IllegalStateException("纸样资料不齐全，无法流回资料中心");
        }

        // 标记纸样为最终版本（pattern_final）
        StyleAttachment pattern = (StyleAttachment) check.get("patternFile");
        StyleAttachment grading = (StyleAttachment) check.get("gradingFile");

        if (pattern != null) {
            pattern.setBizType("pattern_final");
            styleAttachmentService.updateById(pattern);
        }
        if (grading != null) {
            grading.setBizType("pattern_grading_final");
            styleAttachmentService.updateById(grading);
        }

        log.info("Pattern files flowed to data center: styleId={}", styleId);
        return true;
    }

    private boolean isAllowedPatternExtension(String extension) {
        String ext = extension == null ? "" : extension.trim().toLowerCase();
        return ".dxf".equals(ext) || ".plt".equals(ext) || ".ets".equals(ext);
    }

    private boolean isPatternLocked(String styleId) {
        if (!StringUtils.hasText(styleId)) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        Long sid;
        try {
            sid = Long.valueOf(styleId.trim());
        } catch (Exception e) {
            throw new IllegalArgumentException("styleId参数错误");
        }
        StyleInfo style = styleInfoService.getById(sid);
        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }
        return styleInfoService.isPatternLocked(sid);
    }
}
