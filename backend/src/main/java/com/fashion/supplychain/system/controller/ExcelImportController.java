package com.fashion.supplychain.system.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.orchestration.ExcelImportOrchestrator;
import com.fashion.supplychain.system.orchestration.SmartImportOrchestrator;
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
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Excel 数据导入控制器
 * 提供 8 种数据类型的模板下载和 Excel 上传导入（D-751 扩到 8 种）：
 * - style: 款式资料
 * - factory: 工厂/供应商
 * - employee: 员工/工人
 * - process: 工序模板
 * - customer: 客户档案
 * - material: 物料主档
 * - material-stock: 物料期初库存
 * - product-stock: 成品期初库存
 *
 * 使用流程：下载模板 → 填写数据 → 上传导入
 * 租户入驻推荐顺序：款式 → 供应商 → 客户 → 物料主档 → 期初库存(物料/成品) → 员工 → 工序
 */
@Slf4j
@RestController
@RequestMapping("/api/data-import")
@PreAuthorize("isAuthenticated()")
public class ExcelImportController {

    @Autowired
    private ExcelImportOrchestrator excelImportOrchestrator;

    @Autowired
    private SmartImportOrchestrator smartImportOrchestrator;

    private final ObjectMapper objectMapper = new ObjectMapper();

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
            case "customer":
                fileName = "客户导入模板.xlsx";
                break;
            case "material":
                fileName = "物料主档导入模板.xlsx";
                break;
            case "material-stock":
                fileName = "物料期初库存导入模板.xlsx";
                break;
            case "product-stock":
                fileName = "成品期初库存导入模板.xlsx";
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
     * @param type 数据类型: style / factory / employee / process / customer / material / material-stock / product-stock
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
            case "customer":
                result = excelImportOrchestrator.importCustomers(tenantId, file);
                break;
            case "material":
                result = excelImportOrchestrator.importMaterialMasters(tenantId, file);
                break;
            case "material-stock":
                result = excelImportOrchestrator.importMaterialOpeningStock(tenantId, file);
                break;
            case "product-stock":
                result = excelImportOrchestrator.importFinishedOpeningStock(tenantId, file);
                break;
            default:
                return Result.fail("不支持的导入类型: " + type
                        + "，可选值: style/factory/employee/process/customer/material/material-stock/product-stock");
        }

        int failedCount = (int) result.getOrDefault("failedCount", 0);
        if (failedCount > 0) {
            // 部分失败，返回成功但附带失败详情
            return Result.success(result);
        }
        return Result.success(result);
    }

    /**
     * 智能识别表头（D-751 二期）：不按模板，任意格式 Excel 丢进来，
     * 规则+AI 给出列映射建议，前端展示映射预览让用户确认后调 /upload-mapped。
     */
    @PostMapping("/smart-map/{type}")
    public Result<Map<String, Object>> smartMap(
            @PathVariable String type,
            @RequestParam("file") MultipartFile file) {
        try {
            return Result.success(smartImportOrchestrator.smartMap(type, file));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * 按确认后的映射导入（D-751 二期）：归一化成标准工作簿后走既有导入器，
     * 校验/失败明细/部分成功语义与普通导入完全一致。
     */
    @PostMapping("/upload-mapped/{type}")
    public Result<Map<String, Object>> uploadMapped(
            @PathVariable String type,
            @RequestParam("file") MultipartFile file,
            @RequestParam("mapping") String mappingJson) {

        Long tenantId = UserContext.tenantId();
        if (tenantId == null) {
            return Result.fail("无法获取租户信息，请重新登录");
        }
        Map<String, String> mapping;
        try {
            mapping = objectMapper.readValue(mappingJson,
                    objectMapper.getTypeFactory().constructMapType(LinkedHashMap.class, String.class, String.class));
        } catch (Exception e) {
            return Result.fail("映射参数格式错误");
        }

        log.info("[智能导入] 用户={}, 租户={}, 类型={}, 文件={}, 大小={}KB",
                UserContext.username(), tenantId, type,
                file.getOriginalFilename(), file.getSize() / 1024);
        try {
            return Result.success(smartImportOrchestrator.importMapped(tenantId, type, file, mapping));
        } catch (IllegalArgumentException e) {
            return Result.fail(e.getMessage());
        }
    }

    /**
     * ZIP 打包导入：款式资料 + 封面图片
     *
     * ZIP 结构规则：
     *   - 包含一个 Excel 文件（.xlsx/.xls），字段同款式导入模板
     *   - 图片文件名 = 款号（如 FZ2024001.jpg），自动关联为封面图
     *   - 支持 jpg/jpeg/png/gif/webp
     *   - 最大 500 条款式，ZIP 包 500MB 以内
     */
    @PostMapping("/upload-zip/style")
    public Result<Map<String, Object>> uploadZipAndImport(
            @RequestParam("file") MultipartFile file) {

        if (file == null || file.isEmpty()) return Result.fail("请上传 ZIP 文件");

        String filename = file.getOriginalFilename() == null ? "" : file.getOriginalFilename().toLowerCase();
        if (!filename.endsWith(".zip")) return Result.fail("仅支持 .zip 格式，请将 Excel + 图片一起压缩成 ZIP 后上传");

        Long tenantId = UserContext.tenantId();
        if (tenantId == null) return Result.fail("无法获取租户信息，请重新登录");

        log.info("[ZIP导入] 用户={}, 租户={}, 文件={}, 大小={}KB",
                UserContext.username(), tenantId, file.getOriginalFilename(), file.getSize() / 1024);

        Map<String, Object> result = excelImportOrchestrator.importStylesFromZip(tenantId, file);
        return Result.success(result);
    }
}
