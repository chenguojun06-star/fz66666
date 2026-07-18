package com.fashion.supplychain.common;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.tenant.TenantFilePathResolver;
import org.slf4j.Logger;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Set;
import java.util.UUID;

@RestController
@RequestMapping("/api/common")
@Slf4j
@PreAuthorize("isAuthenticated()")
public class CommonController {

    private static final Logger logger = log;

    private static final Set<String> ALLOWED_EXTENSIONS = Set.of(
            ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg",
            ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
            ".zip", ".rar", ".7z",
            ".txt", ".csv", ".json", ".xml",
            ".mp4", ".mp3", ".wav", ".avi",
            ".dxf", ".plt", ".ets", ".prj"
    );

    private static final long MAX_FILE_SIZE = 10 * 1024 * 1024;

    @Value("${fashion.upload-path}")
    private String uploadPath;

    @Autowired
    private CosService cosService;

    /**
     * 通用文件上传（租户隔离版本）
     * 文件自动存储到 tenants/{tenantId}/ 子目录
     * 返回的 URL 为 /api/file/tenant-download/{tenantId}/{filename}
     */
    @PostMapping("/upload")
    public Result<String> upload(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Result.badRequest("文件为空");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            return Result.badRequest("文件大小超过10MB限制");
        }
        try {
            TenantAssert.assertTenantContext();

            String originalFilename = file.getOriginalFilename();
            String safeOriginal = originalFilename == null ? "file" : originalFilename;
            int dot = safeOriginal.lastIndexOf('.');
            String extension = dot >= 0 ? safeOriginal.substring(dot).toLowerCase() : "";
            if (!ALLOWED_EXTENSIONS.contains(extension)) {
                return Result.badRequest("不支持的文件类型: " + extension + "，允许的类型: " + ALLOWED_EXTENSIONS);
            }
            String newFilename = UUID.randomUUID().toString() + extension;

            byte[] fileBytes = file.getBytes();
            if (isImageExtension(extension)) {
                byte[] compressed = compressImage(fileBytes, extension);
                if (compressed.length < fileBytes.length) {
                    fileBytes = compressed;
                }
            }

            if (cosService.isEnabled()) {
                Long tenantId = UserContext.tenantId();
                cosService.upload(tenantId, newFilename, fileBytes, file.getContentType());
            } else {
                File dest = TenantFilePathResolver.resolveStoragePath(uploadPath, newFilename);
                java.nio.file.Files.write(dest.toPath(), fileBytes);
                cosService.safeRefreshTenantStorageUsage(UserContext.tenantId());
            }

            // ✅ 返回租户隔离的 URL
            String url = TenantFilePathResolver.buildDownloadUrl(newFilename);
            return Result.success(url);
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg == null || msg.trim().isEmpty()) {
                msg = "上传失败";
            }
            return Result.fail(msg);
        }
    }

    /**
     * 通用文件下载（旧端点，保留用于兼容旧数据）
     *
     * ⚠️ 已改为需要认证 + 租户校验
     * 新上传的文件请使用 /api/file/tenant-download/{tenantId}/{fileName}
     *
     * 旧文件（无租户前缀）：从根目录查找，仅允许已认证用户访问
     * 新文件（有租户前缀）：重定向到新端点
     */
    @GetMapping("/download/{fileName:.+}")
    @PreAuthorize("isAuthenticated() and (T(com.fashion.supplychain.common.UserContext).isTopAdmin() or hasAuthority('ROLE_SUPER_ADMIN'))")
    @SuppressWarnings("null")
    public ResponseEntity<Resource> downloadFile(@PathVariable String fileName,
            @RequestParam(value = "download", required = false, defaultValue = "0") String download) {
        try {
            Path baseDir = Path.of(uploadPath).toAbsolutePath().normalize();
            Path filePath = baseDir.resolve(fileName).normalize();
            if (!filePath.startsWith(baseDir)) {
                return ResponseEntity.notFound().build();
            }

            Resource resource = new UrlResource(filePath.toUri());

            if (!resource.exists()) {
                Long tenantId = UserContext.tenantId();
                if (tenantId != null) {
                    Path tenantPath = baseDir.resolve("tenants").resolve(String.valueOf(tenantId)).resolve(fileName).normalize();
                    if (tenantPath.startsWith(baseDir)) {
                        resource = new UrlResource(tenantPath.toUri());
                        filePath = tenantPath;
                    }
                }
            }

            if (!resource.exists()) {
                return ResponseEntity.notFound().build();
            }

            Long fileTenantId = TenantFilePathResolver.extractTenantIdFromDiskPath(uploadPath, filePath.toString());
            if (fileTenantId != null) {
                try {
                    TenantFilePathResolver.validateTenantAccess(fileTenantId);
                } catch (Exception e) {
                    logger.warn("[旧下载端点-租户隔离] 跨租户文件访问被拒绝: currentUser={}, fileTenant={}, fileName={}",
                            UserContext.tenantId(), fileTenantId, fileName);
                    return ResponseEntity.status(403).build();
                }
            } else {
                logger.info("[旧下载端点-租户隔离] 管理员访问旧格式文件: user={}, tenantId={}, fileName={}",
                        UserContext.username(), UserContext.tenantId(), fileName);
            }

            return buildFileResponse(resource, filePath, download);
        } catch (MalformedURLException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * 构建文件响应（公共方法，供新旧两个端点共用）
     */
    static ResponseEntity<Resource> buildFileResponse(Resource resource, Path filePath, String download) {
        String contentType = null;
        try {
            contentType = Files.probeContentType(filePath);
        } catch (IOException e) {
            logger.debug("[Common] 文件类型探测失败: {}", e.getMessage());
        }
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        if (contentType != null && !contentType.trim().isEmpty()) {
            try {
                mediaType = MediaType.parseMediaType(contentType);
            } catch (Exception e) {
                logger.debug("[Common] MediaType解析失败: {}", e.getMessage());
            }
        }

        boolean inline = contentType != null && (
                contentType.startsWith("image/")
                        || contentType.startsWith("text/")
                        || "application/pdf".equalsIgnoreCase(contentType)
        );

        boolean forceDownload = download != null && ("1".equals(download.trim())
                || "true".equalsIgnoreCase(download.trim())
                || "yes".equalsIgnoreCase(download.trim()));
        if (forceDownload) {
            inline = false;
        }

        return ResponseEntity.ok()
                .contentType(mediaType)
                .header(HttpHeaders.CONTENT_DISPOSITION, (inline ? "inline" : "attachment") + "; filename=\"" + resource.getFilename() + "\"")
                .body(resource);
    }

    private byte[] compressImage(byte[] originalBytes, String extension) {
        try {
            javax.imageio.ImageIO.setUseCache(false);
            java.awt.image.BufferedImage originalImage = javax.imageio.ImageIO.read(
                new java.io.ByteArrayInputStream(originalBytes));
            if (originalImage == null) {
                return originalBytes;
            }
            int width = originalImage.getWidth();
            int height = originalImage.getHeight();
            int maxDimension = 1920;
            if (width <= maxDimension && height <= maxDimension) {
                return originalBytes;
            }
            double scale = Math.min((double) maxDimension / width, (double) maxDimension / height);
            int newWidth = (int) (width * scale);
            int newHeight = (int) (height * scale);
            boolean hasAlpha = originalImage.getColorModel() != null && originalImage.getColorModel().hasAlpha();
            int imageType = hasAlpha ? java.awt.image.BufferedImage.TYPE_INT_ARGB : java.awt.image.BufferedImage.TYPE_INT_RGB;
            java.awt.image.BufferedImage resized = new java.awt.image.BufferedImage(
                newWidth, newHeight, imageType);
            java.awt.Graphics2D g = resized.createGraphics();
            if (!hasAlpha) {
                g.setColor(java.awt.Color.WHITE);
                g.fillRect(0, 0, newWidth, newHeight);
            }
            g.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION,
                java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.drawImage(originalImage, 0, 0, newWidth, newHeight, null);
            g.dispose();
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            String format = extension.replace(".", "");
            if ("jpg".equals(format)) format = "jpeg";
            java.util.Iterator<javax.imageio.ImageWriter> writers = javax.imageio.ImageIO.getImageWritersByFormatName(format);
            if (!writers.hasNext()) {
                logger.warn("[图片压缩] 无可用ImageWriter for format={}, 使用原图", format);
                return originalBytes;
            }
            javax.imageio.ImageWriter writer = writers.next();
            javax.imageio.ImageWriteParam param = writer.getDefaultWriteParam();
            if (param.canWriteCompressed()) {
                param.setCompressionMode(javax.imageio.ImageWriteParam.MODE_EXPLICIT);
                param.setCompressionQuality(0.8f);
            }
            try (javax.imageio.stream.ImageOutputStream ios = javax.imageio.ImageIO.createImageOutputStream(baos)) {
                writer.setOutput(ios);
                writer.write(null, new javax.imageio.IIOImage(resized, null, null), param);
            }
            writer.dispose();
            byte[] result = baos.toByteArray();
            logger.info("[图片压缩] {}x{} → {}x{}, {}KB → {}KB",
                width, height, newWidth, newHeight,
                originalBytes.length / 1024, result.length / 1024);
            return result;
        } catch (Exception e) {
            logger.warn("[图片压缩] 压缩失败，使用原图: {}", e.getMessage());
            return originalBytes;
        }
    }

    private boolean isImageExtension(String extension) {
        return Set.of(".jpg", ".jpeg", ".png", ".bmp").contains(extension);
    }
}
