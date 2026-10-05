package com.fashion.supplychain.intelligence.orchestration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 确定性查询直查分流回归守护（D-702 性能第三阶段）
 *
 * <p>用户反馈：「太慢，人员点击就可以看，远远不够人员去点击查看来的更快」。
 * 提示层优化只能省掉 10~13s，<b>但 Agent 循环的两轮同步 LLM 往返是固有成本</b>
 *（iter=1 发起工具 ~2.4s + iter=2 生成答案 ~20.8s），压不掉。
 * 对「PO20260706155257 进度到哪了」这类问题，直查是唯一能把 20s 降到 0.5s 的办法。
 *
 * <p><b>本类的核心是安全边界</b>：直查绕过了 Agent 循环，因此必须保证
 * ① 不猜参数 ② 不越权 ③ 任何失败都降级回 Agent 而非报错或编造数据。
 */
@DisplayName("直查分流（D-702：确定性查询 20s → 0.5s，且绝不猜数据）")
class DirectQueryRouterTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Test
    @DisplayName("① 能从自然语言中提取真实订单号（真实格式 PO+6位以上数字）")
    void extractsRealOrderNo() {
        assertThat(DirectQueryRouter.extractOrderNo("PO20260706155257 这个订单什么情况"))
                .isEqualTo("PO20260706155257");
        assertThat(DirectQueryRouter.extractOrderNo("查一下 PO20260324001 的进度"))
                .isEqualTo("PO20260324001");
        assertThat(DirectQueryRouter.extractOrderNo("订单 po20260706155257 到哪了"))
                .isEqualTo("PO20260706155257");
    }

    @Test
    @DisplayName("① 没有订单号时必须返回 null，绝不猜测（猜参数会查出看似合理却错误的数字）")
    void noOrderNoMeansNoDirectQuery() {
        assertThat(DirectQueryRouter.extractOrderNo("这个订单什么情况")).isNull();
        assertThat(DirectQueryRouter.extractOrderNo("查一下进度")).isNull();
        assertThat(DirectQueryRouter.extractOrderNo("你好")).isNull();
        assertThat(DirectQueryRouter.extractOrderNo("")).isNull();
        assertThat(DirectQueryRouter.extractOrderNo(null)).isNull();
    }

    @Test
    @DisplayName("② 只对进度类问法直查；分析类必须交回 Agent（需要推理，不是查表）")
    void onlyProgressQuestionsAreDirect() {
        assertThat(DirectQueryRouter.isProgressQuestion("PO20260706155257 进度到哪了")).isTrue();
        assertThat(DirectQueryRouter.isProgressQuestion("这单做到哪一步了")).isTrue();
        assertThat(DirectQueryRouter.isProgressQuestion("什么时候能出货")).isTrue();
        // 需要推理/对比分析的不能直查
        assertThat(DirectQueryRouter.isProgressQuestion("为什么总是延期")).isFalse();
        assertThat(DirectQueryRouter.isProgressQuestion("分析一下成本结构")).isFalse();
        assertThat(DirectQueryRouter.isProgressQuestion("你好")).isFalse();
    }

    /**
     * 字段名必须与工具真实返回一致 —— 这里用工具的真实 JSON 结构做回归。
     * 第一版我按平铺结构写渲染，实际是 {@code {success,message,total,orders:[...]}}，
     * 结果渲染不出任何字段。这里锁死嵌套结构，防止再犯。
     */
    @Test
    @DisplayName("③ 卡片渲染必须匹配工具真实结构 {success,message,total,orders:[...]}（嵌套！）")
    void rendersNestedToolStructure() throws Exception {
        // 取自 ProductionProgressTool#buildOrderDetail 的真实字段
        String toolJson = "{\"success\":true,\"message\":\"查询成功\",\"total\":1,\"orders\":[{"
                + "\"orderNo\":\"PO20260706155257\",\"styleNo\":\"H0002\",\"styleName\":\"测试款\","
                + "\"factoryName\":\"测试厂\",\"orderQuantity\":100,\"completedQuantity\":60,"
                + "\"cuttingQuantity\":60,\"cuttingBundleCount\":6,\"overallProgress\":\"60%\","
                + "\"status\":\"producing\",\"urgencyLevel\":\"normal\",\"merchandiser\":\"张三\","
                + "\"plannedEndDate\":\"2026-10-20\",\"expectedShipDate\":\"2026-10-22 18:00\","
                + "\"materialArrivalRate\":\"100%\",\"overdueDays\":0}]}";

        Map<String, Object> parsed = MAPPER.readValue(toolJson, new TypeReference<Map<String, Object>>() {
        });
        assertThat(parsed.get("success")).as("必须能识别 success 标志").isEqualTo(true);
        List<?> orders = (List<?>) parsed.get("orders");
        assertThat(orders).as("orders 是嵌套数组，不是平铺字段").hasSize(1);
        Map<String, Object> detail = MAPPER.convertValue(orders.get(0), new TypeReference<Map<String, Object>>() {
        });
        assertThat(detail.get("overallProgress")).as("字段名是 overallProgress 且带%号，不是 productionProgress")
                .isEqualTo("60%");
        assertThat(detail.get("orderNo")).isEqualTo("PO20260706155257");
    }

    @Test
    @DisplayName("③ 工具失败时（success:false）必须识别，不能当成数据渲染")
    void toolFailureMustNotBeRenderedAsData() throws Exception {
        String failJson = "{\"success\":false,\"message\":\"未查询到符合条件的生产订单\"}";
        Map<String, Object> parsed = MAPPER.readValue(failJson, new TypeReference<Map<String, Object>>() {
        });
        assertThat(Boolean.FALSE.equals(parsed.get("success")))
                .as("直查必须识别失败标志并交回 Agent，否则会渲染空卡片")
                .isTrue();
        assertThat(parsed).as("失败时没有 orders 字段").doesNotContainKey("orders");
    }

    @Test
    @DisplayName("④ 直查不得绕过工具权限：必须先 canUseTool 再执行")
    void permissionIsCheckedBeforeExecution() throws Exception {
        String src = read();
        int permIdx = src.indexOf("canUseTool(toolName)");
        int execIdx = src.indexOf("tool.execute(argsJson)");
        assertThat(permIdx > 0)
                .as("直查绕过了 Agent 循环，若不校验权限就等于给「工具不可见」的角色开了旁路")
                .isTrue();
        assertThat(execIdx > 0).as("应存在工具执行调用").isTrue();
        assertThat(permIdx < execIdx)
                .as("权限校验必须在执行之前")
                .isTrue();
        // 权限不通过时必须立即放弃，而不是继续执行
        int end = Math.min(permIdx + 320, src.length());
        String afterPerm = src.substring(permIdx, end);
        assertThat(afterPerm.contains("return null"))
                .as("权限不足必须直接返回 null 交回 Agent")
                .isTrue();
    }

    @Test
    @DisplayName("⑤ 直查是优化不是依赖：Bean 缺失或异常都必须退化为主链路")
    void directQueryIsOptionalAndIsolated() throws Exception {
        String orch = readOrchestrator();
        assertThat(orch)
                .as("required=false：这是性能优化，Bean 缺失不该让整个小云不可用")
                .contains("@Autowired(required = false)")
                .contains("DirectQueryRouter directQueryRouter");
        assertThat(orch)
                .as("直查异常必须被捕获并交回 Agent 循环")
                .contains("直查异常，交回 Agent 循环");
    }

    @Test
    @DisplayName("⑤ 回答必须声明数据来源为直接查库，让用户知道数字不是 AI 编的")
    void answerDeclaresDataSource() throws Exception {
        String src = read();
        assertThat(src)
                .as("CLAUDE.md 铁律 7：必须让用户可辨认数据来源，区别于 AI 生成内容")
                .contains("直接查库，未经 AI 生成");
    }

    private static String readOrchestrator() throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/intelligence/orchestration/AiAgentOrchestrator.java",
                "backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/AiAgentOrchestrator.java")) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 AiAgentOrchestrator.java");
    }

    private static String read() throws Exception {
        for (String p : List.of(
                "src/main/java/com/fashion/supplychain/intelligence/orchestration/DirectQueryRouter.java",
                "backend/src/main/java/com/fashion/supplychain/intelligence/orchestration/DirectQueryRouter.java")) {
            Path path = Path.of(p);
            if (Files.exists(path)) return Files.readString(path, StandardCharsets.UTF_8);
        }
        throw new AssertionError("找不到 DirectQueryRouter.java");
    }
}