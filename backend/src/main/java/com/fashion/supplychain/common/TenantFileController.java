package com.fashion.supplychain.common;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.InputStreamResource;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import lombok.extern.slf4j.Slf4j;

import jakarta.servlet.http.HttpServletRequest;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 租户隔离文件访问控制器
 *
 * 文件 URL 格式：/api/file/tenant-download/{tenantId}/{fileName}
 *
 * 安全策略：
 * - 要求登录认证（SecurityConfig 已配置 authenticated）
 * - 前端通过 getAuthedFileUrl() 在 URL 追加 ?token=xxx
 * - 校验当前用户的 tenantId 与文件所属 tenantId 一致
 * - 文件名为 UUID 格式，不可猜测
 * - 文件存储在 tenants/{tenantId}/ 子目录中，物理隔离
 * - 开启 COS 时：302 重定向到预签名 URL；禁用时：本地文件流
 */
@RestController
@RequestMapping("/api/file")
@Slf4j
@PreAuthorize("isAuthenticated()")
public class TenantFileController {

    @Value("${fashion.upload-path}")
    private String uploadPath;

    @Autowired
    private CosService cosService;

    /**
     * 1×1 透明 PNG 占位图（文件在 COS/本地均不存在时返回）
     * 浏览器收到 200+image/png 不会报告控制台错误，同时缓存 24h 防止重复轮询
     * 注：前端 <img onError> 不会触发，图片区域呈现为透明（与 "无图" 占位效果等价）
     */
    private static final byte[] TRANSPARENT_PNG = Base64.getDecoder().decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    );

    /**
     * 租户隔离文件下载/预览
     *
     * URL 格式：/api/file/tenant-download/{tenantId}/{fileName}
     * 支持含斜杠的子目录文件名（如 expense-docs/uuid.jpg）
     *
     * @param tenantId 文件所属租户ID（URL 路径参数）
     * @param download 是否强制下载（0=内联预览，1=下载）
     * @param request  用于提取完整文件路径（含子目录）
     */
    @GetMapping("/tenant-download/{tenantId}/**")
    @SuppressWarnings("null")
    public ResponseEntity<?> tenantDownload(
            @PathVariable Long tenantId,
            @RequestParam(value = "download", required = false, defaultValue = "0") String download,
            HttpServletRequest request) {
        // 从完整 URI 中提取文件名（含子目录，如 expense-docs/uuid.jpg）
        String requestUri = request.getRequestURI();
        String prefix = "/api/file/tenant-download/" + tenantId + "/";
        String fileName = requestUri.contains(prefix)
                ? requestUri.substring(requestUri.indexOf(prefix) + prefix.length()) : "";
        try {
            // 强制校验租户归属（超级管理员可访问所有租户文件）
            // 安全修复：tenantId 为 null 时也拒绝访问，防止 UserContext 补全失败导致校验绕过
            if (!UserContext.isSuperAdmin()) {
                Long currentTenantId = UserContext.tenantId();
                if (currentTenantId == null || !currentTenantId.equals(tenantId)) {
                    log.warn("[租户文件] 跨租户文件访问被拦截: currentTenant={}, fileTenant={}, fileName={}, userId={}",
                            currentTenantId, tenantId, fileName, UserContext.userId());
                    return ResponseEntity.status(403).build();
                }
            }

            // ✅ COS 已启用：代理流式返回 COS 内容（不再 302 跳转）
            // 原因：302 跳转后浏览器直接访问 COS 跨域链接，若 Content-Type 非 image/* ，Chrome ORB 会拦截图片
            if (cosService.isEnabled()) {
                try {
                    com.qcloud.cos.model.COSObject cosObject = cosService.streamObject(tenantId, fileName);
                    // 优先用 COS 返回的 ContentType；若为空或 octet-stream，根据文件名进行内容类型推断
                    String cosContentType = cosObject.getObjectMetadata().getContentType();
                    if (cosContentType == null || cosContentType.startsWith("application/octet-stream")) {
                        String lowerName = fileName.toLowerCase();
                        if (lowerName.endsWith(".png")) cosContentType = "image/png";
                        else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) cosContentType = "image/jpeg";
                        else if (lowerName.endsWith(".gif")) cosContentType = "image/gif";
                        else if (lowerName.endsWith(".webp")) cosContentType = "image/webp";
                        else if (lowerName.endsWith(".pdf")) cosContentType = "application/pdf";
                        else cosContentType = "application/octet-stream";
                    }
                    InputStream cosStream = cosObject.getObjectContent();
                    final String contentType = cosContentType;
                    long contentLength = cosObject.getObjectMetadata().getContentLength();
                    InputStreamResource resource = new InputStreamResource(cosStream);
                    return ResponseEntity.ok()
                            .header(HttpHeaders.CONTENT_TYPE, contentType)
                            .header(HttpHeaders.CACHE_CONTROL, "max-age=3600")
                            .contentLength(contentLength)
                            .body(resource);
                } catch (Exception e) {
                    // NoSuchKey / 404：文件在 COS 中确实不存在（如历史本地上传数据）
                    // 直接返回占位图，跳过预签名URL二次请求，节省一次无效网络往返
                    if (e instanceof com.qcloud.cos.exception.CosServiceException cosEx
                            && ("NoSuchKey".equals(cosEx.getErrorCode()) || cosEx.getStatusCode() == 404)) {
                        log.debug("[COS] 文件不存在于COS: tenantId={}, fileName={}", tenantId, fileName);
                        return missingFilePlaceholder(fileName);
                    }
                    // 其他错误（权限/网络抖动等）：走预签名 URL 兜底
                    log.warn("[COS] 流式获取失败，改用预签名URL代理: tenantId={}, fileName={}, error={}",
                            tenantId, fileName, e.getMessage());
                    // 回退：服务端代理下载预签名 URL 内容（避免 302 跳转后浏览器 ORB 拦截）
                    try {
                        String presignedUrl = cosService.getPresignedUrl(tenantId, fileName);
                        URL cosUrl = java.net.URI.create(presignedUrl).toURL();
                        HttpURLConnection conn = (HttpURLConnection) cosUrl.openConnection();
                        try {
                            conn.setConnectTimeout(5000);
                            conn.setReadTimeout(15000);
                            conn.setRequestMethod("GET");
                            int httpStatus = conn.getResponseCode();
                            if (httpStatus != 200) {
                                log.warn("[COS] 文件不存在于COS（{}）: tenantId={}, fileName={}",
                                        httpStatus, tenantId, fileName);
                                return missingFilePlaceholder(fileName);
                            }
                            String proxyContentType = conn.getContentType();
                            if (proxyContentType == null || proxyContentType.startsWith("application/octet-stream")) {
                                String lowerName = fileName.toLowerCase();
                                if (lowerName.endsWith(".png")) proxyContentType = "image/png";
                                else if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) proxyContentType = "image/jpeg";
                                else if (lowerName.endsWith(".gif")) proxyContentType = "image/gif";
                                else if (lowerName.endsWith(".webp")) proxyContentType = "image/webp";
                                else if (lowerName.endsWith(".pdf")) proxyContentType = "application/pdf";
                                else proxyContentType = "application/octet-stream";
                            }
                            long proxyLen = conn.getContentLengthLong();
                            InputStream proxyInputStream = conn.getInputStream();
                            InputStreamResource proxyResource = new InputStreamResource(proxyInputStream);
                            var builder = ResponseEntity.ok()
                                    .header(HttpHeaders.CONTENT_TYPE, proxyContentType)
                                    .header(HttpHeaders.CACHE_CONTROL, "max-age=3600");
                            if (proxyLen > 0) builder.contentLength(proxyLen);
                            ResponseEntity<?> response = builder.body(proxyResource);
                            return response;
                        } finally {
                            conn.disconnect();
                        }
                    } catch (Exception ex) {
                        log.warn("[COS] 预签名URL代理也失败（文件可能不存在）: tenantId={}, fileName={}, err={}",
                                tenantId, fileName, ex.getMessage());
                        return missingFilePlaceholder(fileName);
                    }
                }
            }

            // 本地文件存储（开发环境 / 未配置 COS / COS 回退）
            Path baseDir = Path.of(uploadPath).toAbsolutePath().normalize();
            Path filePath = baseDir.resolve("tenants")
                    .resolve(String.valueOf(tenantId))
                    .resolve(fileName)
                    .normalize();

            // 路径遍历防护
            if (!filePath.startsWith(baseDir)) {
                log.warn("[租户文件安全] 路径遍历攻击被拦截: tenantId={}, fileName={}", tenantId, fileName);
                return ResponseEntity.notFound().build();
            }

            Resource resource = new UrlResource(filePath.toUri());
            if (!resource.exists()) {
                log.debug("[租户文件] 文件不存在（COS和本地均无）: tenantId={}, fileName={}", tenantId, fileName);
                return missingFilePlaceholder(fileName);
            }

            return CommonController.buildFileResponse(resource, filePath, download);
        } catch (MalformedURLException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            log.error("[租户文件] 未预期的异常: tenantId={}, fileName={}", tenantId, fileName, e);
            return missingFilePlaceholder(fileName);
        }
    }

    /**
     * 文件缺失时的占位图响应（HTTP 200 + 1×1 透明 PNG）
     * PDF 文件仍返回 404（无法用图片占位）
     */
    private ResponseEntity<Resource> missingFilePlaceholder(String fileName) {
        if (fileName != null && fileName.toLowerCase().endsWith(".pdf")) {
            return ResponseEntity.notFound().build();
        }
        InputStreamResource placeholder = new InputStreamResource(new ByteArrayInputStream(TRANSPARENT_PNG));
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, "image/png")
                .header(HttpHeaders.CACHE_CONTROL, "public, max-age=86400")
                .contentLength(TRANSPARENT_PNG.length)
                .body(placeholder);
    }

    /**
     * 文件存储诊断端点（超管专用）
     * 快速检查 COS 是否启用、本地文件数量等
     */
    @GetMapping("/storage-status")
    @PreAuthorize("hasAuthority('ROLE_SUPER_ADMIN')")
    public Result<Map<String, Object>> storageStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("cosEnabled", cosService.isEnabled());
        status.put("uploadPath", uploadPath);

        if (cosService.isEnabled()) {
            status.put("storageType", "腾讯云 COS（持久化）");
            status.put("healthy", true);
            status.put("message", "COS 已启用，文件不会因容器重启而丢失");
        } else {
            // 检查本地目录
            Path localDir = Path.of(uploadPath).toAbsolutePath().normalize();
            Path tenantsDir = localDir.resolve("tenants");
            boolean dirExists = Files.exists(tenantsDir);
            long fileCount = 0;
            if (dirExists) {
                try (var stream = Files.walk(tenantsDir)) {
                    fileCount = stream.filter(Files::isRegularFile).count();
                } catch (Exception e) {
                    log.warn("[TenantFile] 遍历租户文件目录失败: {}", e.getMessage());
                }
            }
            status.put("storageType", "本地磁盘（⚠️ 容器重启会丢失！）");
            status.put("localDirExists", dirExists);
            status.put("localFileCount", fileCount);
            status.put("healthy", false);
            status.put("message", "⚠️ COS 未配置！生产环境文件存储在容器本地磁盘，重启/缩扩容会永久丢失所有文件。" +
                    "请配置环境变量：COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET、COS_REGION");
        }

        return Result.success(status);
    }
}
