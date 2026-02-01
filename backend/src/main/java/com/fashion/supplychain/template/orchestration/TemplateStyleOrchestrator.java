package com.fashion.supplychain.template.orchestration;

import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.entity.StyleProcess;
import com.fashion.supplychain.style.entity.StyleSize;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.style.service.StyleProcessService;
import com.fashion.supplychain.style.service.StyleSizeService;
import com.fashion.supplychain.template.entity.TemplateLibrary;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.NoSuchElementException;

/**
 * 模板与款式编排器
 *
 * 职责：协调template模块与style模块之间的数据流转
 * 实现模板应用到款式的跨模块编排
 *
 * @author Fashion Supply Chain System
 * @since 2026-02-01
 */
@Slf4j
@Service
public class TemplateStyleOrchestrator {

    @Autowired
    private TemplateLibraryService templateLibraryService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleProcessService styleProcessService;

    @Autowired
    private StyleSizeService styleSizeService;

    /**
     * 将模板应用到目标款式
     *
     * @param templateId 模板ID
     * @param targetStyleId 目标款式ID
     * @param mode 应用模式（overwrite/merge）
     * @return 是否成功
     */
    @Transactional(rollbackFor = Exception.class)
    public boolean applyTemplateToStyle(String templateId, Long targetStyleId, String mode) {
        if (templateId == null || templateId.trim().isEmpty()) {
            throw new IllegalArgumentException("templateId不能为空");
        }
        if (targetStyleId == null) {
            throw new IllegalArgumentException("targetStyleId不能为空");
        }

        // 查询目标款式
        StyleInfo style = styleInfoService.getById(targetStyleId);
        if (style == null) {
            throw new NoSuchElementException("目标款号不存在");
        }

        // 查询模板
        TemplateLibrary template = templateLibraryService.getById(templateId);
        if (template == null) {
            throw new NoSuchElementException("模板不存在");
        }

        String templateType = template.getTemplateType();
        if (templateType == null) {
            throw new IllegalArgumentException("模板类型不能为空");
        }

        String m = mode == null ? "" : mode.trim().toLowerCase();
        boolean overwrite = "overwrite".equals(m) || "cover".equals(m) || "true".equals(m);

        log.info("开始应用模板到款式: templateId={}, targetStyleId={}, templateType={}, mode={}",
                templateId, targetStyleId, templateType, mode);

        // 根据模板类型调用对应的Service方法
        boolean result = templateLibraryService.applyToStyle(templateId, targetStyleId, mode);

        log.info("模板应用完成: templateId={}, targetStyleId={}, result={}",
                templateId, targetStyleId, result);

        return result;
    }

    /**
     * 从款式创建模板
     *
     * @param sourceStyleNo 源款号
     * @param templateTypes 模板类型列表
     * @return 创建的模板列表
     */
    @Transactional(rollbackFor = Exception.class)
    public List<TemplateLibrary> createTemplateFromStyle(String sourceStyleNo, List<String> templateTypes) {
        if (sourceStyleNo == null || sourceStyleNo.trim().isEmpty()) {
            throw new IllegalArgumentException("sourceStyleNo不能为空");
        }

        // 查询源款式
        StyleInfo style = styleInfoService.lambdaQuery()
                .eq(StyleInfo::getStyleNo, sourceStyleNo.trim())
                .one();
        if (style == null || style.getId() == null) {
            throw new NoSuchElementException("款号不存在: " + sourceStyleNo);
        }

        log.info("开始从款式创建模板: sourceStyleNo={}, templateTypes={}",
                sourceStyleNo, templateTypes);

        // 调用Service方法创建模板
        List<TemplateLibrary> created = templateLibraryService.createFromStyle(sourceStyleNo, templateTypes);

        log.info("模板创建完成: sourceStyleNo={}, createdCount={}",
                sourceStyleNo, created.size());

        return created;
    }

    /**
     * 批量应用BOM模板到款式
     *
     * @param templateId 模板ID
     * @param targetStyleIds 目标款式ID列表
     * @param overwrite 是否覆盖
     * @return 成功应用的款式数
     */
    @Transactional(rollbackFor = Exception.class)
    public int batchApplyBomTemplate(String templateId, List<Long> targetStyleIds, boolean overwrite) {
        if (templateId == null || templateId.trim().isEmpty()) {
            throw new IllegalArgumentException("templateId不能为空");
        }
        if (targetStyleIds == null || targetStyleIds.isEmpty()) {
            return 0;
        }

        TemplateLibrary template = templateLibraryService.getById(templateId);
        if (template == null) {
            throw new NoSuchElementException("模板不存在");
        }

        if (!"bom".equals(template.getTemplateType())) {
            throw new IllegalArgumentException("模板类型必须是bom");
        }

        int successCount = 0;
        String mode = overwrite ? "overwrite" : "merge";

        for (Long styleId : targetStyleIds) {
            try {
                boolean result = applyTemplateToStyle(templateId, styleId, mode);
                if (result) {
                    successCount++;
                }
            } catch (Exception e) {
                log.error("应用BOM模板失败: templateId={}, styleId={}", templateId, styleId, e);
            }
        }

        log.info("批量应用BOM模板完成: templateId={}, targetCount={}, successCount={}",
                templateId, targetStyleIds.size(), successCount);

        return successCount;
    }

    /**
     * 批量应用工序模板到款式
     *
     * @param templateId 模板ID
     * @param targetStyleIds 目标款式ID列表
     * @param overwrite 是否覆盖
     * @return 成功应用的款式数
     */
    @Transactional(rollbackFor = Exception.class)
    public int batchApplyProcessTemplate(String templateId, List<Long> targetStyleIds, boolean overwrite) {
        if (templateId == null || templateId.trim().isEmpty()) {
            throw new IllegalArgumentException("templateId不能为空");
        }
        if (targetStyleIds == null || targetStyleIds.isEmpty()) {
            return 0;
        }

        TemplateLibrary template = templateLibraryService.getById(templateId);
        if (template == null) {
            throw new NoSuchElementException("模板不存在");
        }

        String templateType = template.getTemplateType();
        if (!"process".equals(templateType) && !"process_price".equals(templateType)) {
            throw new IllegalArgumentException("模板类型必须是process或process_price");
        }

        int successCount = 0;
        String mode = overwrite ? "overwrite" : "merge";

        for (Long styleId : targetStyleIds) {
            try {
                boolean result = applyTemplateToStyle(templateId, styleId, mode);
                if (result) {
                    successCount++;
                }
            } catch (Exception e) {
                log.error("应用工序模板失败: templateId={}, styleId={}", templateId, styleId, e);
            }
        }

        log.info("批量应用工序模板完成: templateId={}, targetCount={}, successCount={}",
                templateId, targetStyleIds.size(), successCount);

        return successCount;
    }
}
