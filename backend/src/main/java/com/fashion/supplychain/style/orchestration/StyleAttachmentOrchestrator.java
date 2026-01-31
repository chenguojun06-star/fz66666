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

    /**     * 上传纸样文件并替换原有文件（用于资料中心）
     * 会删除原有的pattern类型文件，上传新文件
     */
    public StyleAttachment uploadAndReplacePattern(MultipartFile file, String styleId, String styleNo, String type) {
        log.info("======= 开始上传纸样文件 =======");
        log.info("styleId: {}", styleId);
        log.info("styleNo: {}", styleNo);
        log.info("type: {}", type);
        log.info("文件名: {}", file.getOriginalFilename());
        log.info("文件大小: {} bytes", file.getSize());
        log.info("uploadPath配置值: {}", uploadPath);

        if (file == null || file.isEmpty()) {
            log.error("文件为空");
            throw new IllegalArgumentException("文件为空");
        }
        if (!StringUtils.hasText(styleId)) {
            log.error("styleId为空");
            throw new IllegalArgumentException("styleId不能为空");
        }

        String bizType = StringUtils.hasText(type) ? type.trim() : "pattern";
        log.info("最终bizType: {}", bizType);

        try {
            // 1. 获取当前版本号
            List<StyleAttachment> existingPatterns = styleAttachmentService.listByStyleId(styleId.trim(), bizType);
            int nextVersion = 1;
            if (existingPatterns != null && !existingPatterns.isEmpty()) {
                // 找到最大版本号
                int maxVersion = existingPatterns.stream()
                    .mapToInt(a -> a.getVersion() == null ? 0 : a.getVersion())
                    .max()
                    .orElse(0);
                nextVersion = maxVersion + 1;

                // 将当前active的纸样改为archived（保留旧版本）
                for (StyleAttachment existing : existingPatterns) {
                    if ("active".equals(existing.getStatus())) {
                        existing.setStatus("archived");
                        styleAttachmentService.updateById(existing);
                    }
                }
            }

            // 2. 上传新文件
            log.info("开始保存文件到: {}", uploadPath);
            File dir = new File(uploadPath);
            log.info("目录是否存在: {}, 绝对路径: {}", dir.exists(), dir.getAbsolutePath());

            if (!dir.exists()) {
                log.info("目录不存在，开始创建...");
                boolean created = dir.mkdirs();
                log.info("目录创建结果: {}", created);
            }

            String originalFilename = file.getOriginalFilename();
            String safeOriginal = originalFilename == null ? "file" : originalFilename;
            int dot = safeOriginal.lastIndexOf('.');
            String extension = dot >= 0 ? safeOriginal.substring(dot) : "";

            String newFilename = UUID.randomUUID().toString() + extension;
            File dest = new File(dir, newFilename);
            log.info("目标文件路径: {}", dest.getAbsolutePath());

            file.transferTo(dest);
            log.info("文件保存成功");

            // 3. 创建新记录
            log.info("开始创建数据库记录...");
            StyleAttachment attachment = new StyleAttachment();
            attachment.setId(UUID.randomUUID().toString());
            attachment.setStyleId(styleId);
            attachment.setBizType(bizType);
            attachment.setFileName(safeOriginal);
            attachment.setFileUrl("/upload/" + newFilename);
            attachment.setFileSize(file.getSize());
            attachment.setFileType(extension.length() > 1 ? extension.substring(1) : "");
            attachment.setCreateTime(LocalDateTime.now());
            attachment.setVersion(nextVersion);
            attachment.setStatus("active");

            // 获取当前用户作为维护人
            String currentUser = UserContext.username();
            log.info("当前用户: {}", currentUser);
            if (StringUtils.hasText(currentUser)) {
                attachment.setUploader(currentUser);
            }

            log.info("开始保存到数据库...");
            boolean saved = styleAttachmentService.save(attachment);
            log.info("数据库保存结果: {}", saved);

            if (!saved) {
                throw new IllegalStateException("保存附件失败");
            }

            log.info("纸样文件上传完成，附件ID: {}", attachment.getId());
            return attachment;
        } catch (Exception e) {
            log.error("上传纸样文件失败: " + e.getMessage(), e);
            throw new RuntimeException("上传失败: " + e.getMessage());
        }
    }

    /**     * 检查纸样是否齐全
     */
    public Map<String, Object> checkPatternComplete(String styleId) {
        Map<String, Object> result = new java.util.HashMap<>();
        List<String> missingItems = new java.util.ArrayList<>();
        result.put("complete", false);
        result.put("missingItems", missingItems);

        if (!StringUtils.hasText(styleId)) {
            missingItems.add("styleId不能为空");
            return result;
        }

        StyleAttachment pattern = styleAttachmentService.getLatestPattern(styleId, "pattern");
        if (pattern == null) {
            missingItems.add("纸样文件");
        }

        // 放码纸样改为可选（不再强制要求）
        StyleAttachment grading = styleAttachmentService.getLatestPattern(styleId, "pattern_grading");

        result.put("complete", missingItems.isEmpty());
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
