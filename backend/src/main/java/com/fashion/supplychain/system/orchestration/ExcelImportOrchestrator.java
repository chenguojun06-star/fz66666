package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.system.importer.ExcelImportHelper;
import com.fashion.supplychain.system.importer.EmployeeExcelImporter;
import com.fashion.supplychain.system.importer.FactoryExcelImporter;
import com.fashion.supplychain.system.importer.ProcessExcelImporter;
import com.fashion.supplychain.system.importer.StyleExcelImporter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@Slf4j
@Service
public class ExcelImportOrchestrator {

    @Autowired
    private ExcelImportHelper importHelper;

    @Autowired
    private StyleExcelImporter styleExcelImporter;

    @Autowired
    private FactoryExcelImporter factoryExcelImporter;

    @Autowired
    private EmployeeExcelImporter employeeExcelImporter;

    @Autowired
    private ProcessExcelImporter processExcelImporter;

    public byte[] generateTemplate(String type) {
        ExcelImportHelper.TemplateConfig config = resolveTemplateConfig(type);
        return importHelper.generateTemplate(config);
    }

    private ExcelImportHelper.TemplateConfig resolveTemplateConfig(String type) {
        switch (type) {
            case "style":
                return styleExcelImporter.getTemplateConfig();
            case "factory":
                return factoryExcelImporter.getTemplateConfig();
            case "employee":
                return employeeExcelImporter.getTemplateConfig();
            case "process":
                return processExcelImporter.getTemplateConfig();
            default:
                throw new IllegalArgumentException("不支持的导入类型: " + type);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importStyles(Long tenantId, MultipartFile file) {
        return styleExcelImporter.importStyles(tenantId, file);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importFactories(Long tenantId, MultipartFile file) {
        return factoryExcelImporter.importFactories(tenantId, file);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importEmployees(Long tenantId, MultipartFile file) {
        return employeeExcelImporter.importEmployees(tenantId, file);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importProcesses(Long tenantId, MultipartFile file) {
        return processExcelImporter.importProcesses(tenantId, file);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importStylesFromZip(Long tenantId, MultipartFile file) {
        return styleExcelImporter.importStylesFromZip(tenantId, file);
    }
}
