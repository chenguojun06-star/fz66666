package com.fashion.supplychain.intelligence.agent.command;

import java.util.Map;

public interface CompensableTool {

    CompensationResult compensate(Map<String, Object> execSnapshot);

    boolean isCompensable();
}
