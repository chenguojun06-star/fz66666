package com.fashion.supplychain.finance.orchestration;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.finance.entity.MaterialReconciliation;
import com.fashion.supplychain.finance.service.MaterialReconciliationService;
import com.fashion.supplychain.production.service.MaterialPurchaseService;
import com.fashion.supplychain.production.service.ProductionOrderService;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import java.math.BigDecimal;
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
 * MaterialReconciliationOrchestrator 单元测试
 *
 * 测试范围：
 * 1. 对账单查询（分页 list、详情 getById）
 * 2. 对账单创建（save）
 * 3. 对账单更新（update，含权限检查）
 * 4. 对账单删除（delete，含权限检查）
 * 5. 批量补数据（backfill，含权限检查）
 */
@ExtendWith(MockitoExtension.class)
class MaterialReconciliationOrchestratorTest {

    @Mock private MaterialReconciliationService materialReconciliationService;
    @Mock private MaterialPurchaseService materialPurchaseService;
    @Mock private ProductionOrderService productionOrderService;

    @InjectMocks
    private MaterialReconciliationOrchestrator orchestrator;

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

    // ==================== list 查询测试 ====================

    @Nested
    class ListTests {

        @Test
        void list_returnsPagedResults() {
            setUser("u1", "用户1", "admin");
            Map<String, Object> params = new HashMap<>();
            Page<MaterialReconciliation> page = new Page<>(1, 10);
            page.setRecords(Collections.singletonList(createTestRecord()));
            page.setTotal(1);

            when(materialReconciliationService.queryPage(params)).thenReturn(page);

            IPage<MaterialReconciliation> result = orchestrator.list(params);

            assertNotNull(result);
            assertEquals(1, result.getTotal());
            verify(materialReconciliationService).queryPage(params);
        }

        @Test
        void list_returnsEmptyPage_whenNoData() {
            setUser("u1", "用户1", "admin");
            Map<String, Object> params = new HashMap<>();
            Page<MaterialReconciliation> page = new Page<>(1, 10);
            page.setRecords(Collections.emptyList());
            page.setTotal(0);

            when(materialReconciliationService.queryPage(params)).thenReturn(page);

            IPage<MaterialReconciliation> result = orchestrator.list(params);

            assertNotNull(result);
            assertEquals(0, result.getTotal());
            assertTrue(result.getRecords().isEmpty());
        }
    }

    // ==================== getById 测试 ====================

    @Nested
    class GetByIdTests {

        @Test
        void getById_returnsRecord_whenExists() {
            setUser("u1", "用户1", "admin");
            MaterialReconciliation record = createTestRecord();
            record.setId("rec123");

            when(materialReconciliationService.getById("rec123")).thenReturn(record);

            MaterialReconciliation result = orchestrator.getById("rec123");

            assertNotNull(result);
            assertEquals("rec123", result.getId());
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
            when(materialReconciliationService.getById("notExist")).thenReturn(null);

            assertThrows(NoSuchElementException.class, () -> orchestrator.getById("notExist"));
        }

        @Test
        void getById_throwsException_whenLogicallyDeleted() {
            setUser("u1", "用户1", "admin");
            MaterialReconciliation deleted = createTestRecord();
            deleted.setId("rec123");
            deleted.setDeleteFlag(1);

            when(materialReconciliationService.getById("rec123")).thenReturn(deleted);

            assertThrows(NoSuchElementException.class, () -> orchestrator.getById("rec123"));
        }
    }

    // ==================== save 测试 ====================

    @Nested
    class SaveTests {

        @Test
        void save_createsNewRecord_successfully() {
            setUser("u1", "用户1", "admin");
            MaterialReconciliation record = createTestRecord();

            when(materialReconciliationService.save(any(MaterialReconciliation.class))).thenReturn(true);

            boolean result = orchestrator.save(record);

            assertTrue(result);
            assertEquals("pending", record.getStatus());
            assertEquals(Integer.valueOf(0), record.getDeleteFlag());
            assertNotNull(record.getCreateTime());
            assertNotNull(record.getUpdateTime());
            verify(materialReconciliationService).save(record);
        }

        @Test
        void save_throwsException_whenParamIsNull() {
            setUser("u1", "用户1", "admin");
            assertThrows(IllegalArgumentException.class, () -> orchestrator.save(null));
        }

        @Test
        void save_throwsException_whenServiceFails() {
            setUser("u1", "用户1", "admin");
            MaterialReconciliation record = createTestRecord();

            when(materialReconciliationService.save(any(MaterialReconciliation.class))).thenReturn(false);

            assertThrows(IllegalStateException.class, () -> orchestrator.save(record));
        }
    }

    // ==================== update 测试 ====================

    @Nested
    class UpdateTests {

        @Test
        void update_modifiesPendingRecord_successfully() {
            setUser("u1", "用户1", "worker");
            MaterialReconciliation existing = createTestRecord();
            existing.setId("rec123");
            existing.setStatus("pending");
            existing.setDeleteFlag(0);

            MaterialReconciliation updated = createTestRecord();
            updated.setId("rec123");
            updated.setQuantity(200);

            when(materialReconciliationService.getById("rec123")).thenReturn(existing);
            when(materialReconciliationService.updateById(any(MaterialReconciliation.class))).thenReturn(true);

            boolean result = orchestrator.update(updated);

            assertTrue(result);
            verify(materialReconciliationService).updateById(any());
        }

        @Test
        void update_throwsException_whenIdIsEmpty() {
            setUser("u1", "用户1", "admin");
            MaterialReconciliation record = new MaterialReconciliation();
            record.setId("");

            assertThrows(IllegalArgumentException.class, () -> orchestrator.update(record));
        }

        @Test
        void update_throwsException_whenParamIsNull() {
            setUser("u1", "用户1", "admin");
            assertThrows(IllegalArgumentException.class, () -> orchestrator.update(null));
        }

        @Test
        void update_throwsException_whenNotFound() {
            setUser("u1", "用户1", "admin");
            MaterialReconciliation record = createTestRecord();
            record.setId("notExist");

            when(materialReconciliationService.getById("notExist")).thenReturn(null);

            assertThrows(NoSuchElementException.class, () -> orchestrator.update(record));
        }

        @Test
        void update_throwsException_whenNonPendingAndNotTopAdmin() {
            setUser("u1", "用户1", "worker"); // 普通用户
            MaterialReconciliation existing = createTestRecord();
            existing.setId("rec123");
            existing.setStatus("verified");
            existing.setDeleteFlag(0);

            MaterialReconciliation toUpdate = createTestRecord();
            toUpdate.setId("rec123");

            when(materialReconciliationService.getById("rec123")).thenReturn(existing);

            assertThrows(IllegalStateException.class, () -> orchestrator.update(toUpdate));
            verify(materialReconciliationService, never()).updateById(any());
        }

        @Test
        void update_allowsNonPending_whenTopAdmin() {
            setUser("u1", "管理员", "admin"); // TopAdmin
            MaterialReconciliation existing = createTestRecord();
            existing.setId("rec123");
            existing.setStatus("verified");
            existing.setDeleteFlag(0);

            MaterialReconciliation toUpdate = createTestRecord();
            toUpdate.setId("rec123");

            when(materialReconciliationService.getById("rec123")).thenReturn(existing);
            when(materialReconciliationService.updateById(any(MaterialReconciliation.class))).thenReturn(true);

            boolean result = orchestrator.update(toUpdate);

            assertTrue(result);
            verify(materialReconciliationService).updateById(any());
        }
    }

    // ==================== delete 测试 ====================

    @Nested
    class DeleteTests {

        @Test
        void delete_removesPendingRecord_successfully() {
            setUser("u1", "用户1", "worker");
            MaterialReconciliation existing = createTestRecord();
            existing.setId("rec123");
            existing.setStatus("pending");
            existing.setDeleteFlag(0);

            when(materialReconciliationService.getById("rec123")).thenReturn(existing);
            when(materialReconciliationService.updateById(any(MaterialReconciliation.class))).thenReturn(true);

            boolean result = orchestrator.delete("rec123");

            assertTrue(result);
            verify(materialReconciliationService).updateById(argThat(r ->
                    r.getDeleteFlag() != null && r.getDeleteFlag() == 1));
        }

        @Test
        void delete_throwsException_whenIdIsEmpty() {
            setUser("u1", "用户1", "admin");
            assertThrows(IllegalArgumentException.class, () -> orchestrator.delete(""));
            assertThrows(IllegalArgumentException.class, () -> orchestrator.delete(null));
        }

        @Test
        void delete_throwsException_whenNotFoundOrDeleted() {
            setUser("u1", "用户1", "admin");
            when(materialReconciliationService.getById("notExist")).thenReturn(null);

            assertThrows(NoSuchElementException.class, () -> orchestrator.delete("notExist"));
        }

        @Test
        void delete_throwsException_whenNonPendingAndNotTopAdmin() {
            setUser("u1", "用户1", "worker");
            MaterialReconciliation existing = createTestRecord();
            existing.setId("rec123");
            existing.setStatus("approved");
            existing.setDeleteFlag(0);

            when(materialReconciliationService.getById("rec123")).thenReturn(existing);

            assertThrows(IllegalStateException.class, () -> orchestrator.delete("rec123"));
            verify(materialReconciliationService, never()).updateById(any());
        }

        @Test
        void delete_allowsNonPending_whenTopAdmin() {
            setUser("u1", "管理员", "admin");
            MaterialReconciliation existing = createTestRecord();
            existing.setId("rec123");
            existing.setStatus("approved");
            existing.setDeleteFlag(0);

            when(materialReconciliationService.getById("rec123")).thenReturn(existing);
            when(materialReconciliationService.updateById(any(MaterialReconciliation.class))).thenReturn(true);

            boolean result = orchestrator.delete("rec123");

            assertTrue(result);
        }
    }

    // ==================== backfill 测试 ====================

    @Nested
    class BackfillTests {

        @Test
        void backfill_throwsAccessDenied_whenNotSupervisor() {
            setUser("u1", "普通工人", "worker");

            assertThrows(AccessDeniedException.class, () -> orchestrator.backfill());
        }
    }

    // ==================== 辅助方法 ====================

    private MaterialReconciliation createTestRecord() {
        MaterialReconciliation record = new MaterialReconciliation();
        record.setReconciliationNo("MR20260212001");
        record.setSupplierName("测试供应商");
        record.setMaterialName("测试面料");
        record.setMaterialCode("MAT001");
        record.setQuantity(100);
        record.setUnitPrice(new BigDecimal("15.50"));
        record.setTotalAmount(new BigDecimal("1550.00"));
        record.setDeductionAmount(BigDecimal.ZERO);
        record.setFinalAmount(new BigDecimal("1550.00"));
        record.setStatus("pending");
        record.setDeleteFlag(0);
        record.setCreateTime(LocalDateTime.now());
        record.setUpdateTime(LocalDateTime.now());
        record.setTenantId(1L);
        return record;
    }
}
