package com.fashion.supplychain.production.orchestration;

import com.fashion.supplychain.common.tenant.TenantAssert;
import com.fashion.supplychain.production.entity.CuttingBom;
import com.fashion.supplychain.production.entity.CuttingTask;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.service.CuttingBomService;
import com.fashion.supplychain.production.service.CuttingTaskService;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
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

    public List<CuttingBom> listByCuttingTaskId(String cuttingTaskId) {
        return cuttingBomService.listByCuttingTaskId(cuttingTaskId);
    }

    public List<CuttingBom> listByStyleNo(String styleNo) {
        return cuttingBomService.listByStyleNo(styleNo);
    }

    @Transactional
    public CuttingBom save(CuttingBom bom) {
        validateCuttingTaskEditable(bom.getCuttingTaskId());
        fillDefaults(bom);
        calculateTotalPrice(bom);
        cuttingBomService.save(bom);
        syncSingleBomRowToMaterialDatabase(bom);
        return bom;
    }

    @Transactional
    public CuttingBom update(CuttingBom bom) {
        CuttingBom existing = cuttingBomService.getById(bom.getId());
        if (existing == null) {
            throw new IllegalArgumentException("裁剪面辅料记录不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(existing.getTenantId(), "裁剪面辅料");
        validateCuttingTaskEditable(existing.getCuttingTaskId());
        fillDefaults(bom);
        calculateTotalPrice(bom);
        bom.setUpdateTime(LocalDateTime.now());
        cuttingBomService.updateById(bom);
        syncSingleBomRowToMaterialDatabase(bom);
        return bom;
    }

    @Transactional
    public void delete(String id) {
        CuttingBom existing = cuttingBomService.getById(id);
        if (existing == null) {
            return;
        }
        TenantAssert.assertBelongsToCurrentTenant(existing.getTenantId(), "裁剪面辅料");
        validateCuttingTaskEditable(existing.getCuttingTaskId());
        existing.setDeleteFlag(1);
        existing.setUpdateTime(LocalDateTime.now());
        cuttingBomService.updateById(existing);
    }

    @Transactional
    public void batchSave(String cuttingTaskId, List<CuttingBom> bomList) {
        validateCuttingTaskEditable(cuttingTaskId);
        CuttingTask task = cuttingTaskService.getById(cuttingTaskId);
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
        CuttingTask task = cuttingTaskService.getById(cuttingTaskId);
        if (task == null) {
            throw new IllegalArgumentException("裁剪任务不存在");
        }
        TenantAssert.assertBelongsToCurrentTenant(task.getTenantId(), "裁剪任务");
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
