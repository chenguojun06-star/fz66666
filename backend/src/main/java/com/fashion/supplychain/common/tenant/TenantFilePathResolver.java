package com.fashion.supplychain.common.tenant;

import com.fashion.supplychain.common.BusinessException;
import com.fashion.supplychain.common.UserContext;
import lombok.extern.slf4j.Slf4j;

import java.io.File;
import java.nio.file.Path;

/**
 * 租户文件路径解析器
 *
 * 核心职责：
 * 1. 自动在文件路径中注入租户ID前缀（后端负责，前端无感知）
 * 2. 校验文件访问权限（Token 的 tenantId 必须匹配路径中的 tenantId）
 * 3. 统一文件 URL 格式为 /api/file/tenant-download/{tenantId}/{filename}
 *
 * 目录结构：
 *   {uploadPath}/tenants/{tenantId}/{uuid}.{ext}
 *
 * 规则（3个必须做 + 2个不能做）：
 * ✅ 必须做1：所有文件路径自动加 tenant_id，后端负责，前端不管
 * ✅ 必须做2：查看文件必须通过后端 API 获取"临时链接"，不允许直接 URL 访问
 * ✅ 必须做3：后端 API 必须校验 Token 的 tenant_id 与文件路径中的 tenant_id 是否一致
 * ❌ 不能做1：前端绝不能传 tenant_id 给文件 API
 * ❌ 不能做2：文件路径绝不能没有 tenant_id
 */
@Slf4j
public class TenantFilePathResolver {

    private TenantFilePathResolver() {
        // 工具类禁止实例化
    }

    /** 租户文件目录前缀 */
    private static final String TENANT_DIR_PREFIX = "tenants";

    /**
     * 获取当前租户的文件存储子目录
     * 例如：tenants/1/
     *
     * @return 租户子目录路径（相对于 uploadPath）
     */
    public static String resolveTenantDir() {
        Long tenantId = TenantAssert.requireTenantId();
        return TENANT_DIR_PREFIX + File.separator + tenantId;
    }

    /**
     * 获取指定租户的文件存储子目录
     *
     * @param tenantId 租户ID
     * @return 租户子目录路径
     */
    public static String resolveTenantDir(Long tenantId) {
        if (tenantId == null) {
            throw new BusinessException("租户ID不能为空");
        }
        return TENANT_DIR_PREFIX + File.separator + tenantId;
    }

    /**
     * 解析文件的完整磁盘存储路径（带租户隔离）
     * 自动从 UserContext 取 tenantId
     *
     * @param uploadPath 上传根路径（fashion.upload-path）
     * @param filename   文件名（如 uuid.png）
     * @return 完整磁盘路径（如 /uploads/tenants/1/uuid.png）
     */
    public static File resolveStoragePath(String uploadPath, String filename) {
        String tenantDir = resolveTenantDir();
        File dir = new File(uploadPath, tenantDir);
        if (!dir.exists()) {
            boolean created = dir.mkdirs();
            if (!created && !dir.exists()) {
                log.error("[租户文件] 创建租户目录失败: {}", dir.getAbsolutePath());
                throw new BusinessException("文件存储目录创建失败");
            }
        }
        return new File(dir, filename);
    }

    /**
     * 生成租户隔离的文件下载 URL
     * 格式：/api/file/tenant-download/{tenantId}/{filename}
     *
     * @param filename 文件名（如 uuid.png）
     * @return 统一 URL（如 /api/file/tenant-download/1/uuid.png）
     */
    public static String buildDownloadUrl(String filename) {
        Long tenantId = TenantAssert.requireTenantId();
        return "/api/file/tenant-download/" + tenantId + "/" + filename;
    }

    /**
     * 从文件 URL 中提取租户ID
     * 支持格式：/api/file/tenant-download/{tenantId}/{filename}
     *
     * @param fileUrl 文件URL
     * @return 租户ID，解析失败返回 null
     */
    public static Long extractTenantIdFromUrl(String fileUrl) {
        if (fileUrl == null || fileUrl.isEmpty()) {
            return null;
        }
        String prefix = "/api/file/tenant-download/";
        if (!fileUrl.startsWith(prefix)) {
            return null; // 旧格式 URL，无租户信息
        }
        String remaining = fileUrl.substring(prefix.length());
        int slash = remaining.indexOf('/');
        if (slash <= 0) {
            return null;
        }
        try {
            return Long.valueOf(remaining.substring(0, slash));
        } catch (NumberFormatException e) {
            log.warn("[租户文件] URL 中租户ID解析失败: {}", fileUrl);
            return null;
        }
    }

    /**
     * 从文件 URL 中提取文件名
     *
     * @param fileUrl 文件URL
     * @return 文件名
     */
    public static String extractFilenameFromUrl(String fileUrl) {
        if (fileUrl == null || fileUrl.isEmpty()) {
            return null;
        }
        // 新格式：/api/file/tenant-download/{tenantId}/{filename}
        String prefix = "/api/file/tenant-download/";
        if (fileUrl.startsWith(prefix)) {
            String remaining = fileUrl.substring(prefix.length());
            int slash = remaining.indexOf('/');
            if (slash > 0 && slash < remaining.length() - 1) {
                return remaining.substring(slash + 1);
            }
        }
        // 旧格式：/api/common/download/{filename} 或 /upload/{filename}
        int lastSlash = fileUrl.lastIndexOf('/');
        if (lastSlash >= 0 && lastSlash < fileUrl.length() - 1) {
            return fileUrl.substring(lastSlash + 1);
        }
        return fileUrl;
    }

    /**
     * 校验当前用户是否有权限访问该文件路径
     * Token 的 tenantId 必须与文件路径中的 tenantId 一致
     *
     * @param fileTenantId 文件所属租户ID
     * @throws BusinessException 无权访问时抛出
     */
    public static void validateTenantAccess(Long fileTenantId) {
        // 超级管理员可以访问所有
        if (UserContext.isSuperAdmin()) {
            return;
        }
        Long currentTenantId = TenantAssert.requireTenantId();
        if (!currentTenantId.equals(fileTenantId)) {
            log.warn("[租户文件安全] 跨租户文件访问被拦截: currentTenant={}, fileTenant={}",
                    currentTenantId, fileTenantId);
            throw new BusinessException("无权访问该文件");
        }
    }

    /**
     * 将磁盘文件的绝对路径解析为租户ID
     * 用于从物理路径反推租户归属
     *
     * @param uploadPath 上传根路径
     * @param absoluteFilePath 文件绝对路径
     * @return 租户ID，解析失败返回 null
     */
    public static Long extractTenantIdFromDiskPath(String uploadPath, String absoluteFilePath) {
        try {
            Path base = Path.of(uploadPath).toAbsolutePath().normalize();
            Path file = Path.of(absoluteFilePath).toAbsolutePath().normalize();
            Path relative = base.relativize(file);
            // 期望格式：tenants/{tenantId}/{filename}
            if (relative.getNameCount() >= 3
                    && TENANT_DIR_PREFIX.equals(relative.getName(0).toString())) {
                return Long.valueOf(relative.getName(1).toString());
            }
        } catch (Exception e) {
            log.warn("[租户文件] 从磁盘路径提取租户ID失败: {}", absoluteFilePath, e);
        }
        return null;
    }

    /**
     * 判断文件 URL 是否为旧格式（无租户隔离）
     *
     * @param fileUrl 文件URL
     * @return true 表示旧格式需要迁移
     */
    public static boolean isLegacyUrl(String fileUrl) {
        if (fileUrl == null || fileUrl.isEmpty()) {
            return false;
        }
        // 旧格式：/api/common/download/xxx 或 /upload/xxx
        return fileUrl.startsWith("/api/common/download/") || fileUrl.startsWith("/upload/");
    }

    /**
     * 将旧格式 URL 转换为新格式（需要指定租户ID）
     *
     * @param legacyUrl 旧格式URL
     * @param tenantId  目标租户ID
     * @return 新格式URL
     */
    public static String migrateLegacyUrl(String legacyUrl, Long tenantId) {
        String filename = extractFilenameFromUrl(legacyUrl);
        if (filename == null) {
            throw new BusinessException("无法解析文件名: " + legacyUrl);
        }
        return "/api/file/tenant-download/" + tenantId + "/" + filename;
    }
}
