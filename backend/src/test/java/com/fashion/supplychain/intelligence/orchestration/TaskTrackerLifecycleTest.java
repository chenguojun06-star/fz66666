package com.fashion.supplychain.intelligence.orchestration;

import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.entity.AiTaskTracker;
import com.fashion.supplychain.intelligence.mapper.AiTaskTrackerMapper;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * AI 任务追踪（D-880）。
 *
 * <p>背景：`AiTaskTracker` 此前只有写入口——高风险工具执行成功后记一条 PENDING，
 * 全系统没有读取路径、没有完成动作、过期扫描也没有调度，表只增不减。
 *
 * <p>本测试锁住三条修复：
 * <ol>
 *   <li>同目标重复执行 → 旧 PENDING 被标记完成（「已被后续操作取代」），不堆积</li>
 *   <li>过期扫描确实会更新（24h 阈值 + 只在有超时任务时更新）</li>
 *   <li>按执行人查询能返回待验证任务</li>
 * </ol>
 */
@DisplayName("AI 任务追踪：收口旧任务 / 过期扫描 / 按执行人查询")
class TaskTrackerLifecycleTest {

    @Mock
    private AiTaskTrackerMapper mapper;

    @InjectMocks
    private TaskTrackerOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        UserContext ctx = new UserContext();
        ctx.setTenantId(2L);
        ctx.setUserId("1001");
        ctx.setUsername("张三");
        UserContext.set(ctx);
    }

    private AiTaskTracker pendingTask(Long id) {
        AiTaskTracker t = new AiTaskTracker();
        t.setId(id);
        t.setTenantId(2L);
        t.setStatus("PENDING");
        t.setTargetType("ORDER");
        t.setTargetId("PO1");
        return t;
    }

    @Test
    @DisplayName("同目标重复执行：旧 PENDING 标记完成 + 新任务插入（各一次）")
    void recordTaskSupersedesOlderPending() {
        when(mapper.selectList(any())).thenReturn(List.of(pendingTask(11L), pendingTask(12L)));

        orchestrator.recordTask("tool_order_contact_urge", "NOTIFY", "ORDER", "PO1", "催单", "张三");

        // 两条旧任务各更新一次
        verify(mapper, times(2)).update(isNull(), any(UpdateWrapper.class));
        verify(mapper, times(1)).insert(any(AiTaskTracker.class));
    }

    @Test
    @DisplayName("无旧任务时只插入，不产生多余更新")
    void recordTaskWithoutStaleOnlyInserts() {
        when(mapper.selectList(any())).thenReturn(List.of());

        orchestrator.recordTask("tool_order_contact_urge", "NOTIFY", "ORDER", "PO1", "催单", "张三");

        verify(mapper, never()).update(any(), any(Wrapper.class));
        verify(mapper, times(1)).insert(any(AiTaskTracker.class));
    }

    @Test
    @DisplayName("targetId 为空时不做收口查询（避免把无关任务批量误关）")
    void emptyTargetIdSkipsSupersede() {
        orchestrator.recordTask("tool_system_sync", "NOTIFY", "SYSTEM", "", "同步", "张三");

        verify(mapper, never()).selectList(any());
        verify(mapper, times(1)).insert(any(AiTaskTracker.class));
    }

    @Test
    @DisplayName("过期扫描：有超时任务才更新，24h 阈值")
    void expireStaleTasksUpdatesOnlyWhenNeeded() {
        when(mapper.selectCount(any())).thenReturn(3L);
        orchestrator.expireStaleTasks();
        verify(mapper, times(1)).update(isNull(), any(UpdateWrapper.class));

        when(mapper.selectCount(any())).thenReturn(0L);
        orchestrator.expireStaleTasks();
        // 第二次没有再更新（仍只有第一次那 1 次）
        verify(mapper, times(1)).update(isNull(), any(UpdateWrapper.class));
    }

    @Test
    @DisplayName("按执行人查询：返回该执行人的待验证任务")
    void listPendingByAgentReturnsTasks() {
        when(mapper.selectList(any())).thenReturn(List.of(pendingTask(21L)));

        List<AiTaskTracker> tasks = orchestrator.listPendingTasksByAgent(2L, "张三");

        assertEquals(1, tasks.size());
        assertEquals(21L, tasks.get(0).getId());
    }

    @Test
    @DisplayName("参数缺失直接返回空，不查库（防全表扫）")
    void listPendingByAgentGuardsNullArgs() {
        assertEquals(0, orchestrator.listPendingTasksByAgent(null, "张三").size());
        assertEquals(0, orchestrator.listPendingTasksByAgent(2L, null).size());
        verify(mapper, never()).selectList(any());
    }
}
