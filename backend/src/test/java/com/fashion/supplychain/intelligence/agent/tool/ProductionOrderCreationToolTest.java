package com.fashion.supplychain.intelligence.agent.tool;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.orchestration.ProductionOrderOrchestrator;
import com.fashion.supplychain.style.entity.StyleInfo;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.orchestration.SerialOrchestrator;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.OrganizationUnitService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProductionOrderCreationToolTest {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Mock
    private StyleInfoService styleInfoService;

    @Mock
    private ProductionOrderOrchestrator productionOrderOrchestrator;

    @Mock
    private FactoryService factoryService;

    @Mock
    private OrganizationUnitService organizationUnitService;

    @Mock
    private TemplateLibraryService templateLibraryService;

    @Mock
    private SerialOrchestrator serialOrchestrator;

    @InjectMocks
    private ProductionOrderCreationTool tool;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("u1001");
        ctx.setUsername("AI测试员");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void execute_returnsMissingInfo_whenRequiredFieldsAreIncomplete() throws Exception {
        String result = tool.execute("{\"styleNo\":\"ST-001\"}");

        JsonNode root = JSON.readTree(result);
        assertTrue(root.path("needMoreInfo").asBoolean());
        assertTrue(root.path("error").asText().contains("建单信息不完整"));
        assertTrue(root.path("missingFields").toString().contains("加工厂/生产组"));
        assertTrue(root.path("missingFields").toString().contains("颜色尺码数量明细"));
        assertTrue(root.path("missingFields").toString().contains("计划开始时间"));
        assertTrue(root.path("missingFields").toString().contains("计划完成时间"));
    }

    @Test
    void execute_createsFormalOrderThroughOrchestrator_whenInputIsComplete() throws Exception {
        StyleInfo style = new StyleInfo();
        style.setId(99L);
        style.setStyleNo("ST-001");
        style.setStyleName("春季卫衣");
        style.setSkc("ST-001-RED");

        Factory factory = new Factory();
        factory.setId("F001");
        factory.setTenantId(1L);
        factory.setFactoryName("鑫达制衣厂");
        factory.setDeleteFlag(0);

        when(styleInfoService.getOne(any(QueryWrapper.class), eq(false))).thenReturn(style);
        when(factoryService.list(any(QueryWrapper.class))).thenReturn(List.of(factory));
        when(templateLibraryService.resolveProgressNodeUnitPrices("ST-001")).thenReturn(List.of(
                Map.of("id", "cutting", "name", "裁剪", "unitPrice", 1.5),
                Map.of("id", "sewing", "name", "车缝", "unitPrice", 3.0)
        ));
        when(serialOrchestrator.generate("ORDER_NO")).thenReturn("PO20260318001");
        when(productionOrderOrchestrator.saveOrUpdateOrder(any(ProductionOrder.class))).thenAnswer(invocation -> {
            ProductionOrder order = invocation.getArgument(0);
            order.setId("ORDER-1001");
            return true;
        });

        String arguments = """
                {
                  "styleNo": "ST-001",
                  "factoryName": "鑫达制衣厂",
                  "plannedStartDate": "2026-03-20",
                  "plannedEndDate": "2026-03-28",
                  "orderLines": [
                    {"color": "红色", "size": "M", "quantity": 120},
                    {"color": "红色", "size": "L", "quantity": 80}
                  ],
                  "urgencyLevel": "urgent",
                  "plateType": "首单",
                  "orderBizType": "FOB",
                  "remark": "优先排期"
                }
                """;

        String result = tool.execute(arguments);

        JsonNode root = JSON.readTree(result);
        assertTrue(root.path("success").asBoolean());
        assertEquals("ORDER-1001", root.path("orderId").asText());
        assertEquals("PO20260318001", root.path("orderNo").asText());
        assertEquals(200, root.path("orderQuantity").asInt());
        assertEquals("鑫达制衣厂", root.path("factoryName").asText());
        assertEquals("EXTERNAL", root.path("factoryType").asText());
        assertTrue(root.path("message").asText().contains("完整链路创建成功"));

        ArgumentCaptor<ProductionOrder> captor = ArgumentCaptor.forClass(ProductionOrder.class);
        verify(productionOrderOrchestrator).saveOrUpdateOrder(captor.capture());
        ProductionOrder saved = captor.getValue();
        assertEquals("ST-001", saved.getStyleNo());
        assertEquals("春季卫衣", saved.getStyleName());
        assertEquals("PO20260318001", saved.getOrderNo());
        assertEquals("F001", saved.getFactoryId());
        assertEquals("EXTERNAL", saved.getFactoryType());
        assertEquals(200, saved.getOrderQuantity());
        assertEquals("红色", saved.getColor());
        assertEquals("M,L", saved.getSize());
        assertEquals("pending", saved.getStatus());
        assertNotNull(saved.getProgressWorkflowJson());
        assertTrue(saved.getOrderDetails().contains("materialPriceSource"));
        assertTrue(saved.getOrderDetails().contains("物料采购系统"));
        assertTrue(saved.getOrderDetails().contains("红色"));
        assertTrue(saved.getOrderDetails().contains("120"));
        assertFalse(saved.getProgressWorkflowJson().isBlank());
    }
}
