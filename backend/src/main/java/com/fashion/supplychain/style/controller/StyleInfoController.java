package com.fashion.supplychain.style.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.orchestration.StyleDocOcrOrchestrator;
import com.fashion.supplychain.style.orchestration.StyleInfoOrchestrator;
import com.fashion.supplychain.style.service.ProductSkuService;
import org.springframework.http.MediaType;
import org.springframework.web.multipart.MultipartFile;
import com.baomidou.mybatisplus.core.metadata.IPage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import java.util.Map;
import java.util.NoSuchElementException;

/**
 * 款号资料Controller
 */
@RestController
@RequestMapping("/api/style/info")
@PreAuthorize("isAuthenticated()")
public class StyleInfoController {

    @Autowired
    private StyleInfoOrchestrator styleInfoOrchestrator;

    @Autowired
    private StyleDocOcrOrchestrator styleDocOcrOrchestrator;

    @Autowired
    private ProductSkuService productSkuService;

    /**
     * 分页查询款号资料列表
     */
    @GetMapping("/list")
    public Result<?> list(@RequestParam Map<String, Object> params) {
        IPage<StyleInfo> page = styleInfoOrchestrator.list(params);
        return Result.success(page);
    }

    /**
     * 获取样衣开发费用统计
     * 支持两种模式：
     * 1. rangeType 模式：day/week/month/year
     * 2. 自定义日期范围模式：startDate + endDate（格式：yyyy-MM-dd）
     */
    @GetMapping("/development-stats")
    public Result<?> getDevelopmentStats(
            @RequestParam(defaultValue = "day") String rangeType,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate) {
        if (startDate != null && endDate != null) {
            java.time.LocalDateTime start = java.time.LocalDate.parse(startDate).atStartOfDay();
            java.time.LocalDateTime end = java.time.LocalDate.parse(endDate).atTime(23, 59, 59);
            return Result.success(styleInfoOrchestrator.getDevelopmentStatsByDateRange(start, end));
        }
        return Result.success(styleInfoOrchestrator.getDevelopmentStats(rangeType));
    }

    /**
     * 顶部统计卡片数据（总数/进行中/已完成/已延期）
     * 支持可选 mode 参数：
     * - 默认或 mode=sample：所有启用状态款式（样衣开发列表页）
     * - mode=order：仅已下单款式 pushedToOrder=1（下单管理页）
     */
    @GetMapping("/stats")
    public Result<?> getStyleStats(@RequestParam(required = false) String mode) {
        return Result.success(styleInfoOrchestrator.getStyleStats(mode));
    }

    /**
     * 根据ID或款号查询详情。款式不存在时返回 data=null（200），不报404，
     * 适配样衣入库等"预填充"场景：未找到款式只是静默跳过，不是错误。
     */
    @GetMapping("/{id}")
    public Result<?> detail(@PathVariable("id") String idOrStyleNo) {
        try {
            return Result.success(styleInfoOrchestrator.detail(idOrStyleNo));
        } catch (NoSuchElementException e) {
            return Result.success(null);
        }
    }

    /**
     * 新增款号资料
     */
    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public Result<?> save(@RequestBody StyleInfo styleInfo) {
        styleInfoOrchestrator.save(styleInfo);
        return Result.success(styleInfo);
    }

    /**
     * 更新款号资料
     */
    @PutMapping
    public Result<?> update(@RequestBody StyleInfo styleInfo) {
        styleInfoOrchestrator.update(styleInfo);
        return Result.successMessage("操作成功");
    }

    @PutMapping("/{id}/size-color-config")
    public Result<?> updateSizeColorConfig(@PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        styleInfoOrchestrator.updateSizeColorConfig(id, body);
        return Result.successMessage("颜色尺码配置已保存，SKU 已自动生成");
    }

    @PutMapping("/{id}/production-requirements")
    public Result<?> updateProductionRequirements(@PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.updateProductionRequirements(id, body));
    }

    @PostMapping("/{id}/production-requirements/rollback")
    public Result<?> rollbackProductionRequirements(@PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.rollbackProductionRequirements(id, body));
    }

    @PostMapping("/{id}/pattern-revision/rollback")
    public Result<?> rollbackPatternRevision(@PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        return Result.success(styleInfoOrchestrator.rollbackPatternRevision(id, body));
    }

    @PostMapping("/{id}/pattern-revision/lock")
    public Result<?> lockPatternRevision(@PathVariable Long id) {
        styleInfoOrchestrator.lockPatternRevision(id);
        return Result.success();
    }

    @PostMapping("/{id}/production-requirements/lock")
    public Result<?> lockProductionRequirements(@PathVariable Long id) {
        styleInfoOrchestrator.lockProductionRequirements(id);
        return Result.success();
    }

    /**
     * 统一的阶段操作端点（替代14个分散端点）
     *
     * @param id 款式ID
     * @param stage 阶段：pattern/sample/bom/process/secondary
     * @param action 操作：start/complete/reset/progress/skip
     * @param body 可选参数（用于progress和reset）
     * @return 操作结果
     */
    @PostMapping("/{id}/stage-action")
    public Result<?> stageAction(
            @PathVariable Long id,
            @RequestParam String stage,
            @RequestParam String action,
            @RequestBody(required = false) Map<String, Object> body) {

        // 智能路由到对应的Orchestrator方法
        switch (stage.toLowerCase()) {
            case "pattern":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startPattern(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completePattern(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetPattern(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "sample":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startSample(id));
                    case "progress": return Result.success(styleInfoOrchestrator.updateSampleProgress(id, body));
                    case "complete": return Result.success(styleInfoOrchestrator.completeSample(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetSample(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "bom":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startBom(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeBom(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetBom(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "process":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startProcess(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeProcess(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetProcess(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "size-price":
            case "sizeprice":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startSizePrice(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeSizePrice(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetSizePrice(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "secondary":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startSecondary(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeSecondary(id));
                    case "skip": return Result.success(styleInfoOrchestrator.skipSecondary(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetSecondary(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "size":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startSize(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeSize(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetSize(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            case "production":
                switch (action.toLowerCase()) {
                    case "start": return Result.success(styleInfoOrchestrator.startProductionStage(id));
                    case "complete": return Result.success(styleInfoOrchestrator.completeProductionStage(id));
                    case "reset": return Result.success(styleInfoOrchestrator.resetProductionStage(id, body));
                    default: return Result.fail("不支持的操作: " + action);
                }
            default:
                return Result.fail("不支持的阶段: " + stage);
        }
    }

    /**
     * 检查生产要求是否被锁定（是否被订单引用）
     */
    @GetMapping("/{id}/production-req/lock")
    public Result<?> checkProductionReqLock(@PathVariable Long id) {
        boolean locked = styleInfoOrchestrator.isProductionReqLocked(id);
        return Result.success(Map.of("locked", locked));
    }

    /** 工序单价退回维护（主管权限） */
    @PostMapping("/{id}/process/reset")
    public Result<?> resetProcess(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return stageAction(id, "process", "reset", body);
    }

    /** 码数单价开始 */
    @PostMapping("/{id}/size-price/start")
    public Result<?> startSizePrice(@PathVariable Long id) {
        return stageAction(id, "size-price", "start", null);
    }

    /** 码数单价完成 */
    @PostMapping("/{id}/size-price/complete")
    public Result<?> completeSizePrice(@PathVariable Long id) {
        return stageAction(id, "size-price", "complete", null);
    }

    /** 码数单价退回维护（主管权限） */
    @PostMapping("/{id}/size-price/reset")
    public Result<?> resetSizePrice(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return stageAction(id, "size-price", "reset", body);
    }

    /**
         * 报废开发样，保留记录不删除
     */
    @PostMapping("/{id}/scrap")
    @PreAuthorize("isAuthenticated()")
    public Result<?> scrap(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        String reason = body != null && body.get("reason") != null ? String.valueOf(body.get("reason")) : null;
        return Result.success(styleInfoOrchestrator.scrap(id, reason));
    }

    /**
     * 保存样衣审核结论（评语选填）
     * 调用方式：POST /api/style/info/{id}/sample-review
     * Body：{ "reviewStatus": "PASS|REWORK|REJECT", "reviewComment": "...", "reviewImages": ["url1", "url2"] }
     */
    @PostMapping("/{id}/sample-review")
    public Result<?> saveSampleReview(
            @PathVariable Long id,
            @RequestBody(required = false) Map<String, Object> body) {
        String reviewStatus  = body != null ? (String) body.get("reviewStatus")  : null;
        String reviewComment = body != null ? (String) body.get("reviewComment") : null;
        Object reviewImages = body != null ? body.get("reviewImages") : null;
        return Result.success(styleInfoOrchestrator.saveSampleReview(id, reviewStatus, reviewComment, reviewImages));
    }

    /**
     * 一键复制款式（复制款式基础信息 + BOM 到新款色）
     * 调用方式：POST /api/style/info/{id}/copy
     * Body：{ "styleNo": "新款号", "color": "新颜色", "styleName": "新款名（可选）" }
     */
    @PostMapping("/{id}/copy")
    public Result<?> copyStyle(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        String newStyleNo   = body.get("styleNo");
        String newColor     = body.get("color");
        String newStyleName = body.get("styleName");
        return Result.success(styleInfoOrchestrator.copyStyle(id, newStyleNo, newColor, newStyleName));
    }

    /**
     * AI识别工艺单图片，提取生产要求文本
     */
    @PostMapping(value = "/{id}/recognize-requirement", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<?> recognizeRequirement(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        return Result.success(styleDocOcrOrchestrator.recognizeRequirementDoc(file));
    }

    /**
     * AI识别尺寸表图片，提取尺码和部位尺寸数据
     */
    @PostMapping(value = "/{id}/recognize-size-table", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<?> recognizeSizeTable(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        return Result.success(styleDocOcrOrchestrator.recognizeSizeTable(file));
    }

    /**
     * AI识别BOM物料清单图片，提取面料/辅料明细数据
     */
    @PostMapping(value = "/{id}/recognize-bom-table", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Result<?> recognizeBomTable(
            @PathVariable Long id,
            @RequestParam("file") MultipartFile file) {
        return Result.success(styleDocOcrOrchestrator.recognizeBomTable(file));
    }

    @PutMapping("/{id}/use-sku-prefix")
    public Result<?> updateUseSkuPrefix(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        Integer useSkuPrefix = (Integer) body.get("useSkuPrefix");
        productSkuService.updateUseSkuPrefix(id, useSkuPrefix);
        return Result.successMessage("操作成功");
    }
}
