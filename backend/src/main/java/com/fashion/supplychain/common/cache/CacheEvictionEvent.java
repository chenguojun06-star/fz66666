package com.fashion.supplychain.common.cache;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.util.Set;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CacheEvictionEvent implements Serializable {
    private static final long serialVersionUID = 1L;

    private String cacheName;
    private Set<String> keys;
    private String tenantId;
    private String source;
    private Long timestamp;
}
