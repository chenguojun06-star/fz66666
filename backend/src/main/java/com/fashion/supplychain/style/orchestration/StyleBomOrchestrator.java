package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.production.orchestration.MaterialDatabaseOrchestrator;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.MaterialStockService;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.RoundingMode;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import com.fashion.supplychain.common.UserContext;

@Service
@Slf4j
public class StyleBomOrchestrator {

    private static final ExecutorService MATERIAL_SYNC_EXECUTOR = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r);
        t.setName("material-sync-worker");
        t.setDaemon(true);
        return t;
    });

    private static final ConcurrentHashMap<String, Map<String, Object>> SYNC_JOBS = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<Long, String> RUNNING_JOB_BY_STYLE_ID = new ConcurrentHashMap<>();

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Autowired
    private MaterialDatabaseOrchestrator materialDatabaseOrchestrator;

    @Autowired
    private MaterialPurchaseService materialPurchaseService;

    @Autowired
    private MaterialStockService materialStockService;

    @Autowired
    private StyleQuotationOrchestrator styleQuotationOrchestrator;

    public List<StyleBom> listByStyleId(Long styleId) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        return styleBomService.listByStyleId(styleId);
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean save(StyleBom styleBom) {
        if (styleBom == null || styleBom.getStyleId() == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }
        normalizeAndCalc(styleBom);
        if (styleBom.getCreateTime() == null) {
            styleBom.setCreateTime(LocalDateTime.now());
        }
        styleBom.setUpdateTime(LocalDateTime.now());
        boolean ok = styleBomService.save(styleBom);
        // 样衣阶段不自动同步到模板库
        // if (ok) {
        //     tryCreateBomTemplate(styleBom.getStyleId());
        //     autoSyncBomRow(styleBom);
        // }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }

        // BOM变更后自动重算报价单
        try {
            styleQuotationOrchestrator.recalculateFromLiveData(styleBom.getStyleId());
        } catch (Exception e) {
            log.warn("Auto-sync quotation failed after BOM save: styleId={}, error={}", styleBom.getStyleId(), e.getMessage());
        }

        // 跟单员 = 填写BOM信息的人（自动填充到款式基础信息）
        try {
            String currentUser = UserContext.username();
            if (StringUtils.hasText(currentUser)) {
                StyleInfo styleInfo = styleInfoService.getById(styleBom.getStyleId());
                if (styleInfo != null && !StringUtils.hasText(styleInfo.getOrderType())) {
                    styleInfo.setOrderType(currentUser);
                    styleInfoService.updateById(styleInfo);
                    log.info("Synced merchandiser to style info: styleId={}, merchandiser={}", styleBom.getStyleId(), currentUser);
                }
            }
        } catch (Exception e) {
            log.warn("Failed to sync merchandiser: styleId={}, error={}", styleBom.getStyleId(), e.getMessage());
        }

        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean update(StyleBom styleBom) {
        if (styleBom == null || styleBom.getId() == null) {
            throw new IllegalArgumentException("id不能为空");
        }
        StyleBom current = styleBomService.getById(styleBom.getId());
        if (current == null) {
            throw new NoSuchElementException("记录不存在");
        }
        if (styleBom.getStyleId() == null) {
            styleBom.setStyleId(current.getStyleId());
        }
        normalizeAndCalc(styleBom);
        styleBom.setUpdateTime(LocalDateTime.now());
        boolean ok = styleBomService.updateById(styleBom);

        // BOM变更后自动重算报价单
        if (ok) {
            Long sid = styleBom.getStyleId() != null ? styleBom.getStyleId() : current.getStyleId();
            try {
                styleQuotationOrchestrator.recalculateFromLiveData(sid);
            } catch (Exception e) {
                log.warn("Auto-sync quotation failed after BOM update: styleId={}, error={}", sid, e.getMessage());
            }
        }

        // 样衣阶段不自动同步到模板库
        // if (ok) {
        //     Long styleId = styleBom.getStyleId() != null ? styleBom.getStyleId() : current.getStyleId();
        //     tryCreateBomTemplate(styleId);
        //     StyleBom merged = new StyleBom();
        //     merged.setId(styleBom.getId());
        //     merged.setStyleId(styleId);
        //     merged.setMaterialCode(StringUtils.hasText(styleBom.getMaterialCode()) ? styleBom.getMaterialCode() : current.getMaterialCode());
        //     merged.setMaterialName(StringUtils.hasText(styleBom.getMaterialName()) ? styleBom.getMaterialName() : current.getMaterialName());
        //     merged.setMaterialType(StringUtils.hasText(styleBom.getMaterialType()) ? styleBom.getMaterialType() : current.getMaterialType());
        //     merged.setUnit(StringUtils.hasText(styleBom.getUnit()) ? styleBom.getUnit() : current.getUnit());
        //     merged.setSupplier(StringUtils.hasText(styleBom.getSupplier()) ? styleBom.getSupplier() : current.getSupplier());
        //     merged.setSpecification(StringUtils.hasText(styleBom.getSpecification()) ? styleBom.getSpecification() : current.getSpecification());
        //     merged.setUnitPrice(styleBom.getUnitPrice() != null ? styleBom.getUnitPrice() : current.getUnitPrice());
        //     merged.setRemark(StringUtils.hasText(styleBom.getRemark()) ? styleBom.getRemark() : current.getRemark());
        //     autoSyncBomRow(merged);
        // }
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        return true;
    }

    public boolean delete(String id) {
        // 先获取 styleId 再删除，以便重算报价
        StyleBom current = styleBomService.getById(id);
        Long styleId = current != null ? current.getStyleId() : null;

        boolean ok = styleBomService.removeById(id);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }

        // BOM删除后自动重算报价单
        if (styleId != null) {
            try {
                styleQuotationOrchestrator.recalculateFromLiveData(styleId);
            } catch (Exception e) {
                log.warn("Auto-sync quotation failed after BOM delete: styleId={}, error={}", styleId, e.getMessage());
            }
        }
        return true;
    }

    public Map<String, Object> syncToMaterialDatabase(Long styleId, boolean forceUpdateCompleted) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }

        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }
        String styleNo = StringUtils.hasText(style.getStyleNo()) ? style.getStyleNo().trim() : null;

        List<StyleBom> bomRows = styleBomService.listByStyleId(styleId);
        int totalBomRows = bomRows == null ? 0 : bomRows.size();

        Set<String> codes = new HashSet<>();
        if (bomRows != null) {
            for (StyleBom b : bomRows) {
                if (b == null) {
                    continue;
                }
                String code = StringUtils.hasText(b.getMaterialCode()) ? b.getMaterialCode().trim() : null;
                if (StringUtils.hasText(code)) {
                    codes.add(code);
                }
            }
        }

        Map<String, MaterialDatabase> existingByCode = new HashMap<>();
        if (!codes.isEmpty()) {
            List<MaterialDatabase> existed = materialDatabaseService.lambdaQuery()
                    .in(MaterialDatabase::getMaterialCode, codes)
                    .and(w -> w.isNull(MaterialDatabase::getDeleteFlag).or().eq(MaterialDatabase::getDeleteFlag, 0))
                    .orderByDesc(MaterialDatabase::getUpdateTime)
                    .list();
            for (MaterialDatabase m : existed) {
                if (m == null) {
                    continue;
                }
                String code = StringUtils.hasText(m.getMaterialCode()) ? m.getMaterialCode().trim() : null;
                if (!StringUtils.hasText(code)) {
                    continue;
                }
                existingByCode.putIfAbsent(code, m);
            }
        }

        int created = 0;
        int updated = 0;
        int skippedInvalid = 0;
        int skippedCompleted = 0;
        int failed = 0;
        List<Map<String, Object>> details = new ArrayList<>();

        if (bomRows != null) {
            for (StyleBom b : bomRows) {
                if (b == null) {
                    continue;
                }

                String code = StringUtils.hasText(b.getMaterialCode()) ? b.getMaterialCode().trim() : null;
                String name = StringUtils.hasText(b.getMaterialName()) ? b.getMaterialName().trim() : null;
                String unit = StringUtils.hasText(b.getUnit()) ? b.getUnit().trim() : null;
                String supplierName = StringUtils.hasText(b.getSupplier()) ? b.getSupplier().trim() : null;

                String invalidReason = null;
                if (!StringUtils.hasText(code)) {
                    invalidReason = "物料编码为空";
                } else if (!StringUtils.hasText(name)) {
                    invalidReason = "物料名称为空";
                } else if (!StringUtils.hasText(unit)) {
                    invalidReason = "单位为空";
                } else if (!StringUtils.hasText(supplierName)) {
                    invalidReason = "供应商为空";
                }

                if (invalidReason != null) {
                    skippedInvalid += 1;
                    if (details.size() < 100) {
                        details.add(new LinkedHashMap<>(
                                Map.of("materialCode", code == null ? "" : code, "status", "skipped", "reason",
                                        invalidReason)));
                    }
                    continue;
                }

                String mt = StringUtils.hasText(b.getMaterialType()) ? b.getMaterialType().trim().toLowerCase() : null;
                String normalizedType;
                if (mt == null) {
                    normalizedType = "accessory";
                } else if (mt.startsWith("fabric")) {
                    normalizedType = "fabric";
                } else if (mt.startsWith("lining")) {
                    normalizedType = "lining";
                } else if (mt.startsWith("accessory")) {
                    normalizedType = "accessory";
                } else {
                    normalizedType = mt;
                }

                String specifications = StringUtils.hasText(b.getSpecification()) ? b.getSpecification().trim() : null;
                String remark = StringUtils.hasText(b.getRemark()) ? b.getRemark().trim() : null;

                MaterialDatabase current = existingByCode.get(code);
                if (current != null) {
                    String st = StringUtils.hasText(current.getStatus()) ? current.getStatus().trim().toLowerCase() : "";
                    if ("completed".equals(st) && !forceUpdateCompleted) {
                        skippedCompleted += 1;
                        if (details.size() < 100) {
                            details.add(new LinkedHashMap<>(
                                    Map.of("materialCode", code, "status", "skipped", "reason", "已完成，未覆盖")));
                        }
                        continue;
                    }
                }

                try {
                    if (current == null) {
                        MaterialDatabase toCreate = new MaterialDatabase();
                        toCreate.setMaterialCode(code);
                        toCreate.setMaterialName(name);
                        toCreate.setStyleNo(styleNo);
                        toCreate.setMaterialType(normalizedType);
                        toCreate.setSpecifications(specifications);
                        toCreate.setUnit(unit);
                        toCreate.setSupplierName(supplierName);
                        toCreate.setUnitPrice(b.getUnitPrice());
                        toCreate.setRemark(remark);
                        materialDatabaseOrchestrator.save(toCreate);
                        created += 1;
                    } else {
                        MaterialDatabase patch = new MaterialDatabase();
                        patch.setId(current.getId());
                        patch.setMaterialCode(code);
                        patch.setMaterialName(name);
                        patch.setStyleNo(styleNo);
                        patch.setMaterialType(normalizedType);
                        patch.setSpecifications(specifications);
                        patch.setUnit(unit);
                        patch.setSupplierName(supplierName);
                        patch.setUnitPrice(b.getUnitPrice());
                        patch.setRemark(remark);
                        materialDatabaseOrchestrator.update(patch);
                        updated += 1;
                    }
                } catch (Exception e) {
                    failed += 1;
                    if (details.size() < 100) {
                        String msg = e.getMessage() == null ? "同步失败" : e.getMessage();
                        details.add(new LinkedHashMap<>(Map.of("materialCode", code, "status", "failed", "reason", msg)));
                    }
                }
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("styleId", styleId);
        out.put("styleNo", styleNo == null ? "" : styleNo);
        out.put("totalBomRows", totalBomRows);
        out.put("created", created);
        out.put("updated", updated);
        out.put("skippedInvalid", skippedInvalid);
        out.put("skippedCompleted", skippedCompleted);
        out.put("failed", failed);
        out.put("details", details);
        return out;
    }

    public Map<String, Object> startSyncToMaterialDatabaseJob(Long styleId, boolean forceUpdateCompleted) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }

        String existed = RUNNING_JOB_BY_STYLE_ID.get(styleId);
        if (StringUtils.hasText(existed)) {
            Map<String, Object> job = SYNC_JOBS.get(existed);
            if (job != null) {
                return new LinkedHashMap<>(Map.of("jobId", existed, "status", job.getOrDefault("status", "running")));
            }
        }

        String jobId = UUID.randomUUID().toString();
        Map<String, Object> job = new LinkedHashMap<>();
        job.put("jobId", jobId);
        job.put("styleId", styleId);
        job.put("status", "queued");
        job.put("forceUpdateCompleted", forceUpdateCompleted);
        job.put("createTime", LocalDateTime.now().toString());
        job.put("updateTime", LocalDateTime.now().toString());
        job.put("result", null);
        job.put("error", null);
        SYNC_JOBS.put(jobId, job);
        RUNNING_JOB_BY_STYLE_ID.put(styleId, jobId);

        MATERIAL_SYNC_EXECUTOR.submit(() -> {
            try {
                job.put("status", "running");
                job.put("updateTime", LocalDateTime.now().toString());
                Map<String, Object> result = syncToMaterialDatabase(styleId, forceUpdateCompleted);
                job.put("result", result);
                job.put("status", "done");
                job.put("updateTime", LocalDateTime.now().toString());
            } catch (Exception e) {
                job.put("status", "failed");
                job.put("error", e.getMessage() == null ? "同步失败" : e.getMessage());
                job.put("updateTime", LocalDateTime.now().toString());
                log.warn("Material database sync job failed: jobId={}, styleId={}", jobId, styleId, e);
            } finally {
                RUNNING_JOB_BY_STYLE_ID.remove(styleId, jobId);
            }
        });

        return new LinkedHashMap<>(Map.of("jobId", jobId, "status", "queued"));
    }

    public Map<String, Object> getSyncJob(String jobId) {
        if (!StringUtils.hasText(jobId)) {
            throw new IllegalArgumentException("jobId不能为空");
        }
        Map<String, Object> job = SYNC_JOBS.get(jobId.trim());
        if (job == null) {
            throw new NoSuchElementException("任务不存在");
        }
        return job;
    }

    private void tryCreateBomTemplate(Long styleId) {
        try {
            StyleInfo style = styleId == null ? null : styleInfoService.getById(styleId);
            String styleNo = style == null ? null : style.getStyleNo();
            if (styleNo != null && !styleNo.trim().isEmpty()) {
                Map<String, Object> body = new HashMap<>();
                body.put("sourceStyleNo", styleNo.trim());
                body.put("templateTypes", List.of("bom"));
                templateLibraryOrchestrator.createFromStyle(body);
            }
        } catch (Exception e) {
            log.warn("Failed to sync templates from style bom: styleId={}", styleId, e);
        }
    }

    private void autoSyncBomRow(StyleBom styleBom) {
        if (styleBom == null || styleBom.getStyleId() == null) {
            return;
        }
        String code = StringUtils.hasText(styleBom.getMaterialCode()) ? styleBom.getMaterialCode().trim() : null;
        if (!StringUtils.hasText(code)) {
            return;
        }

        StyleInfo style = styleInfoService.getById(styleBom.getStyleId());
        String styleNo = style == null ? null : (StringUtils.hasText(style.getStyleNo()) ? style.getStyleNo().trim() : null);

        MaterialDatabase existed = materialDatabaseService.lambdaQuery()
                .eq(MaterialDatabase::getMaterialCode, code)
                .and(w -> w.isNull(MaterialDatabase::getDeleteFlag).or().eq(MaterialDatabase::getDeleteFlag, 0))
                .orderByDesc(MaterialDatabase::getUpdateTime)
                .last("limit 1")
                .one();

        if (existed == null) {
            String name = StringUtils.hasText(styleBom.getMaterialName()) ? styleBom.getMaterialName().trim() : null;
            String unit = StringUtils.hasText(styleBom.getUnit()) ? styleBom.getUnit().trim() : null;
            String supplierName = StringUtils.hasText(styleBom.getSupplier()) ? styleBom.getSupplier().trim() : null;
            if (!StringUtils.hasText(name)) {
                throw new IllegalArgumentException("物料名称不能为空");
            }
            if (!StringUtils.hasText(unit)) {
                throw new IllegalArgumentException("单位不能为空");
            }
            if (!StringUtils.hasText(supplierName)) {
                throw new IllegalArgumentException("供应商不能为空");
            }
        }

        String mt = StringUtils.hasText(styleBom.getMaterialType()) ? styleBom.getMaterialType().trim().toLowerCase() : null;
        String normalizedType;
        if (mt == null) {
            normalizedType = "accessory";
        } else if (mt.startsWith("fabric")) {
            normalizedType = "fabric";
        } else if (mt.startsWith("lining")) {
            normalizedType = "lining";
        } else if (mt.startsWith("accessory")) {
            normalizedType = "accessory";
        } else {
            normalizedType = mt;
        }

        if (existed != null) {
            String st = StringUtils.hasText(existed.getStatus()) ? existed.getStatus().trim().toLowerCase() : "";
            if ("completed".equals(st)) {
                return;
            }

            MaterialDatabase patch = new MaterialDatabase();
            patch.setId(existed.getId());
            patch.setMaterialCode(code);
            patch.setMaterialName(styleBom.getMaterialName());
            patch.setStyleNo(styleNo);
            patch.setMaterialType(normalizedType);
            patch.setSpecifications(styleBom.getSpecification());
            patch.setUnit(styleBom.getUnit());
            patch.setSupplierName(styleBom.getSupplier());
            patch.setUnitPrice(styleBom.getUnitPrice());
            patch.setRemark(styleBom.getRemark());
            materialDatabaseOrchestrator.update(patch);
            return;
        }

        MaterialDatabase toCreate = new MaterialDatabase();
        toCreate.setMaterialCode(code);
        toCreate.setMaterialName(styleBom.getMaterialName());
        toCreate.setStyleNo(styleNo);
        toCreate.setMaterialType(normalizedType);
        toCreate.setSpecifications(styleBom.getSpecification());
        toCreate.setUnit(styleBom.getUnit());
        toCreate.setSupplierName(styleBom.getSupplier());
        toCreate.setUnitPrice(styleBom.getUnitPrice());
        toCreate.setRemark(styleBom.getRemark());
        materialDatabaseOrchestrator.save(toCreate);
    }

    // ==================== 库存检查（跨模块编排） ====================

    /**
     * 保存BOM并检查库存（跨模块编排：style BOM + production MaterialStock）
     * 从 StyleBomServiceImpl 迁移，消除 Service 层跨模块依赖
     */
    @Transactional(rollbackFor = Exception.class)
    public List<StyleBom> saveBomWithStockCheck(List<StyleBom> bomList, Integer productionQty) {
        if (bomList == null || bomList.isEmpty()) {
            throw new RuntimeException("BOM列表不能为空");
        }
        if (productionQty == null || productionQty <= 0) {
            throw new RuntimeException("生产数量必须大于0");
        }

        Long styleId = bomList.get(0).getStyleId();
        log.info("开始保存BOM并检查库存: 款号ID={}, 生产数量={}, BOM条数={}",
                styleId, productionQty, bomList.size());

        // 清除BOM缓存（数据变更时主动失效）
        styleBomService.clearBomCache(styleId);

        // 遍历每个BOM项，检查库存
        for (StyleBom bom : bomList) {
            int requiredQty = calculateRequirement(bom, productionQty);
            MaterialStock stock = findStock(bom);

            int availableQty = 0;
            if (stock != null) {
                availableQty = (stock.getQuantity() != null ? stock.getQuantity() : 0)
                             - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0);
                availableQty = Math.max(0, availableQty);
            }

            if (availableQty >= requiredQty) {
                bom.setStockStatus("sufficient");
                bom.setRequiredPurchase(0);
            } else if (availableQty > 0) {
                bom.setStockStatus("insufficient");
                bom.setRequiredPurchase(requiredQty - availableQty);
            } else {
                bom.setStockStatus("none");
                bom.setRequiredPurchase(requiredQty);
            }
            bom.setAvailableStock(availableQty);

            log.debug("BOM库存检查: 物料={}, 颜色={}, 需求={}, 可用={}, 状态={}, 需采购={}",
                    bom.getMaterialCode(), bom.getColor(), requiredQty, availableQty,
                    bom.getStockStatus(), bom.getRequiredPurchase());
        }

        // 批量更新BOM（只更新已存在的记录）
        List<StyleBom> existingBoms = bomList.stream()
                .filter(bom -> bom.getId() != null && !bom.getId().trim().isEmpty())
                .collect(java.util.stream.Collectors.toList());

        if (!existingBoms.isEmpty()) {
            styleBomService.updateBatchById(existingBoms);
            log.info("BOM库存状态更新完成: 更新了{}条记录", existingBoms.size());
        } else {
            log.warn("BOM列表中没有已保存的记录，跳过更新");
        }

        return bomList;
    }

    /**
     * 获取BOM库存汇总信息（跨模块编排：style BOM + production MaterialStock）
     * 从 StyleBomServiceImpl 迁移，消除 Service 层跨模块依赖
     */
    public Map<String, Object> getBomStockSummary(Long styleId, Integer productionQty) {
        List<StyleBom> bomList = styleBomService.listByStyleId(styleId);

        if (bomList.isEmpty()) {
            Map<String, Object> emptySummary = new HashMap<>();
            emptySummary.put("totalItems", 0);
            emptySummary.put("sufficientCount", 0);
            emptySummary.put("insufficientCount", 0);
            emptySummary.put("noneCount", 0);
            emptySummary.put("allSufficient", false);
            return emptySummary;
        }

        int totalItems = bomList.size();
        int sufficientCount = 0;
        int insufficientCount = 0;
        int noneCount = 0;
        int totalRequiredPurchase = 0;
        BigDecimal totalPurchaseValue = BigDecimal.ZERO;

        for (StyleBom bom : bomList) {
            if (bom.getStockStatus() == null || "unchecked".equals(bom.getStockStatus())) {
                int requiredQty = calculateRequirement(bom, productionQty);
                MaterialStock stock = findStock(bom);
                int availableQty = 0;
                if (stock != null) {
                    availableQty = Math.max(0,
                            (stock.getQuantity() != null ? stock.getQuantity() : 0)
                                    - (stock.getLockedQuantity() != null ? stock.getLockedQuantity() : 0));
                }

                if (availableQty >= requiredQty) {
                    bom.setStockStatus("sufficient");
                    bom.setRequiredPurchase(0);
                } else if (availableQty > 0) {
                    bom.setStockStatus("insufficient");
                    bom.setRequiredPurchase(requiredQty - availableQty);
                } else {
                    bom.setStockStatus("none");
                    bom.setRequiredPurchase(requiredQty);
                }
                bom.setAvailableStock(availableQty);
            }

            switch (bom.getStockStatus()) {
                case "sufficient":
                    sufficientCount++;
                    break;
                case "insufficient":
                    insufficientCount++;
                    break;
                case "none":
                    noneCount++;
                    break;
            }

            if (bom.getRequiredPurchase() != null && bom.getRequiredPurchase() > 0) {
                totalRequiredPurchase += bom.getRequiredPurchase();
                if (bom.getUnitPrice() != null) {
                    BigDecimal purchaseValue = bom.getUnitPrice()
                            .multiply(BigDecimal.valueOf(bom.getRequiredPurchase()));
                    totalPurchaseValue = totalPurchaseValue.add(purchaseValue);
                }
            }
        }

        Map<String, Object> summary = new HashMap<>();
        summary.put("totalItems", totalItems);
        summary.put("sufficientCount", sufficientCount);
        summary.put("insufficientCount", insufficientCount);
        summary.put("noneCount", noneCount);
        summary.put("allSufficient", sufficientCount == totalItems);
        summary.put("totalRequiredPurchase", totalRequiredPurchase);
        summary.put("totalPurchaseValue", totalPurchaseValue);
        summary.put("bomList", bomList);

        return summary;
    }

    /**
     * 计算BOM物料需求量
     * 公式：单件用量 × 生产数量 × (1 + 损耗率)
     */
    private int calculateRequirement(StyleBom bom, Integer productionQty) {
        if (bom.getUsageAmount() == null) {
            return 0;
        }
        BigDecimal usageAmount = bom.getUsageAmount();
        BigDecimal qty = BigDecimal.valueOf(productionQty);
        BigDecimal lossRate = bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO;
        BigDecimal lossFactor = BigDecimal.ONE.add(lossRate.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
        BigDecimal requirement = usageAmount.multiply(qty).multiply(lossFactor);
        return requirement.setScale(0, RoundingMode.UP).intValue();
    }

    /**
     * 查找库存记录（按物料编码、颜色、尺码精确匹配）
     */
    private MaterialStock findStock(StyleBom bom) {
        LambdaQueryWrapper<MaterialStock> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MaterialStock::getMaterialCode, bom.getMaterialCode());
        if (bom.getColor() != null && !bom.getColor().trim().isEmpty()) {
            wrapper.eq(MaterialStock::getColor, bom.getColor());
        }
        if (bom.getSize() != null && !bom.getSize().trim().isEmpty()) {
            wrapper.eq(MaterialStock::getSize, bom.getSize());
        }
        List<MaterialStock> stockList = materialStockService.list(wrapper);
        if (stockList.isEmpty()) {
            return null;
        }
        return stockList.stream()
                .max((s1, s2) -> {
                    int qty1 = (s1.getQuantity() != null ? s1.getQuantity() : 0)
                            - (s1.getLockedQuantity() != null ? s1.getLockedQuantity() : 0);
                    int qty2 = (s2.getQuantity() != null ? s2.getQuantity() : 0)
                            - (s2.getLockedQuantity() != null ? s2.getLockedQuantity() : 0);
                    return Integer.compare(qty1, qty2);
                })
                .orElse(null);
    }

    private void normalizeAndCalc(StyleBom styleBom) {
        BigDecimal usageAmount = styleBom.getUsageAmount() == null ? BigDecimal.ZERO : styleBom.getUsageAmount();
        BigDecimal lossRate = styleBom.getLossRate() == null ? BigDecimal.ZERO : styleBom.getLossRate();
        BigDecimal unitPrice = styleBom.getUnitPrice() == null ? BigDecimal.ZERO : styleBom.getUnitPrice();

        BigDecimal qty = usageAmount.multiply(BigDecimal.ONE.add(lossRate.movePointLeft(2)));
        styleBom.setTotalPrice(qty.multiply(unitPrice));
    }

    /**
     * 根据BOM配置生成物料采购记录（样衣开发阶段），不支持强制重置
     */
    @Transactional(rollbackFor = Exception.class)
    public int generatePurchase(Long styleId) {
        return generatePurchase(styleId, false);
    }

    /**
     * 根据BOM配置生成物料采购记录（样衣开发阶段）
     *
     * @param styleId 款式ID
     * @param force   true=强制重新生成（先软删除已有记录再重建）；false=若已存在则报错
     * @return 生成的采购记录数量
     */
    @Transactional(rollbackFor = Exception.class)
    public int generatePurchase(Long styleId, boolean force) {
        if (styleId == null || styleId <= 0) {
            throw new IllegalArgumentException("款式ID不能为空");
        }

        // 查询款式信息
        StyleInfo styleInfo = styleInfoService.getById(styleId);
        if (styleInfo == null) {
            throw new NoSuchElementException("款式不存在");
        }

        // 查询BOM配置
        List<StyleBom> bomList = listByStyleId(styleId);
        if (bomList == null || bomList.isEmpty()) {
            throw new IllegalStateException("该款式尚未配置BOM");
        }

        // 检查是否已经生成过采购记录（样衣类型）
        LambdaQueryWrapper<MaterialPurchase> existsWrapper = new LambdaQueryWrapper<>();
        existsWrapper.eq(MaterialPurchase::getStyleId, String.valueOf(styleId))
                .eq(MaterialPurchase::getSourceType, "sample")
                .eq(MaterialPurchase::getDeleteFlag, 0);
        long existsCount = materialPurchaseService.count(existsWrapper);

        if (existsCount > 0) {
            if (!force) {
                throw new IllegalStateException("该款式已生成过样衣采购记录，请勿重复生成");
            }
            // force=true：软删除已有的样衣采购记录（状态为pending的才允许删除）
            List<MaterialPurchase> existingRecords = materialPurchaseService.list(existsWrapper);
            int softDeletedCount = 0;
            for (MaterialPurchase mp : existingRecords) {
                String status = mp.getStatus() == null ? "" : mp.getStatus().trim().toLowerCase();
                if (MaterialConstants.STATUS_PENDING.equals(status)) {
                    mp.setDeleteFlag(1);
                    mp.setUpdateTime(LocalDateTime.now());
                    materialPurchaseService.updateById(mp);
                    softDeletedCount++;
                } else {
                    log.warn("样衣采购记录已{}，无法删除，跳过重新生成: purchaseNo={}", status, mp.getPurchaseNo());
                }
            }
            log.info("强制重新生成：软删除 {} 条旧样衣采购记录: styleId={}", softDeletedCount, styleId);
        }

        // ---- 解析 size_color_config，提取颜色列表和款式总件数 ----
        String colorStr = null;
        String sizeStr = null;
        int styleTotalQty = 0;

        String sizeColorConfig = styleInfo.getSizeColorConfig();
        if (StringUtils.hasText(sizeColorConfig)) {
            try {
                ObjectMapper om = new ObjectMapper();
                JsonNode root = om.readTree(sizeColorConfig);
                // 格式示例：{"sizes":["S","M"],"colors":["红色","蓝色"],"quantities":[10,5,8,4],...}
                // colors 与 sizes 各自去重后，quantities 按 colors×sizes 展开
                JsonNode colorsNode = root.get("colors");
                JsonNode sizesNode = root.get("sizes");
                JsonNode quantitiesNode = root.get("quantities");

                List<String> colors = new ArrayList<>();
                if (colorsNode != null && colorsNode.isArray()) {
                    for (JsonNode n : colorsNode) {
                        String c = n.asText("").trim();
                        if (!c.isEmpty()) colors.add(c);
                    }
                }
                List<String> sizes = new ArrayList<>();
                if (sizesNode != null && sizesNode.isArray()) {
                    for (JsonNode n : sizesNode) {
                        String s = n.asText("").trim();
                        if (!s.isEmpty()) sizes.add(s);
                    }
                }
                if (quantitiesNode != null && quantitiesNode.isArray()) {
                    for (JsonNode n : quantitiesNode) {
                        styleTotalQty += n.asInt(0);
                    }
                }

                if (!colors.isEmpty()) {
                    colorStr = String.join(",", colors);
                }
                if (!sizes.isEmpty()) {
                    sizeStr = String.join(",", sizes);
                }
            } catch (Exception e) {
                log.warn("解析 size_color_config 失败，降级为款式 color/size 字段: styleId={}, error={}", styleId, e.getMessage());
            }
        }

        // 降级：从旧 color/size 字段读取
        if (colorStr == null || colorStr.isEmpty()) {
            String fallbackColor = styleInfo.getColor();
            if (fallbackColor != null && !fallbackColor.trim().isEmpty()) {
                colorStr = fallbackColor.trim();
            }
        }
        if (sizeStr == null || sizeStr.isEmpty()) {
            String fallbackSize = styleInfo.getSize();
            if (fallbackSize != null && !fallbackSize.trim().isEmpty()) {
                sizeStr = fallbackSize.trim();
            }
        }

        // 如果款式总件数仍为0（无 quantities 字段），默认用1避免采购数量为0
        if (styleTotalQty <= 0) {
            styleTotalQty = 1;
            log.warn("款式颜色尺码数量配置未设置，采购数量将按BOM单件用量计算: styleId={}", styleId);
        }

        log.info("样衣采购参数: styleId={}, 颜色={}, 尺码={}, 款式总件数={}", styleId, colorStr, sizeStr, styleTotalQty);

        // 为每个BOM项创建采购记录
        int createdCount = 0;
        for (StyleBom bom : bomList) {
            try {
                MaterialPurchase purchase = new MaterialPurchase();

                String purchaseNo = "MP" + System.currentTimeMillis() % 100000000;
                purchase.setPurchaseNo(purchaseNo);

                purchase.setMaterialCode(bom.getMaterialCode());
                purchase.setMaterialName(bom.getMaterialName());
                purchase.setMaterialType(bom.getMaterialType());
                purchase.setSpecifications(bom.getSpecification());
                purchase.setUnit(bom.getUnit());

                // 采购数量 = BOM单件用量 × 款式总件数（含损耗率）
                BigDecimal usageAmount = bom.getUsageAmount() != null ? bom.getUsageAmount() : BigDecimal.ZERO;
                BigDecimal lossRate = bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO;
                BigDecimal lossFactor = BigDecimal.ONE.add(lossRate.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP));
                BigDecimal totalUsage = usageAmount.multiply(BigDecimal.valueOf(styleTotalQty)).multiply(lossFactor);
                int purchaseQty = totalUsage.setScale(0, RoundingMode.CEILING).intValue();

                if (purchaseQty <= 0) {
                    log.warn("BOM配置用量为0或未设置，跳过该物料: styleId={}, materialName={}", styleId, bom.getMaterialName());
                    continue;
                }

                purchase.setPurchaseQuantity(purchaseQty);
                purchase.setArrivedQuantity(0);

                String supplier = bom.getSupplier();
                if (supplier == null || supplier.trim().isEmpty()) {
                    log.warn("BOM配置缺少供应商信息: styleId={}, materialName={}", styleId, bom.getMaterialName());
                }
                purchase.setSupplierName(supplier != null ? supplier.trim() : "");

                BigDecimal bomUnitPrice = bom.getUnitPrice();
                log.info("BOM单价读取: styleId={}, materialCode={}, materialName={}, bomUnitPrice={}, 款式件数={}, 采购数量={}",
                        styleId, bom.getMaterialCode(), bom.getMaterialName(), bomUnitPrice, styleTotalQty, purchaseQty);

                purchase.setUnitPrice(bomUnitPrice);
                BigDecimal totalAmount = bomUnitPrice != null
                        ? bomUnitPrice.multiply(BigDecimal.valueOf(purchaseQty))
                        : BigDecimal.ZERO;
                purchase.setTotalAmount(totalAmount);

                purchase.setStyleId(String.valueOf(styleId));
                purchase.setStyleNo(styleInfo.getStyleNo());
                purchase.setStyleName(styleInfo.getStyleName());
                purchase.setStyleCover(styleInfo.getCover());

                // 从 size_color_config 解析的颜色/尺码信息（优先），用于采购单头部展示
                if (colorStr != null && !colorStr.isEmpty()) {
                    purchase.setColor(colorStr);
                }
                if (sizeStr != null && !sizeStr.isEmpty()) {
                    purchase.setSize(sizeStr);
                }

                purchase.setSourceType("sample");
                purchase.setStatus(MaterialConstants.STATUS_PENDING);
                purchase.setDeleteFlag(0);
                purchase.setCreateTime(LocalDateTime.now());
                purchase.setUpdateTime(LocalDateTime.now());

                materialPurchaseService.save(purchase);
                createdCount++;

            } catch (Exception e) {
                log.error("Failed to create material purchase for bom: bomId={}", bom.getId(), e);
            }
        }

        log.info("Generated {} material purchase records for styleId={}", createdCount, styleId);
        return createdCount;
    }
}
