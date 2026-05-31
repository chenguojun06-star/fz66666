package com.fashion.supplychain.common.cache;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DataSyncEvent implements Serializable {
    private static final long serialVersionUID = 1L;

    public static final String TYPE_ORDER_UPDATE = "order:update";
    public static final String TYPE_SCAN_CREATE = "scan:create";
    public static final String TYPE_STOCK_CHANGE = "stock:change";
    public static final String TYPE_PROGRESS_UPDATE = "progress:update";

    private String eventType;
    private String entityType;
    private String entityId;
    private String tenantId;
    private Map<String, Object> data;
    private String source;
    private Long timestamp;
}
