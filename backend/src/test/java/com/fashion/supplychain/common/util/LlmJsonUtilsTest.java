package com.fashion.supplychain.common.util;

import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * {@link LlmJsonUtils} 的测试。
 *
 * <p>用例尽量来自**线上真实翻车场景**：2026-10-13 CEO 智能体的输出被输出长度截断在
 * "…并评估外" 处，整条诊断降级为"解析失败"。
 */
@DisplayName("大模型 JSON 提取：去围栏 / 抠结构 / 截断修补")
class LlmJsonUtilsTest {

    private static JsonNode parse(String raw) {
        return LlmJsonUtils.parse(raw, JsonNode.class);
    }

    @Test
    @DisplayName("① 干净的 JSON 原样解析")
    void plainJson() {
        JsonNode n = parse("{\"title\":\"标题\",\"priority\":\"high\"}");
        assertThat(n.get("title").asText()).isEqualTo("标题");
        assertThat(n.get("priority").asText()).isEqualTo("high");
    }

    @Test
    @DisplayName("② 带 Markdown 围栏的 JSON")
    void fencedJson() {
        String raw = "```json\n{\"title\":\"标题\"}\n```";
        assertThat(parse(raw).get("title").asText()).isEqualTo("标题");
    }

    @Test
    @DisplayName("③ 前后夹带解释文字的 JSON（模型最爱这么干）")
    void jsonWithProse() {
        String raw = "好的，我的分析如下：\n{\"title\":\"标题\",\"content\":\"正文\"}\n希望对你有帮助。";
        JsonNode n = parse(raw);
        assertThat(n.get("title").asText()).isEqualTo("标题");
        assertThat(n.get("content").asText()).isEqualTo("正文");
    }

    @Test
    @DisplayName("④ 字符串里含花括号/引号，不能误判结束位置")
    void bracesInsideString() {
        String raw = "{\"content\":\"包含 { 和 } 还有 \\\"引号\\\" 的正文\",\"ok\":true}";
        JsonNode n = parse(raw);
        assertThat(n.get("content").asText()).contains("{").contains("}").contains("引号");
        assertThat(n.get("ok").asBoolean()).isTrue();
    }

    @Test
    @DisplayName("⑤ 输出被截断在字符串中间（线上真实场景）→ 修补后仍能拿到已输出的字段")
    void truncatedInsideString() {
        // 线上原文：recommendedAction 写到 "…并评估外" 就被截断了
        String raw = "{\"title\":\"订单PO20260930163102严重逾期与盲目加速风险诊断\","
                + "\"content\":\"综合PMC、品控及财务缺位情况\","
                + "\"recommendedAction\":\"1）2小时内成立红色应急小组；2）12小时内与客户沟通；"
                + "6）问责与升级：对生产部1陈主管启动延期问责，若24小时无实质进展则升级至总经理或老板，并评估外";
        JsonNode n = parse(raw);
        assertThat(n.get("title").asText()).contains("严重逾期");
        assertThat(n.get("content").asText()).isEqualTo("综合PMC、品控及财务缺位情况");
        // 截断的部分就是没有 —— 但前半段必须保住，不能整条丢掉
        assertThat(n.get("recommendedAction").asText()).startsWith("1）2小时内成立红色应急小组");
    }

    @Test
    @DisplayName("⑥ 截断在逗号后 → 修补")
    void truncatedAfterComma() {
        JsonNode n = parse("{\"a\":1,\"b\":2,");
        assertThat(n.get("a").asInt()).isEqualTo(1);
        assertThat(n.get("b").asInt()).isEqualTo(2);
    }

    @Test
    @DisplayName("⑦ 截断在「有 key 没值」处 → 丢掉那个 key，保住前面的")
    void truncatedAfterKey() {
        JsonNode n = parse("{\"a\":1,\"b\":");
        assertThat(n.get("a").asInt()).isEqualTo(1);
        assertThat(n.has("b")).isFalse();
    }

    @Test
    @DisplayName("⑧ 截断在嵌套对象里 → 逐层闭合")
    void truncatedInsideNested() {
        JsonNode n = parse("{\"a\":{\"x\":1,\"y\":");
        assertThat(n.get("a").get("x").asInt()).isEqualTo(1);
    }

    @Test
    @DisplayName("⑨ 数组同样处理")
    void truncatedArray() {
        JsonNode n = parse("{\"items\":[{\"k\":1},{\"k\":2");
        assertThat(n.get("items")).hasSize(2);
        assertThat(n.get("items").get(1).get("k").asInt()).isEqualTo(2);
    }

    @Test
    @DisplayName("⑩ 完全不是 JSON → 明确抛错，而不是返回半个对象")
    void notJsonAtAll() {
        assertThat(LlmJsonUtils.extractJson("抱歉，我无法完成该请求。")).isNull();
        assertThatThrownBy(() -> LlmJsonUtils.parse("抱歉，我无法完成该请求。", JsonNode.class))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("找不到 JSON 结构");
    }

    @Test
    @DisplayName("⑪ 括号错配（结构本身坏了）→ 不猜测，返回 null")
    void malformedBrackets() {
        assertThat(LlmJsonUtils.extractJson("{\"a\":1]")).isNull();
    }

    @Test
    @DisplayName("⑫ 模型多给字段 / 字段名写错，不该让整条失败")
    void unknownFieldTolerated() {
        // 用真实 DTO 场景：多出来的字段直接忽略
        record Dto(String title) {
        }
        Dto dto = LlmJsonUtils.parse("{\"title\":\"标题\",\"extraField\":123}", Dto.class);
        assertThat(dto.title()).isEqualTo("标题");
    }

    @Test
    @DisplayName("⑬ null 输入不炸")
    void nullInput() {
        assertThat(LlmJsonUtils.extractJson(null)).isNull();
    }
}
