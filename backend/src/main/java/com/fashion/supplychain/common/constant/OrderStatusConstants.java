package com.fashion.supplychain.common.constant;

import java.util.Set;

public class OrderStatusConstants {
    private OrderStatusConstants() {}

    public static final String COMPLETED = "completed";
    public static final String CANCELLED = "cancelled";
    public static final String SCRAPPED = "scrapped";
    public static final String ARCHIVED = "archived";
    public static final String CLOSED = "closed";

    public static final Set<String> TERMINAL_STATUSES = Set.of(COMPLETED, CANCELLED, SCRAPPED, ARCHIVED, CLOSED);

    public static boolean isTerminal(String status) {
        return status != null && TERMINAL_STATUSES.contains(status.trim().toLowerCase());
    }
}
