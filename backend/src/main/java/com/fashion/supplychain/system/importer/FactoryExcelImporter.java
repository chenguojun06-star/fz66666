package com.fashion.supplychain.system.importer;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
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

@Component
@Slf4j
public class FactoryExcelImporter {

    private static final String[] FACTORY_HEADERS = {
            "供应商名称*", "供应商编码", "联系人", "联系电话", "地址"
    };
    private static final String[] FACTORY_EXAMPLES = {
            "广州XX制衣厂", "GZ001", "李经理", "13800138000", "广州市番禺区XX路"
    };

    @Autowired
    private FactoryService factoryService;

    @Autowired
    private ExcelImportHelper importHelper;

    public ExcelImportHelper.TemplateConfig getTemplateConfig() {
        ExcelImportHelper.TemplateConfig config = new ExcelImportHelper.TemplateConfig();
        config.headers = FACTORY_HEADERS;
        config.examples = FACTORY_EXAMPLES;
        config.sheetName = "供应商";
        config.notes = new String[]{
                "供应商名称*: 必填，不能重复",
                "供应商编码: 选填，内部编码",
                "联系人: 选填",
                "联系电话: 选填",
                "地址: 选填"
        };
        return config;
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importFactories(Long tenantId, MultipartFile file) {
        List<Map<String, String>> rows = importHelper.parseExcel(file, FACTORY_HEADERS);
        if (rows.isEmpty()) {
            throw new IllegalArgumentException("Excel文件中没有数据");
        }
        if (rows.size() > 500) {
            throw new IllegalArgumentException("单次最多导入 500 条，当前 " + rows.size() + " 条");
        }

        List<Map<String, Object>> successRecords = new ArrayList<>();
        List<Map<String, Object>> failedRecords = new ArrayList<>();

        for (int index = 0; index < rows.size(); index++) {
            Map<String, String> item = rows.get(index);
            try {
                String factoryName = importHelper.safe(item.get("供应商名称*"));
                if (!StringUtils.hasText(factoryName)) {
                    throw new IllegalArgumentException("供应商名称不能为空");
                }

                Factory existing = factoryService.getOne(
                        new LambdaQueryWrapper<Factory>()
                                .eq(Factory::getFactoryName, factoryName)
                                .eq(Factory::getDeleteFlag, 0)
                                .last("LIMIT 1")
                );
                if (existing != null) {
                    throw new IllegalArgumentException("供应商名称已存在: " + factoryName);
                }

                Factory factory = new Factory();
                factory.setFactoryName(factoryName);
                factory.setFactoryCode(importHelper.safe(item.get("供应商编码")));
                factory.setContactPerson(importHelper.safe(item.get("联系人")));
                factory.setContactPhone(importHelper.safe(item.get("联系电话")));
                factory.setAddress(importHelper.safe(item.get("地址")));
                factory.setStatus("active");
                factory.setDeleteFlag(0);
                factory.setCreateTime(LocalDateTime.now());
                factory.setUpdateTime(LocalDateTime.now());

                boolean saved = factoryService.save(factory);
                if (!saved) throw new RuntimeException("保存失败");

                Map<String, Object> success = new LinkedHashMap<>();
                success.put("row", index + 2);
                success.put("factoryName", factoryName);
                successRecords.add(success);
            } catch (Exception e) {
                Map<String, Object> fail = new LinkedHashMap<>();
                fail.put("row", index + 2);
                fail.put("factoryName", item.get("供应商名称*"));
                fail.put("error", e.getMessage());
                failedRecords.add(fail);
            }
        }

        return importHelper.buildResult(rows.size(), successRecords, failedRecords, "供应商");
    }
}
