package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.CosService;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.OrderShareResponse;
import com.fashion.supplychain.production.orchestration.OrderShareOrchestrator;
import com.fashion.supplychain.warehouse.dto.OutstockShareResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * 客户订单分享控制器
 *
 * <p>提供两个端点：
 * <ul>
 *   <li>POST /api/production/orders/{id}/share-token — 生成分享令牌（需要登录）</li>
 *   <li>GET  /api/public/share/order/{token}          — 公开查询订单摘要（无需登录）</li>
 * </ul>
 *
 * <p>安全：公开接口在 SecurityConfig 中已配置 permitAll("/api/public/**")，
 * 响应内容仅包含 OrderShareResponse 中定义的可公开字段。
 */
@Slf4j
@RestController
public class OrderShareController {

    @Autowired
    private OrderShareOrchestrator orderShareOrchestrator;

    @Autowired
    private CosService cosService;

    @Value("${fashion.upload-path:./uploads/}")
    private String uploadPath;

    /**
     * 为指定订单生成分享令牌（30 天有效）
     * 前端调用后可拼接 /share/{token} 作为客户分享链接
     */
    @PreAuthorize("isAuthenticated()")
    @PostMapping("/api/production/orders/{id}/share-token")
    public Result<Map<String, String>> generateShareToken(@PathVariable("id") String orderId) {
        try {
            String token = orderShareOrchestrator.generateShareToken(orderId);
            return Result.success(Map.of(
                "token", token,
                "shareUrl", "/share/" + token
            ));
        } catch (SecurityException e) {
            return Result.fail("无权限分享此订单");
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 通过分享令牌获取订单公开摘要（无需登录）
     * 此接口在 SecurityConfig 中已配置 .antMatchers("/api/public/**").permitAll()
     */
    @GetMapping("/api/public/share/order/{token:.+}")
    public Result<OrderShareResponse> getSharedOrder(@PathVariable("token") String token) {
        return orderShareOrchestrator.resolveShareOrder(token);
    }

    /**
     * 通过分享令牌获取出库记录公开摘要（无需登录）
     */
    @GetMapping("/api/public/share/outstock/{token:.+}")
    public Result<OutstockShareResponse> getSharedOutstock(@PathVariable("token") String token) {
        return orderShareOrchestrator.resolveOutstockShare(token);
    }

    @GetMapping("/api/public/share/order/{token:.+}/style-cover")
    public ResponseEntity<Resource> getSharedOrderStyleCover(@PathVariable("token") String token) {
        String fileUrl = orderShareOrchestrator.resolveSharedStyleCover(token);
        if (fileUrl == null || fileUrl.isBlank()) {
            return ResponseEntity.notFound().build();
        }
        try {
            if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
                return ResponseEntity.status(302).location(URI.create(fileUrl)).build();
            }
            String prefix = "/api/file/tenant-download/";
            if (!fileUrl.startsWith(prefix)) {
                String redirectUrl = fileUrl.startsWith("/")
                        ? ServletUriComponentsBuilder.fromCurrentContextPath().path(fileUrl).toUriString()
                        : fileUrl;
                return ResponseEntity.status(302).location(URI.create(redirectUrl)).build();
            }

            String rest = fileUrl.substring(prefix.length());
            int slashIndex = rest.indexOf('/');
            if (slashIndex <= 0) {
                return ResponseEntity.notFound().build();
            }
            Long tenantId = Long.parseLong(rest.substring(0, slashIndex));
            String fileName = rest.substring(slashIndex + 1);

            if (cosService.isEnabled()) {
                return ResponseEntity.status(302).location(URI.create(cosService.getPresignedUrl(tenantId, fileName))).build();
            }

            Path baseDir = Path.of(uploadPath).toAbsolutePath().normalize();
            Path filePath = baseDir.resolve("tenants").resolve(String.valueOf(tenantId)).resolve(fileName).normalize();
            if (!filePath.startsWith(baseDir)) {
                return ResponseEntity.notFound().build();
            }
            Resource resource = new UrlResource(filePath.toUri());
            if (!resource.exists()) {
                return ResponseEntity.notFound().build();
            }

            String contentType = Files.probeContentType(filePath);
            MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
            if (contentType != null && !contentType.isBlank()) {
                try {
                    mediaType = MediaType.parseMediaType(contentType);
                } catch (Exception ignored) {
                }
            }
            return ResponseEntity.ok()
                    .contentType(mediaType)
                    .header(HttpHeaders.CONTENT_DISPOSITION, "inline; filename=\"" + resource.getFilename() + "\"")
                    .body(resource);
        } catch (Exception e) {
            log.warn("公开分享款式图读取失败 token={}", token, e);
            return ResponseEntity.notFound().build();
        }
    }
}
