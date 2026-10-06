package com.fashion.supplychain.system.importer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.crm.entity.Customer;
import com.fashion.supplychain.crm.service.CustomerService;
import com.fashion.supplychain.production.entity.MaterialDatabase;
import com.fashion.supplychain.production.orchestration.MaterialInboundOrchestrator;
import com.fashion.supplychain.production.service.MaterialDatabaseService;
import com.fashion.supplychain.style.entity.ProductSku;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.orchestration.ExcelImportOrchestrator;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.warehouse.orchestration.FinishedWarehouseOperationOrchestrator;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import static org.mockito.Mockito.doReturn;

/**
 * D-751 租户入驻批量导入第一期：客户/物料主档/物料期初库存/成品期初库存 导入器单测
 */
@ExtendWith(MockitoExtension.class)
class OpeningStockAndCustomerImportersTest {

    /** 真实现 spy：safe/parseDecimal/parseInteger/buildResult 走真实逻辑，仅替身 parseExcel */
    @Spy
    private ExcelImportHelper importHelper = new ExcelImportHelper();

    @Mock
    private CustomerService customerService;

    @Mock
    private FactoryService factoryService;

    @Mock
    private MaterialDatabaseService materialDatabaseService;

    @Mock
    private com.fashion.supplychain.production.service.MaterialStockService materialStockService;

    @Mock
    private MaterialInboundOrchestrator materialInboundOrchestrator;

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private ProductSkuService productSkuService;

    @Mock
    private FinishedWarehouseOperationOrchestrator finishedWarehouseOperationOrchestrator;

    @InjectMocks
    private CustomerExcelImporter customerExcelImporter;

    @InjectMocks
    private MaterialMasterExcelImporter materialMasterExcelImporter;

    @InjectMocks
    private MaterialOpeningStockExcelImporter materialOpeningStockExcelImporter;

    @InjectMocks
    private FinishedOpeningStockExcelImporter finishedOpeningStockExcelImporter;

    @InjectMocks
    private ExcelImportOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("T001");
        ctx.setUsername("导入测试员");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private static MockMultipartFile xlsx() {
        return new MockMultipartFile("file", "test.xlsx", "application/octet-stream", new byte[]{1});
    }

    private static Map<String, String> row(String... kv) {
        Map<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kv.length; i += 2) {
            m.put(kv[i], kv[i + 1]);
        }
        return m;
    }

    private static List<Map<String, String>> rows(Map<String, String>... rs) {
        List<Map<String, String>> list = new ArrayList<>();
        for (Map<String, String> r : rs) {
            list.add(r);
        }
        return list;
    }

    @SuppressWarnings("unchecked")
    private void stubParse(List<? extends Map<String, String>> parsed) {
        doReturn((List<Map<String, String>>) parsed)
                .when(importHelper).parseExcel(any(), any(String[].class));
    }

    @Test
    void templateConfigs_headersAlignWithExamples() {
        ExcelImportHelper.TemplateConfig[][] configs = {
                {customerExcelImporter.getTemplateConfig()},
                {materialMasterExcelImporter.getTemplateConfig()},
                {materialOpeningStockExcelImporter.getTemplateConfig()},
                {finishedOpeningStockExcelImporter.getTemplateConfig()},
        };
        for (ExcelImportHelper.TemplateConfig[] holder : configs) {
            ExcelImportHelper.TemplateConfig config = holder[0];
            assertNotNull(config);
            assertNotNull(config.sheetName);
            assertEquals(config.headers.length, config.examples.length, "表头与示例列数必须一致");
        }
    }

    @Test
    void orchestrator_rejectsUnknownType() {
        assertThrows(IllegalArgumentException.class, () -> orchestrator.generateTemplate("unknown"));
    }

    @Test
    void customerImport_happyPath() {
        stubParse(rows(row("客户名称*", "广州XX服饰", "客户等级", "VIP")));
        when(customerService.getOne(any())).thenReturn(null);
        when(customerService.save(any(Customer.class))).thenReturn(true);

        Map<String, Object> result = customerExcelImporter.importCustomers(2L, xlsx());

        assertEquals(1, result.get("successCount"));
        assertEquals(0, result.get("failedCount"));
        ArgumentCaptor<Customer> captor = ArgumentCaptor.forClass(Customer.class);
        verify(customerService).save(captor.capture());
        Customer saved = captor.getValue();
        assertEquals("广州XX服饰", saved.getCompanyName());
        assertEquals("1", saved.getCustomerLevel()); // VIP → 1
        assertEquals("ACTIVE", saved.getStatus());
        assertTrue(saved.getCustomerNo().startsWith("CRM"));
        assertEquals(2L, saved.getTenantId());
    }

    @Test
    void customerImport_duplicateInDbFailsRow() {
        stubParse(rows(row("客户名称*", "已存在客户")));
        when(customerService.getOne(any())).thenReturn(new Customer());

        Map<String, Object> result = customerExcelImporter.importCustomers(2L, xlsx());

        assertEquals(1, result.get("failedCount"));
        verify(customerService, never()).save(any(Customer.class));
    }

    @Test
    void customerImport_invalidLevelFailsRow() {
        stubParse(rows(row("客户名称*", "甲", "客户等级", "9")));
        when(customerService.getOne(any())).thenReturn(null);

        Map<String, Object> result = customerExcelImporter.importCustomers(2L, xlsx());

        assertEquals(1, result.get("failedCount"));
        verify(customerService, never()).save(any(Customer.class));
    }

    @Test
    void materialMaster_supplierMustExist() {
        stubParse(rows(row("物料编码*", "WL001", "物料名称*", "全棉布", "类型", "面料", "供应商名称", "不存在的供应商")));
        when(materialDatabaseService.getOne(any())).thenReturn(null);
        when(factoryService.getOne(any())).thenReturn(null);

        Map<String, Object> result = materialMasterExcelImporter.importMaterialMasters(2L, xlsx());

        assertEquals(1, result.get("failedCount"));
        verify(materialDatabaseService, never()).save(any(MaterialDatabase.class));
    }

    @Test
    void materialMaster_happyPathCompletesStatus() {
        stubParse(rows(row("物料编码*", "WL001", "物料名称*", "全棉布", "类型", "面料", "供应商名称", "广州面料厂")));
        when(materialDatabaseService.getOne(any())).thenReturn(null);
        Factory factory = new Factory();
        factory.setId("F001");
        when(factoryService.getOne(any())).thenReturn(factory);
        when(materialDatabaseService.save(any(MaterialDatabase.class))).thenReturn(true);

        Map<String, Object> result = materialMasterExcelImporter.importMaterialMasters(2L, xlsx());

        assertEquals(1, result.get("successCount"));
        ArgumentCaptor<MaterialDatabase> captor = ArgumentCaptor.forClass(MaterialDatabase.class);
        verify(materialDatabaseService).save(captor.capture());
        MaterialDatabase saved = captor.getValue();
        assertEquals("fabric", saved.getMaterialType());
        assertEquals("completed", saved.getStatus());
        assertEquals("F001", saved.getSupplierId());
    }

    @Test
    void materialOpeningStock_masterRequired() {
        stubParse(rows(row("物料编码*", "WL404", "数量*", "10")));
        when(materialDatabaseService.getOne(any())).thenReturn(null);

        Map<String, Object> result = materialOpeningStockExcelImporter.importMaterialOpeningStock(2L, xlsx());

        assertEquals(1, result.get("failedCount"));
        verify(materialInboundOrchestrator, never()).manualInbound(
                any(), any(), any(), any(), any(), any(BigDecimal.class),
                any(), any(), any(), any(), any());
    }

    @Test
    void materialOpeningStock_invalidQuantityFailsRow() {
        stubParse(rows(row("物料编码*", "WL001", "数量*", "abc")));

        Map<String, Object> result = materialOpeningStockExcelImporter.importMaterialOpeningStock(2L, xlsx());

        assertEquals(1, result.get("failedCount"));
        verify(materialInboundOrchestrator, never()).manualInbound(
                any(), any(), any(), any(), any(), any(BigDecimal.class),
                any(), any(), any(), any(), any());
    }

    @Test
    void materialOpeningStock_happyPathCallsManualInbound() {
        stubParse(rows(row("物料编码*", "WL001", "数量*", "12.5", "颜色", "黑色")));
        MaterialDatabase master = new MaterialDatabase();
        master.setMaterialCode("WL001");
        master.setMaterialName("全棉布");
        master.setMaterialType("fabric");
        when(materialDatabaseService.getOne(any())).thenReturn(master);

        Map<String, Object> result = materialOpeningStockExcelImporter.importMaterialOpeningStock(2L, xlsx());

        assertEquals(1, result.get("successCount"));
        verify(materialInboundOrchestrator).manualInbound(
                eq("WL001"), eq("全棉布"), eq("fabric"), eq("黑色"), eq(null),
                eq(new BigDecimal("12.5")), eq(null), eq(null), eq("T001"), eq("导入测试员"),
                contains("期初库存导入"));
    }

    @Test
    void finishedOpeningStock_styleRequired() {
        stubParse(rows(row("款号*", "NOPE", "数量*", "5")));
        when(styleInfoService.getOne(any())).thenReturn(null);

        Map<String, Object> result = finishedOpeningStockExcelImporter.importFinishedOpeningStock(2L, xlsx());

        assertEquals(1, result.get("failedCount"));
        verify(finishedWarehouseOperationOrchestrator, never()).freeInbound(any());
    }

    @Test
    void finishedOpeningStock_quantityMustBePositiveInteger() {
        stubParse(rows(row("款号*", "FZ001", "数量*", "-3")));

        Map<String, Object> result = finishedOpeningStockExcelImporter.importFinishedOpeningStock(2L, xlsx());

        assertEquals(1, result.get("failedCount"));
        verify(finishedWarehouseOperationOrchestrator, never()).freeInbound(any());
    }

    @Test
    @SuppressWarnings({"unchecked", "rawtypes"})
    void finishedOpeningStock_reusesExistingSkuCode() {
        stubParse(rows(row("款号*", "FZ001", "数量*", "50", "颜色", "黑色", "码数", "M")));
        StyleInfo style = new StyleInfo();
        style.setId(100L);
        style.setStyleNo("FZ001");
        when(styleInfoService.getOne(any())).thenReturn(style);
        ProductSku sku = new ProductSku();
        sku.setSkuCode("SKU-LEGACY-001");
        when(productSkuService.getOne(any())).thenReturn(sku);

        Map<String, Object> result = finishedOpeningStockExcelImporter.importFinishedOpeningStock(2L, xlsx());

        assertEquals(1, result.get("successCount"));
        ArgumentCaptor<Map<String, Object>> captor = ArgumentCaptor.forClass((Class) Map.class);
        verify(finishedWarehouseOperationOrchestrator).freeInbound(captor.capture());
        Map<String, Object> params = captor.getValue();
        assertEquals("SKU-LEGACY-001", params.get("skuCode"));
        assertEquals(50, params.get("quantity"));
        assertEquals(Boolean.TRUE, params.get("autoCreateSku"));
        assertEquals("free_inbound", params.get("sourceType"));
        assertEquals("FZ001", params.get("styleNo"));
    }
}
