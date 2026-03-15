package com.fashion.supplychain.production.service;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.entity.ScanRecord;
import com.fashion.supplychain.production.mapper.ScanRecordMapper;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.time.LocalDateTime;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class ProductionOrderScanRecordDomainServiceTest {

    @Mock
    private ScanRecordMapper scanRecordMapper;

    @Mock
    private TemplateLibraryService templateLibraryService;

    @InjectMocks
    private ProductionOrderScanRecordDomainService service;

    @BeforeEach
    void setUp() {
        UserContext.clear();
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("operator-1");
        ctx.setUsername("测试员");
        UserContext.set(ctx);
        when(scanRecordMapper.insert(any(ScanRecord.class))).thenReturn(1);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void insertOrderOperationRecord_generatesRequestIdWithinColumnLimit() {
        ProductionOrder order = buildOrder();

        service.insertOrderOperationRecord(order, "报废", "测试报废", LocalDateTime.now());

        ScanRecord saved = captureInsertedRecord();
        assertTrue(saved.getRequestId().startsWith("ORDER_OP:"));
        assertTrue(saved.getRequestId().length() <= 64);
    }

    @Test
    void insertAdvanceRecord_generatesRequestIdWithinColumnLimit() {
        ProductionOrder order = buildOrder();
        when(templateLibraryService.resolveProgressNodeNameFromPercent("STYLE-001", 60)).thenReturn("车缝");

        service.insertAdvanceRecord(order, 60, LocalDateTime.now());

        ScanRecord saved = captureInsertedRecord();
        assertTrue(saved.getRequestId().startsWith("ORDER_ADVANCE:"));
        assertTrue(saved.getRequestId().length() <= 64);
    }

    @Test
    void insertRollbackRecord_generatesRequestIdWithinColumnLimit() {
        ProductionOrder order = buildOrder();

        service.insertRollbackRecord(order, "裁剪", "回退测试", LocalDateTime.now());

        ScanRecord saved = captureInsertedRecord();
        assertTrue(saved.getRequestId().startsWith("ORDER_ROLLBACK:"));
        assertTrue(saved.getRequestId().length() <= 64);
    }

    @Test
    void insertOrchestrationFailure_generatesRequestIdWithinColumnLimit() {
        ProductionOrder order = buildOrder();

        service.insertOrchestrationFailure(order, "generateMaterialDemand", "异常测试", LocalDateTime.now());

        ScanRecord saved = captureInsertedRecord();
        assertTrue(saved.getRequestId().startsWith("ORCH_FAIL:"));
        assertTrue(saved.getRequestId().length() <= 64);
    }

    private ScanRecord captureInsertedRecord() {
        ArgumentCaptor<ScanRecord> captor = ArgumentCaptor.forClass(ScanRecord.class);
        verify(scanRecordMapper).insert(captor.capture());
        return captor.getValue();
    }

    private ProductionOrder buildOrder() {
        ProductionOrder order = new ProductionOrder();
        order.setId("2412e34c-0ba7-11f1-9759-363b36779977");
        order.setOrderNo("CUT20260315135549088");
        order.setStyleId("style-1");
        order.setStyleNo("STYLE-001");
        order.setColor("黑色");
        order.setSize("XL");
        return order;
    }
}