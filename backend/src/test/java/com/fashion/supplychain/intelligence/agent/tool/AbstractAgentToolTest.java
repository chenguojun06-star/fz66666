package com.fashion.supplychain.intelligence.agent.tool;

import com.fashion.supplychain.common.UserContext;
import com.fashion.supplychain.intelligence.agent.AiTool;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("AbstractAgentTool - 统一权限校验与异常处理")
class AbstractAgentToolTest {

    private StubAgentTool tool;

    @BeforeEach
    void setUp() {
        tool = new StubAgentTool();
        UserContext.clear();
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    private void setTenantContext(Long tenantId, String role) {
        UserContext ctx = new UserContext();
        ctx.setUserId("testUser");
        ctx.setUsername("test");
        ctx.setRole(role);
        ctx.setTenantId(tenantId);
        UserContext.set(ctx);
    }

    @Test
    @DisplayName("租户上下文丢失时拒绝执行")
    void execute_noTenantContext_returnsError() throws Exception {
        String result = tool.execute("{}");
        assertTrue(result.contains("\"success\":false"), "应返回失败");
        assertTrue(result.contains("租户上下文丢失"), "应提示租户上下文丢失");
    }

    @Test
    @DisplayName("tenantId为null时拒绝执行")
    void execute_nullTenantId_returnsError() throws Exception {
        setTenantContext(null, "admin");
        String result = tool.execute("{}");
        assertTrue(result.contains("租户上下文丢失"), "tenantId为null应视为上下文丢失");
    }

    @Test
    @DisplayName("doExecute抛IllegalArgumentException时返回参数错误")
    void execute_illegalArgument_returnsParamError() throws Exception {
        setTenantContext(1L, "admin");
        tool.nextException = new IllegalArgumentException("缺少参数orderNo");
        String result = tool.execute("{}");
        assertTrue(result.contains("参数错误"), "应返回参数错误");
        assertTrue(result.contains("缺少参数orderNo"), "应包含原始消息");
    }

    @Test
    @DisplayName("doExecute抛IllegalStateException时返回业务拒绝")
    void execute_illegalState_returnsBusinessReject() throws Exception {
        setTenantContext(1L, "admin");
        tool.nextException = new IllegalStateException("订单已完成");
        String result = tool.execute("{}");
        assertTrue(result.contains("\"success\":false"), "应返回失败");
        assertTrue(result.contains("订单已完成"), "应包含业务拒绝消息");
    }

    @Test
    @DisplayName("doExecute抛RuntimeException时返回执行失败")
    void execute_runtimeException_returnsExecutionError() throws Exception {
        setTenantContext(1L, "admin");
        tool.nextException = new RuntimeException("数据库连接超时");
        String result = tool.execute("{}");
        assertTrue(result.contains("执行失败"), "应返回执行失败");
    }

    @Test
    @DisplayName("doExecute正常执行时返回成功结果")
    void execute_normal_returnsSuccess() throws Exception {
        setTenantContext(1L, "admin");
        tool.nextResult = "{\"success\":true,\"message\":\"操作成功\"}";
        String result = tool.execute("{}");
        assertTrue(result.contains("\"success\":true"), "应返回成功");
    }

    @Test
    @DisplayName("errorJson格式正确")
    void errorJson_correctFormat() {
        String json = tool.testErrorJson("测试错误");
        assertTrue(json.contains("\"success\":false"), "success应为false");
        assertTrue(json.contains("测试错误"), "应包含错误消息");
    }

    @Test
    @DisplayName("successJson格式正确")
    void successJson_correctFormat() throws Exception {
        String json = tool.testSuccessJson("操作成功");
        assertTrue(json.contains("\"success\":true"), "success应为true");
        assertTrue(json.contains("操作成功"), "应包含消息");
    }

    @Test
    @DisplayName("parseArgs正确解析JSON参数")
    void parseArgs_correctParsesJson() throws Exception {
        var result = tool.testParseArgs("{\"orderNo\":\"ORD-001\",\"quantity\":10}");
        assertEquals("ORD-001", result.get("orderNo"));
        assertEquals(10, result.get("quantity"));
    }

    @Test
    @DisplayName("requireString - 缺少必填参数时抛异常")
    void requireString_missingParam_throwsException() throws Exception {
        var args = tool.testParseArgs("{\"orderNo\":\"ORD-001\"}");
        assertThrows(IllegalArgumentException.class, () -> tool.testRequireString(args, "missingKey"));
    }

    @Test
    @DisplayName("optionalString - 可选参数缺失时返回null")
    void optionalString_missing_returnsNull() throws Exception {
        var args = tool.testParseArgs("{\"orderNo\":\"ORD-001\"}");
        assertNull(tool.testOptionalString(args, "missingKey"));
    }

    private static class StubAgentTool extends AbstractAgentTool {

        String nextResult = "{\"success\":true,\"message\":\"ok\"}";
        RuntimeException nextException = null;

        @Override
        public String getName() {
            return "tool_stub_test";
        }

        @Override
        protected String doExecute(String argumentsJson) throws Exception {
            if (nextException != null) {
                throw nextException;
            }
            return nextResult;
        }

        @Override
        public AiTool getToolDefinition() {
            return buildToolDef("测试桩", java.util.Map.of("param", stringProp("测试参数")), java.util.List.of());
        }

        String testErrorJson(String msg) {
            return errorJson(msg);
        }

        String testSuccessJson(String msg) throws Exception {
            return successJson(msg);
        }

        java.util.Map<String, Object> testParseArgs(String json) throws Exception {
            return parseArgs(json);
        }

        String testRequireString(java.util.Map<String, Object> args, String key) {
            return requireString(args, key);
        }

        String testOptionalString(java.util.Map<String, Object> args, String key) {
            return optionalString(args, key);
        }
    }
}
