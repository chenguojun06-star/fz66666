package com.fashion.supplychain.common;

import com.fashion.supplychain.common.tenant.TenantFilePathResolver;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import lombok.extern.slf4j.Slf4j;

import java.net.MalformedURLException;
import java.nio.file.Path;

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
 */
@RestController
@RequestMapping("/api/file")
@Slf4j
public class TenantFileController {

    @Value("${fashion.upload-path}")
    private String uploadPath;

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

            // 构建文件的磁盘路径：{uploadPath}/tenants/{tenantId}/{fileName}
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
                log.debug("[租户文件] 文件不存在: tenantId={}, fileName={}", tenantId, fileName);
                return ResponseEntity.notFound().build();
            }

            return CommonController.buildFileResponse(resource, filePath, download);
        } catch (MalformedURLException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
