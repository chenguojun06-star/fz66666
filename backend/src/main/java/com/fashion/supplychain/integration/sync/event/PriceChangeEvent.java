package com.fashion.supplychain.integration.sync.event;

import lombok.Getter;
import org.springframework.context.ApplicationEvent;

@Getter
public class PriceChangeEvent extends ApplicationEvent {

    private final Long styleId;
    private final Long tenantId;

    public PriceChangeEvent(Object source, Long styleId, Long tenantId) {
        super(source);
        this.styleId = styleId;
        this.tenantId = tenantId;
    }
}
