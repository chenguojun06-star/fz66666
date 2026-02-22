package com.fashion.supplychain.system.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.orchestration.ExcelImportOrchestrator;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/**
 * Excel 数据导入控制器
 * 提供 4 种数据类型的模板下载和 Excel 上传导入：
 * - style: 款式资料
 * - factory: 工厂/供应商
 * - employee: 员工/工人
 * - process: 工序模板
 *
 * 使用流程：下载模板 → 填写数据 → 上传导入
 */
@Slf4j
@RestController
@RequestMapping("/api/data-import")
@PreAuthorize("isAuthenticated()")
public class ExcelImportController {

    @Autowired
    private ExcelImportOrchestrator excelImportOrchestrator;

    /**
     * 下载 Excel 模板
     * @param type 数据类型: style / factory / employee / process
     */
    @GetMapping("/template/{type}")
    public ResponseEntity<byte[]> downloadTemplate(@PathVariable String type) {
        byte[] templateBytes = excelImportOrchestrator.generateTemplate(type);

        String fileName;
        switch (type) {
            case "style":
                fileName = "款式资料导入模板.xlsx";
                break;
            case "factory":
                fileName = "供应商导入模板.xlsx";
                break;
            case "employee":
                fileName = "员工导入模板.xlsx";
                break;
            case "process":
                fileName = "工序导入模板.xlsx";
                break;
            default:
                fileName = "导入模板.xlsx";
        }

        String encodedFileName = URLEncoder.encode(fileName, StandardCharsets.UTF_8).replace("+", "%20");

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename*=UTF-8''" + encodedFileName)
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .body(templateBytes);
    }

    /**
     * 上传 Excel 并导入数据
     * @param type 数据类型: style / factory / employee / process
     * @param file Excel 文件
     */
    @PostMapping("/upload/{type}")
    public Result<Map<String, Object>> uploadAndImport(
            @PathVariable String type,
            @RequestParam("file") MultipartFile file) {

        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("无法获取租户信息，请重新登录");
        }

        log.info("[Excel导入] 用户={}, 租户={}, 类型={}, 文件={}, 大小={}KB",
                UserContext.username(), tenantId, type,
                file.getOriginalFilename(), file.getSize() / 1024);

        Map<String, Object> result;
        switch (type) {
            case "style":
                result = excelImportOrchestrator.importStyles(tenantId, file);
                break;
            case "factory":
                result = excelImportOrchestrator.importFactories(tenantId, file);
                break;
            case "employee":
                result = excelImportOrchestrator.importEmployees(tenantId, file);
                break;
            case "process":
                result = excelImportOrchestrator.importProcesses(tenantId, file);
                break;
            default:
                return Result.fail("不支持的导入类型: " + type + "，可选值: style/factory/employee/process");
        }

        int failedCount = (int) result.getOrDefault("failedCount", 0);
        if (failedCount > 0) {
            // 部分失败，返回成功但附带失败详情
            return Result.success(result);
        }
        return Result.success(result);
    }
}
