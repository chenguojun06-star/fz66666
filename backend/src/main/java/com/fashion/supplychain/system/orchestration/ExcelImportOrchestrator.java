package com.fashion.supplychain.system.orchestration;

import com.fashion.supplychain.system.importer.ExcelImportHelper;
import com.fashion.supplychain.system.importer.CustomerExcelImporter;
import com.fashion.supplychain.system.importer.EmployeeExcelImporter;
import com.fashion.supplychain.system.importer.FactoryExcelImporter;
import com.fashion.supplychain.system.importer.FinishedOpeningStockExcelImporter;
import com.fashion.supplychain.system.importer.MaterialMasterExcelImporter;
import com.fashion.supplychain.system.importer.MaterialOpeningStockExcelImporter;
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

    @Autowired
    private CustomerExcelImporter customerExcelImporter;

    @Autowired
    private MaterialMasterExcelImporter materialMasterExcelImporter;

    @Autowired
    private MaterialOpeningStockExcelImporter materialOpeningStockExcelImporter;

    @Autowired
    private FinishedOpeningStockExcelImporter finishedOpeningStockExcelImporter;

    public byte[] generateTemplate(String type) {
        ExcelImportHelper.TemplateConfig config = resolveTemplateConfig(type);
        return importHelper.generateTemplate(config);
    }

    /** 智能映射导入需要拿目标类型的标准表头（D-751） */
    public ExcelImportHelper.TemplateConfig templateConfigOf(String type) {
        return resolveTemplateConfig(type);
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
            case "customer":
                return customerExcelImporter.getTemplateConfig();
            case "material":
                return materialMasterExcelImporter.getTemplateConfig();
            case "material-stock":
                return materialOpeningStockExcelImporter.getTemplateConfig();
            case "product-stock":
                return finishedOpeningStockExcelImporter.getTemplateConfig();
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

    // 客户/物料主档：批内一个事务（与既有导入器一致）。
    // 期初库存两型故意不开整体事务：底层 manualInbound/freeInbound 逐行自带事务，
    // 行级失败只回滚该行（若套整体事务，内层 rollback-only 会把整批拖垮）。
    public Map<String, Object> importCustomers(Long tenantId, MultipartFile file) {
        return customerExcelImporter.importCustomers(tenantId, file);
    }

    public Map<String, Object> importMaterialMasters(Long tenantId, MultipartFile file) {
        return materialMasterExcelImporter.importMaterialMasters(tenantId, file);
    }

    public Map<String, Object> importMaterialOpeningStock(Long tenantId, MultipartFile file) {
        return materialOpeningStockExcelImporter.importMaterialOpeningStock(tenantId, file);
    }

    public Map<String, Object> importFinishedOpeningStock(Long tenantId, MultipartFile file) {
        return finishedOpeningStockExcelImporter.importFinishedOpeningStock(tenantId, file);
    }

    @Transactional(rollbackFor = Exception.class)
    public Map<String, Object> importStylesFromZip(Long tenantId, MultipartFile file) {
        return styleExcelImporter.importStylesFromZip(tenantId, file);
    }

    /**
     * 按类型分发导入（D-751 智能映射导入专用入口）。
     * ⚠️ 与 ExcelImportController.uploadAndImport 的 switch 保持同一组类型；
     * 期初库存两型不带整体事务（逐行独立提交），其余类型由各导入器自身 @Transactional 保批内原子。
     */
    public Map<String, Object> importByType(Long tenantId, String type, MultipartFile file) {
        switch (type) {
            case "style":
                return importStyles(tenantId, file);
            case "factory":
                return importFactories(tenantId, file);
            case "employee":
                return importEmployees(tenantId, file);
            case "process":
                return importProcesses(tenantId, file);
            case "customer":
                return customerExcelImporter.importCustomers(tenantId, file);
            case "material":
                return materialMasterExcelImporter.importMaterialMasters(tenantId, file);
            case "material-stock":
                return materialOpeningStockExcelImporter.importMaterialOpeningStock(tenantId, file);
            case "product-stock":
                return finishedOpeningStockExcelImporter.importFinishedOpeningStock(tenantId, file);
            default:
                throw new IllegalArgumentException("不支持的导入类型: " + type);
        }
    }
}
