package com.fashion.supplychain.style.orchestration;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.tenant.TenantFilePathResolver;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleAttachmentService;
import com.fashion.supplychain.style.service.StyleInfoService;
import java.io.File;
import java.nio.file.Files;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
@Slf4j
public class StyleAttachmentOrchestrator {

    @Autowired
    private StyleAttachmentService styleAttachmentService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private com.fashion.supplychain.common.CosService cosService;

    @Value("${fashion.upload-path}")
    private String uploadPath;

    public List<StyleAttachment> list(String styleId, String styleNo, String bizType) {
        String sid = normalizeNullable(styleId);
        String normalizedStyleNo = normalizeNullable(styleNo);
        if (!StringUtils.hasText(sid) && StringUtils.hasText(normalizedStyleNo)) {
            StyleInfo style = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
                    .select(StyleInfo::getId)
                    .eq(StyleInfo::getStyleNo, normalizedStyleNo)
                    .last("limit 1"), false);
            if (style == null || style.getId() == null) {
                // 款式不存在时返回空列表，而非 404（前端可能在款式创建完成前就查询附件）
                return new ArrayList<>();
            }
            sid = String.valueOf(style.getId());
        }

        if (!StringUtils.hasText(sid)) {
            throw new IllegalArgumentException("缺少参数 styleId 或 styleNo");
        }

        String type = StringUtils.hasText(bizType) ? bizType.trim() : null;

        // 纸样 / 放码纸样 展示时，同时包含已流转版本（*_final）避免样衣完成后附件消失
        if ("pattern".equals(type)) {
            List<StyleAttachment> base = styleAttachmentService.listByStyleId(sid.trim(), "pattern");
            List<StyleAttachment> finalFiles = styleAttachmentService.listByStyleId(sid.trim(), "pattern_final");
            if (!finalFiles.isEmpty()) {
                List<StyleAttachment> merged = new ArrayList<>(base);
                merged.addAll(finalFiles);
                return merged;
            }
            return base;
        }
        if ("pattern_grading".equals(type)) {
            List<StyleAttachment> base = styleAttachmentService.listByStyleId(sid.trim(), "pattern_grading");
            List<StyleAttachment> finalFiles = styleAttachmentService.listByStyleId(sid.trim(), "pattern_grading_final");
            if (!finalFiles.isEmpty()) {
                List<StyleAttachment> merged = new ArrayList<>(base);
                merged.addAll(finalFiles);
                return merged;
            }
            return base;
        }
        return styleAttachmentService.listByStyleId(sid.trim(), type);
    }

    public StyleAttachment upload(MultipartFile file, String styleId, String bizType) {
        return upload(file, styleId, null, bizType);
    }

    public StyleAttachment upload(MultipartFile file, String styleId, String styleNo, String bizType) {
        return uploadWithVersion(file, styleId, styleNo, bizType, null);
    }

    @Transactional(rollbackFor = Exception.class)
    public StyleAttachment uploadWithVersion(MultipartFile file, String styleId, String bizType, String versionRemark) {
        return uploadWithVersion(file, styleId, null, bizType, versionRemark);
    }

    @Transactional(rollbackFor = Exception.class)
    public StyleAttachment uploadWithVersion(MultipartFile file, String styleId, String styleNo, String bizType,
            String versionRemark) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件为空");
        }
        String resolvedStyleId = resolveStyleId(styleId, styleNo);

        // ✅ 租户上下文校验
        TenantAssert.assertTenantContext();

        String type = StringUtils.hasText(bizType) ? bizType.trim() : "general";
        // 纸样锁定检查已移除：全部开放，不限制已完成状态的款式上传

        try {
            String originalFilename = file.getOriginalFilename();
            String safeOriginal = originalFilename == null ? "file" : originalFilename;
            int dot = safeOriginal.lastIndexOf('.');
            String extension = dot >= 0 ? safeOriginal.substring(dot) : "";

            String newFilename = UUID.randomUUID().toString() + extension;
            String extForCheck = extension.length() > 1 ? extension.substring(1).toLowerCase() : "";
            if (!extForCheck.isEmpty() && !isAllowedExtension(extForCheck)) {
                throw new IllegalArgumentException("不支持的文件类型: " + extension);
            }
            if (cosService.isEnabled()) {
                cosService.upload(com.fashion.supplychain.common.UserContext.tenantId(), newFilename, file);
            } else {
                File dest = TenantFilePathResolver.resolveStoragePath(uploadPath, newFilename);
                file.transferTo(dest);
                cosService.safeRefreshTenantStorageUsage(com.fashion.supplychain.common.UserContext.tenantId());
            }

            StyleAttachment latest = styleAttachmentService.getLatestPattern(resolvedStyleId, type);
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
            attachment.setStyleId(resolvedStyleId);
            attachment.setFileName(safeOriginal);
            attachment.setFileUrl(TenantFilePathResolver.buildDownloadUrl(newFilename));
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
                    Long sid = Long.valueOf(resolvedStyleId);
                    styleInfoService.lambdaUpdate()
                            .eq(StyleInfo::getId, sid)
                            .set(StyleInfo::getCover, attachment.getFileUrl())
                            .update();
                } catch (Exception e) {
                    log.warn("Failed to update style cover: styleId={}, fileUrl={}", resolvedStyleId,
                            attachment.getFileUrl(),
                            e);
                }
            }

            return attachment;
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.error("Upload style attachment failed: styleId={}, styleNo={}, bizType={}, fileName={}",
                    resolvedStyleId, styleNo, bizType, file == null ? null : file.getOriginalFilename(), e);
            throw new IllegalStateException(StringUtils.hasText(e.getMessage()) ? e.getMessage() : "文件上传失败");
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
        // 纸样锁定检查已移除：全部开放

        String safeName = StringUtils.hasText(fileName) ? fileName.trim() : "file";
        int dot = safeName.lastIndexOf('.');
        String extension = dot >= 0 ? safeName.substring(dot) : "";

        try {
            // ✅ 租户上下文校验
            TenantAssert.assertTenantContext();

            String newFilename = UUID.randomUUID().toString() + extension;
            // ✅ 存储文件：COS 优先，本地降级
            Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
            if (cosService.isEnabled()) {
                String ct = StringUtils.hasText(contentType) ? contentType.trim() : "application/octet-stream";
                cosService.upload(tenantId, newFilename, content, ct);
            } else {
                File dest = TenantFilePathResolver.resolveStoragePath(uploadPath, newFilename);
                Files.write(dest.toPath(), content);
                cosService.safeRefreshTenantStorageUsage(tenantId);
            }

            StyleAttachment attachment = new StyleAttachment();
            attachment.setStyleId(styleId);
            attachment.setFileName(safeName);
            attachment.setFileUrl(TenantFilePathResolver.buildDownloadUrl(newFilename));
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
        StyleInfo style = null;
        try {
            style = styleInfoService.getById(Long.valueOf(String.valueOf(current.getStyleId())));
        } catch (Exception e) { log.debug("Non-critical error: {}", e.getMessage()); }
        String type = StringUtils.hasText(current.getBizType()) ? current.getBizType().trim() : null;
        // 纸样锁定检查已移除：全部开放
        boolean ok = styleAttachmentService.removeById(id);
        if (!ok) {
            if (styleAttachmentService.getById(id) == null) {
                log.warn("[ATTACHMENT-DELETE] id={} already deleted, idempotent success", id);
                return true;
            }
            throw new IllegalStateException("删除失败");
        }
        String currentCover = style == null ? null : style.getCover();
        if (StringUtils.hasText(currentCover) && currentCover.trim().equals(String.valueOf(current.getFileUrl()).trim())) {
            List<StyleAttachment> remainingImages = styleAttachmentService.listByStyleId(String.valueOf(current.getStyleId()))
                    .stream()
                    .filter(item -> item != null && StringUtils.hasText(item.getFileType()) && item.getFileType().contains("image"))
                    .toList();
            String nextCover = remainingImages.isEmpty() ? null : remainingImages.get(0).getFileUrl();
            try {
                styleInfoService.lambdaUpdate()
                        .eq(StyleInfo::getId, Long.valueOf(String.valueOf(current.getStyleId())))
                        .set(StyleInfo::getCover, nextCover)
                        .update();
            } catch (Exception e) {
                log.warn("[ATTACHMENT-DELETE] 封面重置失败: styleId={}, nextCover={}", current.getStyleId(), nextCover, e);
            }
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
    @Transactional(rollbackFor = Exception.class)
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

        // ✅ 租户上下文校验
        TenantAssert.assertTenantContext();

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

            // 2. 上传新文件（✅ 存储到租户子目录）
            String originalFilename = file.getOriginalFilename();
            String safeOriginal = originalFilename == null ? "file" : originalFilename;
            int dot = safeOriginal.lastIndexOf('.');
            String extension = dot >= 0 ? safeOriginal.substring(dot) : "";

            String newFilename = UUID.randomUUID().toString() + extension;
            String extForCheck = extension.length() > 1 ? extension.substring(1).toLowerCase() : "";
            if (!extForCheck.isEmpty() && !isAllowedExtension(extForCheck)) {
                throw new IllegalArgumentException("不支持的文件类型: " + extension);
            }
            if (cosService.isEnabled()) {
                cosService.upload(com.fashion.supplychain.common.UserContext.tenantId(), newFilename, file);
            } else {
                File dest = TenantFilePathResolver.resolveStoragePath(uploadPath, newFilename);
                log.info("目标文件路径: {}", dest.getAbsolutePath());
                file.transferTo(dest);
                cosService.safeRefreshTenantStorageUsage(com.fashion.supplychain.common.UserContext.tenantId());
            }
            log.info("文件保存成功");

            // 3. 创建新记录
            log.info("开始创建数据库记录...");
            StyleAttachment attachment = new StyleAttachment();
            attachment.setId(UUID.randomUUID().toString());
            attachment.setStyleId(styleId);
            attachment.setBizType(bizType);
            attachment.setFileName(safeOriginal);
            // ✅ 统一使用租户隔离 URL 格式
            attachment.setFileUrl(TenantFilePathResolver.buildDownloadUrl(newFilename));
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

        // 优先查开发中的纸样文件（pattern），不存在则检查已流转版本（pattern_final）
        StyleAttachment pattern = styleAttachmentService.getLatestPattern(styleId, "pattern");
        if (pattern == null) {
            pattern = styleAttachmentService.getLatestPattern(styleId, "pattern_final");
        }
        if (pattern == null) {
            missingItems.add("纸样文件");
        }

        // 放码纸样改为可选（不再强制要求）
        StyleAttachment grading = styleAttachmentService.getLatestPattern(styleId, "pattern_grading");
        if (grading == null) {
            grading = styleAttachmentService.getLatestPattern(styleId, "pattern_grading_final");
        }

        result.put("complete", missingItems.isEmpty());
        result.put("patternFile", pattern);
        result.put("gradingFile", grading);
        return result;
    }

    /**
     * 将纸样资料流回资料中心（按款号）
     */
    @Transactional(rollbackFor = Exception.class)
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

        // 幂等处理：如果文件已经是 final 类型（样衣完成时已流转），直接跳过更新
        if (pattern != null && !"pattern_final".equals(pattern.getBizType())) {
            pattern.setBizType("pattern_final");
            styleAttachmentService.updateById(pattern);
        }
        if (grading != null && !"pattern_grading_final".equals(grading.getBizType())) {
            grading.setBizType("pattern_grading_final");
            styleAttachmentService.updateById(grading);
        }

        log.info("Pattern files flowed to data center: styleId={}, patternAlreadyFinal={}", styleId,
                pattern != null && "pattern_final".equals(pattern.getBizType()));
        return true;
    }

    /**
     * 将指定附件设置为款式封面（主图）
     * 前端"设为主图"按钮调用此方法，确保封面持久化到 t_style_info.cover
     */
    public boolean setCoverFromAttachment(String attachmentId) {
        if (!StringUtils.hasText(attachmentId)) {
            throw new IllegalArgumentException("attachmentId不能为空");
        }
        StyleAttachment attachment = styleAttachmentService.getById(attachmentId.trim());
        if (attachment == null) {
            throw new NoSuchElementException("附件不存在：" + attachmentId);
        }
        TenantAssert.assertTenantContext();
        try {
            Long sid = Long.valueOf(attachment.getStyleId());
            styleInfoService.lambdaUpdate()
                    .eq(StyleInfo::getId, sid)
                    .set(StyleInfo::getCover, attachment.getFileUrl())
                    .update();
            log.info("[StyleAttachment] 封面已更新: styleId={}, fileUrl={}", sid, attachment.getFileUrl());
            return true;
        } catch (Exception e) {
            log.error("[StyleAttachment] 设置封面失败: attachmentId={}", attachmentId, e);
            throw new IllegalStateException("设置封面失败：" + e.getMessage());
        }
    }

    private String resolveStyleId(String styleId, String styleNo) {
        String normalizedStyleId = normalizeNullable(styleId);
        if (StringUtils.hasText(normalizedStyleId)) {
            return normalizedStyleId;
        }

        String normalizedStyleNo = normalizeNullable(styleNo);
        if (!StringUtils.hasText(normalizedStyleNo)) {
            throw new IllegalArgumentException("请先保存基础信息，再上传图片");
        }

        StyleInfo style = styleInfoService.getOne(new LambdaQueryWrapper<StyleInfo>()
                .select(StyleInfo::getId)
                .eq(StyleInfo::getStyleNo, normalizedStyleNo)
                .last("limit 1"), false);
        if (style == null || style.getId() == null) {
            throw new IllegalArgumentException("请先保存基础信息，再上传图片");
        }
        return String.valueOf(style.getId());
    }

    private String normalizeNullable(String value) {
        String normalized = value == null ? null : value.trim();
        if (!StringUtils.hasText(normalized)) {
            return null;
        }
        if ("undefined".equalsIgnoreCase(normalized) || "null".equalsIgnoreCase(normalized)) {
            return null;
        }
        return normalized;
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

    private static final java.util.Set<String> UPLOAD_ALLOWED_EXTENSIONS = java.util.Set.of(
            "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg",
            "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "json", "xml",
            "zip", "rar", "7z",
            "mp4", "mp3", "wav", "avi",
            "dxf", "plt", "ets", "prj"
    );

    private boolean isAllowedExtension(String ext) {
        return UPLOAD_ALLOWED_EXTENSIONS.contains(ext);
    }

    @Transactional(rollbackFor = Exception.class)
    public StyleAttachment uploadSupplement(MultipartFile file, String styleId, String styleNo) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件为空");
        }
        String resolvedStyleId = resolveStyleId(styleId, styleNo);
        TenantAssert.assertTenantContext();

        try {
            String originalFilename = file.getOriginalFilename();
            String safeOriginal = originalFilename == null ? "file" : originalFilename;
            int dot = safeOriginal.lastIndexOf('.');
            String extension = dot >= 0 ? safeOriginal.substring(dot) : "";

            String newFilename = UUID.randomUUID().toString() + extension;
            String extForCheck = extension.length() > 1 ? extension.substring(1).toLowerCase() : "";
            if (!extForCheck.isEmpty() && !isAllowedExtension(extForCheck)) {
                throw new IllegalArgumentException("不支持的文件类型: " + extension);
            }
            if (cosService.isEnabled()) {
                cosService.upload(com.fashion.supplychain.common.UserContext.tenantId(), newFilename, file);
            } else {
                File dest = TenantFilePathResolver.resolveStoragePath(uploadPath, newFilename);
                file.transferTo(dest);
                cosService.safeRefreshTenantStorageUsage(com.fashion.supplychain.common.UserContext.tenantId());
            }

            StyleAttachment attachment = new StyleAttachment();
            attachment.setStyleId(resolvedStyleId);
            attachment.setFileName(safeOriginal);
            attachment.setFileUrl(TenantFilePathResolver.buildDownloadUrl(newFilename));
            attachment.setFileType(file.getContentType());
            attachment.setBizType("pattern_supplement");
            attachment.setFileSize(file.getSize());
            attachment.setVersion(1);
            attachment.setStatus("active");
            UserContext ctx = UserContext.get();
            attachment.setUploader(ctx != null ? ctx.getUsername() : null);
            attachment.setCreateTime(LocalDateTime.now());

            styleAttachmentService.save(attachment);
            return attachment;
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.error("Upload supplement pattern failed: styleId={}, styleNo={}", styleId, styleNo, e);
            throw new IllegalStateException("补充纸样上传失败");
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public StyleAttachment claimSupplement(String id) {
        StyleAttachment attachment = styleAttachmentService.getById(id);
        if (attachment == null) {
            throw new NoSuchElementException("附件不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(attachment.getTenantId(), "纸样附件");
        UserContext ctx = UserContext.get();
        attachment.setClaimTime(LocalDateTime.now());
        attachment.setClaimUser(ctx != null ? ctx.getUsername() : null);
        styleAttachmentService.updateById(attachment);
        return attachment;
    }

    @Transactional(rollbackFor = Exception.class)
    public StyleAttachment completeSupplement(String id) {
        StyleAttachment attachment = styleAttachmentService.getById(id);
        if (attachment == null) {
            throw new NoSuchElementException("附件不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(attachment.getTenantId(), "纸样附件");
        attachment.setCompleteTime(LocalDateTime.now());
        styleAttachmentService.updateById(attachment);
        return attachment;
    }
}
