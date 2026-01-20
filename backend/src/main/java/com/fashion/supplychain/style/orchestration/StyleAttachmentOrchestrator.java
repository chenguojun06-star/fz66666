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

            if ("pattern".equalsIgnoreCase(type) && !isAllowedPatternExtension(extension)) {
                throw new IllegalArgumentException("纸样文件仅支持dxf/plt/ets格式");
            }

            String newFilename = UUID.randomUUID().toString() + extension;
            File dest = new File(dir, newFilename);
            file.transferTo(dest);

            StyleAttachment attachment = new StyleAttachment();
            attachment.setStyleId(styleId);
            attachment.setFileName(safeOriginal);
            attachment.setFileUrl("/api/common/download/" + newFilename);
            String contentType = file.getContentType();
            attachment.setFileType(contentType);
            attachment.setBizType(type);
            attachment.setFileSize(file.getSize());
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
