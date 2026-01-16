package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleAttachment;
import com.fashion.supplychain.style.orchestration.StyleAttachmentOrchestrator;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import java.util.List;

@RestController
@RequestMapping("/api/style/attachment")
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

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(styleAttachmentOrchestrator.delete(id));
    }
}
