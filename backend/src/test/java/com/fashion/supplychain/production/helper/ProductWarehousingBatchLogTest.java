package com.fashion.supplychain.production.helper;

import com.fashion.supplychain.common.OperationLogAppendUtil;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.system.entity.OperationLog;
import com.fashion.supplychain.system.service.OperationLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

/**
 * 批量成品入库日志接线（D-881）。
 *
 * <p>背景：D-877 复核发现成品入库有两条路径——单条入库 {@code save} 记了
 * {@code appendSingleWarehousing}，批量入库 {@code batchSave} 却没记。
 * 同一订单混用两种入库方式时，订单操作时间轴会缺批量那几段，查不到谁批量入了多少。
 *
 * <p>两层验证：
 * <ol>
 *   <li>行为层：批量入库日志的 action / targetId / 明细（裁捆数）是否正确</li>
 *   <li>接线层：编排器源码里必须真的调用了 {@code appendBatchWarehousing}
 *       （helper 写好了没人调 = 本次要修的那类缺陷本身）</li>
 * </ol>
 */
@DisplayName("批量成品入库日志接线（D-881）：批量入库不再静默")
class ProductWarehousingBatchLogTest {

    private OperationLogService operationLogService;
    private ProductWarehousingLogAppendHelper helper;

    @BeforeEach
    void setUp() {
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("1001");
        ctx.setUsername("测试质检员");
        UserContext.set(ctx);

        operationLogService = mock(OperationLogService.class);
        new OperationLogAppendUtil().setOperationLogService(operationLogService);

        helper = new ProductWarehousingLogAppendHelper();
    }

    private OperationLog captureSingle() {
        ArgumentCaptor<OperationLog> captor = ArgumentCaptor.forClass(OperationLog.class);
        verify(operationLogService, times(1)).createOperationLog(captor.capture());
        return captor.getValue();
    }

    @Test
    @DisplayName("批量入库：action=批量成品入库，明细带裁捆数，targetId=订单主键")
    void batchWarehousingIsLogged() {
        helper.appendBatchWarehousing("order-1", 3);

        OperationLog log = captureSingle();
        assertEquals("生产订单", log.getModule());
        assertEquals("批量成品入库", log.getOperation());
        assertEquals("order-1", log.getTargetId(), "targetId 必须是订单主键");
        assertTrue(log.getDetails().contains("3"), "明细要能看出这一批入了几个裁捆");
        assertTrue(log.getDetails().contains("裁捆"));
        assertEquals(2L, log.getTenantId(), "日志必须带租户，跨租户不可见");
    }

    @Test
    @DisplayName("单条入库日志保持原样（不能因为补批量而改坏单条）")
    void singleWarehousingUnchanged() {
        helper.appendSingleWarehousing("order-2", 100, 5);

        OperationLog log = captureSingle();
        assertEquals("成品入库", log.getOperation());
        assertEquals("order-2", log.getTargetId());
        assertTrue(log.getDetails().contains("100"));
        assertTrue(log.getDetails().contains("5"));
    }

    @Test
    @DisplayName("空订单主键不写日志（避免产生无主审计行）")
    void nullOrderIdWritesNothing() {
        helper.appendBatchWarehousing(null, 3);
        verify(operationLogService, never()).createOperationLog(org.mockito.ArgumentMatchers.any());
    }

    @Test
    @DisplayName("接线守护：batchSave 必须真的调用 appendBatchWarehousing（写好了没人调 = 缺陷本身）")
    void batchSaveActuallyCallsTheLogMethod() throws Exception {
        Path source = Paths.get("src/main/java/com/fashion/supplychain/production/orchestration/ProductWarehousingOrchestrator.java");
        String code = Files.readString(source, StandardCharsets.UTF_8);
        if (!code.contains("logAppendHelper.appendBatchWarehousing(")) {
            fail("ProductWarehousingOrchestrator.batchSave 未调用 appendBatchWarehousing——"
                    + "批量入库方法定义了但没接线，正是 D-877 查出的那类缺陷");
        }
    }
}
