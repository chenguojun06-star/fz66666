package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.entity.MaterialPurchase;
import com.fashion.supplychain.production.entity.MaterialStock;
import com.fashion.supplychain.style.entity.StyleBom;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.production.helper.MaterialDatabaseLogAppendHelper;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.NoSuchElementException;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Slf4j
@Service
public class MaterialDatabaseOrchestrator {

    @Autowired
    private com.fashion.supplychain.style.service.StyleBomService styleBomService;

    @Autowired
    private com.fashion.supplychain.production.service.MaterialPurchaseService materialPurchaseService;

    @Autowired
    private com.fashion.supplychain.production.service.MaterialStockService materialStockService;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Autowired
    private MaterialDatabaseLogAppendHelper logAppendHelper;

    public IPage<MaterialDatabase> list(Map<String, Object> params) {
        return materialDatabaseService.queryPage(params);
    }

    public MaterialDatabase getById(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id不能为空");
        }
        com.fashion.supplychain.common.tenant.TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        MaterialDatabase db = materialDatabaseService.lambdaQuery()
                .eq(MaterialDatabase::getId, id.trim())
                .eq(MaterialDatabase::getTenantId, tenantId)
                .one();
        if (db == null || (db.getDeleteFlag() != null && db.getDeleteFlag() == 1)) {
            throw new NoSuchElementException("记录不存在");
        }
        return db;
    }

    /**
     * D-P2-6：查询主面料关联的辅料列表
     * 用于 BOM 选主面料时自动带出辅料，避免漏采购
     * @param mainMaterialId 主面料ID
     * @return 关联辅料列表（按 deleteFlag=0 + tenantId 过滤）
     */
    public java.util.List<MaterialDatabase> getCompanions(String mainMaterialId) {
        if (!StringUtils.hasText(mainMaterialId)) {
            throw new IllegalArgumentException("主面料ID不能为空");
        }
        MaterialDatabase main = getById(mainMaterialId);
        String idsJson = main.getCompanionMaterialIds();
        if (!StringUtils.hasText(idsJson)) {
            return java.util.Collections.emptyList();
        }
        // 解析 JSON 数组 ["uuid1","uuid2"]
        java.util.List<String> ids = parseCompanionIds(idsJson);
        if (ids.isEmpty()) {
            return java.util.Collections.emptyList();
        }
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        // 一次性查所有关联辅料（按 tenant_id + delete_flag 过滤）
        java.util.List<MaterialDatabase> companions = materialDatabaseService.lambdaQuery()
                .in(MaterialDatabase::getId, ids)
                .eq(MaterialDatabase::getTenantId, tenantId)
                .and(w -> w.isNull(MaterialDatabase::getDeleteFlag).or().eq(MaterialDatabase::getDeleteFlag, 0))
                .list();
        // 按原 JSON 顺序返回（保持用户配置的顺序）
        java.util.Map<String, MaterialDatabase> byId = new java.util.HashMap<>();
        for (MaterialDatabase m : companions) {
            byId.put(m.getId(), m);
        }
        java.util.List<MaterialDatabase> ordered = new java.util.ArrayList<>();
        for (String id : ids) {
            MaterialDatabase m = byId.get(id);
            if (m != null) ordered.add(m);
        }
        return ordered;
    }

    /**
     * 解析 companionMaterialIds JSON 数组字符串
     * 兼容 ["uuid1","uuid2"] 和 ["uuid1", "uuid2"]（带空格）
     */
    private java.util.List<String> parseCompanionIds(String idsJson) {
        if (!StringUtils.hasText(idsJson)) return java.util.Collections.emptyList();
        String trimmed = idsJson.trim();
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
            log.warn("[companion] companionMaterialIds 不是合法JSON数组: {}", idsJson);
            return java.util.Collections.emptyList();
        }
        String inner = trimmed.substring(1, trimmed.length() - 1).trim();
        if (inner.isEmpty()) return java.util.Collections.emptyList();
        java.util.List<String> result = new java.util.ArrayList<>();
        // 用逗号分隔，去引号和空格
        for (String part : inner.split(",")) {
            String s = part.trim().replaceAll("^\"|\"$", "").replaceAll("^'|'$", "").trim();
            if (!s.isEmpty() && !"null".equals(s)) {
                result.add(s);
            }
        }
        return result;
    }

    public boolean save(MaterialDatabase material) {
        if (material == null) {
            throw new IllegalArgumentException("参数为空");
        }
        if (!StringUtils.hasText(material.getMaterialCode())) {
            throw new IllegalArgumentException("物料编码不能为空");
        }
        material.setMaterialCode(material.getMaterialCode().trim());
        if (!StringUtils.hasText(material.getMaterialName())) {
            throw new IllegalArgumentException("物料名称不能为空");
        }
        if (!StringUtils.hasText(material.getUnit())) {
            throw new IllegalArgumentException("单位不能为空");
        }
        if (!StringUtils.hasText(material.getSupplierName())) {
            throw new IllegalArgumentException("供应商不能为空");
        }

        long dup = materialDatabaseService.lambdaQuery()
                .eq(MaterialDatabase::getMaterialCode, material.getMaterialCode())
                .and(w -> w.isNull(MaterialDatabase::getDeleteFlag).or().eq(MaterialDatabase::getDeleteFlag, 0))
                .count();
        if (dup > 0) {
            throw new IllegalStateException("物料编码已存在");
        }

        LocalDateTime now = LocalDateTime.now();
        if (!StringUtils.hasText(material.getMaterialType())) {
            material.setMaterialType("accessory");
        }
        if (!StringUtils.hasText(material.getStatus())) {
            material.setStatus("pending");
        }
        material.setCreateTime(now);
        material.setUpdateTime(now);
        material.setDeleteFlag(0);
        normalizeStatusTime(material, null);
        boolean ok = materialDatabaseService.save(material);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        logAppendHelper.appendCreate(material.getId());
        return true;
    }

    public boolean update(MaterialDatabase material) {
        if (material == null || !StringUtils.hasText(material.getId())) {
            throw new IllegalArgumentException("id不能为空");
        }
        MaterialDatabase current = getById(material.getId());

        if (!StringUtils.hasText(material.getMaterialCode())) {
            material.setMaterialCode(current.getMaterialCode());
        }
        if (!StringUtils.hasText(material.getMaterialName())) {
            material.setMaterialName(current.getMaterialName());
        }
        if (!StringUtils.hasText(material.getUnit())) {
            material.setUnit(current.getUnit());
        }
        if (!StringUtils.hasText(material.getSupplierName())) {
            material.setSupplierName(current.getSupplierName());
        }
        if (!StringUtils.hasText(material.getMaterialType())) {
            material.setMaterialType(current.getMaterialType());
        }
        if (!StringUtils.hasText(material.getStatus())) {
            material.setStatus(current.getStatus());
        }
        material.setUpdateTime(LocalDateTime.now());
        material.setDeleteFlag(current.getDeleteFlag() == null ? 0 : current.getDeleteFlag());

        normalizeStatusTime(material, current);
        boolean ok = materialDatabaseService.updateById(material);
        if (!ok) {
            throw new IllegalStateException("保存失败");
        }
        logAppendHelper.appendUpdate(material.getId(), "基础信息更新");
        return true;
    }

    public boolean complete(String id) {
        MaterialDatabase current = getById(id);
        MaterialDatabase patch = new MaterialDatabase();
        patch.setId(current.getId());
        patch.setStatus("completed");
        patch.setCompletedTime(LocalDateTime.now());
        patch.setUpdateTime(LocalDateTime.now());
        boolean ok = materialDatabaseService.updateById(patch);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        logAppendHelper.appendComplete(id);
        return true;
    }

    public boolean returnToPending(String id, String reason) {
        MaterialDatabase current = getById(id);
        // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL
        LambdaUpdateWrapper<MaterialDatabase> retUw = new LambdaUpdateWrapper<>();
        retUw.eq(MaterialDatabase::getId, current.getId())
             .set(MaterialDatabase::getStatus, "pending")
             .set(MaterialDatabase::getCompletedTime, null)
             .set(MaterialDatabase::getReturnReason, StringUtils.hasText(reason) ? reason.trim() : null)
             .set(MaterialDatabase::getUpdateTime, LocalDateTime.now());
        boolean ok = materialDatabaseService.update(retUw);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        logAppendHelper.appendReturnToPending(id, reason);
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id不能为空");
        }
        // P0 铁律4：多租户隔离 — 删除前必须校验租户归属（含软删除记录的幂等性处理）
        com.fashion.supplychain.common.tenant.TenantAssert.assertTenantContext();
        Long tenantId = com.fashion.supplychain.common.UserContext.tenantId();
        MaterialDatabase current = materialDatabaseService.lambdaQuery()
                .eq(MaterialDatabase::getId, id.trim())
                .eq(MaterialDatabase::getTenantId, tenantId)
                .last("LIMIT 1")
                .one();
        if (current == null) {
            throw new NoSuchElementException("物料库记录不存在");
        }
        if (current.getDeleteFlag() != null && current.getDeleteFlag() != 0) {
            log.warn("[MATERIAL-DB-DELETE] id={} already deleted, idempotent success", id);
            return true;
        }

        // 引用防护：被款式物料清单 / 在途采购 / 有库存的物料禁止删除，
        // 否则 BOM 与采购单引用悬空、库存行变孤儿数据
        String code = current.getMaterialCode();
        if (StringUtils.hasText(code)) {
            Long tid = tenantId;
            long bomRefs = styleBomService.count(new LambdaQueryWrapper<StyleBom>()
                    .eq(StyleBom::getMaterialCode, code)
                    .eq(StyleBom::getTenantId, tid));
            if (bomRefs > 0) {
                throw new IllegalStateException("该物料被 " + bomRefs + " 个款式物料清单引用，无法删除（可改为停用）");
            }
            long activePurchases = materialPurchaseService.count(new LambdaQueryWrapper<MaterialPurchase>()
                    .eq(MaterialPurchase::getMaterialCode, code)
                    .eq(MaterialPurchase::getTenantId, tid)
                    .eq(MaterialPurchase::getDeleteFlag, 0)
                    .notIn(MaterialPurchase::getStatus, "completed", "cancelled"));
            if (activePurchases > 0) {
                throw new IllegalStateException("该物料存在 " + activePurchases + " 个未完成采购单，请先处理完在途采购再删除");
            }
            long stockRows = materialStockService.count(new LambdaQueryWrapper<MaterialStock>()
                    .eq(MaterialStock::getMaterialCode, code)
                    .eq(MaterialStock::getTenantId, tid)
                    .eq(MaterialStock::getDeleteFlag, 0)
                    .apply("quantity > 0"));
            if (stockRows > 0) {
                throw new IllegalStateException("该物料仍有库存数量，请先清库存再删除（或改为停用）");
            }
        }

        boolean ok = materialDatabaseService.removeById(current.getId());
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
        logAppendHelper.appendDelete(current.getId());
        return true;
    }

    private void normalizeStatusTime(MaterialDatabase next, MaterialDatabase current) {
        String st = StringUtils.hasText(next.getStatus()) ? next.getStatus().trim().toLowerCase() : null;
        if (st == null) {
            st = current == null ? null : (current.getStatus() == null ? null : current.getStatus().trim().toLowerCase());
        }
        if ("completed".equals(st)) {
            if (next.getCompletedTime() == null) {
                LocalDateTime existed = current == null ? null : current.getCompletedTime();
                next.setCompletedTime(existed != null ? existed : LocalDateTime.now());
            }
            return;
        }
        if ("pending".equals(st)) {
            next.setCompletedTime(null);
        }
    }

    public String generateMaterialCode(String materialType) {
        return materialDatabaseService.generateMaterialCode(materialType);
    }

    public boolean disable(String id) {
        MaterialDatabase current = getById(id);
        MaterialDatabase patch = new MaterialDatabase();
        patch.setId(current.getId());
        patch.setDisabled(1);
        patch.setUpdateTime(LocalDateTime.now());
        boolean ok = materialDatabaseService.updateById(patch);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        logAppendHelper.appendDisable(id, "手动禁用");
        return true;
    }

    public boolean enable(String id) {
        MaterialDatabase current = getById(id);
        MaterialDatabase patch = new MaterialDatabase();
        patch.setId(current.getId());
        patch.setDisabled(0);
        patch.setUpdateTime(LocalDateTime.now());
        boolean ok = materialDatabaseService.updateById(patch);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        logAppendHelper.appendEnable(id);
        return true;
    }
}
