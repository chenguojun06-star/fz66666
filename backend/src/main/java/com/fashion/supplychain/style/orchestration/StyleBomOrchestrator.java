package com.fashion.supplychain.style.orchestration;

import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.orchestration.MaterialDatabaseOrchestrator;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.common.constant.MaterialConstants;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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
        boolean ok = styleBomService.removeById(id);
        if (!ok) {
            throw new IllegalStateException("删除失败");
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

    private void normalizeAndCalc(StyleBom styleBom) {
        BigDecimal usageAmount = styleBom.getUsageAmount() == null ? BigDecimal.ZERO : styleBom.getUsageAmount();
        BigDecimal lossRate = styleBom.getLossRate() == null ? BigDecimal.ZERO : styleBom.getLossRate();
        BigDecimal unitPrice = styleBom.getUnitPrice() == null ? BigDecimal.ZERO : styleBom.getUnitPrice();

        BigDecimal qty = usageAmount.multiply(BigDecimal.ONE.add(lossRate.movePointLeft(2)));
        styleBom.setTotalPrice(qty.multiply(unitPrice));
    }

    /**
     * 根据BOM配置生成物料采购记录（样衣开发阶段）
     *
     * @param styleId 款式ID
     * @return 生成的采购记录数量
     */
    @Transactional(rollbackFor = Exception.class)
    public int generatePurchase(Long styleId) {
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
            throw new IllegalStateException("该款式已生成过样衣采购记录，请勿重复生成");
        }

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

                BigDecimal usageAmount = bom.getUsageAmount() != null ? bom.getUsageAmount() : BigDecimal.ZERO;
                int purchaseQty = usageAmount.setScale(0, RoundingMode.CEILING).intValue();

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
                log.info("BOM单价读取: styleId={}, materialCode={}, materialName={}, bomUnitPrice={}",
                        styleId, bom.getMaterialCode(), bom.getMaterialName(), bomUnitPrice);

                purchase.setUnitPrice(bomUnitPrice);
                BigDecimal totalAmount = bomUnitPrice != null
                        ? bomUnitPrice.multiply(BigDecimal.valueOf(purchaseQty))
                        : BigDecimal.ZERO;
                purchase.setTotalAmount(totalAmount);

                purchase.setStyleId(String.valueOf(styleId));
                purchase.setStyleNo(styleInfo.getStyleNo());
                purchase.setStyleName(styleInfo.getStyleName());
                purchase.setStyleCover(styleInfo.getCover());

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
