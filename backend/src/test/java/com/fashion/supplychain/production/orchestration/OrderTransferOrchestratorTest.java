package com.fashion.supplychain.production.orchestration;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.Factory;
import com.fashion.supplychain.system.entity.User;
import com.fashion.supplychain.system.service.FactoryService;
import com.fashion.supplychain.system.service.UserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderTransferOrchestratorTest {

    @InjectMocks
    private OrderTransferOrchestrator orchestrator;

    @Mock private UserService userService;
    @Mock private FactoryService factoryService;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(1L);
        ctx.setUserId("user1");
        ctx.setUsername("测试用户");
        UserContext.set(ctx);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    // ── searchTransferableUsers ───────────────────────────────────────

    @Test
    void searchTransferableUsers_emptyResult_returnsMapWithTotalAndRecords() {
        when(userService.page(any(), any())).thenReturn(new Page<>());

        Map<String, Object> result = orchestrator.searchTransferableUsers("张三", 1L, 10L);

        assertThat(result).containsKeys("total", "records");
        assertThat(result.get("total")).isEqualTo(0L);
    }

    @Test
    void searchTransferableUsers_withResults_returnsCorrectCount() {
        Page<User> page = new Page<>();
        page.setTotal(2);
        User u1 = new User();
        u1.setId(10L);
        u1.setName("张三");
        u1.setUsername("zhangsan");
        User u2 = new User();
        u2.setId(11L);
        u2.setName("李四");
        u2.setUsername("lisi");
        page.setRecords(java.util.List.of(u1, u2));
        when(userService.page(any(), any())).thenReturn(page);

        Map<String, Object> result = orchestrator.searchTransferableUsers("", 1L, 10L);

        assertThat(result.get("total")).isEqualTo(2L);
        @SuppressWarnings("unchecked")
        java.util.List<Map<String, Object>> records = (java.util.List<Map<String, Object>>) result.get("records");
        assertThat(records).hasSize(2);
    }

    @Test
    void searchTransferableUsers_nullKeyword_stillReturnsMap() {
        when(userService.page(any(), any())).thenReturn(new Page<>());
        Map<String, Object> result = orchestrator.searchTransferableUsers(null, 1L, 20L);
        assertThat(result).containsKeys("total", "records");
    }

    // ── searchTransferableFactories ───────────────────────────────────

    @Test
    void searchTransferableFactories_emptyResult_returnsMapWithTotalAndRecords() {
        when(factoryService.page(any(), any())).thenReturn(new Page<>());

        Map<String, Object> result = orchestrator.searchTransferableFactories("工厂A", 1L, 10L);

        assertThat(result).containsKeys("total", "records");
        assertThat(result.get("total")).isEqualTo(0L);
    }

    @Test
    void searchTransferableFactories_withResults_returnsFactoryFields() {
        Page<Factory> page = new Page<>();
        page.setTotal(1);
        Factory factory = new Factory();
        factory.setId("5");
        factory.setFactoryCode("FC001");
        factory.setFactoryName("测试工厂");
        page.setRecords(java.util.List.of(factory));
        when(factoryService.page(any(), any())).thenReturn(page);

        Map<String, Object> result = orchestrator.searchTransferableFactories("测试", 1L, 10L);

        assertThat(result.get("total")).isEqualTo(1L);
        @SuppressWarnings("unchecked")
        java.util.List<Map<String, Object>> records = (java.util.List<Map<String, Object>>) result.get("records");
        assertThat(records).hasSize(1);
        assertThat(records.get(0)).containsKey("factoryName");
    }
}
