package com.fashion.supplychain.common;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
public class CommonController {

    @Value("${fashion.upload-path}")
    private String uploadPath;

    @PostMapping("/upload")
    public Result<String> upload(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return Result.fail("文件为空");
        }
        try {
            File dir = new File(uploadPath);
            if (!dir.exists()) {
                dir.mkdirs();
            }

            String originalFilename = file.getOriginalFilename();
            String safeOriginal = originalFilename == null ? "file" : originalFilename;
            int dot = safeOriginal.lastIndexOf('.');
            String extension = dot >= 0 ? safeOriginal.substring(dot) : "";
            String newFilename = UUID.randomUUID().toString() + extension;
            File dest = new File(dir, newFilename);
            file.transferTo(dest);

            return Result.success("/api/common/download/" + newFilename);
        } catch (Exception e) {
            String msg = e.getMessage();
            if (msg == null || msg.trim().isEmpty()) {
                msg = "上传失败";
            }
            return Result.fail(msg);
        }
    }

    @GetMapping("/download/{fileName:.+}")
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

            if (resource.exists()) {
                String contentType = null;
                try {
                    contentType = Files.probeContentType(filePath);
                } catch (IOException e) {
                    log.warn("Failed to probe content type: filePath={}", filePath, e);
                }
                MediaType mediaType = MediaType.APPLICATION_OCTET_STREAM;
                if (contentType != null && !contentType.trim().isEmpty()) {
                    try {
                        mediaType = MediaType.parseMediaType(contentType);
                    } catch (Exception e) {
                        log.warn("Failed to parse media type: contentType={}", contentType, e);
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
            } else {
                return ResponseEntity.notFound().build();
            }
        } catch (MalformedURLException e) {
            return ResponseEntity.notFound().build();
        }
    }
}
