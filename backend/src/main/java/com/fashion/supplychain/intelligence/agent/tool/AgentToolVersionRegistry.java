package com.fashion.supplychain.intelligence.agent.tool;

import jakarta.annotation.PostConstruct;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Service;
import org.springframework.context.annotation.Lazy;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Agent 工具版本治理注册中心
 *
 * <p>P3-2 升级（2026-07-28）：工具版本化治理
 *
 * <p>启动时扫描所有标注 @AgentToolDef 的 Bean，记录版本元数据到内存，
 * 提供版本查询、废弃工具检测、版本分布统计能力。
 *
 * <p>设计原则：
 * <ul>
 *   <li>启动时扫描一次（@PostConstruct），运行时只读</li>
 *   <li>扫描失败不影响主流程（best-effort，降级为空注册表）</li>
 *   <li>不持久化（仅内存），版本变更通过代码注解体现</li>
 *   <li>多租户无隔离（工具元数据是全局的）</li>
 * </ul>
 *
 * @author xiaoyun
 * @since 2026-07-28
 */
@Slf4j
@Service
@Lazy
public class AgentToolVersionRegistry {

    @Autowired
    private ApplicationContext applicationContext;

    /** 工具名 → 元数据（启动时填充，运行时只读） */
    private final Map<String, ToolVersionInfo> registry = new ConcurrentHashMap<>();

    @PostConstruct
    void scanTools() {
        try {
            Map<String, Object> beans = applicationContext.getBeansWithAnnotation(AgentToolDef.class);
            if (beans == null || beans.isEmpty()) {
                log.warn("[AgentToolRegistry] 未扫描到任何 @AgentToolDef 工具");
                return;
            }

            int total = 0;
            int deprecatedCount = 0;
            for (Map.Entry<String, Object> entry : beans.entrySet()) {
                Object bean = entry.getValue();
                AgentToolDef def = bean.getClass().getAnnotation(AgentToolDef.class);
                if (def == null) {
                    // CGLIB 代理类需取父类注解
                    def = bean.getClass().getSuperclass().getAnnotation(AgentToolDef.class);
                }
                if (def == null) continue;

                ToolVersionInfo info = new ToolVersionInfo();
                info.setName(def.name());
                info.setDescription(def.description());
                info.setDomain(def.domain().name());
                info.setDomainLabel(def.domain().getLabel());
                info.setTimeoutMs(def.timeoutMs());
                info.setReadOnly(def.readOnly());
                info.setVersion(def.version());
                info.setDeprecated(def.deprecated());
                info.setReplacedBy(def.replacedBy());
                info.setBeanName(entry.getKey());
                info.setBeanClass(bean.getClass().getSimpleName());

                registry.put(def.name(), info);
                total++;
                if (def.deprecated()) {
                    deprecatedCount++;
                }
            }

            log.info("[AgentToolRegistry] 工具版本扫描完成: 共 {} 个工具, {} 个已废弃", total, deprecatedCount);
        } catch (Exception e) {
            log.warn("[AgentToolRegistry] 工具版本扫描失败(不影响主流程): {}", e.getMessage());
        }
    }

    /**
     * 列出所有工具版本信息
     */
    public List<ToolVersionInfo> listAll() {
        if (registry.isEmpty()) return Collections.emptyList();
        return new ArrayList<>(registry.values());
    }

    /**
     * 查询单个工具版本信息
     */
    public ToolVersionInfo get(String toolName) {
        return registry.get(toolName);
    }

    /**
     * 列出所有已废弃工具
     */
    public List<ToolVersionInfo> listDeprecated() {
        return registry.values().stream()
                .filter(ToolVersionInfo::isDeprecated)
                .toList();
    }

    /**
     * 版本分布统计（version → count）
     */
    public Map<String, Integer> versionDistribution() {
        Map<String, Integer> dist = new LinkedHashMap<>();
        for (ToolVersionInfo info : registry.values()) {
            dist.merge(info.getVersion(), 1, Integer::sum);
        }
        return dist;
    }

    /**
     * 领域分布统计（domain → count）
     */
    public Map<String, Integer> domainDistribution() {
        Map<String, Integer> dist = new LinkedHashMap<>();
        for (ToolVersionInfo info : registry.values()) {
            dist.merge(info.getDomain(), 1, Integer::sum);
        }
        return dist;
    }

    /**
     * 健康检查：废弃工具是否有 replacedBy 指引
     *
     * @return 不健康条目列表（deprecated=true 但 replacedBy 为空）
     */
    public List<ToolVersionInfo> healthCheckDeprecatedWithoutReplacement() {
        return registry.values().stream()
                .filter(ToolVersionInfo::isDeprecated)
                .filter(info -> info.getReplacedBy() == null || info.getReplacedBy().isBlank())
                .toList();
    }

    /**
     * 检查指定的替代工具是否真实存在（防止 replacedBy 指向不存在的工具）
     *
     * @return 不健康条目列表（replacedBy 指向不存在的工具）
     */
    public List<ToolVersionInfo> healthCheckReplacedByNotExist() {
        return registry.values().stream()
                .filter(ToolVersionInfo::isDeprecated)
                .filter(info -> info.getReplacedBy() != null && !info.getReplacedBy().isBlank())
                .filter(info -> !registry.containsKey(info.getReplacedBy()))
                .toList();
    }

    /**
     * 整体健康摘要
     */
    public Map<String, Object> healthSummary() {
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("totalTools", registry.size());
        summary.put("deprecatedCount", listDeprecated().size());
        summary.put("versionDistribution", versionDistribution());
        summary.put("domainDistribution", domainDistribution());
        summary.put("deprecatedWithoutReplacement", healthCheckDeprecatedWithoutReplacement().size());
        summary.put("replacedByNotExist", healthCheckReplacedByNotExist().size());
        return summary;
    }

    /**
     * 工具版本元数据
     */
    @Data
    public static class ToolVersionInfo {
        private String name;
        private String description;
        private String domain;
        private String domainLabel;
        private int timeoutMs;
        private boolean readOnly;
        private String version;
        private boolean deprecated;
        private String replacedBy;
        private String beanName;
        private String beanClass;

        public Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", name);
            m.put("description", description);
            m.put("domain", domain);
            m.put("domainLabel", domainLabel);
            m.put("timeoutMs", timeoutMs);
            m.put("readOnly", readOnly);
            m.put("version", version);
            m.put("deprecated", deprecated);
            m.put("replacedBy", replacedBy);
            m.put("beanName", beanName);
            m.put("beanClass", beanClass);
            return m;
        }
    }
}
