package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.CuttingBom;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.helper.CuttingBomLogAppendHelper;
import com.fashion.supplychain.production.service.CuttingBomService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.style.entity.StyleBom;
import com.fashion.supplychain.style.service.StyleBomService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Component
@Slf4j
public class CuttingBomOrchestrator {

    @Autowired
    private CuttingBomService cuttingBomService;

    @Autowired
    private CuttingTaskService cuttingTaskService;

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Autowired
    private MaterialDatabaseOrchestrator materialDatabaseOrchestrator;

    @Autowired
    private CuttingBomLogAppendHelper logAppendHelper;

    @Autowired
    private StyleBomService styleBomService;

    public List<CuttingBom> listByCuttingTaskId(String cuttingTaskId) {
        return cuttingBomService.listByCuttingTaskId(cuttingTaskId);
    }

    public List<CuttingBom> listByStyleNo(String styleNo) {
        return cuttingBomService.listByStyleNo(styleNo);
    }

    /**
     * 存量裁剪任务：从款式 BOM 初始化面辅料信息。
     * 仅在该任务尚无裁剪 BOM 数据且款式已配置 BOM 时生效，不覆盖用户已维护数据。
     * 返回初始化后的 BOM 列表。
     */
    @Transactional
    public List<CuttingBom> initFromStyle(String cuttingTaskId) {
        if (!StringUtils.hasText(cuttingTaskId)) {
            throw new IllegalArgumentException("裁剪任务ID不能为空");
        }
        Long tenantId = UserContext.tenantId();
        CuttingTask task = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getId, cuttingTaskId.trim())
                .eq(CuttingTask::getTenantId, tenantId)
                .one();
        if (task == null) {
            throw new IllegalArgumentException("裁剪任务不存在");
        }
        List<CuttingBom> existing = cuttingBomService.listByCuttingTaskId(task.getId());
        if (existing != null && !existing.isEmpty()) {
            return existing;
        }
        String styleIdRaw = task.getStyleId();
        if (!StringUtils.hasText(styleIdRaw)) {
            return List.of();
        }
        Long styleId;
        try {
            styleId = Long.valueOf(styleIdRaw.trim());
        } catch (NumberFormatException e) {
            return List.of();
        }
        List<StyleBom> bomList = styleBomService.listByStyleId(styleId);
        if (bomList == null || bomList.isEmpty()) {
            return List.of();
        }

        List<CuttingBom> rows = new ArrayList<>();
        LocalDateTime now = LocalDateTime.now();
        for (StyleBom bom : bomList) {
            if (bom == null) continue;
            CuttingBom cb = new CuttingBom();
            cb.setCuttingTaskId(task.getId());
            cb.setProductionOrderNo(task.getProductionOrderNo());
            cb.setStyleNo(task.getStyleNo());
            cb.setMaterialCode(bom.getMaterialCode());
            cb.setMaterialName(bom.getMaterialName());
            cb.setMaterialType(bom.getMaterialType());
            cb.setPartCode(bom.getPartCode());
            cb.setPartName(bom.getPartName());
            cb.setSubPartName(bom.getSubPartName());
            cb.setFabricComposition(bom.getFabricComposition());
            cb.setFabricWeight(bom.getFabricWeight());
            cb.setColor(bom.getColor());
            cb.setSize(bom.getSize());
            cb.setSpecification(bom.getSpecification());
            cb.setUnit(bom.getUnit());
            cb.setUsageAmount(bom.getUsageAmount());
            cb.setLossRate(bom.getLossRate());
            cb.setUnitPrice(bom.getUnitPrice());
            cb.setSupplierId(bom.getSupplierId());
            cb.setSupplierName(bom.getSupplier());
            cb.setSupplierContactPerson(bom.getSupplierContactPerson());
            cb.setSupplierContactPhone(bom.getSupplierContactPhone());
            cb.setImageUrls(bom.getImageUrls());
            cb.setRemark(bom.getRemark());
            cb.setCreateTime(now);
            cb.setUpdateTime(now);
            cb.setDeleteFlag(0);
            rows.add(cb);
        }
        if (!rows.isEmpty()) {
            cuttingBomService.saveBatch(rows);
            log.info("裁剪任务BOM已从款式BOM初始化(存量任务): taskId={}, orderNo={}, 条数={}",
                    task.getId(), task.getProductionOrderNo(), rows.size());
        }
        return rows;
    }

    @Transactional
    public CuttingBom save(CuttingBom bom) {
        validateCuttingTaskEditable(bom.getCuttingTaskId());
        fillDefaults(bom);
        calculateTotalPrice(bom);
        cuttingBomService.save(bom);
        logAppendHelper.appendCreate(bom.getId());
        syncSingleBomRowToMaterialDatabase(bom);
        return bom;
    }

    @Transactional
    public CuttingBom update(CuttingBom bom) {
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById（前置校验）
        Long tenantId = UserContext.tenantId();
        CuttingBom existing = cuttingBomService.lambdaQuery()
                .eq(CuttingBom::getId, bom.getId())
                .eq(CuttingBom::getTenantId, tenantId)
                .one();
        if (existing == null) {
            throw new IllegalArgumentException("裁剪面辅料记录不存在");
        }
        validateCuttingTaskEditable(existing.getCuttingTaskId());
        fillDefaults(bom);
        calculateTotalPrice(bom);
        bom.setUpdateTime(LocalDateTime.now());
        cuttingBomService.updateById(bom);
        logAppendHelper.appendUpdate(bom.getId(), "裁剪BOM更新");
        syncSingleBomRowToMaterialDatabase(bom);
        return bom;
    }

    @Transactional
    public void delete(String id) {
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById（前置校验）
        Long tenantId = UserContext.tenantId();
        CuttingBom existing = cuttingBomService.lambdaQuery()
                .eq(CuttingBom::getId, id)
                .eq(CuttingBom::getTenantId, tenantId)
                .one();
        if (existing == null) {
            return;
        }
        validateCuttingTaskEditable(existing.getCuttingTaskId());
        existing.setDeleteFlag(1);
        existing.setUpdateTime(LocalDateTime.now());
        cuttingBomService.updateById(existing);
    }

    @Transactional
    public void batchSave(String cuttingTaskId, List<CuttingBom> bomList) {
        validateCuttingTaskEditable(cuttingTaskId);
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById
        Long tenantId = UserContext.tenantId();
        CuttingTask task = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getId, cuttingTaskId)
                .eq(CuttingTask::getTenantId, tenantId)
                .one();
        for (CuttingBom bom : bomList) {
            bom.setCuttingTaskId(cuttingTaskId);
            if (task != null) {
                bom.setProductionOrderNo(task.getProductionOrderNo());
                bom.setStyleNo(task.getStyleNo());
            }
            fillDefaults(bom);
            calculateTotalPrice(bom);
        }
        cuttingBomService.saveBatch(bomList);
        for (CuttingBom bom : bomList) {
            syncSingleBomRowToMaterialDatabase(bom);
        }
    }

    private void validateCuttingTaskEditable(String cuttingTaskId) {
        if (!StringUtils.hasText(cuttingTaskId)) {
            throw new IllegalArgumentException("裁剪任务ID不能为空");
        }
        // P1 多租户隔离：用 lambdaQuery 带 tenantId 替代 getById（前置校验）
        Long tenantId = UserContext.tenantId();
        CuttingTask task = cuttingTaskService.lambdaQuery()
                .eq(CuttingTask::getId, cuttingTaskId)
                .eq(CuttingTask::getTenantId, tenantId)
                .one();
        if (task == null) {
            throw new IllegalArgumentException("裁剪任务不存在");
        }
        if ("bundled".equals(task.getStatus())) {
            throw new IllegalArgumentException("裁剪已完成，不可修改面辅料信息");
        }
    }

    private void fillDefaults(CuttingBom bom) {
        if (!StringUtils.hasText(bom.getMaterialType())) {
            bom.setMaterialType("accessory");
        }
        if (bom.getUsageAmount() == null) {
            bom.setUsageAmount(BigDecimal.ZERO);
        }
        if (bom.getLossRate() == null) {
            bom.setLossRate(BigDecimal.ZERO);
        }
        if (bom.getUnitPrice() == null) {
            bom.setUnitPrice(BigDecimal.ZERO);
        }
        bom.setCreateTime(LocalDateTime.now());
        bom.setUpdateTime(LocalDateTime.now());
        bom.setDeleteFlag(0);
    }

    private void calculateTotalPrice(CuttingBom bom) {
        BigDecimal usage = bom.getUsageAmount() != null ? bom.getUsageAmount() : BigDecimal.ZERO;
        BigDecimal price = bom.getUnitPrice() != null ? bom.getUnitPrice() : BigDecimal.ZERO;
        BigDecimal loss = bom.getLossRate() != null ? bom.getLossRate() : BigDecimal.ZERO;
        BigDecimal total = usage.multiply(price).multiply(BigDecimal.ONE.add(loss.divide(BigDecimal.valueOf(100), 4, RoundingMode.HALF_UP)));
        bom.setTotalPrice(total.setScale(2, RoundingMode.HALF_UP));
    }

    private void syncSingleBomRowToMaterialDatabase(CuttingBom bom) {
        String code = StringUtils.hasText(bom.getMaterialCode()) ? bom.getMaterialCode().trim() : null;
        if (!StringUtils.hasText(code)) {
            return;
        }
        String name = StringUtils.hasText(bom.getMaterialName()) ? bom.getMaterialName().trim() : null;
        String unit = StringUtils.hasText(bom.getUnit()) ? bom.getUnit().trim() : null;
        String supplierName = StringUtils.hasText(bom.getSupplierName()) ? bom.getSupplierName().trim() : null;
        if (!StringUtils.hasText(name) || !StringUtils.hasText(unit) || !StringUtils.hasText(supplierName)) {
            return;
        }

        String normalizedType = normalizeMaterialType(bom.getMaterialType());
        String styleNo = StringUtils.hasText(bom.getStyleNo()) ? bom.getStyleNo().trim() : null;

        MaterialDatabase existed = materialDatabaseService.lambdaQuery()
                .eq(MaterialDatabase::getMaterialCode, code)
                .and(w -> w.isNull(MaterialDatabase::getDeleteFlag).or().eq(MaterialDatabase::getDeleteFlag, 0))
                .orderByDesc(MaterialDatabase::getUpdateTime)
                .last("limit 1")
                .one();

        if (existed != null) {
            String st = StringUtils.hasText(existed.getStatus()) ? existed.getStatus().trim().toLowerCase() : "";
            if ("completed".equals(st)) {
                return;
            }
            MaterialDatabase patch = new MaterialDatabase();
            patch.setId(existed.getId());
            patch.setMaterialCode(code);
            patch.setMaterialName(bom.getMaterialName());
            patch.setStyleNo(styleNo);
            patch.setMaterialType(normalizedType);
            patch.setSpecifications(bom.getSpecification());
            patch.setUnit(bom.getUnit());
            patch.setSupplierName(bom.getSupplierName());
            patch.setUnitPrice(bom.getUnitPrice());
            patch.setRemark(bom.getRemark());
            materialDatabaseOrchestrator.update(patch);
            return;
        }

        MaterialDatabase toCreate = new MaterialDatabase();
        toCreate.setMaterialCode(code);
        toCreate.setMaterialName(bom.getMaterialName());
        toCreate.setStyleNo(styleNo);
        toCreate.setMaterialType(normalizedType);
        toCreate.setSpecifications(bom.getSpecification());
        toCreate.setUnit(bom.getUnit());
        toCreate.setSupplierName(bom.getSupplierName());
        toCreate.setSupplierId(bom.getSupplierId());
        toCreate.setSupplierContactPerson(bom.getSupplierContactPerson());
        toCreate.setSupplierContactPhone(bom.getSupplierContactPhone());
        toCreate.setUnitPrice(bom.getUnitPrice());
        toCreate.setFabricComposition(bom.getFabricComposition());
        toCreate.setFabricWeight(bom.getFabricWeight());
        toCreate.setRemark(bom.getRemark());
        materialDatabaseOrchestrator.save(toCreate);
    }

    private String normalizeMaterialType(String materialType) {
        if (materialType == null || materialType.trim().isEmpty()) {
            return "accessory";
        }
        String mt = materialType.trim().toLowerCase();
        if (mt.startsWith("fabric")) return "fabric";
        if (mt.startsWith("lining")) return "lining";
        if (mt.startsWith("accessory")) return "accessory";
        return mt;
    }
}
