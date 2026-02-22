package com.fashion.supplychain.common;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import lombok.extern.slf4j.Slf4j;

import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
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
     * 租户隔离文件下载/预览
     *
     * @param tenantId 文件所属租户ID（URL 路径参数）
     * @param fileName 文件名（UUID 格式）
     * @param download 是否强制下载（0=内联预览，1=下载）
     */
    @GetMapping("/tenant-download/{tenantId}/{fileName:.+}")
    @SuppressWarnings("null")
    public ResponseEntity<Resource> tenantDownload(
            @PathVariable Long tenantId,
            @PathVariable String fileName,
            @RequestParam(value = "download", required = false, defaultValue = "0") String download) {
        try {
            // 强制校验租户归属（超级管理员可访问所有租户文件）
            Long currentTenantId = UserContext.tenantId();
            if (currentTenantId != null && !UserContext.isSuperAdmin()) {
                if (!currentTenantId.equals(tenantId)) {
                    log.warn("[租户文件] 跨租户文件访问被拦截: currentTenant={}, fileTenant={}, fileName={}",
                            currentTenantId, tenantId, fileName);
                    return ResponseEntity.status(403).build();
                }
            }

            // ✅ COS 已启用：直接生成预签名URL，302跳转到COS
            // 不再调用 exists()（HeadObject 可能缺权限导致误判404）
            // 如果文件在COS不存在，COS本身会返回404，效果一样但不会误杀
            if (cosService.isEnabled()) {
                try {
                    String presignedUrl = cosService.getPresignedUrl(tenantId, fileName);
                    return ResponseEntity.status(302)
                            .header(HttpHeaders.LOCATION, presignedUrl)
                            .build();
                } catch (Exception e) {
                    log.warn("[COS] 生成预签名URL失败，尝试本地回退: tenantId={}, fileName={}, error={}",
                            tenantId, fileName, e.getMessage());
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
                return ResponseEntity.notFound().build();
            }

            return CommonController.buildFileResponse(resource, filePath, download);
        } catch (MalformedURLException e) {
            return ResponseEntity.notFound().build();
        }
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
                    // ignore
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
