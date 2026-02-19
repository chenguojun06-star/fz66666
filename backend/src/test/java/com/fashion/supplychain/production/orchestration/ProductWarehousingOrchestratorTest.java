package com.fashion.supplychain.production.orchestration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.production.entity.ProductWarehousing;
import com.fashion.supplychain.production.entity.ProductionOrder;
import com.fashion.supplychain.production.service.*;
import com.fashion.supplychain.style.service.ProductSkuService;
import com.fashion.supplychain.style.service.StyleBomService;
import com.fashion.supplychain.style.service.StyleInfoService;
import com.fashion.supplychain.template.service.TemplateLibraryService;
import java.time.LocalDateTime;
import java.util.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;

/**
 * ProductWarehousingOrchestrator 单元测试
 *
 * 测试范围：
 * 1. 入库记录查询（getById）
 * 2. 入库记录删除（delete）
 * 3. 入库记录更新（update 参数校验）
 * 4. 待处理菲号查询（listPendingBundles 参数校验）
 * 5. 质检概要（getQualityBriefing 参数校验）
 * 6. 入库回退（rollbackByBundle 权限/参数校验）
 */
@ExtendWith(MockitoExtension.class)
class ProductWarehousingOrchestratorTest {

    @Mock private ProductWarehousingService productWarehousingService;
    @Mock private ProductionOrderService productionOrderService;
    @Mock private ProductionOrderOrchestrator productionOrderOrchestrator;
    @Mock private CuttingBundleService cuttingBundleService;
    @Mock private CuttingTaskService cuttingTaskService;
    @Mock private ScanRecordService scanRecordService;
    @Mock private ProductionOrderScanRecordDomainService scanRecordDomainService;
    @Mock private ProductSkuService productSkuService;
    @Mock private StyleInfoService styleInfoService;
    @Mock private StyleBomService styleBomService;
    @Mock private TemplateLibraryService templateLibraryService;

    @InjectMocks
    private ProductWarehousingOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        UserContext.clear();
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private void setUser(String userId, String username, String role) {
        UserContext ctx = new UserContext();
        ctx.setUserId(userId);
        ctx.setUsername(username);
        ctx.setRole(role);
        ctx.setTenantId(1L);
        UserContext.set(ctx);
    }

    // ==================== getById 测试 ====================

    @Nested
    class GetByIdTests {

        @Test
        void getById_returnsRecord_whenExists() {
            setUser("u1", "用户1", "admin");
            ProductWarehousing record = createTestWarehousing();
            record.setId("wh123");

            when(productWarehousingService.getById("wh123")).thenReturn(record);

            ProductWarehousing result = orchestrator.getById("wh123");

            assertNotNull(result);
            assertEquals("wh123", result.getId());
        }

        @Test
        void getById_throwsException_whenIdIsEmpty() {
            setUser("u1", "用户1", "admin");
            assertThrows(IllegalArgumentException.class, () -> orchestrator.getById(""));
            assertThrows(IllegalArgumentException.class, () -> orchestrator.getById(null));
            assertThrows(IllegalArgumentException.class, () -> orchestrator.getById("   "));
        }

        @Test
        void getById_throwsException_whenNotFound() {
            setUser("u1", "用户1", "admin");
            when(productWarehousingService.getById("notExist")).thenReturn(null);

            assertThrows(NoSuchElementException.class, () -> orchestrator.getById("notExist"));
        }

        @Test
        void getById_throwsException_whenLogicallyDeleted() {
            setUser("u1", "用户1", "admin");
            ProductWarehousing deleted = createTestWarehousing();
            deleted.setId("wh123");
            deleted.setDeleteFlag(1);

            when(productWarehousingService.getById("wh123")).thenReturn(deleted);

            assertThrows(NoSuchElementException.class, () -> orchestrator.getById("wh123"));
        }
    }

    // ==================== save 参数校验测试 ====================

    @Nested
    class SaveTests {

        @Test
        void save_throwsException_whenParamIsNull() {
            setUser("u1", "用户1", "admin");
            assertThrows(IllegalArgumentException.class, () -> orchestrator.save(null));
        }
    }

    // ==================== update 参数校验测试 ====================

    @Nested
    class UpdateTests {

        @Test
        void update_throwsException_whenParamIsNull() {
            setUser("u1", "用户1", "admin");
            assertThrows(IllegalArgumentException.class, () -> orchestrator.update(null));
        }

        @Test
        void update_throwsException_whenIdIsEmpty() {
            setUser("u1", "用户1", "admin");
            ProductWarehousing record = createTestWarehousing();
            record.setId("");

            assertThrows(IllegalArgumentException.class, () -> orchestrator.update(record));
        }

        @Test
        void update_throwsException_whenNotFound() {
            setUser("u1", "用户1", "admin");
            ProductWarehousing record = createTestWarehousing();
            record.setId("notExist");

            when(productWarehousingService.getById("notExist")).thenReturn(null);

            assertThrows(NoSuchElementException.class, () -> orchestrator.update(record));
        }

        @Test
        void update_throwsException_whenLogicallyDeleted() {
            setUser("u1", "用户1", "admin");
            ProductWarehousing existing = createTestWarehousing();
            existing.setId("wh123");
            existing.setDeleteFlag(1);

            ProductWarehousing toUpdate = createTestWarehousing();
            toUpdate.setId("wh123");

            when(productWarehousingService.getById("wh123")).thenReturn(existing);

            assertThrows(NoSuchElementException.class, () -> orchestrator.update(toUpdate));
        }
    }

    // ==================== delete 测试 ====================

    @Nested
    class DeleteTests {

        @Test
        void delete_throwsException_whenIdIsEmpty() {
            setUser("u1", "用户1", "admin");
            assertThrows(IllegalArgumentException.class, () -> orchestrator.delete(""));
            assertThrows(IllegalArgumentException.class, () -> orchestrator.delete(null));
        }

        @Test
        void delete_throwsException_whenNotFound() {
            setUser("u1", "用户1", "admin");
            when(productWarehousingService.getById("notExist")).thenReturn(null);

            assertThrows(NoSuchElementException.class, () -> orchestrator.delete("notExist"));
        }

        @Test
        void delete_throwsException_whenAlreadyDeleted() {
            setUser("u1", "用户1", "admin");
            ProductWarehousing deleted = createTestWarehousing();
            deleted.setId("wh123");
            deleted.setDeleteFlag(1);

            when(productWarehousingService.getById("wh123")).thenReturn(deleted);

            assertThrows(NoSuchElementException.class, () -> orchestrator.delete("wh123"));
        }
    }

    // ==================== listPendingBundles 测试 ====================

    @Nested
    class ListPendingBundlesTests {

        @Test
        void listPendingBundles_throwsException_whenStatusIsEmpty() {
            setUser("u1", "用户1", "admin");
            assertThrows(IllegalArgumentException.class, () -> orchestrator.listPendingBundles(""));
            assertThrows(IllegalArgumentException.class, () -> orchestrator.listPendingBundles(null));
        }
    }

    // ==================== getQualityBriefing 测试 ====================

    @Nested
    class GetQualityBriefingTests {

        @Test
        void getQualityBriefing_throwsException_whenOrderIdIsEmpty() {
            setUser("u1", "用户1", "admin");
            assertThrows(IllegalArgumentException.class, () -> orchestrator.getQualityBriefing(""));
            assertThrows(IllegalArgumentException.class, () -> orchestrator.getQualityBriefing(null));
        }

        @Test
        void getQualityBriefing_throwsException_whenOrderNotFound() {
            setUser("u1", "用户1", "admin");
            when(productionOrderService.getById("notExist")).thenReturn(null);

            assertThrows(NoSuchElementException.class,
                    () -> orchestrator.getQualityBriefing("notExist"));
        }
    }

    // ==================== rollbackByBundle 测试 ====================

    @Nested
    class RollbackByBundleTests {

        @Test
        void rollbackByBundle_throwsAccessDenied_whenNotSupervisor() {
            setUser("u1", "普通工人", "worker");

            Map<String, Object> body = new HashMap<>();
            body.put("cuttingBundleQrCode", "QR001");
            body.put("rollbackQuantity", 5);
            body.put("remark", "质量问题");

            assertThrows(AccessDeniedException.class, () -> orchestrator.rollbackByBundle(body));
        }

        @Test
        void rollbackByBundle_throwsException_whenQrCodeIsEmpty() {
            setUser("u1", "主管", "supervisor");

            Map<String, Object> body = new HashMap<>();
            body.put("cuttingBundleQrCode", "");
            body.put("rollbackQuantity", 5);
            body.put("remark", "质量问题");

            assertThrows(IllegalArgumentException.class, () -> orchestrator.rollbackByBundle(body));
        }

        @Test
        void rollbackByBundle_throwsException_whenQuantityInvalid() {
            setUser("u1", "主管", "supervisor");

            Map<String, Object> body = new HashMap<>();
            body.put("cuttingBundleQrCode", "QR001");
            body.put("rollbackQuantity", 0);
            body.put("remark", "质量问题");

            assertThrows(IllegalArgumentException.class, () -> orchestrator.rollbackByBundle(body));
        }

        @Test
        void rollbackByBundle_throwsException_whenRemarkIsEmpty() {
            setUser("u1", "主管", "supervisor");

            Map<String, Object> body = new HashMap<>();
            body.put("cuttingBundleQrCode", "QR001");
            body.put("rollbackQuantity", 5);
            body.put("remark", "");

            assertThrows(IllegalArgumentException.class, () -> orchestrator.rollbackByBundle(body));
        }
    }

    // ==================== batchSave 参数校验测试 ====================

    @Nested
    class BatchSaveTests {

        @Test
        void batchSave_throwsException_whenOrderIdIsEmpty() {
            setUser("u1", "用户1", "admin");
            Map<String, Object> body = new HashMap<>();
            body.put("orderId", "");

            assertThrows(IllegalArgumentException.class, () -> orchestrator.batchSave(body));
        }

        @Test
        void batchSave_throwsException_whenItemsNotList() {
            setUser("u1", "用户1", "admin");
            Map<String, Object> body = new HashMap<>();
            body.put("orderId", "order123");
            body.put("items", "not a list");

            assertThrows(IllegalArgumentException.class, () -> orchestrator.batchSave(body));
        }

        @Test
        void batchSave_throwsException_whenItemsEmpty() {
            setUser("u1", "用户1", "admin");
            Map<String, Object> body = new HashMap<>();
            body.put("orderId", "order123");
            body.put("items", Collections.emptyList());

            assertThrows(IllegalArgumentException.class, () -> orchestrator.batchSave(body));
        }
    }

    // ==================== 辅助方法 ====================

    private ProductWarehousing createTestWarehousing() {
        ProductWarehousing record = new ProductWarehousing();
        record.setWarehousingNo("WH20260212001");
        record.setOrderId("order123");
        record.setOrderNo("PO20260212001");
        record.setStyleNo("FZ2024001");
        record.setWarehousingQuantity(50);
        record.setQualifiedQuantity(48);
        record.setUnqualifiedQuantity(2);
        record.setQualityStatus("qualified");
        record.setDeleteFlag(0);
        record.setCreateTime(LocalDateTime.now());
        record.setTenantId(1L);
        return record;
    }
}
