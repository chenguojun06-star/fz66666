package com.fashion.supplychain.intelligence.agent.handoff;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class SubAgentDefinition {
    private String agentId;
    private String name;
    private String description;
    private String domain;
    private List<String> triggers;
    private String systemPrompt;
    private List<String> toolWhitelist;
    private Map<String, String> knowledgeRefs;
    private int maxIterations;
    private boolean enabled = true;
}