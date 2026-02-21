package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.orchestration.StyleAttachmentOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/style/attachment")
@PreAuthorize("isAuthenticated()")
public class StyleAttachmentController {

    @Autowired
    private StyleAttachmentOrchestrator styleAttachmentOrchestrator;

    @GetMapping("/list")
    public Result<List<StyleAttachment>> list(@RequestParam(required = false) String styleId,
            @RequestParam(required = false) String styleNo,
            @RequestParam(required = false) String bizType) {
        return Result.success(styleAttachmentOrchestrator.list(styleId, styleNo, bizType));
    }

    @PostMapping("/upload")
    public Result<StyleAttachment> upload(@RequestParam("file") MultipartFile file,
            @RequestParam("styleId") String styleId,
            @RequestParam(value = "bizType", required = false) String bizType) {
        return Result.success(styleAttachmentOrchestrator.upload(file, styleId, bizType));
    }

    /**
     * 上传纸样文件（支持版本管理）
     */
    @PostMapping("/pattern/upload")
    public Result<StyleAttachment> uploadPattern(@RequestParam("file") MultipartFile file,
            @RequestParam("styleId") String styleId,
            @RequestParam(value = "bizType", defaultValue = "pattern") String bizType,
            @RequestParam(value = "versionRemark", required = false) String versionRemark) {
        return Result.success(styleAttachmentOrchestrator.uploadWithVersion(file, styleId, bizType, versionRemark));
    }

    /**
     * 获取纸样版本历史
     */
    @GetMapping("/pattern/versions")
    public Result<List<StyleAttachment>> patternVersions(@RequestParam String styleId,
            @RequestParam(value = "bizType", defaultValue = "pattern") String bizType) {
        return Result.success(styleAttachmentOrchestrator.listPatternVersions(styleId, bizType));
    }

    /**
     * 检查纸样是否齐全
     */
    @GetMapping("/pattern/check")
    public Result<Map<String, Object>> checkPattern(@RequestParam String styleId) {
        return Result.success(styleAttachmentOrchestrator.checkPatternComplete(styleId));
    }

    /**
     * 资料中心纸样上传（替换原有纸样文件）
     */
    @PostMapping("/upload-pattern")
    public Result<StyleAttachment> uploadPatternForDataCenter(
            @RequestParam("file") MultipartFile file,
            @RequestParam("styleId") String styleId,
            @RequestParam("styleNo") String styleNo,
            @RequestParam(value = "type", defaultValue = "pattern") String type) {
        return Result.success(styleAttachmentOrchestrator.uploadAndReplacePattern(file, styleId, styleNo, type));
    }

    /**
     * 纸样资料流回资料中心
     */
    @PostMapping("/pattern/flow-to-center")
    public Result<Boolean> flowPatternToCenter(@RequestParam String styleId) {
        return Result.success(styleAttachmentOrchestrator.flowPatternToDataCenter(styleId));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(styleAttachmentOrchestrator.delete(id));
    }
}
