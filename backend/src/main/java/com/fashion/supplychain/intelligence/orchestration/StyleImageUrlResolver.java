package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.CosService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
@Slf4j
public class StyleImageUrlResolver {

    @Autowired
    private CosService cosService;

    @Value("${fashion.upload-dir:./uploads}")
    private String uploadPath;

    public String resolveForVision(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return null;
        if (rawUrl.startsWith("https://") || rawUrl.startsWith("http://")) {
            if (rawUrl.contains(".cos.") && rawUrl.contains(".myqcloud.com/")) {
                return resolveCosHttpsUrl(rawUrl);
            }
            return downloadExternalImageAsBase64(rawUrl);
        }
        String prefix = "/api/file/tenant-download/";
        if (rawUrl.startsWith(prefix)) {
            String rest = rawUrl.substring(prefix.length());
            int slashIdx = rest.indexOf('/');
            if (slashIdx <= 0) {
                log.warn("[StyleDifficulty][imageResolve] 路径格式无效: {}", rawUrl);
                return null;
            }
            String tenantIdStr = rest.substring(0, slashIdx);
            String filename = rest.substring(slashIdx + 1);
            try {
                Long tenantId = Long.parseLong(tenantIdStr);
                if (cosService.isEnabled()) {
                    String presignedUrl = cosService.getPresignedUrl(tenantId, filename);
                    log.info("[StyleDifficulty][imageResolve] → COS 预签名 URL (tenantId={}, file={})", tenantId, filename);
                    return presignedUrl;
                } else {
                    return readLocalFileAsBase64DataUri(tenantId, filename);
                }
            } catch (NumberFormatException e) {
                log.warn("[StyleDifficulty][imageResolve] tenantId 格式无效: {}", tenantIdStr);
                return null;
            }
        }
        log.warn("[StyleDifficulty][imageResolve] 无法识别的 URL 格式: {}",
                rawUrl.substring(0, Math.min(60, rawUrl.length())));
        return null;
    }

    private String resolveCosHttpsUrl(String cosUrl) {
        try {
            int keyStart = cosUrl.indexOf(".myqcloud.com/") + ".myqcloud.com/".length();
            String cosKey = cosUrl.substring(keyStart);
            int qMark = cosKey.indexOf('?');
            if (qMark > 0) cosKey = cosKey.substring(0, qMark);
            if (cosKey.startsWith("tenants/")) {
                String rest = cosKey.substring("tenants/".length());
                int slashIdx = rest.indexOf('/');
                if (slashIdx > 0) {
                    Long tenantId = Long.parseLong(rest.substring(0, slashIdx));
                    String filename = rest.substring(slashIdx + 1);
                    if (cosService.isEnabled()) {
                        String presigned = cosService.getPresignedUrl(tenantId, filename);
                        log.info("[StyleDifficulty][imageResolve] COS直链 → 预签名URL (tenantId={}, file={})", tenantId, filename);
                        return presigned;
                    }
                    return readLocalFileAsBase64DataUri(tenantId, filename);
                }
            }
        } catch (Exception e) {
            log.warn("[StyleDifficulty][imageResolve] COS直链解析失败，透传原始URL: {}", e.getMessage());
        }
        return cosUrl;
    }

    private String downloadExternalImageAsBase64(String url) {
        try {
            java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(url))
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                    .header("Accept", "image/*,*/*")
                    .timeout(java.time.Duration.ofSeconds(20))
                    .GET()
                    .build();
            java.net.http.HttpResponse<byte[]> resp = java.net.http.HttpClient.newHttpClient()
                    .send(req, java.net.http.HttpResponse.BodyHandlers.ofByteArray());
            if (resp.statusCode() == 200) {
                byte[] bytes = resp.body();
                if (bytes.length > 8 * 1024 * 1024) {
                    log.warn("[StyleDifficulty][imageResolve] 外链图片过大({}MB>8MB)，跳过视觉", bytes.length / 1024 / 1024);
                    return null;
                }
                String contentType = resp.headers().firstValue("Content-Type").orElse("image/jpeg");
                String mimeType = contentType.contains("png") ? "image/png"
                        : contentType.contains("webp") ? "image/webp"
                        : contentType.contains("gif") ? "image/gif" : "image/jpeg";
                String b64 = java.util.Base64.getEncoder().encodeToString(bytes);
                log.info("[StyleDifficulty][imageResolve] 外链图片下载成功 → Base64({}KB, {})", bytes.length / 1024, mimeType);
                return "data:" + mimeType + ";base64," + b64;
            }
            log.warn("[StyleDifficulty][imageResolve] 外链图片下载失败 status={} url={}",
                    resp.statusCode(), url.substring(0, Math.min(80, url.length())));
            return null;
        } catch (Exception e) {
            log.warn("[StyleDifficulty][imageResolve] 外链图片下载异常: {}", e.getMessage());
            return null;
        }
    }

    private String readLocalFileAsBase64DataUri(Long tenantId, String filename) {
        try {
            java.nio.file.Path filePath = java.nio.file.Paths.get(uploadPath, "tenants",
                    tenantId.toString(), filename).toAbsolutePath().normalize();
            if (!java.nio.file.Files.exists(filePath)) {
                log.warn("[StyleDifficulty][imageResolve] 本地文件不存在，跳过视觉: {}", filePath);
                return null;
            }
            byte[] bytes = java.nio.file.Files.readAllBytes(filePath);
            if (bytes.length > 10 * 1024 * 1024) {
                log.warn("[StyleDifficulty][imageResolve] 文件过大 ({}MB >10MB)，跳过视觉", bytes.length / 1024 / 1024);
                return null;
            }
            String lower = filename.toLowerCase();
            String mimeType = lower.endsWith(".png") ? "image/png"
                    : lower.endsWith(".webp") ? "image/webp"
                    : lower.endsWith(".gif") ? "image/gif" : "image/jpeg";
            String b64 = java.util.Base64.getEncoder().encodeToString(bytes);
            log.info("[StyleDifficulty][imageResolve] → Base64 Data URI ({}B, {})", bytes.length, mimeType);
            return "data:" + mimeType + ";base64," + b64;
        } catch (Exception e) {
            log.warn("[StyleDifficulty][imageResolve] 本地文件读取失败: {} - {}", filename, e.getMessage());
            return null;
        }
    }
}
