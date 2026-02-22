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
        } else {
            log.info("[COS] 未配置 COS，使用本地文件存储（开发模式）");
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
        } catch (IOException e) {
            // ByteArrayInputStream.close() 不会抛出受检异常，此处仅为编译满足
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
        GeneratePresignedUrlRequest req = new GeneratePresignedUrlRequest(bucket, key, HttpMethodName.GET);
        req.setExpiration(new Date(System.currentTimeMillis() + PRESIGNED_EXPIRE_MS));
        URL url = cosClient.generatePresignedUrl(req);
        return url.toString();
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
