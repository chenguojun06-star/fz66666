package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.NoSuchElementException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

@Service
public class MaterialDatabaseOrchestrator {

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    public IPage<MaterialDatabase> list(Map<String, Object> params) {
        return materialDatabaseService.queryPage(params);
    }

    public MaterialDatabase getById(String id) {
        if (!StringUtils.hasText(id)) {
            throw new IllegalArgumentException("id不能为空");
        }
        MaterialDatabase db = materialDatabaseService.getById(id.trim());
        if (db == null || (db.getDeleteFlag() != null && db.getDeleteFlag() == 1)) {
            throw new NoSuchElementException("记录不存在");
        }
        return db;
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
        return true;
    }

    public boolean returnToPending(String id, String reason) {
        if (!StringUtils.hasText(reason)) {
            throw new IllegalArgumentException("退回原因不能为空");
        }
        MaterialDatabase current = getById(id);
        // ⚠️ 用 LambdaUpdateWrapper 显式 SET NULL
        LambdaUpdateWrapper<MaterialDatabase> retUw = new LambdaUpdateWrapper<>();
        retUw.eq(MaterialDatabase::getId, current.getId())
             .set(MaterialDatabase::getStatus, "pending")
             .set(MaterialDatabase::getCompletedTime, null)
             .set(MaterialDatabase::getReturnReason, reason.trim())
             .set(MaterialDatabase::getUpdateTime, LocalDateTime.now());
        boolean ok = materialDatabaseService.update(retUw);
        if (!ok) {
            throw new IllegalStateException("操作失败");
        }
        return true;
    }

    @Transactional(rollbackFor = Exception.class)
    public boolean delete(String id) {
        MaterialDatabase current = getById(id);
        MaterialDatabase patch = new MaterialDatabase();
        patch.setId(current.getId());
        patch.setDeleteFlag(1);
        patch.setUpdateTime(LocalDateTime.now());
        boolean ok = materialDatabaseService.updateById(patch);
        if (!ok) {
            throw new IllegalStateException("删除失败");
        }
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
}
