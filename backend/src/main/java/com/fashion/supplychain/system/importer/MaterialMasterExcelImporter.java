package com.fashion.supplychain.system.importer;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.service.FactoryService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDateTime;
import java.util.*;

/**
 * 物料主档 Excel 导入器（D-751 租户入驻批量导入第一期）
 * 迁移数据直接落 completed（完善状态），BOM/采购选料立即可用；
 * 供应商按名称精确匹配 t_factory，匹配不到整行失败（避免挂空供应商ID）。
 */
@Component
@Slf4j
public class MaterialMasterExcelImporter {

    private static final String[] MATERIAL_HEADERS = {
            "物料编码*", "物料名称*", "类型", "颜色", "单位", "单价", "幅宽", "克重", "成分", "规格", "供应商名称", "备注"
    };
    private static final String[] MATERIAL_EXAMPLES = {
            "WL0001", "全棉针织布", "面料", "黑色", "米", "25.5", "150cm", "200g/m²", "100%棉", "1.5米门幅", "广州XX面料厂", "老系统迁移"
    };

    @Autowired
    private MaterialDatabaseService materialDatabaseService;

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private ExcelImportHelper importHelper;

    public ExcelImportHelper.TemplateConfig getTemplateConfig() {
        ExcelImportHelper.TemplateConfig config = new ExcelImportHelper.TemplateConfig();
        config.headers = MATERIAL_HEADERS;
        config.examples = MATERIAL_EXAMPLES;
        config.sheetName = "物料主档";
        config.notes = new String[]{
                "物料编码*: 必填，同一租户内唯一——后续「物料期初库存」导入靠它对应物料",
                "物料名称*: 必填",
                "类型: 面料 / 辅料，不填默认 辅料",
                "单价: 数字（元），选填",
                "供应商名称: 选填，必须是系统中已存在的供应商（先导入供应商）",
                "导入后即为「完善」状态，BOM/采购立即可选",
                "单次最多导入 500 条"
        };
        return config;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importMaterialMasters(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = importHelper.parseExcel(file, MATERIAL_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();
        Set<String> seenInFile = new HashSet<>();
        LocalDateTime now = LocalDateTime.now();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String materialCode = importHelper.safe(item.get("物料编码*"));
                String materialName = importHelper.safe(item.get("物料名称*"));
                if (!StringUtils.hasText(materialCode)) {
                    throw new IllegalArgumentException("物料编码不能为空");
                }
                if (!StringUtils.hasText(materialName)) {
                    throw new IllegalArgumentException("物料名称不能为空");
                }
                if (!seenInFile.add(materialCode)) {
                    throw new IllegalArgumentException("文件内重复：物料编码「" + materialCode + "」出现多次");
                }

                MaterialDatabase existing = materialDatabaseService.getOne(
                        new LambdaQueryWrapper<MaterialDatabase>()
                                .eq(MaterialDatabase::getMaterialCode, materialCode)
                                .eq(MaterialDatabase::getTenantId, tenantId)
                                .and(w -> w.isNull(MaterialDatabase::getDeleteFlag).or().eq(MaterialDatabase::getDeleteFlag, 0))
                                .last("LIMIT 1")
                );
                if (existing != null) {
                    throw new IllegalArgumentException("物料编码已存在: " + materialCode);
                }

                MaterialDatabase material = new MaterialDatabase();
                material.setMaterialCode(materialCode);
                material.setMaterialName(materialName);
                String type = importHelper.safe(item.get("类型"));
                material.setMaterialType(normalizeType(type));
                material.setColor(importHelper.safe(item.get("颜色")));
                material.setUnit(importHelper.safe(item.get("单位")));
                material.setUnitPrice(importHelper.parseDecimal(item.get("单价")));
                material.setFabricWidth(importHelper.safe(item.get("幅宽")));
                material.setFabricWeight(importHelper.safe(item.get("克重")));
                material.setFabricComposition(importHelper.safe(item.get("成分")));
                material.setSpecifications(importHelper.safe(item.get("规格")));
                material.setRemark(importHelper.safe(item.get("备注")));

                String supplierName = importHelper.safe(item.get("供应商名称"));
                if (StringUtils.hasText(supplierName)) {
                    Factory factory = factoryService.getOne(
                            new LambdaQueryWrapper<Factory>()
                                    .eq(Factory::getFactoryName, supplierName)
                                    .eq(Factory::getTenantId, tenantId)
                                    .eq(Factory::getDeleteFlag, 0)
                                    .last("LIMIT 1")
                    );
                    if (factory == null) {
                        throw new IllegalArgumentException("供应商不存在: " + supplierName + "，请先在「供应商导入」中导入");
                    }
                    material.setSupplierId(factory.getId());
                    material.setSupplierName(supplierName);
                    material.setSupplierContactPerson(factory.getContactPerson());
                    material.setSupplierContactPhone(factory.getContactPhone());
                }

                material.setStatus("completed");
                material.setCompletedTime(now);
                material.setDisabled(0);
                material.setDeleteFlag(0);
                material.setTenantId(tenantId);
                material.setCreateTime(now);
                material.setUpdateTime(now);

                boolean saved = materialDatabaseService.save(material);
                if (!saved) throw new RuntimeException("保存失败");

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("materialCode", materialCode);
                success.put("materialName", materialName);
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("materialCode", item.get("物料编码*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        return importHelper.buildResult(rows.size(), successRecords, failedRecords, "物料主档");
    }

    /** 类型归一：面料/布料→fabric，里料→lining，辅料/配件→accessory（与前端 materialType 三分类一致） */
    private String normalizeType(String raw) {
        if (!StringUtils.hasText(raw)) {
            return "accessory";
        }
        String v = raw.trim();
        if ("面料".equals(v) || "布料".equals(v) || "fabric".equalsIgnoreCase(v)) return "fabric";
        if ("里料".equals(v) || "lining".equalsIgnoreCase(v)) return "lining";
        if ("辅料".equals(v) || "配件".equals(v) || "accessory".equalsIgnoreCase(v)) return "accessory";
        return v;
    }
}
