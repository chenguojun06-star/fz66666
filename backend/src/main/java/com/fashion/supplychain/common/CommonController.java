package com.fashion.supplychain.common;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.common.tenant.TenantFilePathResolver;
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
import java.util.UUID;

@RestController
@RequestMapping("/api/common")
@Slf4j
@PreAuthorize("isAuthenticated()")
public class CommonController {

    @Value("${fashion.upload-path}")
    private String uploadPath;

    /**
     * 通用文件上传（租户隔离版本）
     * 文件自动存储到 tenants/{tenantId}/ 子目录
     * 返回的 URL 为 /api/file/tenant-download/{tenantId}/{filename}
     */
    @PostMapping("/upload")
    public Result<String> upload(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Result.fail("文件为空");
        }
        try {
            // ✅ 必须做1：自动从 Token 获取 tenantId，前端不传
            TenantAssert.assertTenantContext();

            String originalFilename = file.getOriginalFilename();
            String safeOriginal = originalFilename == null ? "file" : originalFilename;
            int dot = safeOriginal.lastIndexOf('.');
            String extension = dot >= 0 ? safeOriginal.substring(dot) : "";
            String newFilename = UUID.randomUUID().toString() + extension;

            // ✅ 文件存储到 tenants/{tenantId}/ 子目录
            File dest = TenantFilePathResolver.resolveStoragePath(uploadPath, newFilename);
            file.transferTo(dest);

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
    @SuppressWarnings("null")
    public ResponseEntity<Resource> downloadFile(@PathVariable String fileName,
            @RequestParam(value = "download", required = false, defaultValue = "0") String download) {
        try {
            Path baseDir = Path.of(uploadPath).toAbsolutePath().normalize();
            // 优先从旧的平级目录查找（兼容已有数据）
            Path filePath = baseDir.resolve(fileName).normalize();
            if (!filePath.startsWith(baseDir)) {
                return ResponseEntity.notFound().build();
            }

            Resource resource = new UrlResource(filePath.toUri());

            if (!resource.exists()) {
                // 旧文件不存在，尝试从当前租户目录查找（可能已迁移）
                Long tenantId = UserContext.tenantId();
                if (tenantId != null) {
                    Path tenantPath = baseDir.resolve("tenants").resolve(String.valueOf(tenantId)).resolve(fileName).normalize();
                    if (tenantPath.startsWith(baseDir)) {
                        resource = new UrlResource(tenantPath.toUri());
                    }
                }
            }

            if (resource.exists()) {
                return buildFileResponse(resource, filePath, download);
            } else {
                return ResponseEntity.notFound().build();
            }
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
            // ignore
        }
        MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
        if (contentType != null && !contentType.trim().isEmpty()) {
            try {
                mediaType = MediaType.parseMediaType(contentType);
            } catch (Exception e) {
                // ignore
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
}
