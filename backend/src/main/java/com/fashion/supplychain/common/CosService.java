package com.fashion.supplychain.common;

import com.qcloud.cos.COSClient;
import com.qcloud.cos.ClientConfig;
import com.qcloud.cos.auth.BasicCOSCredentials;
import com.qcloud.cos.auth.COSCredentials;
import com.qcloud.cos.http.HttpMethodName;
import com.qcloud.cos.model.GeneratePresignedUrlRequest;
import com.qcloud.cos.model.ObjectMetadata;
import com.qcloud.cos.region.Region;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import javax.annotation.PostConstruct;
import javax.annotation.PreDestroy;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.util.Date;

/**
 * 腾讯云 COS 文件存储服务（可选启用）
 *
 * 配置方式（环境变量）：
 *   COS_SECRET_ID  - API 密钥
 *   COS_SECRET_KEY - API 密钥
 *   COS_BUCKET     - 存储桶名（含 AppId，如 my-bucket-1250000000）
 *   COS_REGION     - 地域（默认 ap-shanghai）
 *
 * 未配置时自动降级为本地文件存储（开发/测试环境）。
 *
 * 文件存储路径（COS Key）格式：tenants/{tenantId}/{filename}
 * 预签名 URL 有效期：2 小时
 */
@Service
@Slf4j
public class CosService {

    @Value("${fashion.cos.secret-id:}")
    private String secretId;

    @Value("${fashion.cos.secret-key:}")
    private String secretKey;

    @Value("${fashion.cos.region:ap-shanghai}")
    private String region;

    @Value("${fashion.cos.bucket:}")
    private String bucket;

    @Value("${fashion.upload-path:./uploads/}")
    private String uploadPath;

    /** 预签名 URL 有效期：2 小时 */
    private static final long PRESIGNED_EXPIRE_MS = 2 * 3600_000L;

    private COSClient cosClient;

    @PostConstruct
    public void init() {
        if (isEnabled()) {
            COSCredentials credentials = new BasicCOSCredentials(secretId, secretKey);
            ClientConfig clientConfig = new ClientConfig(new Region(region));
            cosClient = new COSClient(credentials, clientConfig);
            log.info("[COS] 已启用腾讯云 COS 文件存储: bucket={}, region={}", bucket, region);
            // 启动时验证 COS 连接（完整权限验证：写入+读取+删除）
            String testKey = "_health_check_" + System.currentTimeMillis() + ".txt";
            try {
                // 1. 验证 list 权限
                cosClient.listObjects(bucket, "tenants/");
                log.info("[COS] ✅ list 权限验证通过");

                // 2. 验证 write 权限（上传小文件）
                byte[] testData = "COS health check".getBytes();
                ObjectMetadata testMeta = new ObjectMetadata();
                testMeta.setContentLength(testData.length);
                testMeta.setContentType("text/plain");
                cosClient.putObject(bucket, testKey, new ByteArrayInputStream(testData), testMeta);
                log.info("[COS] ✅ write 权限验证通过");

                // 3. 验证 read 权限（生成预签名URL）
                GeneratePresignedUrlRequest preReq = new GeneratePresignedUrlRequest(bucket, testKey, HttpMethodName.GET);
                preReq.setExpiration(new Date(System.currentTimeMillis() + 60_000));
                cosClient.generatePresignedUrl(preReq);
                log.info("[COS] ✅ read/presign 权限验证通过");

                // 4. 清理测试文件
                cosClient.deleteObject(bucket, testKey);
                log.info("[COS] ✅ delete 权限验证通过");

                log.info("[COS] COS 全部权限验证成功 ✅ (list/write/read/delete)");
            } catch (Exception e) {
                // 清理可能残留的测试文件
                try { cosClient.deleteObject(bucket, testKey); } catch (Exception ignored) {}
                String errMsg = e.getMessage();
                if (errMsg != null && errMsg.contains("AccessDenied")) {
                    log.error("[COS] ⛔⛔⛔ COS 权限验证失败（AccessDenied）！" +
                            "API密钥没有对 bucket={} 的操作权限。" +
                            "请到腾讯云控制台 → 访问管理(CAM) → 检查子用户的 COS 策略是否包含 cos:PutObject、cos:GetObject 权限。" +
                            "错误详情: {}", bucket, errMsg);
                } else {
                    log.error("[COS] ⚠️⚠️⚠️ COS 连接验证失败！bucket={}, region={}, 错误: {}。" +
                            "文件上传/下载将会失败！请检查 COS_SECRET_ID、COS_SECRET_KEY、COS_BUCKET 环境变量是否正确。",
                            bucket, region, errMsg);
                }
            }
        } else {
            // 检测是否在生产环境（容器内无 .run/backend.env 文件）
            boolean isProduction = System.getenv("SPRING_PROFILES_ACTIVE") != null
                    && System.getenv("SPRING_PROFILES_ACTIVE").contains("prod");
            if (isProduction || "/uploads/".equals(uploadPath) || "/uploads".equals(uploadPath)) {
                log.error("\n" +
                    "╔══════════════════════════════════════════════════════════════════╗\n" +
                    "║  ⛔ COS 未配置！生产环境文件将存储在容器本地磁盘！              ║\n" +
                    "║  容器重启/缩扩容后所有上传的文件将永久丢失！                    ║\n" +
                    "║                                                                ║\n" +
                    "║  请在云托管环境变量中配置：                                    ║\n" +
                    "║    COS_SECRET_ID  = <你的腾讯云 API SecretId>                  ║\n" +
                    "║    COS_SECRET_KEY = <你的腾讯云 API SecretKey>                 ║\n" +
                    "║    COS_BUCKET     = <存储桶名-AppId>                           ║\n" +
                    "║    COS_REGION     = ap-shanghai                                ║\n" +
                    "╚══════════════════════════════════════════════════════════════════╝");
            } else {
                log.info("[COS] 未配置 COS，使用本地文件存储（开发模式）");
            }
        }
    }

    /** 是否已启用 COS（判断依据：secretId 和 bucket 均已配置） */
    public boolean isEnabled() {
        return StringUtils.hasText(secretId) && StringUtils.hasText(bucket);
    }

    /**
     * 上传 MultipartFile 到 COS
     *
     * @param tenantId 租户ID（用于构建 key 路径）
     * @param filename 文件名（UUID.ext 格式）
     * @param file     待上传文件
     */
    public void upload(Long tenantId, String filename, MultipartFile file) throws IOException {
        String key = buildKey(tenantId, filename);
        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentLength(file.getSize());
        if (StringUtils.hasText(file.getContentType())) {
            metadata.setContentType(file.getContentType());
        }
        try (InputStream is = file.getInputStream()) {
            cosClient.putObject(bucket, key, is, metadata);
        } catch (com.qcloud.cos.exception.CosServiceException e) {
            log.error("[COS] 文件上传失败: key={}, errorCode={}, statusCode={}, message={}",
                    key, e.getErrorCode(), e.getStatusCode(), e.getErrorMessage());
            if ("AccessDenied".equals(e.getErrorCode())) {
                throw new IOException("文件存储服务权限不足（COS AccessDenied），请联系管理员检查云存储配置", e);
            }
            throw new IOException("文件存储服务异常: " + e.getErrorMessage(), e);
        }
        log.info("[COS] 文件上传成功: key={}, size={}", key, file.getSize());
    }

    /**
     * 上传字节数组到 COS（用于程序内部生成的文件，如 PDF、图片等）
     *
     * @param tenantId    租户ID
     * @param filename    文件名
     * @param content     文件字节内容
     * @param contentType MIME 类型
     */
    public void upload(Long tenantId, String filename, byte[] content, String contentType) {
        String key = buildKey(tenantId, filename);
        ObjectMetadata metadata = new ObjectMetadata();
        metadata.setContentLength(content.length);
        if (StringUtils.hasText(contentType)) {
            metadata.setContentType(contentType);
        }
        try (InputStream is = new ByteArrayInputStream(content)) {
            cosClient.putObject(bucket, key, is, metadata);
        } catch (com.qcloud.cos.exception.CosServiceException e) {
            log.error("[COS] 文件上传失败(bytes): key={}, errorCode={}, statusCode={}, message={}",
                    key, e.getErrorCode(), e.getStatusCode(), e.getErrorMessage());
            if ("AccessDenied".equals(e.getErrorCode())) {
                throw new RuntimeException("文件存储服务权限不足（COS AccessDenied），请联系管理员检查云存储配置", e);
            }
            throw new RuntimeException("文件存储服务异常: " + e.getErrorMessage(), e);
        } catch (IOException e) {
            throw new RuntimeException("COS 上传失败: " + key, e);
        }
        log.info("[COS] 文件上传成功 (bytes): key={}, size={}", key, content.length);
    }

    /**
     * 生成预签名下载 URL（有效期 2 小时）
     *
     * @param tenantId 租户ID
     * @param filename 文件名
     * @return 带鉴权签名的临时下载 URL
     */
    public String getPresignedUrl(Long tenantId, String filename) {
        String key = buildKey(tenantId, filename);
        try {
            GeneratePresignedUrlRequest req = new GeneratePresignedUrlRequest(bucket, key, HttpMethodName.GET);
            req.setExpiration(new Date(System.currentTimeMillis() + PRESIGNED_EXPIRE_MS));
            URL url = cosClient.generatePresignedUrl(req);
            return url.toString();
        } catch (com.qcloud.cos.exception.CosServiceException e) {
            log.error("[COS] 生成预签名URL失败: key={}, errorCode={}, message={}",
                    key, e.getErrorCode(), e.getErrorMessage());
            throw new RuntimeException("文件下载链接生成失败: " + e.getErrorMessage(), e);
        }
    }

    /**
     * 检查文件是否存在于 COS
     *
     * @param tenantId 租户ID
     * @param filename 文件名
     * @return true 表示文件存在
     */
    public boolean exists(Long tenantId, String filename) {
        String key = buildKey(tenantId, filename);
        try {
            cosClient.getObjectMetadata(bucket, key);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    /** 构建 COS 对象 Key：tenants/{tenantId}/{filename} */
    private String buildKey(Long tenantId, String filename) {
        return "tenants/" + tenantId + "/" + filename;
    }

    @PreDestroy
    public void destroy() {
        if (cosClient != null) {
            cosClient.shutdown();
        }
    }
}
