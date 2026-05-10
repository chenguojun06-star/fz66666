package com.fashion.supplychain.integration.sync.adapter;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class EcPlatformAdapterRegistry {

    private final Map<String, EcPlatformAdapter> adapterMap = new ConcurrentHashMap<>();

    @Autowired
    public EcPlatformAdapterRegistry(List<EcPlatformAdapter> adapters) {
        if (adapters != null) {
            adapters.forEach(a -> adapterMap.put(a.getPlatformCode(), a));
        }
    }

    public EcPlatformAdapter getAdapter(String platformCode) {
        EcPlatformAdapter adapter = adapterMap.get(platformCode);
        if (adapter == null) {
            throw new IllegalArgumentException("Unsupported platform: " + platformCode);
        }
        return adapter;
    }

    public Optional<EcPlatformAdapter> findAdapter(String platformCode) {
        return Optional.ofNullable(adapterMap.get(platformCode));
    }

    public List<String> getSupportedPlatforms() {
        return new ArrayList<>(adapterMap.keySet());
    }
}
