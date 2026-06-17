package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.dto.MaterialColorCardRecognitionResult;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.orchestration.MaterialColorCardOrchestrator;
import com.fashion.supplychain.production.orchestration.MaterialDatabaseOrchestrator;
import com.baomidou.mybatisplus.core.metadata.IPage;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/material/database")
@PreAuthorize("isAuthenticated()")
public class MaterialDatabaseController {

    @Autowired
    private MaterialDatabaseOrchestrator materialDatabaseOrchestrator;

    @Autowired(required = false)
    private MaterialColorCardOrchestrator materialColorCardOrchestrator;

    @GetMapping("/list")
    public Result<IPage<MaterialDatabase>> list(@RequestParam Map<String, Object> params) {
        return Result.success(materialDatabaseOrchestrator.list(params));
    }

    @GetMapping("/generate-code")
    public Result<String> generateCode(@RequestParam(required = false, defaultValue = "accessory") String materialType) {
        return Result.success(materialDatabaseOrchestrator.generateMaterialCode(materialType));
    }

    /**
     * 拍照识别物料色卡信息
     * 入参：已上传的图片 URL
     * 返回：物料各字段识别结果（含置信度），由前端自动填充表单并让用户确认
     */
    @PostMapping("/recognize-color-card")
    public Result<MaterialColorCardRecognitionResult> recognizeColorCard(@RequestBody Map<String, Object> body) {
        String imageUrl = (String) body.get("imageUrl");
        if (materialColorCardOrchestrator == null) {
            MaterialColorCardRecognitionResult fallback = new MaterialColorCardRecognitionResult();
            fallback.setErrorMessage("视觉识别模块未启用，请手动输入");
            return Result.success(fallback);
        }
        return Result.success(materialColorCardOrchestrator.recognizeFromImage(imageUrl));
    }

    @GetMapping("/{id}")
    public Result<MaterialDatabase> getById(@PathVariable String id) {
        return Result.success(materialDatabaseOrchestrator.getById(id));
    }

    @PostMapping
    public Result<Boolean> save(@RequestBody MaterialDatabase material) {
        return Result.success(materialDatabaseOrchestrator.save(material));
    }

    @PutMapping
    public Result<Boolean> update(@RequestBody MaterialDatabase material) {
        return Result.success(materialDatabaseOrchestrator.update(material));
    }

    @PutMapping("/{id}/complete")
    public Result<Boolean> complete(@PathVariable String id) {
        return Result.success(materialDatabaseOrchestrator.complete(id));
    }

    @PutMapping("/{id}/return")
    public Result<Boolean> returnToPending(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
        String reason = body == null ? null : String.valueOf(body.getOrDefault("reason", "")).trim();
        return Result.success(materialDatabaseOrchestrator.returnToPending(id, reason));
    }

    @DeleteMapping("/{id}")
    public Result<Boolean> delete(@PathVariable String id) {
        return Result.success(materialDatabaseOrchestrator.delete(id));
    }

    @PutMapping("/{id}/disable")
    public Result<Boolean> disable(@PathVariable String id) {
        return Result.success(materialDatabaseOrchestrator.disable(id));
    }

    @PutMapping("/{id}/enable")
    public Result<Boolean> enable(@PathVariable String id) {
        return Result.success(materialDatabaseOrchestrator.enable(id));
    }
}
