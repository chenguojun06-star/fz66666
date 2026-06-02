package com.fashion.supplychain.intelligence.engine.risk;

public enum RiskType {
    DELAY("交期风险", 0.30),
    QUALITY("质量风险", 0.20),
    COST("成本风险", 0.10),
    MATERIAL("物料风险", 0.15),
    DELIVERY("交付风险", 0.10),
    FACTORY("工厂风险", 0.10),
    STAGNANT("停滞风险", 0.05);

    private final String description;
    private final double defaultWeight;

    RiskType(String description, double defaultWeight) {
        this.description = description;
        this.defaultWeight = defaultWeight;
    }

    public String description() { return description; }
    public double defaultWeight() { return defaultWeight; }
}
