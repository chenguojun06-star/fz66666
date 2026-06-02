package com.fashion.supplychain.intelligence.engine.kg;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.HashMap;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KgRelation {
    private String relationType;
    private String sourceType;
    private String sourceName;
    private String sourceExternalId;
    private String targetType;
    private String targetName;
    private String targetExternalId;
    private Double weight;
    private Map<String, Object> properties = new HashMap<>();
}
