package com.fashion.supplychain.intelligence.engine.dag;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class DagEdge {
    private String fromNode;
    private String toNode;
    private String conditionKey;
    private Object expectedValue;
}
