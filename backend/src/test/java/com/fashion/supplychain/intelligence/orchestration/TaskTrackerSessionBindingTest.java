package com.fashion.supplychain.intelligence.orchestration;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AgentModeContext;
import com.fashion.supplychain.intelligence.entity.AiTaskTracker;
import com.fashion.supplychain.intelligence.mapper.AiTaskTrackerMapper;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mock;
import org.mockito.MockitoAnnotations;
import org.springframework.data.redis.core.ListOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * AI 任务与会话绑定（D-914）。
 *
 * <p>背景：D-913 打通了 AgentModeContext 的 sessionId 与任务中心的按会话查询端点，
 * 但 {@code bindTaskToSession} 一直没有调用方 —— 会话维度的待办列表永远返回空。
 *
 * <p>本测试锁住两条路径：
 * <ol>
 *   <li>Agent 链路（ThreadLocal 有 sessionId）→ 任务写入后自动挂到该会话索引</li>
 *   <li>非 Agent 链路（无 sessionId）→ 不产生任何会话索引写入</li>
 * </ol>
 */
@DisplayName("AI 任务追踪：创建任务自动绑定到当前 Agent 会话")
class TaskTrackerSessionBindingTest {

    private static final Long TENANT_ID = 2L;
    private static final Long TASK_ID = 88L;
    private static final String SESSION_ID = "sess-abc";

    @Mock
    private AiTaskTrackerMapper mapper;

    @Mock
    private StringRedisTemplate redisTemplate;

    @Mock
    private ListOperations<String, String> listOps;

    /**
     * 不能用 @InjectMocks：@RequiredArgsConstructor 只有一个 final 字段（mapper），
     * Mockito 走构造器注入后不会再注入 redisTemplate 字段，导致绑定逻辑被 null 短路。
     */
    private TaskTrackerOrchestrator orchestrator;

    @BeforeEach
    void setUp() {
        MockitoAnnotations.openMocks(this);
        orchestrator = new TaskTrackerOrchestrator(mapper);
        ReflectionTestUtils.setField(orchestrator, "redisTemplate", redisTemplate);

        UserContext ctx = new UserContext();
        ctx.setTenantId(TENANT_ID);
        ctx.setUserId("1001");
        ctx.setUsername("张三");
        UserContext.set(ctx);

        when(redisTemplate.opsForList()).thenReturn(listOps);
        when(mapper.selectList(any())).thenReturn(List.of());
        // MyBatis-Plus 插入后回填自增主键，mock 里手工回填（否则绑定拿不到 taskId）
        when(mapper.insert(any(AiTaskTracker.class))).thenAnswer(inv -> {
            ((AiTaskTracker) inv.getArgument(0)).setId(TASK_ID);
            return 1;
        });
    }

    @AfterEach
    void tearDown() {
        AgentModeContext.clear();
        UserContext.clear();
    }

    @Test
    @DisplayName("Agent 会话内创建任务：写入会话索引并设置 7 天 TTL")
    void recordTaskBindsToSessionWhenPresent() {
        AgentModeContext.setSessionId(SESSION_ID);

        orchestrator.recordTask("tool_order_contact_urge", "NOTIFY", "ORDER", "PO1", "催单", "张三");

        String indexKey = "agent:session-tasks:" + TENANT_ID + ":" + SESSION_ID;
        verify(listOps).rightPush(eq(indexKey), eq(String.valueOf(TASK_ID)));
        verify(redisTemplate).expire(eq(indexKey), eq(7L), any());
    }

    @Test
    @DisplayName("无会话上下文：不写会话索引（保持原有行为）")
    void recordTaskSkipsBindingWithoutSession() {
        orchestrator.recordTask("tool_order_contact_urge", "NOTIFY", "ORDER", "PO1", "催单", "张三");

        verify(listOps, never()).rightPush(anyString(), anyString());
        verify(mapper).insert(any(AiTaskTracker.class));
    }
}
