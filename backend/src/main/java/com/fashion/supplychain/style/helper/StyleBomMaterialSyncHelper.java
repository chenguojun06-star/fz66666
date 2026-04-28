package com.fashion.supplychain.style.helper;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.orchestration.MaterialDatabaseOrchestrator;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.orchestration.TemplateLibraryOrchestrator;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
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
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class StyleBomMaterialSyncHelper {

    private static final ExecutorService MATERIAL_SYNC_EXECUTOR = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r);
        t.setName("material-sync-worker");
        t.setDaemon(true);
        return t;
    });

    private static final ConcurrentHashMap<String, Map<String, Object>> SYNC_JOBS = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, String> RUNNING_JOB_BY_STYLE_ID = new ConcurrentHashMap<>();

    @Autowired
    private StyleInfoService styleInfoService;

    @Autowired
    private StyleBomService styleBomService;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Autowired
    private MaterialDatabaseOrchestrator materialDatabaseOrchestrator;

    @Autowired
    private TemplateLibraryOrchestrator templateLibraryOrchestrator;

    public Map<String, Object> syncToMaterialDatabase(Long styleId, boolean forceUpdateCompleted) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }

        StyleInfo style = styleInfoService.getById(styleId);
        if (style == null) {
            throw new NoSuchElementException("款号不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(style.getTenantId(), "款式");
        String styleNo = StringUtils.hasText(style.getStyleNo()) ? style.getStyleNo().trim() : null;

        List<StyleBom> bomRows = styleBomService.listByStyleId(styleId);
        int totalBomRows = bomRows == null ? 0 : bomRows.size();

        Map<String, MaterialDatabase> existingByCode = loadExistingMaterialByCode(bomRows);

        SyncStats stats = new SyncStats(0, 0, 0, 0, 0);
        List<Map<String, Object>> details = new ArrayList<>();

        if (bomRows != null) {
            for (StyleBom b : bomRows) {
                if (b == null) continue;
                syncSingleBomRow(b, existingByCode, styleNo, forceUpdateCompleted, stats, details);
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("styleId", styleId);
        out.put("styleNo", styleNo == null ? "" : styleNo);
        out.put("totalBomRows", totalBomRows);
        out.put("created", stats.created);
        out.put("updated", stats.updated);
        out.put("skippedInvalid", stats.skippedInvalid);
        out.put("skippedCompleted", stats.skippedCompleted);
        out.put("failed", stats.failed);
        out.put("details", details);
        return out;
    }

    public Map<String, Object> startSyncToMaterialDatabaseJob(Long styleId, boolean forceUpdateCompleted) {
        if (styleId == null) {
            throw new IllegalArgumentException("styleId不能为空");
        }

        LocalDateTime pruneThreshold = LocalDateTime.now().minusMinutes(10);
        SYNC_JOBS.entrySet().removeIf(e -> {
            Object st = e.getValue().get("status");
            Object ut = e.getValue().get("updateTime");
            if (!"done".equals(st) && !"failed".equals(st)) return false;
            try { return ut == null || LocalDateTime.parse((String) ut).isBefore(pruneThreshold); }
            catch (Exception ex) { log.debug("[StyleBom] isJobPrunable时间解析失败"); return false; }
        });
        String tenantKey = UserContext.tenantId() + ":" + styleId;
        String existed = RUNNING_JOB_BY_STYLE_ID.get(tenantKey);
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
        RUNNING_JOB_BY_STYLE_ID.put(tenantKey, jobId);

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
                RUNNING_JOB_BY_STYLE_ID.remove(tenantKey, jobId);
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

    public void tryCreateBomTemplate(Long styleId) {
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

    public void autoSyncBomRow(StyleBom styleBom) {
        if (styleBom == null || styleBom.getStyleId() == null) {
            return;
        }
        String code = StringUtils.hasText(styleBom.getMaterialCode()) ? styleBom.getMaterialCode().trim() : null;
        if (!StringUtils.hasText(code)) {
            return;
        }

        StyleInfo style = styleInfoService.getById(styleBom.getStyleId());
        if (style != null) {
            TenantAssert.assertBelongsToCurrentTenant(style.getTenantId(), "款式");
        }
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

    private Map<String, MaterialDatabase> loadExistingMaterialByCode(List<StyleBom> bomRows) {
        Set<String> codes = new HashSet<>();
        if (bomRows != null) {
            for (StyleBom b : bomRows) {
                if (b == null) continue;
                String code = StringUtils.hasText(b.getMaterialCode()) ? b.getMaterialCode().trim() : null;
                if (StringUtils.hasText(code)) codes.add(code);
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
                if (m == null) continue;
                String code = StringUtils.hasText(m.getMaterialCode()) ? m.getMaterialCode().trim() : null;
                if (StringUtils.hasText(code)) existingByCode.putIfAbsent(code, m);
            }
        }
        return existingByCode;
    }

    private static class SyncStats {
        int created, updated, skippedInvalid, skippedCompleted, failed;
        SyncStats(int c, int u, int si, int sc, int f) {
            created = c; updated = u; skippedInvalid = si; skippedCompleted = sc; failed = f;
        }
    }

    private void syncSingleBomRow(StyleBom b, Map<String, MaterialDatabase> existingByCode,
            String styleNo, boolean forceUpdateCompleted, SyncStats stats, List<Map<String, Object>> details) {
        String code = StringUtils.hasText(b.getMaterialCode()) ? b.getMaterialCode().trim() : null;
        String name = StringUtils.hasText(b.getMaterialName()) ? b.getMaterialName().trim() : null;
        String unit = StringUtils.hasText(b.getUnit()) ? b.getUnit().trim() : null;
        String supplierName = StringUtils.hasText(b.getSupplier()) ? b.getSupplier().trim() : null;

        String invalidReason = validateBomRequiredFields(code, name, unit, supplierName);
        if (invalidReason != null) {
            stats.skippedInvalid += 1;
            if (details.size() < 100) {
                details.add(new LinkedHashMap<>(Map.of("materialCode", code == null ? "" : code,
                        "status", "skipped", "reason", invalidReason)));
            }
            return;
        }

        String normalizedType = normalizeMaterialType(b.getMaterialType());
        String specifications = StringUtils.hasText(b.getSpecification()) ? b.getSpecification().trim() : null;
        String remark = StringUtils.hasText(b.getRemark()) ? b.getRemark().trim() : null;

        MaterialDatabase current = existingByCode.get(code);
        if (current != null) {
            String st = StringUtils.hasText(current.getStatus()) ? current.getStatus().trim().toLowerCase() : "";
            if ("completed".equals(st) && !forceUpdateCompleted) {
                stats.skippedCompleted += 1;
                if (details.size() < 100) {
                    details.add(new LinkedHashMap<>(Map.of("materialCode", code,
                            "status", "skipped", "reason", "已完成，未覆盖")));
                }
                return;
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
                stats.created += 1;
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
                stats.updated += 1;
            }
        } catch (Exception e) {
            stats.failed += 1;
            if (details.size() < 100) {
                String msg = e.getMessage() == null ? "同步失败" : e.getMessage();
                details.add(new LinkedHashMap<>(Map.of("materialCode", code, "status", "failed", "reason", msg)));
            }
        }
    }

    private String validateBomRequiredFields(String code, String name, String unit, String supplierName) {
        if (!StringUtils.hasText(code)) return "物料编码为空";
        if (!StringUtils.hasText(name)) return "物料名称为空";
        if (!StringUtils.hasText(unit)) return "单位为空";
        if (!StringUtils.hasText(supplierName)) return "供应商为空";
        return null;
    }

    private String normalizeMaterialType(String materialType) {
        String mt = StringUtils.hasText(materialType) ? materialType.trim().toLowerCase() : null;
        if (mt == null) return "accessory";
        if (mt.startsWith("fabric")) return "fabric";
        if (mt.startsWith("lining")) return "lining";
        if (mt.startsWith("accessory")) return "accessory";
        return mt;
    }
}
