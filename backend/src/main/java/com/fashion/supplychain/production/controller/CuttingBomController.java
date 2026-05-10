package com.fashion.supplychain.production.controller;

import com.fashion.supplychain.common.Result;
import com.fashion.supplychain.production.entity.CuttingBom;
import com.fashion.supplychain.production.orchestration.CuttingBomOrchestrator;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/production/cutting-bom")
@PreAuthorize("isAuthenticated()")
public class CuttingBomController {

    @Autowired
    private CuttingBomOrchestrator cuttingBomOrchestrator;

    @GetMapping("/list")
    public Result<?> list(@RequestParam String cuttingTaskId) {
        List<CuttingBom> list = cuttingBomOrchestrator.listByCuttingTaskId(cuttingTaskId);
        return Result.success(list);
    }

    @GetMapping("/list-by-style-no")
    public Result<?> listByStyleNo(@RequestParam String styleNo) {
        List<CuttingBom> list = cuttingBomOrchestrator.listByStyleNo(styleNo);
        return Result.success(list);
    }

    @PostMapping
    public Result<?> save(@RequestBody CuttingBom bom) {
        return Result.success(cuttingBomOrchestrator.save(bom));
    }

    @PutMapping
    public Result<?> update(@RequestBody CuttingBom bom) {
        return Result.success(cuttingBomOrchestrator.update(bom));
    }

    @DeleteMapping("/{id}")
    public Result<?> delete(@PathVariable String id) {
        cuttingBomOrchestrator.delete(id);
        return Result.success("删除成功");
    }

    @PostMapping("/batch")
    public Result<?> batchSave(@RequestBody Map<String, Object> body) {
        String cuttingTaskId = String.valueOf(body.get("cuttingTaskId"));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> bomDataList = (List<Map<String, Object>>) body.get("bomList");
        if (bomDataList == null || bomDataList.isEmpty()) {
            return Result.fail("面辅料列表不能为空");
        }
        List<CuttingBom> bomList = bomDataList.stream().map(this::mapToCuttingBom).toList();
        cuttingBomOrchestrator.batchSave(cuttingTaskId, bomList);
        return Result.success("保存成功");
    }

    private CuttingBom mapToCuttingBom(Map<String, Object> data) {
        CuttingBom bom = new CuttingBom();
        if (data.get("id") != null) bom.setId(String.valueOf(data.get("id")));
        bom.setMaterialCode(data.get("materialCode") != null ? String.valueOf(data.get("materialCode")) : null);
        bom.setMaterialName(data.get("materialName") != null ? String.valueOf(data.get("materialName")) : null);
        bom.setMaterialType(data.get("materialType") != null ? String.valueOf(data.get("materialType")) : null);
        bom.setFabricComposition(data.get("fabricComposition") != null ? String.valueOf(data.get("fabricComposition")) : null);
        bom.setFabricWeight(data.get("fabricWeight") != null ? String.valueOf(data.get("fabricWeight")) : null);
        bom.setColor(data.get("color") != null ? String.valueOf(data.get("color")) : null);
        bom.setSpecification(data.get("specification") != null ? String.valueOf(data.get("specification")) : null);
        bom.setUnit(data.get("unit") != null ? String.valueOf(data.get("unit")) : null);
        bom.setUsageAmount(data.get("usageAmount") != null ? new java.math.BigDecimal(String.valueOf(data.get("usageAmount"))) : null);
        bom.setLossRate(data.get("lossRate") != null ? new java.math.BigDecimal(String.valueOf(data.get("lossRate"))) : null);
        bom.setUnitPrice(data.get("unitPrice") != null ? new java.math.BigDecimal(String.valueOf(data.get("unitPrice"))) : null);
        bom.setSupplierId(data.get("supplierId") != null ? String.valueOf(data.get("supplierId")) : null);
        bom.setSupplierName(data.get("supplierName") != null ? String.valueOf(data.get("supplierName")) : null);
        bom.setSupplierContactPerson(data.get("supplierContactPerson") != null ? String.valueOf(data.get("supplierContactPerson")) : null);
        bom.setSupplierContactPhone(data.get("supplierContactPhone") != null ? String.valueOf(data.get("supplierContactPhone")) : null);
        bom.setMaterialId(data.get("materialId") != null ? String.valueOf(data.get("materialId")) : null);
        bom.setImageUrls(data.get("imageUrls") != null ? String.valueOf(data.get("imageUrls")) : null);
        bom.setRemark(data.get("remark") != null ? String.valueOf(data.get("remark")) : null);
        return bom;
    }
}
