package com.fashion.supplychain.intelligence.engine.kg;

public enum RelationType {
    PRODUCES("factory", "style", "工厂生产款式"),
    CONTAINS("style", "process", "款式包含工序"),
    REQUIRES("style", "material", "款式需要物料"),
    DEPENDS_ON("process", "process", "工序依赖工序"),
    SUPPLIES("supplier", "material", "供应商供应物料"),
    DELIVERS("factory", "order", "工厂交付订单"),
    INSPECTS("inspection", "order", "质检工单检查订单"),
    BELONGS_TO("order", "factory", "订单归属工厂");

    private final String sourceType;
    private final String targetType;
    private final String description;

    RelationType(String sourceType, String targetType, String description) {
        this.sourceType = sourceType;
        this.targetType = targetType;
        this.description = description;
    }

    public String sourceType() { return sourceType; }
    public String targetType() { return targetType; }
    public String description() { return description; }
}
