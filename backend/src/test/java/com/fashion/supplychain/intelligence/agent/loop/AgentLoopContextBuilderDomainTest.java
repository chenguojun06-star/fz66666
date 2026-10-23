package com.fashion.supplychain.intelligence.agent.loop;

import com.fashion.supplychain.intelligence.agent.tool.ToolDomain;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * D-855：小云工具裁剪的领域集合。
 *
 * <p>背景（2026-10-23 核实）：AgentLoopContextBuilder 原先只取
 * `multiDomains.get(0)`——「这批料够不够生产这个单」这类跨域问题
 * （WAREHOUSE + PRODUCTION）只会拿到仓储工具，模型看不到生产侧数据，
 * 回答必然不全甚至答偏。这是**准确性问题**的直接根因之一。
 *
 * <p>本测试守护：多领域必须全取，且为空时不裁剪（宁多给工具也不能缺）。
 */
class AgentLoopContextBuilderDomainTest {

    @Test
    @DisplayName("跨域问题：多个领域必须全部保留（不能只取第一个）")
    void collectDomains_keepsAllDomains() {
        Set<ToolDomain> domains = AgentLoopContextBuilder.collectDomains(
                List.of(ToolDomain.WAREHOUSE, ToolDomain.PRODUCTION));

        assertThat(domains).containsExactly(ToolDomain.WAREHOUSE, ToolDomain.PRODUCTION);
    }

    @Test
    @DisplayName("三领域组合同样全取（routeMulti 已限 3）")
    void collectDomains_keepsThreeDomains() {
        Set<ToolDomain> domains = AgentLoopContextBuilder.collectDomains(
                List.of(ToolDomain.PRODUCTION, ToolDomain.FINANCE, ToolDomain.WAREHOUSE));

        assertThat(domains).hasSize(3);
    }

    @Test
    @DisplayName("空/未命中领域：返回空集（后续不做裁剪，保留全量可见工具）")
    void collectDomains_emptyWhenNoMatch() {
        assertThat(AgentLoopContextBuilder.collectDomains(List.of())).isEmpty();
        assertThat(AgentLoopContextBuilder.collectDomains(null)).isEmpty();
    }

    @Test
    @DisplayName("重复领域去重（LinkedHashSet 保序）")
    void collectDomains_dedupes() {
        Set<ToolDomain> domains = AgentLoopContextBuilder.collectDomains(
                List.of(ToolDomain.STYLE, ToolDomain.STYLE, ToolDomain.FINANCE));

        assertThat(domains).containsExactly(ToolDomain.STYLE, ToolDomain.FINANCE);
    }
}
