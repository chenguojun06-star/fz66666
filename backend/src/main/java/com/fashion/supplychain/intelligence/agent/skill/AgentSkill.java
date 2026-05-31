package com.fashion.supplychain.intelligence.agent.skill;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class AgentSkill {
    private String id;
    private String name;
    private String description;
    private String domain;
    private List<String> triggers;
    private List<String> toolNames;
    private String promptInjection;
    private Map<String, String> knowledgeRefs;
    private int priority;
    private boolean active = true;
    private String version;
    private long loadedAt;
}